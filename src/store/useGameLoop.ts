"use client";

import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { agentCoach, agentDescribe, agentReflect, agentSpyGuess, agentSuspect, agentVote } from "@/ai/agent";
import { append as appendMemory, recall as recallMemory } from "@/ai/memory";
import {
  aliveOf,
  buildPlayers,
  checkWinner,
  clueLeaksWord,
  isDuplicateClue,
  isLazyClue,
  pickBlankIndex,
  pickSpyIndices,
  publicTranscript,
  speakingOrder,
  tallyVotes,
  transcriptLine,
} from "@/game/engine";
import { humanProfileFor, personasFor } from "@/game/personas";
import { getWordPair } from "@/game/words";
import type { AgentProfile, GameConfig, LogEntry, Phase, Player, SuspicionSnapshot, Winner } from "@/game/types";
import { newGameId, track } from "@/lib/telemetry";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Re-ask the SAME agent on transient failure — a retry of the same agent,
// NOT a fallback that makes a choice for it.
async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export interface HumanTurn {
  kind: "describe" | "vote" | "spyGuess";
  player: Player;
  candidates?: string[]; // for vote: restrict who the human may vote for (PK)
}

export function useGameLoop() {
  const t = useTranslations("GameLog");
  // Format a vote tally ("Alice 2 votes, Mia 1 vote") in the active locale.
  const fmtTally = (tally: Record<string, number>) =>
    Object.entries(tally)
      .map(([name, count]) => t("votesEntry", { name, count }))
      .join(t("listSep"));
  const [phase, setPhase] = useState<Phase>("setup");
  const [players, setPlayers] = useState<Player[]>([]);
  const [round, setRound] = useState(1);
  const [order, setOrder] = useState<number[]>([]);
  const [pair, setPair] = useState<ReturnType<typeof getWordPair> | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [winner, setWinner] = useState<Winner>(null);
  const [error, setError] = useState<string | null>(null);
  const [humanTurn, setHumanTurn] = useState<HumanTurn | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const [suspicion, setSuspicion] = useState<SuspicionSnapshot[]>([]);
  const [suspecting, setSuspecting] = useState(false);
  const [reflecting, setReflecting] = useState(false);
  // Masterclass coach: the LLM's tactical advice for the human's current turn.
  const [coachTip, setCoachTip] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);

  // Holds the latest players array so async loops never read stale state.
  const playersRef = useRef<Player[]>([]);
  const orderRef = useRef<number[]>([]);
  const roundRef = useRef(1);
  const devModeRef = useRef(false);
  const tutorialRef = useRef(false);
  // Rounds whose "describe phase" divider has already been logged. Lets a retry of
  // a failed describe phase (re-clicking "start this round") skip re-printing the
  // "Round N · describe" header. Reset per game in startGame.
  const describeLoggedRef = useRef<Set<number>>(new Set());
  // The game's language, set once at start; threaded into every agent prompt and
  // the transcript format so an /en game is played entirely in English.
  const localeRef = useRef<"zh" | "en">("zh");
  // The last config started, so "play again" can replay the same settings.
  const lastConfigRef = useRef<GameConfig | null>(null);
  // Resolver that the async loop awaits while the human takes their turn.
  const humanResolver = useRef<((value: string) => void) | null>(null);

  const addLog = (e: LogEntry) => setLog((l) => [...l, e]);

  const sync = (next: Player[]) => {
    playersRef.current = next;
    setPlayers(next.map((p) => ({ ...p })));
  };

  const waitForHuman = (kind: "describe" | "vote" | "spyGuess", player: Player, candidates?: string[]) =>
    new Promise<string>((resolve) => {
      humanResolver.current = resolve;
      setHumanTurn({ kind, player, candidates });
    });

  // Masterclass only: in the background, ask the LLM coach for tactical advice on
  // the human's current decision. The advice is the LLM's — code only displays it;
  // the human still decides. A failure just leaves the static hint in place.
  const fetchCoach = (decision: "describe" | "vote", player: Player, allClues: string, aliveNames: string[]) => {
    if (!tutorialRef.current || player.kind !== "human") return;
    setCoachTip(null);
    setCoachLoading(true);
    void agentCoach({
      locale: localeRef.current,
      decision,
      name: player.name,
      role: player.role,
      word: player.word,
      allClues,
      aliveNames,
      round: roundRef.current,
    })
      .then((res) => setCoachTip((res.tip || "").toString().trim() || null))
      .catch(() => setCoachTip(null))
      .finally(() => setCoachLoading(false));
  };

  const submitHuman = useCallback((value: string) => {
    const r = humanResolver.current;
    humanResolver.current = null;
    setHumanTurn(null);
    setCoachTip(null);
    setCoachLoading(false);
    if (r) r(value);
  }, []);

  // Developer mode: after a speaker finishes, every alive AI agent re-scores its
  // suspicion of every other in-play player. Scores come from the LLM only —
  // code merely collects and stores them (iron law: no code-computed suspicion).
  const runSuspicionSnapshot = async (working: Player[], r: number, speaker: Player, allClues: string) => {
    const alive = aliveOf(working);
    const aliveNames = alive.map((p) => p.name);
    const aiRaters = alive.filter((p) => p.kind === "ai");
    if (aiRaters.length === 0) return;

    setSuspecting(true);
    const results = await Promise.all(
      aiRaters.map(async (rater) => {
        try {
          // Re-ask on a transient failure (network / malformed-JSON from the model),
          // same as describe/vote — one flaky roll shouldn't drop this rater's row.
          const res = await withRetry(() =>
            agentSuspect(
              {
                locale: localeRef.current,
                name: rater.name,
                trait: rater.trait,
                word: rater.word,
                allClues,
                aliveNames,
                thinkingStyle: rater.thinkingStyle,
                attributes: rater.attributes,
                learnings: rater.recalledLearnings,
                memory: rater.workingMemory,
                isBlank: rater.role === "blank",
              },
              rater.model,
            ),
          );
          return { rater, res };
        } catch {
          return null; // one agent failing to score this tick just omits its row
        }
      }),
    );
    setSuspecting(false);

    const scores: Record<string, Record<string, number>> = {};
    const reasons: Record<string, string> = {};
    const raters: Array<{ id: number; name: string; emoji: string }> = [];
    for (const item of results) {
      if (!item) continue;
      const key = String(item.rater.id);
      raters.push({ id: item.rater.id, name: item.rater.name, emoji: item.rater.emoji });
      reasons[key] = (item.res.reasoning || "").toString();
      const m: Record<string, number> = {};
      for (const s of item.res.suspicions || []) {
        if (s && typeof s.score === "number" && s.name) {
          m[s.name] = Math.max(0, Math.min(100, Math.round(s.score)));
        }
      }
      scores[key] = m;
    }
    if (raters.length === 0) return;
    const snap: SuspicionSnapshot = {
      round: r,
      afterSpeakerId: speaker.id,
      afterSpeakerName: speaker.name,
      raters,
      targets: aliveNames,
      scores,
      reasons,
    };
    setSuspicion((prev) => [...prev, snap]);
  };

  // ── Start a game ────────────────────────────────────────────────────────
  const startGame = useCallback((config: GameConfig) => {
    localeRef.current = config.locale ?? "zh";
    lastConfigRef.current = config;
    const pairChosen = getWordPair(config.wordPairId, { theme: config.theme, difficulty: config.difficulty }, config.locale ?? "zh");
    const aiCount = config.totalPlayers - config.humanPlayers;
    // Advanced settings supply per-seat AgentProfiles; otherwise use the locale's
    // default personas (English names + traits in an /en game).
    const locale = config.locale ?? "zh";
    const aiSource =
      config.aiSlots && config.aiSlots.length >= aiCount ? config.aiSlots.slice(0, aiCount) : personasFor(locale).slice(0, aiCount);
    const profiles: Array<AgentProfile & { kind: "ai" | "human" }> = aiSource.map((p) => ({
      ...p,
      kind: "ai" as const,
    }));
    if (config.humanPlayers === 1) profiles.push({ ...humanProfileFor(locale), kind: "human" as const });
    // Seat the human at a random position so they aren't always last.
    for (let i = profiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [profiles[i], profiles[j]] = [profiles[j], profiles[i]];
    }

    const spyIndices = pickSpyIndices(profiles.length, config.spyCount);
    const blankIndex = config.blankEnabled ? pickBlankIndex(profiles.length, spyIndices) : -1;
    const ps = buildPlayers(profiles, pairChosen, spyIndices, blankIndex);

    // Recall each AI's long-term lessons (from past games with the same agentId).
    for (const pl of ps) {
      if (pl.kind === "ai") pl.recalledLearnings = recallMemory(pl.agentId, 8);
    }

    sync(ps);
    setPair(pairChosen);
    setRound(1);
    roundRef.current = 1;
    describeLoggedRef.current = new Set();
    const ord = speakingOrder(ps);
    setOrder(ord);
    orderRef.current = ord;
    setWinner(null);
    setError(null);
    setHumanTurn(null);
    setDevMode(config.devMode);
    devModeRef.current = config.devMode;
    setTutorial(!!config.tutorial);
    tutorialRef.current = !!config.tutorial;
    setCoachTip(null);
    setCoachLoading(false);
    setSuspicion([]);
    setLog([
      {
        type: "system",
        text: t(blankIndex >= 0 ? "gameStartBlank" : "gameStartNoBlank", {
          players: ps.length,
          spies: spyIndices.length,
        }),
      },
      { type: "system", text: t("gameIntro") },
    ]);
    setPhase("ready");

    newGameId();
    track("game_start", {
      totalPlayers: ps.length,
      aiPlayers: ps.filter((p) => p.kind === "ai").length,
      hasHuman: config.humanPlayers === 1,
      spyCount: spyIndices.length,
      blank: blankIndex >= 0,
      devMode: config.devMode,
      tutorial: !!config.tutorial,
      wordPairId: pairChosen.id,
      theme: config.theme,
      difficulty: pairChosen.difficulty ?? null,
    });
  }, []);

  // ── Describe phase ──────────────────────────────────────────────────────
  const runDescribe = useCallback(async () => {
    setBusy(true);
    setError(null);
    setPhase("describing");
    const r = roundRef.current;
    // Only print the "Round N · describe" divider once per round. On a retry after a
    // mid-phase failure (re-clicking "start this round"), the divider is already there.
    if (!describeLoggedRef.current.has(r)) {
      describeLoggedRef.current.add(r);
      addLog({ type: "phase", text: t("describePhase", { round: r }), round: r });
    }

    const working = playersRef.current.map((p) => ({ ...p }));
    const speakIds = orderRef.current.filter((id) => working.find((p) => p.id === id)?.alive);
    const transcript = publicTranscript(working, localeRef.current).split("\n").filter(Boolean);
    const said: string[] = working.flatMap((p) => p.clues); // every clue said so far this game

    try {
      for (const id of speakIds) {
        const sp = working.find((p) => p.id === id)!;
        // Resume, don't redo: if this player already gave a clue for round r
        // (a prior attempt got this far before failing), skip them. Their clue is
        // already in `working`/`transcript`. Without this, a retry would re-ask
        // them AND push a second clue, shifting it into the next round's slot.
        if (sp.clues.length >= r) continue;
        setSpeakingId(id);
        await sleep(300);

        let clue: string;
        let reasoning: string | null = null;
        if (sp.kind === "human") {
          // Masterclass: ask the coach (in the background) how to clue this turn.
          fetchCoach("describe", sp, transcript.join("\n"), aliveOf(working).map((p) => p.name));
          // Block the human from repeating or saying "same as above"; re-prompt until valid.
          clue = "(……我先不说太多)";
          while (true) {
            const input = (await waitForHuman("describe", sp)).trim();
            if (!input) break;
            if (isLazyClue(input)) {
              setError(t("errLazy"));
              continue;
            }
            if (isDuplicateClue(input, said)) {
              setError(t("errDup"));
              continue;
            }
            if (clueLeaksWord(input, sp.word, localeRef.current)) {
              setError(t("errLeak"));
              continue;
            }
            setError(null);
            clue = input;
            break;
          }
        } else {
          // Re-ask the SAME agent up to 3 times if it repeats (allowed: re-asking,
          // not deciding for it). Accept whatever it gives after that.
          clue = t("clueStuck");
          for (let attempt = 0; attempt < 3; attempt++) {
            const res = await withRetry(() =>
              agentDescribe(
                {
                  locale: localeRef.current,
                  name: sp.name,
                  trait: sp.trait,
                  word: sp.word,
                  round: r,
                  transcript: transcript.join("\n"),
                  position: speakIds.indexOf(id) + 1,
                  speakerCount: speakIds.length,
                  thinkingStyle: sp.thinkingStyle,
                  attributes: sp.attributes,
                  learnings: sp.recalledLearnings,
                  memory: sp.workingMemory,
                  isBlank: sp.role === "blank",
                },
                sp.model,
              ),
            );
            reasoning = res.reasoning ?? null;
            if (res.memoryUpdate) sp.workingMemory = res.memoryUpdate.toString();
            const c = (res.clue || "").toString().trim();
            if (!c) continue;
            const leaks = clueLeaksWord(c, sp.word, localeRef.current);
            if (!isDuplicateClue(c, said) && !isLazyClue(c) && !leaks) {
              clue = c;
              break;
            }
            // Fallback: prefer ANY non-leaking attempt; only keep a leaking one if
            // we have nothing else yet (still the agent's own words, never substituted).
            if (!leaks) clue = c;
            else if (clue === t("clueStuck")) clue = c;
          }
        }

        said.push(clue);
        sp.clues.push(clue);
        sp.lastReasoning = reasoning;
        transcript.push(transcriptLine(r, sp.name, clue, localeRef.current));
        sync(working);
        addLog({ type: "clue", id, name: sp.name, emoji: sp.emoji, round: r, text: clue, reasoning });
        track("clue", {
          round: r,
          name: sp.name,
          kind: sp.kind,
          role: sp.role,
          isSpy: sp.isSpy,
          position: speakIds.indexOf(id) + 1,
          clueLen: clue.length,
        });
        await sleep(200);

        if (devModeRef.current) {
          // Every AI agent re-scores suspicion right after this statement.
          await runSuspicionSnapshot(working, r, sp, transcript.join("\n"));
        }
      }
      setSpeakingId(null);
      setPhase("described");
    } catch (e) {
      setSpeakingId(null);
      setError(t("errDescribe", { msg: e instanceof Error ? e.message : String(e) }));
      setPhase("ready");
    } finally {
      setBusy(false);
    }
  }, []);

  // After the game ends, each AI agent reflects and writes its OWN lessons to
  // long-term memory (agentId-keyed). The agent authors the learnings; code only
  // stores them and recalls them next game (iron law).
  const runReflections = async (working: Player[], winner: "civ" | "spy") => {
    const ai = working.filter((p) => p.kind === "ai");
    if (ai.length === 0) return;
    setReflecting(true);
    addLog({ type: "system", text: t("reflecting") });
    const transcript = publicTranscript(working, localeRef.current);
    const results = await Promise.all(
      ai.map(async (p) => {
        const won = (p.isSpy && winner === "spy") || (!p.isSpy && winner === "civ");
        try {
          // Re-ask on a transient failure (malformed-JSON roll), like describe/vote,
          // so a single bad roll doesn't silently skip this agent's learnings.
          const res = await withRetry(() =>
            agentReflect(
              {
                locale: localeRef.current,
                name: p.name,
                trait: p.trait,
                word: p.word,
                role: p.isSpy ? "卧底" : "平民",
                won,
                transcript,
                outcome: winner === "civ" ? "平民胜" : "卧底胜",
                thinkingStyle: p.thinkingStyle,
                attributes: p.attributes,
                learnings: p.recalledLearnings,
                memory: p.workingMemory,
              },
              p.model,
            ),
          );
          const learnings = (res.learnings || []).map((s) => s.toString().trim()).filter(Boolean).slice(0, 3);
          if (learnings.length) appendMemory(p.agentId, learnings);
          return learnings.length;
        } catch {
          return 0;
        }
      }),
    );
    setReflecting(false);
    const total = results.reduce((n, x) => n + x, 0);
    addLog({ type: "system", text: t("reflectDone", { total }) });
    track("reflect_done", { winner, reflectors: ai.length, learningsWritten: total });
  };

  // One round of voting. Each alive player votes for someone in candidateNames
  // (the enum is passed to the model, so the choice is structurally constrained
  // but always the agent's). Everyone — all AI agents AND the human — votes
  // CONCURRENTLY; the cast votes are applied and revealed together only after
  // every voter has finished, so no one's choice is shown before the rest.
  const castVotes = async (
    working: Player[],
    candidateNames: string[],
    allClues: string,
    voteKey: string,
    humanCandidates?: string[],
  ) => {
    // Clear only votes that belong to a DIFFERENT stage/round; keep this stage's
    // already-cast votes so a retried vote phase resumes (and tallyVotes counts
    // only this stage's votes, since the rest are now null).
    for (let i = 0; i < working.length; i++) {
      if (working[i].lastVoteKey !== voteKey) working[i] = { ...working[i], vote: null, reason: null };
    }
    const alive = aliveOf(working);
    // Voters still needing to vote this stage (resumable: skip already-voted ones).
    const todo = alive.filter((v) => {
      if (candidateNames.filter((n) => n !== v.name).length === 0) return false;
      return !(v.lastVoteKey === voteKey && v.vote != null);
    });
    if (todo.length === 0) {
      setSpeakingId(null);
      return;
    }

    // A pending vote — collected without mutating/logging so the reveal can wait
    // until everyone is done.
    type Cast = { voter: Player; voteName: string; reason: string; reasoning: string | null; memUpdate: string | null };

    const human = todo.find((v) => v.kind === "human");
    const ais = todo.filter((v) => v.kind === "ai");

    // All AI agents vote in parallel. A voter that ultimately fails (or returns an
    // invalid name even after re-asking) just abstains this stage rather than
    // aborting everyone else's vote.
    const aiVotes = Promise.all(
      ais.map(async (voter): Promise<Cast | null> => {
        try {
          return await withRetry(async (): Promise<Cast> => {
            const res = await agentVote(
              {
                locale: localeRef.current,
                name: voter.name,
                trait: voter.trait,
                word: voter.word,
                allClues,
                aliveNames: candidateNames,
                thinkingStyle: voter.thinkingStyle,
                attributes: voter.attributes,
                learnings: voter.recalledLearnings,
                memory: voter.workingMemory,
                isBlank: voter.role === "blank",
              },
              voter.model,
            );
            const target = alive.find((p) => p.id !== voter.id && p.name === res.vote);
            if (!target) throw new Error(`${voter.name} returned an invalid vote “${res.vote}”`);
            return {
              voter,
              voteName: target.name,
              reason: (res.voteReason || t("voteGut")).toString().trim(),
              reasoning: res.reasoning ?? null,
              memUpdate: res.memoryUpdate ?? null,
            };
          });
        } catch {
          return null;
        }
      }),
    );

    // The human votes at the same time. Pass humanCandidates straight through (not
    // the full list) so the "pick among the tied" UI only shows in an actual PK.
    if (human) fetchCoach("vote", human, allClues, candidateNames);
    const humanVote: Promise<Cast | null> = human
      ? waitForHuman("vote", human, humanCandidates).then((voteName) => ({
          voter: human,
          voteName,
          reason: t("voteOwn"),
          reasoning: null,
          memUpdate: null,
        }))
      : Promise.resolve(null);

    const [humanCast, aiCasts] = await Promise.all([humanVote, aiVotes]);
    const casts = [humanCast, ...aiCasts].filter((c): c is Cast => c != null);
    if (casts.length === 0) throw new Error("没有任何有效投票（所有投票均失败）。");

    // Apply every vote, then reveal the whole tally of votes together (seating order).
    for (const c of casts) {
      const idx = working.findIndex((p) => p.id === c.voter.id);
      working[idx] = {
        ...working[idx],
        vote: c.voteName,
        reason: c.reason,
        lastVoteKey: voteKey,
        lastReasoning: c.reasoning,
        workingMemory: c.memUpdate ?? working[idx].workingMemory,
      };
    }
    sync(working);
    for (const v of alive) {
      const c = casts.find((x) => x.voter.id === v.id);
      if (!c) continue;
      addLog({ type: "vote", id: c.voter.id, name: c.voter.name, emoji: c.voter.emoji, target: c.voteName, reason: c.reason, reasoning: c.reasoning });
      track("vote", {
        round: roundRef.current,
        voter: c.voter.name,
        voterKind: c.voter.kind,
        voterIsSpy: c.voter.isSpy,
        target: c.voteName,
      });
    }
    setSpeakingId(null);
  };

  // Comeback guess: the just-eliminated last spy gets one guess at the civilians' word.
  // The AGENT produces the guess; code only checks it against the secret word
  // (a referee correctness check, like validating a vote — not deciding for it).
  const runSpyGuess = async (spy: Player, working: Player[]): Promise<"civ" | "spy"> => {
    const civWord = working.find((p) => p.role === "civilian")?.word ?? "";
    const allClues = publicTranscript(working, localeRef.current);
    addLog({ type: "system", text: t("spyComebackPrompt", { name: spy.name }) });

    let guess = "";
    if (spy.kind === "human") {
      guess = (await waitForHuman("spyGuess", spy)).trim();
    } else {
      setSpeakingId(spy.id);
      try {
        const res = await withRetry(() =>
          agentSpyGuess(
            {
              locale: localeRef.current,
              name: spy.name,
              trait: spy.trait,
              allClues,
              thinkingStyle: spy.thinkingStyle,
              attributes: spy.attributes,
              learnings: spy.recalledLearnings,
              memory: spy.workingMemory,
            },
            spy.model,
          ),
        );
        guess = (res.guess || "").toString().trim();
      } catch {
        guess = "";
      }
      setSpeakingId(null);
    }

    const norm = (s: string) => s.replace(/[\s。.,，!！?？「」"']/g, "");
    const g = norm(guess);
    const c = norm(civWord);
    const correct = !!g && !!c && (g.includes(c) || c.includes(g));
    addLog({ type: "system", text: t("spyComebackResult", { name: spy.name, guess: guess || t("noGuess"), word: civWord }) });
    track("spy_guess", { round: roundRef.current, guesser: spy.name, kind: spy.kind, hasGuess: !!g, correct });
    return correct ? "spy" : "civ";
  };

  // ── Vote phase ──────────────────────────────────────────────────────────
  const runVote = useCallback(async () => {
    setBusy(true);
    setError(null);
    setPhase("voting");
    const r = roundRef.current;
    addLog({ type: "phase", text: t("votePhase", { round: r }), round: r });

    const working = playersRef.current.map((p): Player => ({ ...p }));

    try {
      const aliveNames = aliveOf(working).map((p) => p.name);
      // markEliminated=true tags out players in the transcript so agents stop voting for them.
      await castVotes(working, aliveNames, publicTranscript(working, localeRef.current, true), `r${r}`);
      const first = tallyVotes(working);
      addLog({ type: "tally", text: t("tallyResult", { tally: fmtTally(first.tally) }) });
      track("tally", { round: r, stage: "first", tie: first.tie, top: first.topNames });

      let outName: string;
      if (!first.tie) {
        outName = first.topNames[0];
      } else {
        // Tie-break: tied players each add one more clue, then a revote restricted
        // to just the tied candidates. Still tied → nobody is eliminated.
        addLog({ type: "system", text: t("tieBreak", { names: first.topNames.join(t("tieNamesSep")) }) });
        const transcript = publicTranscript(working, localeRef.current).split("\n").filter(Boolean);
        for (const nm of first.topNames) {
          const sp = working.find((p) => p.name === nm && p.alive);
          if (!sp) continue;
          // Resume, don't redo: a tied player who already added their one extra
          // PK clue this round has clues.length > r (one beyond the normal round).
          // Skip them so a retry doesn't append a second PK clue.
          if (sp.clues.length > r) continue;
          setSpeakingId(sp.id);
          await sleep(300);
          let clue: string;
          let reasoning: string | null = null;
          if (sp.kind === "human") {
            // A cornered tied player can't leak the word in the decisive PK clue either.
            clue = t("cluePkAdd");
            while (true) {
              const input = (await waitForHuman("describe", sp)).trim();
              if (!input) break; // empty → keep the placeholder
              if (clueLeaksWord(input, sp.word, localeRef.current)) {
                setError(t("errLeak"));
                continue;
              }
              setError(null);
              clue = input;
              break;
            }
          } else {
            // The PK clue is the riskiest leak site (a suspected player speaking right
            // before the decisive revote) — re-ask up to twice if it leaks.
            clue = t("clueEllipsis");
            for (let attempt = 0; attempt < 2; attempt++) {
              const res = await withRetry(() =>
                agentDescribe(
                  {
                    locale: localeRef.current,
                    name: sp.name,
                    trait: sp.trait,
                    word: sp.word,
                    round: r,
                    transcript: transcript.join("\n"),
                    position: 2,
                    speakerCount: first.topNames.length,
                    thinkingStyle: sp.thinkingStyle,
                    attributes: sp.attributes,
                    learnings: sp.recalledLearnings,
                    memory: sp.workingMemory,
                    isBlank: sp.role === "blank",
                  },
                  sp.model,
                ),
              );
              reasoning = res.reasoning ?? null;
              if (res.memoryUpdate) sp.workingMemory = res.memoryUpdate.toString();
              const c = (res.clue || "").toString().trim();
              if (!c) continue;
              if (!clueLeaksWord(c, sp.word, localeRef.current)) {
                clue = c;
                break;
              }
              if (clue === t("clueEllipsis")) clue = c; // keep a leaking clue only if nothing else
            }
          }
          const i2 = working.findIndex((p) => p.id === sp.id);
          working[i2] = { ...working[i2], clues: [...working[i2].clues, clue], lastReasoning: reasoning };
          transcript.push(transcriptLine(r, sp.name, clue, localeRef.current, true));
          sync(working);
          addLog({ type: "clue", id: sp.id, name: sp.name, emoji: sp.emoji, round: r, text: clue, reasoning });
          await sleep(200);
        }
        setSpeakingId(null);
        addLog({ type: "phase", text: t("pkPhase", { round: r }), round: r });
        await castVotes(working, first.topNames, publicTranscript(working, localeRef.current, true), `r${r}-pk`, first.topNames);
        const second = tallyVotes(working);
        addLog({ type: "tally", text: t("pkTally", { tally: fmtTally(second.tally) }) });
        if (second.tie) {
          addLog({ type: "system", text: t("pkStillTie") });
          setPhase("revealed");
          return;
        }
        outName = second.topNames[0];
      }

      const out = working.find((p) => p.name === outName)!;
      await sleep(450);
      const outIdx = working.findIndex((p) => p.id === out.id);
      working[outIdx] = { ...working[outIdx], alive: false };
      sync(working);
      addLog({
        type: "eliminate",
        name: out.name,
        emoji: out.emoji,
        isSpy: out.isSpy,
        word: out.word,
        text: out.isSpy
          ? t("elimSpy", { name: out.name })
          : out.role === "blank"
            ? t("elimBlank", { name: out.name })
            : t("elimCiv", { name: out.name }),
      });
      track("eliminate", { round: r, name: out.name, kind: out.kind, role: out.role, isSpy: out.isSpy });

      let w = checkWinner(working);
      // If civilians just eliminated the last spy, that spy gets a comeback guess.
      if (w === "civ" && out.isSpy) {
        w = await runSpyGuess(out, working);
      }
      if (w === "civ" || w === "spy") {
        setWinner(w);
        setPhase("gameover");
        addLog({
          type: "result",
          text: w === "civ" ? t("resultCiv") : t("resultSpy"),
        });
        track("game_over", {
          winner: w,
          rounds: r,
          survivors: aliveOf(working).length,
          spyGuessUsed: out.isSpy && w === "spy",
        });
        await runReflections(working, w);
      } else {
        setPhase("revealed");
      }
    } catch (e) {
      setSpeakingId(null);
      setError(t("errVote", { msg: e instanceof Error ? e.message : String(e) }));
      setPhase("described");
    } finally {
      setBusy(false);
    }
  }, []);

  const nextRound = useCallback(() => {
    const next = roundRef.current + 1;
    roundRef.current = next;
    setRound(next);
    const ord = speakingOrder(playersRef.current);
    orderRef.current = ord;
    setOrder(ord);
    setPhase("ready");
    addLog({ type: "system", text: t("nextRound", { next, alive: aliveOf(playersRef.current).length }) });
  }, []);

  // One tap between rounds: advance the round AND immediately start its describe
  // phase, instead of making the user click "next round" then "start describing".
  // nextRound() updates roundRef/orderRef synchronously, so runDescribe() (which
  // reads those refs) picks up the new round; React batches the two setPhase calls
  // so the intermediate "ready" never renders. The game's FIRST round still starts
  // from the explicit "ready" button after setup — this only fuses the between-round step.
  const nextRoundAndDescribe = useCallback(() => {
    nextRound();
    void runDescribe();
  }, [nextRound, runDescribe]);

  const restart = useCallback(() => {
    setPhase("setup");
    setHumanTurn(null);
    setError(null);
  }, []);

  // Play again with the SAME settings — only the word changes (wordPairId null
  // re-rolls a random pair within the same theme/difficulty filter). Does not
  // return to setup, so the masterclass intro cards don't reappear either.
  const playAgain = useCallback(() => {
    const c = lastConfigRef.current;
    if (!c) {
      setPhase("setup");
      return;
    }
    startGame({ ...c, wordPairId: null });
  }, [startGame]);

  return {
    phase,
    players,
    round,
    order,
    pair,
    log,
    busy,
    speakingId,
    winner,
    error,
    humanTurn,
    devMode,
    tutorial,
    suspicion,
    suspecting,
    reflecting,
    coachTip,
    coachLoading,
    startGame,
    runDescribe,
    runVote,
    nextRound,
    nextRoundAndDescribe,
    restart,
    playAgain,
    submitHuman,
  };
}
