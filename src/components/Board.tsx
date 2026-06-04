"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { S } from "@/app/styles";
import MemoryPanel from "@/components/MemoryPanel";
import SuspicionPanel from "@/components/SuspicionPanel";
import { TutorialCoach } from "@/components/Tutorial";
import type { LogEntry, Phase, Player, SuspicionSnapshot, Winner, WordPair } from "@/game/types";
import type { HumanTurn } from "@/store/useGameLoop";

function PlayerCard({
  p,
  speaking,
  revealAll,
  orderIndex,
}: {
  p: Player;
  speaking: boolean;
  revealAll: boolean;
  orderIndex?: number;
}) {
  const t = useTranslations("Board");
  const dead = !p.alive;
  const lastClue = p.clues[p.clues.length - 1];
  return (
    <div
      style={{
        ...S.card,
        ...(speaking ? S.cardSpeak : {}),
        ...(dead ? S.cardDead : {}),
        ...(revealAll && p.isSpy ? S.cardSpyReveal : {}),
        ...(p.kind === "human" && !dead ? S.cardHuman : {}),
      }}
    >
      <div style={S.cardTop}>
        {orderIndex != null && <span style={S.orderBadge}>{orderIndex}</span>}
        <span style={S.avatar}>{p.emoji}</span>
        <div>
          <div style={S.cardName}>
            {p.name}
            {p.kind === "human" && <span style={S.humanBadge}>{t("badgeYou")}</span>}
            {revealAll && p.isSpy && <span style={S.spyBadge}>{t("badgeSpy")}</span>}
            {revealAll && p.role === "blank" && <span style={{ ...S.spyBadge, background: "var(--green)", color: "#06210a" }}>{t("badgeBlank")}</span>}
            {dead && <span style={S.deadBadge}>{t("badgeDead")}</span>}
          </div>
          <div style={S.cardTrait}>{p.trait}</div>
        </div>
      </div>
      {/* A player's word stays secret until the whole game ends (revealAll = gameover).
          When merely eliminated (dead) we reveal their ROLE via the elimination log,
          but never their word — so the table can't read it off a dead player's card. */}
      {revealAll && (
        <div style={{ ...S.cardWord, color: p.isSpy ? "var(--red)" : p.role === "blank" ? "var(--green)" : "var(--amber)" }}>
          {p.role === "blank" ? t("blankNoWord") : t("wordLabel", { word: p.word })}
        </div>
      )}
      {lastClue && <div style={S.cardClue}>“{lastClue}”</div>}
      {speaking && <div style={S.speakTag}>{t("speaking")}</div>}
      {p.vote && !dead && <div style={S.voteTag}>{t("votedTo", { name: p.vote })}</div>}
    </div>
  );
}

function LogItem({ e, showReasoning }: { e: LogEntry; showReasoning: boolean }) {
  const t = useTranslations("Board");
  if (e.type === "system") return <div style={S.logSystem}>{e.text}</div>;
  if (e.type === "phase") return <div style={S.logPhase}>{e.text}</div>;
  if (e.type === "clue")
    return (
      <div style={S.logClue}>
        <span style={S.logAvatar}>{e.emoji}</span>
        <div>
          <div style={S.logName}>{e.name}</div>
          <div style={S.bubble}>{e.text}</div>
          {showReasoning && e.reasoning && <div style={S.reasoning}>💭 {e.reasoning}</div>}
        </div>
      </div>
    );
  if (e.type === "vote")
    return (
      <div style={S.logVote}>
        <span style={S.logAvatar}>{e.emoji}</span>
        <span>
          <b style={{ color: "var(--ink)" }}>{e.name}</b> {t("votedFor")} <b style={{ color: "var(--amber)" }}>{e.target}</b>
          {/* The stated vote reason is an agent insight — shown only in developer mode, like the 💭 reasoning. */}
          {showReasoning && e.reason && (
            <>
              ：<span style={{ color: "var(--muted)" }}>{e.reason}</span>
            </>
          )}
          {showReasoning && e.reasoning && <div style={S.reasoning}>💭 {e.reasoning}</div>}
        </span>
      </div>
    );
  if (e.type === "tally") return <div style={S.logTally}>{e.text}</div>;
  if (e.type === "eliminate")
    return (
      <div style={{ ...S.logElim, borderColor: e.isSpy ? "var(--red)" : "var(--line)" }}>
        <b>
          {e.emoji} {e.text}
        </b>
      </div>
    );
  if (e.type === "result") return <div style={S.logResult}>{e.text}</div>;
  return null;
}

