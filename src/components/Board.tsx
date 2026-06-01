"use client";

import { useEffect, useRef, useState } from "react";
import { S } from "@/app/styles";
import MemoryPanel from "@/components/MemoryPanel";
import SuspicionPanel from "@/components/SuspicionPanel";
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
            {p.kind === "human" && <span style={S.humanBadge}>你</span>}
            {revealAll && p.isSpy && <span style={S.spyBadge}>卧底</span>}
            {revealAll && p.role === "blank" && <span style={{ ...S.spyBadge, background: "var(--green)", color: "#06210a" }}>白板</span>}
            {dead && <span style={S.deadBadge}>出局</span>}
          </div>
          <div style={S.cardTrait}>{p.trait}</div>
        </div>
      </div>
      {(revealAll || dead) && (
        <div style={{ ...S.cardWord, color: p.isSpy ? "var(--red)" : p.role === "blank" ? "var(--green)" : "var(--amber)" }}>
          {p.role === "blank" ? "白板（无词）" : `词：${p.word}`}
        </div>
      )}
      {lastClue && <div style={S.cardClue}>“{lastClue}”</div>}
      {speaking && <div style={S.speakTag}>● 发言中</div>}
      {p.vote && !dead && <div style={S.voteTag}>投给 → {p.vote}</div>}
    </div>
  );
}

function LogItem({ e, showReasoning }: { e: LogEntry; showReasoning: boolean }) {
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
          <b style={{ color: "var(--ink)" }}>{e.name}</b> 投给 <b style={{ color: "var(--amber)" }}>{e.target}</b>：
          <span style={{ color: "var(--muted)" }}>{e.reason}</span>
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

function phaseLabel(phase: Phase, round: number): string {
  const map: Record<string, string> = {
    ready: `第 ${round} 轮 · 待开始`,
    describing: `第 ${round} 轮 · 描述中`,
    described: `第 ${round} 轮 · 待投票`,
    voting: `第 ${round} 轮 · 投票中`,
    revealed: `第 ${round} 轮 · 已揭晓`,
    gameover: "本局结束",
  };
  return map[phase] || "";
}

function Controls({
  phase,
  busy,
  onDescribe,
  onVote,
  onNext,
  onRestart,
}: {
  phase: Phase;
  busy: boolean;
  onDescribe: () => void;
  onVote: () => void;
  onNext: () => void;
  onRestart: () => void;
}) {
  if (phase === "ready")
    return (
      <button style={S.actBtn} disabled={busy} onClick={onDescribe}>
        ▶ 开始本轮描述
      </button>
    );
  if (phase === "describing")
    return (
      <button style={S.actBtnDim} disabled>
        描述进行中…
      </button>
    );
  if (phase === "described")
    return (
      <button style={S.actBtn} disabled={busy} onClick={onVote}>
        🗳 进入投票
      </button>
    );
  if (phase === "voting")
    return (
      <button style={S.actBtnDim} disabled>
        投票进行中…
      </button>
    );
  if (phase === "revealed")
    return (
      <button style={S.actBtn} disabled={busy} onClick={onNext}>
        ↻ 进入下一轮
      </button>
    );
  if (phase === "gameover")
    return (
      <button style={S.actBtn} onClick={onRestart}>
        🔄 再来一局
      </button>
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
  const [text, setText] = useState("");
  if (turn.kind === "describe" || turn.kind === "spyGuess") {
    const isGuess = turn.kind === "spyGuess";
    return (
      <div style={S.humanPanel}>
        <div style={S.humanLabel}>
          {isGuess
            ? "🔪 你是最后的卧底！猜中平民的词就能反杀翻盘——输入你猜的词:"
            : turn.player.role === "blank"
              ? "🃏 你是白板(没有词)！根据别人的描述猜大家在说啥，含糊地跟一句，别露馅"
              : `轮到你了 · 你的词是【${turn.player.word}】，用一句话描述它(别说出这个词)`}
        </div>
        <input
          style={S.input}
          value={text}
          autoFocus
          placeholder={isGuess ? "你猜平民的词是…" : "一句话描述…"}
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
          {isGuess ? "猜！" : "发送描述"}
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
      <div style={S.humanLabel}>{turn.candidates ? "PK 重投 · 在平票者中选一个" : "轮到你投票 · 你觉得谁是卧底？"}</div>
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
  suspicion: SuspicionSnapshot[];
  suspecting: boolean;
  order: number[];
  guess: number | null;
  onGuess: (id: number) => void;
  onDescribe: () => void;
  onVote: () => void;
  onNext: () => void;
  onRestart: () => void;
  onSubmitHuman: (v: string) => void;
}

export default function Board(props: BoardProps) {
  const { players, log, busy, speakingId, phase, round, winner, error, pair, humanTurn, guess, devMode, suspicion, suspecting, order } = props;
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
  // Agent private reasoning (💭) is a developer-mode insight during play; in
  // normal play it's hidden and only revealed once the game is over.
  const showReasoning = devMode || winner != null;
  const spyName = players.find((p) => p.isSpy)?.name;
  const guessCorrect = winner != null && guess != null && players.find((p) => p.id === guess)?.isSpy;

  return (
    <>
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
          <span style={S.feedTitle}>现场直播</span>
          <span style={S.phaseTag}>{phaseLabel(phase, round)}</span>
        </div>
        <div style={S.feed} ref={feedRef}>
          {log.map((e, i) => (
            <LogItem key={i} e={e} showReasoning={showReasoning} />
          ))}
          {busy && !humanTurn && (
            <div style={S.thinking}>
              <span className="dot" />
              AI 思考中…
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
          />
        </div>
      </section>

      <section style={S.guessWrap}>
        <div style={S.guessHead}>{hasHuman ? "本局信息" : "你的推理"}</div>
        {!hasHuman && (
          <>
            <p style={S.guessHint}>
              {winner ? "本局已结束，看看你押对了没：" : "你觉得谁是卧底？点一个名字下注。"}
            </p>
            <div style={S.guessChips}>
              {players.map((p) => {
                const sel = guess === p.id;
                const revealSpy = winner != null && p.isSpy;
                return (
                  <button
                    key={p.id}
                    onClick={() => !winner && props.onGuess(p.id)}
                    style={{
                      ...S.chip,
                      ...(sel ? S.chipSel : {}),
                      ...(revealSpy ? S.chipSpy : {}),
                      opacity: p.alive || winner ? 1 : 0.4,
                    }}
                  >
                    {p.emoji} {p.name}
                    {revealSpy ? " · 卧底" : ""}
                  </button>
                );
              })}
            </div>
            {winner && guess != null && (
              <div style={{ ...S.verdict, color: guessCorrect ? "var(--green)" : "var(--red)" }}>
                {guessCorrect ? "🎯 你押对了！卧底就是 " + spyName : "❌ 没猜中，卧底其实是 " + spyName}
              </div>
            )}
          </>
        )}
        {hasHuman && (
          <p style={S.guessHint}>
            {winner
              ? winner === "civ"
                ? "🎉 平民胜利！"
                : "🩸 卧底胜利！"
              : "对局进行中。轮到你时下方会出现操作面板。"}
          </p>
        )}
        {pair && (!hasHuman || winner) && (
          <div style={S.wordsBox}>
            <div style={S.wordsTitle}>本局词对{winner ? "" : "(剧透，慎看)"}</div>
            <div style={S.wordsRow}>
              <span style={S.wordCiv}>平民：{pair.civ}</span>
              <span style={S.wordSpy}>卧底：{pair.spy}</span>
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
