"use client";

import { useCallback, useRef, useState } from "react";
import { agentDescribe, agentReflect, agentSpyGuess, agentSuspect, agentVote } from "@/ai/agent";
import { append as appendMemory, recall as recallMemory } from "@/ai/memory";
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
  tallyText,
  tallyVotes,
} from "@/game/engine";
import { HUMAN_PROFILE, PERSONAS } from "@/game/personas";
import { getWordPair } from "@/game/words";
import type { AgentProfile, GameConfig, LogEntry, Phase, Player, SuspicionSnapshot, Winner } from "@/game/types";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Re-ask the SAME agent on transient failure. This is "重问同一个 agent"
// (allowed by the iron law), NOT a fallback that decides for the agent.
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
  const [suspicion, setSuspicion] = useState<SuspicionSnapshot[]>([]);
  const [suspecting, setSuspecting] = useState(false);
  const [reflecting, setReflecting] = useState(false);

  // Holds the latest players array so async loops never read stale state.
  const playersRef = useRef<Player[]>([]);
  const orderRef = useRef<number[]>([]);
  const roundRef = useRef(1);
  const devModeRef = useRef(false);
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

  const submitHuman = useCallback((value: string) => {
    const r = humanResolver.current;
    humanResolver.current = null;
    setHumanTurn(null);
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
          const res = await agentSuspect(
            {
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
    const pairChosen = getWordPair(config.wordPairId, { theme: config.theme, difficulty: config.difficulty });
    const aiCount = config.totalPlayers - config.humanPlayers;
    // Advanced settings supply per-seat AgentProfiles; otherwise use PERSONAS defaults.
    const aiSource =
      config.aiSlots && config.aiSlots.length >= aiCount ? config.aiSlots.slice(0, aiCount) : PERSONAS.slice(0, aiCount);
    const profiles: Array<AgentProfile & { kind: "ai" | "human" }> = aiSource.map((p) => ({
      ...p,
      kind: "ai" as const,
    }));
    if (config.humanPlayers === 1) profiles.push({ ...HUMAN_PROFILE, kind: "human" as const });
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
    const ord = speakingOrder(ps);
    setOrder(ord);
    orderRef.current = ord;
    setWinner(null);
    setError(null);
    setHumanTurn(null);
    setDevMode(config.devMode);
    devModeRef.current = config.devMode;
    setSuspicion([]);
    setLog([
      {
        type: "system",
        text:
          `本局开始 · ${ps.length} 名玩家入座，其中潜伏着 ${spyIndices.length} 名卧底` +
          (blankIndex >= 0 ? `，还混入了 1 名白板(没有词)。` : `。`),
      },
      { type: "system", text: `平民与卧底各自拿到了一个相近但不同的词。连他们自己都还不知道谁是那个例外。` },
    ]);
    setPhase("ready");
  }, []);

  // ── Describe phase ──────────────────────────────────────────────────────
  const runDescribe = useCallback(async () => {
    setBusy(true);
    setError(null);
    setPhase("describing");
    const r = roundRef.current;
    addLog({ type: "phase", text: `第 ${r} 轮 · 描述环节`, round: r });

    const working = playersRef.current.map((p) => ({ ...p }));
    const speakIds = orderRef.current.filter((id) => working.find((p) => p.id === id)?.alive);
    const transcript = publicTranscript(working).split("\n").filter(Boolean);
    const said: string[] = working.flatMap((p) => p.clues); // every clue said so far this game

    try {
      for (const id of speakIds) {
        const sp = working.find((p) => p.id === id)!;
        setSpeakingId(id);
        await sleep(300);

        let clue: string;
        let reasoning: string | null = null;
        if (sp.kind === "human") {
          // Block the human from repeating or saying "和上面一样"; re-prompt until valid.
          clue = "(……我先不说太多)";
          while (true) {
            const input = (await waitForHuman("describe", sp)).trim();
            if (!input) break;
            if (isLazyClue(input)) {
              setError("不能说“和上面一样/同上”这类话，请认真描述一句。");
              continue;
            }
            if (isDuplicateClue(input, said)) {
              setError("不能和别人说过的完全重复，换个角度再说一句。");
              continue;
            }
            setError(null);
            clue = input;
            break;
          }
        } else {
          // Re-ask the SAME agent up to 3 times if it repeats (allowed: re-asking,
          // not deciding for it). Accept whatever it gives after that.
          clue = "(……一时语塞)";
          for (let attempt = 0; attempt < 3; attempt++) {
            const res = await withRetry(() =>
              agentDescribe(
                {
                  name: sp.name,
                  trait: sp.trait,
                  word: sp.word,
                  round: r,
                  transcript: transcript.join("\n"),
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
            if (c && !isDuplicateClue(c, said) && !isLazyClue(c)) {
              clue = c;
              break;
            }
            if (c) clue = c; // keep last attempt as fallback
          }
        }

        said.push(clue);
        sp.clues.push(clue);
        sp.lastReasoning = reasoning;
        transcript.push(`【第${r}轮】${sp.name}：${clue}`);
        sync(working);
        addLog({ type: "clue", id, name: sp.name, emoji: sp.emoji, round: r, text: clue, reasoning });
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
      setError(`描述环节出错：${e instanceof Error ? e.message : String(e)}（可点“开始本轮描述”重试本轮）`);
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
    addLog({ type: "system", text: "AI 们正在复盘本局、记下经验……" });
    const transcript = publicTranscript(working);
    const results = await Promise.all(
      ai.map(async (p) => {
        const won = (p.isSpy && winner === "spy") || (!p.isSpy && winner === "civ");
        try {
          const res = await agentReflect(
            {
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
    addLog({ type: "system", text: `复盘完成，共写入 ${total} 条经验到各 AI 的长期记忆(下一局会自动带上)。` });
  };

  // One round of voting. Each alive player votes for someone in candidateNames
  // (the enum is passed to the model, so the choice is structurally constrained
  // but always the agent's). Mutates `working` in place; reset votes first.
  const castVotes = async (
    working: Player[],
    candidateNames: string[],
    allClues: string,
    humanCandidates?: string[],
  ) => {
    for (let i = 0; i < working.length; i++) working[i] = { ...working[i], vote: null, reason: null };
    const alive = aliveOf(working);
    for (const voter of alive) {
      const candidates = candidateNames.filter((n) => n !== voter.name);
      if (candidates.length === 0) continue;
      setSpeakingId(voter.id);
      await sleep(280);

      let voteName: string;
      let reason: string;
      let reasoning: string | null = null;
      let memUpdate: string | null = null;

      if (voter.kind === "human") {
        voteName = await waitForHuman("vote", voter, humanCandidates ?? candidateNames);
        reason = "（你的投票）";
      } else {
        const res = await withRetry(() =>
          agentVote(
            {
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
          ),
        );
        reasoning = res.reasoning ?? null;
        memUpdate = res.memoryUpdate ?? null;
        const target = alive.find((p) => p.id !== voter.id && p.name === res.vote);
        if (!target) throw new Error(`${voter.name} 返回了无效投票“${res.vote}”`);
        voteName = target.name;
        reason = (res.voteReason || "凭直觉。").toString().trim();
      }

      const idx = working.findIndex((p) => p.id === voter.id);
      working[idx] = {
        ...working[idx],
        vote: voteName,
        reason,
        lastReasoning: reasoning,
        workingMemory: memUpdate ?? working[idx].workingMemory,
      };
      sync(working);
      addLog({ type: "vote", id: voter.id, name: voter.name, emoji: voter.emoji, target: voteName, reason, reasoning });
      await sleep(200);
    }
    setSpeakingId(null);
  };

  // 反杀: the just-eliminated last spy gets one guess at the civilians' word.
  // The AGENT produces the guess; code only checks it against the secret word
  // (a referee correctness check, like validating a vote — not deciding for it).
  const runSpyGuess = async (spy: Player, working: Player[]): Promise<"civ" | "spy"> => {
    const civWord = working.find((p) => p.role === "civilian")?.word ?? "";
    const allClues = publicTranscript(working);
    addLog({ type: "system", text: `${spy.name} 是最后一名卧底——给他一次「猜词反杀」的机会：猜中平民的词就翻盘。` });

    let guess = "";
    if (spy.kind === "human") {
      guess = (await waitForHuman("spyGuess", spy)).trim();
    } else {
      setSpeakingId(spy.id);
      try {
        const res = await withRetry(() =>
          agentSpyGuess(
            {
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
    addLog({ type: "system", text: `${spy.name} 猜：「${guess || "(没猜)"}」——平民的词是「${civWord}」。` });
    return correct ? "spy" : "civ";
  };

  // ── Vote phase ──────────────────────────────────────────────────────────
  const runVote = useCallback(async () => {
    setBusy(true);
    setError(null);
    setPhase("voting");
    const r = roundRef.current;
    addLog({ type: "phase", text: `第 ${r} 轮 · 投票环节`, round: r });

    const working = playersRef.current.map((p): Player => ({ ...p }));

    try {
      const aliveNames = aliveOf(working).map((p) => p.name);
      await castVotes(working, aliveNames, publicTranscript(working));
      const first = tallyVotes(working);
      addLog({ type: "tally", text: `计票结果：${tallyText(first.tally)}。` });

      let outName: string;
      if (!first.tie) {
        outName = first.topNames[0];
      } else {
        // 平票 PK: tied players each add one more clue, then a revote restricted
        // to just the tied candidates. Still tied → nobody is eliminated.
        addLog({ type: "system", text: `出现平票（${first.topNames.join("、")}）——进入 PK：他们各补一句描述后重投。` });
        const transcript = publicTranscript(working).split("\n").filter(Boolean);
        for (const nm of first.topNames) {
          const sp = working.find((p) => p.name === nm && p.alive);
          if (!sp) continue;
          setSpeakingId(sp.id);
          await sleep(300);
          let clue: string;
          let reasoning: string | null = null;
          if (sp.kind === "human") {
            clue = (await waitForHuman("describe", sp)).trim() || "(……我再补一句)";
          } else {
            const res = await withRetry(() =>
              agentDescribe(
                {
                  name: sp.name,
                  trait: sp.trait,
                  word: sp.word,
                  round: r,
                  transcript: transcript.join("\n"),
                  thinkingStyle: sp.thinkingStyle,
                  attributes: sp.attributes,
                  learnings: sp.recalledLearnings,
                  memory: sp.workingMemory,
                  isBlank: sp.role === "blank",
                },
                sp.model,
              ),
            );
            clue = (res.clue || "").toString().trim() || "(……)";
            reasoning = res.reasoning ?? null;
            if (res.memoryUpdate) sp.workingMemory = res.memoryUpdate.toString();
          }
          const i2 = working.findIndex((p) => p.id === sp.id);
          working[i2] = { ...working[i2], clues: [...working[i2].clues, clue], lastReasoning: reasoning };
          transcript.push(`【第${r}轮·PK】${sp.name}：${clue}`);
          sync(working);
          addLog({ type: "clue", id: sp.id, name: sp.name, emoji: sp.emoji, round: r, text: clue, reasoning });
          await sleep(200);
        }
        setSpeakingId(null);
        addLog({ type: "phase", text: `第 ${r} 轮 · PK 重投`, round: r });
        await castVotes(working, first.topNames, publicTranscript(working), first.topNames);
        const second = tallyVotes(working);
        addLog({ type: "tally", text: `PK 计票：${tallyText(second.tally)}。` });
        if (second.tie) {
          addLog({ type: "system", text: `PK 仍然平票，本轮无人出局。` });
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
          ? `${out.name} 被票出——他正是卧底！他的词是「${out.word}」。`
          : out.role === "blank"
            ? `${out.name} 被票出，但他是白板(根本没有词)！卧底还在场……`
            : `${out.name} 被票出，但他是平民，词是「${out.word}」。卧底还在场……`,
      });

      let w = checkWinner(working);
      // If civilians just eliminated the last spy, that spy gets a 反杀 guess.
      if (w === "civ" && out.isSpy) {
        w = await runSpyGuess(out, working);
      }
      if (w === "civ" || w === "spy") {
        setWinner(w);
        setPhase("gameover");
        addLog({
          type: "result",
          text: w === "civ" ? "🎉 平民阵营胜利！卧底已被揪出。" : "🩸 卧底阵营胜利！",
        });
        await runReflections(working, w);
      } else {
        setPhase("revealed");
      }
    } catch (e) {
      setSpeakingId(null);
      setError(`投票环节出错：${e instanceof Error ? e.message : String(e)}`);
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
    addLog({ type: "system", text: `进入第 ${next} 轮，场上还剩 ${aliveOf(playersRef.current).length} 人。` });
  }, []);

  const restart = useCallback(() => {
    setPhase("setup");
    setHumanTurn(null);
    setError(null);
  }, []);

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
    suspicion,
    suspecting,
    reflecting,
    startGame,
    runDescribe,
    runVote,
    nextRound,
    restart,
    submitHuman,
  };
}