function Controls({
  phase,
  busy,
  onDescribe,
  onVote,
  onNext,
  onRestart,
  onPlayAgain,
}: {
  phase: Phase;
  busy: boolean;
  onDescribe: () => void;
  onVote: () => void;
  onNext: () => void;
  onRestart: () => void;
  onPlayAgain: () => void;
}) {
  const t = useTranslations("Board");
  if (phase === "ready")
    return (
      <button style={S.actBtn} disabled={busy} onClick={onDescribe}>
        {t("ctlStart")}
      </button>
    );
  if (phase === "describing")
    return (
      <button style={S.actBtnDim} disabled>
        {t("ctlDescribing")}
      </button>
    );
  if (phase === "described")
    return (
      <button style={S.actBtn} disabled={busy} onClick={onVote}>
        {t("ctlVote")}
      </button>
    );
  if (phase === "voting")
    return (
      <button style={S.actBtnDim} disabled>
        {t("ctlVoting")}
      </button>
    );
  if (phase === "revealed")
    return (
      <button style={S.actBtn} disabled={busy} onClick={onNext}>
        {t("ctlNext")}
      </button>
    );
  if (phase === "gameover")
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button style={S.actBtn} onClick={onPlayAgain}>
          {t("ctlRestart")}
        </button>
        <button
          onClick={onRestart}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "var(--muted)",
            background: "transparent",
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: "9px 14px",
            cursor: "pointer",
          }}
        >
          {t("ctlNewSettings")}
        </button>
      </div>
    );
  return null;
}

