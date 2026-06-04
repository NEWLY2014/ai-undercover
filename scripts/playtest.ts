/* Headless playtest harness — drives FULL games through the real game engine
 * (src/game/engine.ts) and the real /api/agent LLM endpoint, concurrently, to
 * surface product issues. It is a TEST DRIVER, not product code: it mirrors the
 * exact sequence useGameLoop.ts runs (describe with retry+dedup, concurrent
 * voting, PK ties, spy comeback, reflect) and asserts game invariants while it
 * plays. All players are AI (no interactive human); the coach and suspect
 * features are exercised by firing those calls during a fraction of games.
 *
 * Run:  npx tsx scripts/playtest.ts [workers] [gamesPerWorker] [baseUrl]
 */
import {
  aliveOf,
  buildPlayers,
  checkWinner,
  clueLeaksWord,
  isDuplicateClue,
  isLazyClue,
  maxSpyCount,
  pickBlankIndex,
  pickSpyIndices,
  publicTranscript,
  speakingOrder,
  tallyVotes,
  transcriptLine,
} from "../src/game/engine";
import { personasFor } from "../src/game/personas";
import { filterWordPairs, getWordPair } from "../src/game/words";
import type { AgentProfile, Player } from "../src/game/types";

type Locale = "zh" | "en";
const BASE = process.argv[4] || "http://localhost:3000";
const WORKERS = Number(process.argv[2] || 20);
const GAMES_PER_WORKER = Number(process.argv[3] || 5);
const ROUND_CAP = 15;

// ── shared stats ────────────────────────────────────────────────────────────
const stats = {
  games: 0,
  finished: 0,
  civWins: 0,
  spyWins: 0,
  calls: 0,
  callErrors: 0,
  rate429: 0,
  totalLatencyMs: 0,
  byKind: {} as Record<string, number>,
  // quality / bug findings, deduped by message with a count + a couple examples
  findings: new Map<string, { count: number; examples: string[] }>(),
};
function finding(key: string, example?: string) {
  const f = stats.findings.get(key) ?? { count: 0, examples: [] };
  f.count++;
  if (example && f.examples.length < 4) f.examples.push(example);
  stats.findings.set(key, f);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── the real /api/agent call, with 429/5xx/network backoff ──────────────────
async function callAgent(kind: string, payload: Record<string, unknown>, gameId: string): Promise<Record<string, unknown> | null> {
  const body = JSON.stringify({ kind, payload, gameId });
  for (let attempt = 0; attempt < 6; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${BASE}/api/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      stats.calls++;
      stats.byKind[kind] = (stats.byKind[kind] ?? 0) + 1;
      stats.totalLatencyMs += Date.now() - t0;
      if (res.status === 429) {
        stats.rate429++;
        const ra = Number(res.headers.get("retry-after")) || 2;
        await sleep(ra * 1000 + Math.floor(Math.random() * 400));
        continue;
      }
      const data = (await res.json()) as { result?: Record<string, unknown>; error?: string };
      if (!res.ok) {
        stats.callErrors++;
        finding(`API ${res.status} on ${kind}`, (data?.error || "").slice(0, 120));
        // 5xx: retry a couple times; 4xx: give up
        if (res.status >= 500 && attempt < 3) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        return null;
      }
      return data.result ?? null;
    } catch (e) {
      stats.calls++;
      stats.callErrors++;
      stats.totalLatencyMs += Date.now() - t0;
      finding(`network error on ${kind}`, e instanceof Error ? e.message.slice(0, 120) : String(e));
      await sleep(400 * (attempt + 1));
    }
  }
  return null;
}

// Use the SAME guard the live game uses (engine.clueLeaksWord), so leak findings
// here track the real product behavior.
function leaks(clue: string, word: string, locale: Locale): boolean {
  return clueLeaksWord(clue, word, locale);
}

interface GameConfig {
  locale: Locale;
  totalPlayers: number;
  spyCount: number;
  blankEnabled: boolean;
  wordPairId: string | null;
  theme: string | null;
  difficulty: number | null;
  devMode: boolean; // fire suspect snapshots
  coach: boolean; // fire coach calls (simulate a human at one seat)
}

function ctx(p: Player) {
  return {
    thinkingStyle: p.thinkingStyle,
    attributes: p.attributes,
    learnings: p.recalledLearnings,
    memory: p.workingMemory,
    isBlank: p.role === "blank",
  };
}

