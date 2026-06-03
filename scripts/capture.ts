/* Single-game capture for qualitative review. Plays ONE real game through the
 * engine + /api/agent, up to N rounds, and prints the FULL content (roles/words,
 * every clue + the agent's private reasoning, coach tips, votes + reasons,
 * eliminations, reflections) plus any anomalies — so a human can read the actual
 * gameplay and judge quality/bugs.
 *
 * Run:  npx tsx scripts/capture.ts <zh|en> [rounds] [players] [spies]
 */
import {
  aliveOf,
  buildPlayers,
  checkWinner,
  isDuplicateClue,
  isLazyClue,
  pickBlankIndex,
  pickSpyIndices,
  publicTranscript,
  speakingOrder,
  tallyVotes,
  transcriptLine,
} from "../src/game/engine";
import { personasFor } from "../src/game/personas";
import { getWordPair } from "../src/game/words";
import type { AgentProfile, Player } from "../src/game/types";

type Locale = "zh" | "en";
const BASE = "http://localhost:3000";
const LOCALE = (process.argv[2] as Locale) || "zh";
const ROUNDS = Number(process.argv[3] || 5);
const PLAYERS = Number(process.argv[4] || 8);
const SPIES = Number(process.argv[5] || 1);
const BLANK = process.argv[6] === "blank";