function HumanPanel({
  turn,
  players,
  onSubmit,
}: {
  turn: HumanTurn;
  players: Player[];
  onSubmit: (v: string) => void;
}) {
  const t = useTranslations("Board");
  const [text, setText] = useState("");
  if (turn.kind === "describe" || turn.kind === "spyGuess") {
    const isGuess = turn.kind === "spyGuess";
    return (
      <div style={S.humanPanel}>
        <div style={S.humanLabel}>
          {isGuess
            ? t("humanSpyGuess")
            : turn.player.role === "blank"
              ? t("humanBlank")
              : t("humanDescribe", { word: turn.player.word })}
        </div>
        <input
          style={S.input}
          value={text}
          autoFocus
          placeholder={isGuess ? t("placeholderGuess") : t("placeholderDescribe")}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) {
              onSubmit(text.trim());
              setText("");
            }
          }}
        />
        <button
          style={S.actBtn}
          disabled={!text.trim()}
          onClick={() => {
            onSubmit(text.trim());
            setText("");
          }}
        >
          {isGuess ? t("btnGuess") : t("btnSendClue")}
        </button>
      </div>
    );
  }
  // vote (turn.candidates restricts choices during a PK revote)
  const others = players.filter(
    (p) => p.alive && p.kind !== "human" && (!turn.candidates || turn.candidates.includes(p.name)),
  );
  return (
    <div style={S.humanPanel}>
      <div style={S.humanLabel}>{turn.candidates ? t("humanVotePk") : t("humanVote")}</div>
      <div style={S.guessChips}>
        {others.map((p) => (
          <button key={p.id} style={S.chip} onClick={() => onSubmit(p.name)}>
            {p.emoji} {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export interface BoardProps {
  players: Player[];
  log: LogEntry[];
  busy: boolean;
  speakingId: number | null;
  phase: Phase;
  round: number;
  winner: Winner;
  error: string | null;
  pair: WordPair | null;
  humanTurn: HumanTurn | null;
  devMode: boolean;
  tutorial: boolean;
  coachTip: string | null;
  coachLoading: boolean;
  suspicion: SuspicionSnapshot[];
  suspecting: boolean;
  order: number[];
  guess: number | null;
  onGuess: (id: number) => void;
  onDescribe: () => void;
  onVote: () => void;
  onNext: () => void;
  onRestart: () => void;
  onPlayAgain: () => void;
  onSubmitHuman: (v: string) => void;
}

const PHASE_KEY: Record<string, string> = {
  ready: "phaseReady",
  describing: "phaseDescribing",
  described: "phaseDescribed",
  voting: "phaseVoting",
  revealed: "phaseRevealed",
  gameover: "phaseGameover",
};

export default function Board(props: BoardProps) {
  const { players, log, busy, speakingId, phase, round, winner, error, pair, humanTurn, guess, devMode, tutorial, coachTip, coachLoading, suspicion, suspecting, order } = props;
  const t = useTranslations("Board");
  // Order seats by this round's speaking order; eliminated players sink to the end.
  const orderPos = new Map(order.map((id, i) => [id, i]));
  const orderedPlayers = [...players].sort((a, b) => {
    const ai = orderPos.has(a.id) ? (orderPos.get(a.id) as number) : Infinity;
    const bi = orderPos.has(b.id) ? (orderPos.get(b.id) as number) : Infinity;
    return ai !== bi ? ai - bi : a.id - b.id;
  });
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [log, phase]);

  const hasHuman = players.some((p) => p.kind === "human");
  // Agent private reasoning (💭) and the memory panel are a developer-mode insight
  // ONLY. In the masterclass we deliberately hide the AIs' thinking — the coach is
  // the teacher there, guiding the human step by step — so the student learns to
  // read the table themselves instead of reading the AIs' minds.
  const showReasoning = devMode;
  const spyName = players.find((p) => p.isSpy)?.name ?? "";
  const guessCorrect = winner != null && guess != null && players.find((p) => p.id === guess)?.isSpy;
  // Spectator bet locks once round 1's clues are all in ("首轮描述结束后锁定"): you may
  // place or change your bet all through round-1 describing, then it is final — so the
  // bet is a real read of the table, not a risk-free last-second pick.
  const betLocked = round > 1 || (phase !== "ready" && phase !== "describing");
  const phaseTag = PHASE_KEY[phase] ? t(PHASE_KEY[phase], { round }) : "";

  return (
    <>
    {tutorial && <TutorialCoach phase={phase} humanTurn={humanTurn} winner={winner} players={players} coachTip={coachTip} coachLoading={coachLoading} />}
    <div style={S.board} className="board">
      <section style={S.seats}>
        {orderedPlayers.map((p) => {
          const oi = orderPos.has(p.id) ? (orderPos.get(p.id) as number) + 1 : undefined;
          return (
            <PlayerCard
              key={p.id}
              p={p}
              speaking={speakingId === p.id}
              revealAll={phase === "gameover"}
              orderIndex={p.alive ? oi : undefined}
            />
          );
        })}
      </section>

      <section style={S.feedWrap}>
        <div style={S.feedHead}>
          <span style={S.feedTitle}>{t("feedTitle")}</span>
          <span style={S.phaseTag}>{phaseTag}</span>
        </div>
        <div style={S.feed} ref={feedRef}>
          {log.map((e, i) => (
            <LogItem key={i} e={e} showReasoning={showReasoning} />
          ))}
          {busy && !humanTurn && (
            <div style={S.thinking}>
              <span className="dot" />
              {t("thinking")}
            </div>
          )}
        </div>

        {error && <div style={S.errorBox}>{error}</div>}
        {humanTurn && <HumanPanel turn={humanTurn} players={players} onSubmit={props.onSubmitHuman} />}

        <div style={S.controls}>
          <Controls
            phase={phase}
            busy={busy}
            onDescribe={props.onDescribe}
            onVote={props.onVote}
            onNext={props.onNext}
            onRestart={props.onRestart}
            onPlayAgain={props.onPlayAgain}
          />
        </div>
      </section>

      <section style={S.guessWrap}>
        <div style={S.guessHead}>{hasHuman ? t("guessHeadHuman") : t("guessHeadSpectator")}</div>
        {!hasHuman && (
          <>
            <p style={S.guessHint}>
              {winner
                ? t("guessHintEnded")
                : betLocked
                ? guess != null
                  ? t("guessLocked")
                  : t("guessClosed")
                : t("guessHintActive")}
            </p>
            <div style={S.guessChips}>
              {players.map((p) => {
                const sel = guess === p.id;
                const revealSpy = winner != null && p.isSpy;
                const interactive = !winner && !betLocked;
                return (
                  <button
                    key={p.id}
                    onClick={() => interactive && props.onGuess(p.id)}
                    style={{
                      ...S.chip,
                      ...(sel ? S.chipSel : {}),
                      ...(revealSpy ? S.chipSpy : {}),
                      opacity: p.alive || winner ? 1 : 0.4,
                      cursor: interactive ? "pointer" : "default",
                    }}
                  >
                    {p.emoji} {p.name}
                    {revealSpy ? t("spyTag") : ""}
                  </button>
                );
              })}
            </div>
            {winner && guess != null && (
              <div style={{ ...S.verdict, color: guessCorrect ? "var(--green)" : "var(--red)" }}>
                {guessCorrect ? t("verdictRight", { name: spyName }) : t("verdictWrong", { name: spyName })}
              </div>
            )}
          </>
        )}
        {hasHuman && (
          <p style={S.guessHint}>
            {winner ? (winner === "civ" ? t("resultCiv") : t("resultSpy")) : t("inProgress")}
          </p>
        )}
        {pair && (winner || (!hasHuman && devMode)) && (
          <div style={S.wordsBox}>
            <div style={S.wordsTitle}>
              {t("wordsTitle")}
              {winner ? "" : t("wordsSpoiler")}
            </div>
            <div style={S.wordsRow}>
              <span style={S.wordCiv}>{t("wordCiv", { word: pair.civ })}</span>
              <span style={S.wordSpy}>{t("wordSpy", { word: pair.spy })}</span>
            </div>
          </div>
        )}
      </section>
    </div>
    {devMode && <SuspicionPanel snapshots={suspicion} suspecting={suspecting} />}
    {showReasoning && <MemoryPanel players={players} />}
    </>
  );
}