async function playGame(cfg: GameConfig, gameId: string): Promise<void> {
  stats.games++;
  const pair = getWordPair(cfg.wordPairId, { theme: cfg.theme, difficulty: cfg.difficulty }, cfg.locale);
  const aiCount = cfg.totalPlayers;
  const profiles: Array<AgentProfile & { kind: "ai" | "human" }> = personasFor(cfg.locale).slice(0, aiCount).map((p) => ({ ...p, kind: "ai" as const }));
  const spyIndices = pickSpyIndices(profiles.length, cfg.spyCount);
  const blankIndex = cfg.blankEnabled ? pickBlankIndex(profiles.length, spyIndices) : -1;
  const players = buildPlayers(profiles, pair, spyIndices, blankIndex);
  // coach simulates a human seat (first civilian-ish seat)
  const coachSeat = cfg.coach ? players.find((p) => p.role === "civilian") ?? players[0] : null;

  // invariant: blank has no word
  for (const p of players) {
    if (p.role === "blank" && p.word !== "") finding("INVARIANT: blank has a word", `${p.name}=${p.word}`);
    if (p.role !== "blank" && !p.word) finding("INVARIANT: non-blank has empty word", p.name);
  }

  let order = speakingOrder(players);
  let round = 1;
  let winner: "civ" | "spy" | null = null;

  while (!winner && round <= ROUND_CAP) {
    // ── DESCRIBE ──
    const speakIds = order.filter((id) => players.find((p) => p.id === id)?.alive);
    const said: string[] = players.flatMap((p) => p.clues);
    const transcript = publicTranscript(players, cfg.locale).split("\n").filter(Boolean);
    for (const id of speakIds) {
      const sp = players.find((p) => p.id === id)!;
      if (sp.clues.length >= round) continue;
      // coach call (human-only feature) — exercise it under load
      if (coachSeat && sp.id === coachSeat.id) {
        const adv = await callAgent("coach", {
          locale: cfg.locale, decision: "describe", name: sp.name, role: sp.role, word: sp.word,
          allClues: transcript.join("\n"), aliveNames: aliveOf(players).map((p) => p.name), round,
        }, gameId);
        if (!adv || !String(adv.tip || "").trim()) finding("coach returned empty tip (describe)");
      }
      let clue = "(...)";
      let got = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await callAgent("describe", {
          locale: cfg.locale, name: sp.name, trait: sp.trait, word: sp.word, round,
          transcript: transcript.join("\n"), position: speakIds.indexOf(id) + 1, speakerCount: speakIds.length, ...ctx(sp),
        }, gameId);
        if (!res) continue;
        const c = String(res.clue || "").trim();
        if (!c) { finding("empty clue from LLM", `${sp.name} r${round}`); continue; }
        // Mirror the live leak guard: reject + re-ask a leaking clue.
        const lk = sp.role !== "blank" && leaks(c, sp.word, cfg.locale);
        if (!isDuplicateClue(c, said) && !isLazyClue(c) && !lk) { clue = c; got = true; break; }
        if (isLazyClue(c)) finding("lazy clue from LLM (after guard)", `"${c}"`);
        if (isDuplicateClue(c, said)) finding("duplicate clue from LLM", `"${c}"`);
        if (lk) finding("leak re-asked", `word="${sp.word}" clue="${c}"`);
        if (!lk) clue = c;
      }
      if (!got && clue === "(...)") finding("describe failed all attempts", `${sp.name} r${round}`);
      // A leak that survives every attempt is the real defect.
      if (sp.role !== "blank" && leaks(clue, sp.word, cfg.locale)) finding("WORD LEAK survived guard", `word="${sp.word}" clue="${clue}"`);
      sp.clues.push(clue);
      said.push(clue);
      transcript.push(transcriptLine(round, sp.name, clue, cfg.locale));

      // devMode: suspect snapshot from each alive AI
      if (cfg.devMode) {
        const names = aliveOf(players).map((p) => p.name);
        await Promise.all(
          aliveOf(players).map(async (r) => {
            const res = await callAgent("suspect", {
              locale: cfg.locale, name: r.name, trait: r.trait, word: r.word, allClues: transcript.join("\n"), aliveNames: names, ...ctx(r),
            }, gameId);
            if (res && Array.isArray(res.suspicions)) {
              for (const s of res.suspicions as Array<{ name: string }>) {
                if (s?.name && !names.includes(s.name)) finding("suspect scored a non-alive/invalid name", `${r.name}->${s.name}`);
              }
            }
          }),
        );
      }
    }
    // INVARIANT: every alive player now has exactly `round` clues (no double-append)
    for (const p of aliveOf(players)) {
      if (p.clues.length !== round) finding("INVARIANT: clue-count != round", `${p.name} ${p.clues.length}!=${round}`);
    }

    // ── VOTE (concurrent, mirrors castVotes) ──
    const allClues = publicTranscript(players, cfg.locale, true); // mark eliminated players for voting
    const tallied = await castVotesConcurrent(players, aliveOf(players).map((p) => p.name), allClues, cfg, gameId, coachSeat);
    if (!tallied) { finding("vote produced no casts at all"); break; }
    let result = tallyVotes(players);
    let outName: string | undefined;
    if (!result.tie) {
      outName = result.topNames[0];
    } else {
      // PK: tied players add one more clue, then revote among the tied
      const pkTranscript = publicTranscript(players, cfg.locale).split("\n").filter(Boolean);
      for (const nm of result.topNames) {
        const sp = players.find((p) => p.name === nm && p.alive);
        if (!sp) continue;
        if (sp.clues.length > round) continue;
        const res = await callAgent("describe", {
          locale: cfg.locale, name: sp.name, trait: sp.trait, word: sp.word, round,
          transcript: pkTranscript.join("\n"), position: 2, speakerCount: result.topNames.length, ...ctx(sp),
        }, gameId);
        const clue = String(res?.clue || "").trim() || "(...)";
        sp.clues.push(clue);
        pkTranscript.push(transcriptLine(round, sp.name, clue, cfg.locale, true));
      }
      await castVotesConcurrent(players, result.topNames, publicTranscript(players, cfg.locale, true), cfg, gameId, coachSeat, `r${round}-pk`);
      const second = tallyVotes(players);
      if (second.tie) {
        // nobody eliminated this round — continue
        round++;
        order = speakingOrder(players);
        continue;
      }
      outName = second.topNames[0];
    }

    if (!outName) { finding("no elimination target after vote", `r${round}`); break; }
    const out = players.find((p) => p.name === outName)!;
    // INVARIANT: vote target is alive & not impossible
    if (!out.alive) finding("eliminated an already-dead player", outName);
    out.alive = false;

    winner = checkWinner(players);
    if (winner === "civ" && out.isSpy) {
      // spy comeback: the just-out last spy guesses the civilian word
      const res = await callAgent("spyGuess", {
        locale: cfg.locale, name: out.name, trait: out.trait, allClues: publicTranscript(players, cfg.locale), ...ctx(out),
      }, gameId);
      const guess = String(res?.guess || "").trim();
      const norm = (s: string) => s.replace(/[\s。.,，!！?？「」"'']/g, "").toLowerCase();
      if (guess && norm(guess) === norm(pair.civ)) winner = "spy";
    }
    if (winner) {
      // reflect for each AI (exercise the feature)
      await Promise.all(
        players.filter((p) => p.kind === "ai").map(async (p) => {
          const won = (p.isSpy && winner === "spy") || (!p.isSpy && winner === "civ");
          const res = await callAgent("reflect", {
            locale: cfg.locale, name: p.name, trait: p.trait, word: p.word,
            role: p.isSpy ? "卧底" : "平民", won, transcript: publicTranscript(players, cfg.locale),
            outcome: winner === "civ" ? "平民胜" : "卧底胜", ...ctx(p),
          }, gameId);
          if (res && !Array.isArray(res.learnings)) finding("reflect returned non-array learnings");
        }),
      );
      break;
    }
    round++;
    order = speakingOrder(players);
  }

  if (!winner) finding("GAME DID NOT TERMINATE within round cap", `rounds=${round}`);
  else {
    stats.finished++;
    if (winner === "civ") stats.civWins++;
    else stats.spyWins++;
  }
}

// Concurrent vote — all alive vote in parallel; validate each is a real candidate.
async function castVotesConcurrent(
  players: Player[],
  candidateNames: string[],
  allClues: string,
  cfg: GameConfig,
  gameId: string,
  coachSeat: Player | null,
  voteKey = "r",
): Promise<boolean> {
  for (const p of players) if (p.lastVoteKey !== voteKey) { p.vote = null; p.reason = null; }
  const alive = aliveOf(players).filter((v) => candidateNames.filter((n) => n !== v.name).length > 0);
  // fire coach for the "human" seat's vote
  if (coachSeat && alive.some((v) => v.id === coachSeat.id)) {
    const adv = await callAgent("coach", {
      locale: cfg.locale, decision: "vote", name: coachSeat.name, role: coachSeat.role, word: coachSeat.word,
      allClues, aliveNames: candidateNames, round: 1,
    }, gameId);
    if (!adv || !String(adv.tip || "").trim()) finding("coach returned empty tip (vote)");
  }
  const casts = await Promise.all(
    alive.map(async (voter) => {
      const res = await callAgent("vote", {
        locale: cfg.locale, name: voter.name, trait: voter.trait, word: voter.word, allClues, aliveNames: candidateNames, ...ctx(voter),
      }, gameId);
      if (!res) return null;
      const voteName = String(res.vote || "");
      const target = alive.find((p) => p.id !== voter.id && p.name === voteName) ?? players.find((p) => p.name === voteName && p.alive && p.id !== voter.id);
      if (!target) { finding("LLM returned an invalid vote target", `${voter.name}->"${voteName}"`); return null; }
      return { voter, voteName: target.name };
    }),
  );
  let any = false;
  for (const c of casts) {
    if (!c) continue;
    const idx = players.findIndex((p) => p.id === c.voter.id);
    players[idx].vote = c.voteName;
    players[idx].lastVoteKey = voteKey;
    any = true;
  }
  return any;
}

// ── config matrix — spread feature coverage across games ────────────────────
function configFor(n: number): GameConfig {
  const locale: Locale = n % 2 === 0 ? "zh" : "en";
  const total = 4 + (n % 5); // 4..8
  const spyCount = Math.min(maxSpyCount(total), 1 + (n % 3)); // 1..3 within legal
  const blankEnabled = total - spyCount >= 2 && n % 3 === 0;
  // every 4th game picks a specific word (exercise the word picker), else random
  let wordPairId: string | null = null;
  const theme: string | null = null;
  const difficulty: number | null = null;
  if (n % 4 === 0) {
    const pairs = filterWordPairs({ theme, difficulty }, locale);
    wordPairId = pairs.length ? pairs[n % pairs.length].id : null;
  }
  return { locale, totalPlayers: total, spyCount, blankEnabled, wordPairId, theme, difficulty, devMode: n % 5 === 0, coach: n % 4 === 1 };
}

async function worker(workerId: number, games: number, offset: number) {
  for (let i = 0; i < games; i++) {
    const n = offset + i;
    const cfg = configFor(n);
    const gameId = `pt-w${workerId}-g${i}`;
    try {
      await playGame(cfg, gameId);
    } catch (e) {
      finding("HARNESS EXCEPTION in playGame", e instanceof Error ? e.message.slice(0, 160) : String(e));
    }
  }
}

async function main() {
  const total = WORKERS * GAMES_PER_WORKER;
  console.log(`[playtest] ${WORKERS} workers x ${GAMES_PER_WORKER} games = ${total} games against ${BASE}`);
  const t0 = Date.now();
  // heartbeat
  const hb = setInterval(() => {
    const el = Math.round((Date.now() - t0) / 1000);
    console.log(`[hb ${el}s] games=${stats.games}/${total} finished=${stats.finished} calls=${stats.calls} 429=${stats.rate429} errs=${stats.callErrors} avgLat=${stats.calls ? Math.round(stats.totalLatencyMs / stats.calls) : 0}ms`);
  }, 15000);

  let offset = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, (_, w) => {
      const off = offset;
      offset += GAMES_PER_WORKER;
      return worker(w, GAMES_PER_WORKER, off);
    }),
  );
  clearInterval(hb);

  const el = Math.round((Date.now() - t0) / 1000);
  console.log("\n========== PLAYTEST REPORT ==========");
  console.log(`elapsed=${el}s games=${stats.games} finished=${stats.finished} (civ ${stats.civWins} / spy ${stats.spyWins})`);
  console.log(`calls=${stats.calls} errors=${stats.callErrors} rate429=${stats.rate429} avgLatency=${stats.calls ? Math.round(stats.totalLatencyMs / stats.calls) : 0}ms`);
  console.log(`calls by kind: ${JSON.stringify(stats.byKind)}`);
  console.log(`\n--- FINDINGS (${stats.findings.size} distinct) ---`);
  const sorted = [...stats.findings.entries()].sort((a, b) => b[1].count - a[1].count);
  if (sorted.length === 0) console.log("(none)");
  for (const [k, v] of sorted) {
    console.log(`[${v.count}x] ${k}`);
    for (const ex of v.examples) console.log(`        e.g. ${ex}`);
  }
  console.log("========== END REPORT ==========");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