const anomalies: string[] = [];
const note = (s: string) => anomalies.push(s);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(kind: string, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  for (let a = 0; a < 4; a++) {
    try {
      const res = await fetch(`${BASE}/api/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, payload, gameId: "capture" }),
      });
      if (res.status === 429) { await sleep(2000); continue; }
      const data = (await res.json()) as { result?: Record<string, unknown>; error?: string };
      if (!res.ok) { if (a < 2) { await sleep(500); continue; } note(`API ${res.status} on ${kind}: ${(data?.error || "").slice(0, 80)}`); return null; }
      return data.result ?? null;
    } catch (e) { if (a < 2) { await sleep(500); continue; } note(`network ${kind}: ${e instanceof Error ? e.message : e}`); }
  }
  return null;
}
function ctx(p: Player) {
  return { thinkingStyle: p.thinkingStyle, attributes: p.attributes, learnings: p.recalledLearnings, memory: p.workingMemory, isBlank: p.role === "blank" };
}
function leaks(clue: string, word: string): boolean {
  if (!clue || !word) return false;
  if (LOCALE === "en") return clue.toLowerCase().includes(word.toLowerCase());
  if (clue.includes(word)) return true;
  for (let i = 0; i + 2 <= word.length; i++) if (clue.includes(word.slice(i, i + 2))) return true;
  return false;
}

async function main() {
  const log = (s = "") => console.log(s);
  const pair = getWordPair(null, { theme: null, difficulty: null }, LOCALE);
  const profiles: Array<AgentProfile & { kind: "ai" | "human" }> = personasFor(LOCALE).slice(0, PLAYERS).map((p) => ({ ...p, kind: "ai" as const }));
  const spyIdx = pickSpyIndices(profiles.length, SPIES);
  const blankIdx = BLANK ? pickBlankIndex(profiles.length, spyIdx) : -1;
  const players = buildPlayers(profiles, pair, spyIdx, blankIdx);
  const coachSeat = players.find((p) => p.role === "civilian")!; // simulate the masterclass human

  log(`================ CAPTURE · locale=${LOCALE} · ${PLAYERS}p / ${SPIES} spy${BLANK ? " / blank" : ""} ================`);
  log(`WORDS  civilian="${pair.civ}"  spy="${pair.spy}"  (theme=${pair.theme ?? "?"} difficulty=${pair.difficulty ?? "?"})`);
  log(`SEATS:`);
  for (const p of players) log(`  ${p.emoji} ${p.name.padEnd(6)} role=${p.role.padEnd(9)} word="${p.word || "(blank)"}"${p.id === coachSeat.id ? "  <= COACHED (acts as the human student)" : ""}`);
  log();

  let order = speakingOrder(players);
  let round = 1;
  let winner: "civ" | "spy" | null = null;

  while (!winner && round <= ROUNDS) {
    log(`────────── ROUND ${round} · describe ──────────`);
    const speakIds = order.filter((id) => players.find((p) => p.id === id)?.alive);
    const said = players.flatMap((p) => p.clues);
    const transcript = publicTranscript(players, LOCALE).split("\n").filter(Boolean);
    for (const id of speakIds) {
      const sp = players.find((p) => p.id === id)!;
      if (sp.clues.length >= round) continue;
      if (sp.id === coachSeat.id) {
        const adv = await call("coach", { locale: LOCALE, decision: "describe", name: sp.name, role: sp.role, word: sp.word, allClues: transcript.join("\n"), aliveNames: aliveOf(players).map((p) => p.name), round });
        log(`  🧑‍🏫 COACH→${sp.name} (describe): ${String(adv?.tip || "(none)").trim()}`);
      }
      let clue = "(...)"; let reasoning = "";
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await call("describe", { locale: LOCALE, name: sp.name, trait: sp.trait, word: sp.word, round, transcript: transcript.join("\n"), position: speakIds.indexOf(id) + 1, speakerCount: speakIds.length, ...ctx(sp) });
        if (!res) continue;
        const c = String(res.clue || "").trim();
        reasoning = String(res.reasoning || "").trim();
        if (res.memoryUpdate) sp.workingMemory = String(res.memoryUpdate);
        if (!c) { note(`empty clue ${sp.name} r${round}`); continue; }
        if (sp.role !== "blank" && leaks(c, sp.word)) note(`WORD LEAK: ${sp.name} "${c}" (word "${sp.word}")`);
        if (!isDuplicateClue(c, said) && !isLazyClue(c)) { clue = c; break; }
        if (isLazyClue(c)) note(`lazy clue ${sp.name}: "${c}"`);
        if (isDuplicateClue(c, said)) note(`dup clue ${sp.name}: "${c}"`);
        clue = c;
      }
      sp.clues.push(clue); said.push(clue); transcript.push(transcriptLine(round, sp.name, clue, LOCALE));
      const tag = sp.role === "spy" ? "🕵 SPY " : sp.role === "blank" ? "⬜ BLANK" : "👤 civ ";
      log(`  ${tag} ${sp.name.padEnd(6)} “${clue}”`);
      log(`             💭 ${reasoning}`);
    }

    log(`\n────────── ROUND ${round} · vote ──────────`);
    const allClues = publicTranscript(players, LOCALE);
    const adv = await call("coach", { locale: LOCALE, decision: "vote", name: coachSeat.name, role: coachSeat.role, word: coachSeat.word, allClues, aliveNames: aliveOf(players).map((p) => p.name), round });
    if (aliveOf(players).some((p) => p.id === coachSeat.id)) log(`  🧑‍🏫 COACH→${coachSeat.name} (vote): ${String(adv?.tip || "(none)").trim()}`);
    const alive = aliveOf(players);
    const candidateNames = alive.map((p) => p.name);
    const casts = await Promise.all(
      alive.map(async (voter) => {
        const res = await call("vote", { locale: LOCALE, name: voter.name, trait: voter.trait, word: voter.word, allClues, aliveNames: candidateNames, ...ctx(voter) });
        if (!res) return null;
        const v = String(res.vote || "");
        const target = alive.find((p) => p.id !== voter.id && p.name === v);
        if (!target) { note(`invalid vote ${voter.name}->"${v}"`); return null; }
        return { voter, v, reason: String(res.voteReason || "").trim() };
      }),
    );
    for (const p of players) p.vote = null;
    for (const c of casts) if (c) players.find((p) => p.id === c.voter.id)!.vote = c.v;
    for (const c of casts) if (c) { const t = c.voter.role === "spy" ? "🕵" : c.voter.role === "blank" ? "⬜" : "👤"; log(`  ${t} ${c.voter.name.padEnd(6)} → ${c.v.padEnd(6)}  (${c.reason})`); }
    const tally = tallyVotes(players);
    log(`  TALLY: ${Object.entries(tally.tally).map(([n, v]) => `${n}:${v}`).join("  ")}${tally.tie ? "  [TIE]" : ""}`);
    if (tally.tie) { note(`round ${round} tie among ${tally.topNames.join(",")} — (PK skipped in capture)`); round++; order = speakingOrder(players); log(); continue; }
    const outName = tally.topNames[0];
    const out = players.find((p) => p.name === outName)!;
    out.alive = false;
    log(`  ❌ ELIMINATED: ${out.name} — was ${out.role.toUpperCase()} (word "${out.word || "blank"}")`);
    winner = checkWinner(players);
    if (winner === "civ" && out.isSpy) {
      const g = await call("spyGuess", { locale: LOCALE, name: out.name, trait: out.trait, allClues: publicTranscript(players, LOCALE), ...ctx(out) });
      const guess = String(g?.guess || "").trim();
      const norm = (s: string) => s.replace(/[\s。.,，!！?？「」"'']/g, "").toLowerCase();
      log(`  🔪 SPY COMEBACK GUESS: "${guess}"  (civ word="${pair.civ}") → ${norm(guess) === norm(pair.civ) ? "CORRECT, spy steals win!" : "wrong"}`);
      if (norm(guess) === norm(pair.civ)) winner = "spy";
    }
    log();
    round++;
    order = speakingOrder(players);
  }

  log(`================ RESULT ================`);
  if (winner) log(`WINNER: ${winner === "civ" ? "CIVILIANS" : "UNDERCOVER"} (after ${round - 1} rounds)`);
  else log(`No winner yet — reached the ${ROUNDS}-round observation cap with ${aliveOf(players).length} players alive.`);

  if (winner) {
    log(`\n────────── REFLECTIONS ──────────`);
    for (const p of players.filter((x) => x.kind === "ai").slice(0, 4)) {
      const won = (p.isSpy && winner === "spy") || (!p.isSpy && winner === "civ");
      const res = await call("reflect", { locale: LOCALE, name: p.name, trait: p.trait, word: p.word, role: p.isSpy ? "卧底" : "平民", won, transcript: publicTranscript(players, LOCALE), outcome: winner === "civ" ? "平民胜" : "卧底胜", ...ctx(p) });
      const ls = Array.isArray(res?.learnings) ? (res!.learnings as string[]) : [];
      log(`  ${p.name} (${p.role}, ${won ? "won" : "lost"}): ${ls.map((l) => `\n      - ${l}`).join("")}`);
    }
  }

  log(`\n================ ANOMALIES (${anomalies.length}) ================`);
  if (anomalies.length === 0) log("  (none)");
  for (const a of anomalies) log(`  • ${a}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
