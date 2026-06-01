"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { HumanTurn } from "@/store/useGameLoop";
import type { Phase, Player, Winner } from "@/game/types";

// ── Rules intro (shown before the practice game) ───────────────────────────

const CARDS: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: "🎭",
    title: "什么是谁是卧底",
    body: "大多数人是『平民』，拿到同一个词；少数『卧底』拿到一个相近但不同的词。开局时谁都不知道自己是平民还是卧底——要靠发言慢慢判断。（进阶还有『白板』：什么词都没拿到。）",
  },
  {
    icon: "🗣️",
    title: "每轮怎么玩",
    body: "每轮每人用一句话描述自己拿到的词，但不能直接说出这个词。所有人说完后投票，票数最高的人出局，并亮明身份。",
  },
  {
    icon: "🎯",
    title: "你的目标",
    body: "如果你是平民：和大家一起把卧底票出去。如果你是卧底：藏住自己、活到最后；就算被票出，还有机会猜中平民的词『反杀』翻盘。",
  },
  {
    icon: "💡",
    title: "小技巧",
    body: "描述别太直白（容易暴露），也别太模糊（容易被怀疑）。投票时，找那个『描述和大家对不太上』的人——很可能就是卧底。",
  },
  {
    icon: "🔍",
    title: "这局有 AI 陪你练",
    body: "下面这局有 3 个 AI 和你同桌。每个 AI 发言时会显示它的『内心 OS』(💭推理)，让你看到高手怎么想。轮到你时，上方会有提示教你该做什么。准备好就开始吧！",
  },
];

const overlay: CSSProperties = {
  position: "relative",
  zIndex: 1,
  background: "var(--panel)",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--amber-dim)",
  borderRadius: 16,
  padding: 28,
  maxWidth: 640,
  margin: "0 auto",
};

export function TutorialIntro({ onStart, onBack }: { onStart: () => void; onBack: () => void }) {
  const [i, setI] = useState(0);
  const card = CARDS[i];
  const last = i === CARDS.length - 1;
  return (
    <div style={overlay}>
      <div style={{ fontFamily: "var(--font-mono)", letterSpacing: 2, fontSize: 12, color: "var(--amber)" }}>
        新手教学 · {i + 1}/{CARDS.length}
      </div>
      <div style={{ fontSize: 46, margin: "14px 0 6px" }}>{card.icon}</div>
      <h2 style={{ fontFamily: "var(--font-mono)", fontSize: 24, margin: "0 0 10px" }}>{card.title}</h2>
      <p style={{ color: "var(--ink)", fontSize: 15, lineHeight: 1.7, margin: "0 0 22px" }}>{card.body}</p>

      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {CARDS.map((_, k) => (
          <div
            key={k}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: k <= i ? "var(--amber)" : "var(--line)",
            }}
          />
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <button
          onClick={() => (i === 0 ? onBack() : setI(i - 1))}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            color: "var(--muted)",
            background: "var(--panel2)",
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: "var(--line)",
            borderRadius: 10,
            padding: "11px 18px",
            cursor: "pointer",
          }}
        >
          {i === 0 ? "← 返回" : "上一条"}
        </button>
        <button
          onClick={() => (last ? onStart() : setI(i + 1))}
          style={{
            fontFamily: "var(--font-mono)",
            letterSpacing: 1,
            fontSize: 15,
            color: "#1a1208",
            background: "var(--amber)",
            border: "none",
            borderRadius: 10,
            padding: "11px 22px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {last ? "▶ 开始练习局" : "下一条 →"}
        </button>
      </div>
    </div>
  );
}

// ── In-game coach (phase-based hints during the practice game) ──────────────

function hintFor(
  phase: Phase,
  humanTurn: HumanTurn | null,
  winner: Winner,
  players: Player[],
): { title: string; body: string } | null {
  const human = players.find((p) => p.kind === "human");
  if (winner) {
    const spy = players.find((p) => p.isSpy);
    return {
      title: "本局结束 · 复盘一下",
      body: `卧底是 ${spy?.name ?? "?"}（词「${spy?.word ?? ""}」）。回看上方每个人的描述和💭推理：卧底的描述是不是和大家对不上？你可以「再来一局」继续练，或退出教学正式玩。`,
    };
  }
  if (humanTurn?.kind === "describe") {
    return {
      title: "轮到你描述",
      body: `你的词是【${humanTurn.player.word}】。用一句话描述它的特征（外观/用途/场景），但别说出这个词本身，也别太明显——下方输入框发送。`,
    };
  }
  if (humanTurn?.kind === "vote") {
    return {
      title: "轮到你投票",
      body: "回想各人的描述与💭推理，把票投给那个『和大家对不太上』、最可疑的人。选错也没关系，这是练习。",
    };
  }
  switch (phase) {
    case "ready":
      return {
        title: "开始本轮",
        body: "点『开始本轮描述』。每位玩家(含 AI)会依次发言；AI 发言时注意看它的💭推理,那是它的思路。",
      };
    case "describing":
      return {
        title: "AI 正在发言",
        body: human
          ? "看每个 AI 的💭推理——它在想自己的词、在怀疑谁。留意谁的描述和多数人不一致。"
          : "观察 AI 们的描述与推理。",
      };
    case "described":
      return {
        title: "都说完了",
        body: "点『进入投票』。投票前先想：谁的描述最不对劲？",
      };
    case "voting":
      return { title: "投票进行中", body: "看每个人投给谁、理由是什么。" };
    case "revealed":
      return {
        title: "有人出局",
        body: "上方亮明了出局者身份。还没分胜负的话,点『进入下一轮』继续。",
      };
    default:
      return null;
  }
}

const coachWrap: CSSProperties = {
  background: "linear-gradient(180deg, rgba(232,161,58,.14), rgba(232,161,58,.05))",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--amber-dim)",
  borderRadius: 12,
  padding: "12px 14px",
  marginBottom: 14,
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
};

export function TutorialCoach({
  phase,
  humanTurn,
  winner,
  players,
}: {
  phase: Phase;
  humanTurn: HumanTurn | null;
  winner: Winner;
  players: Player[];
}) {
  const hint = hintFor(phase, humanTurn, winner, players);
  if (!hint) return null;
  return (
    <div style={coachWrap}>
      <span style={{ fontSize: 26, lineHeight: 1 }}>🧑‍🏫</span>
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--amber)", marginBottom: 3 }}>
          教练 · {hint.title}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.6 }}>{hint.body}</div>
      </div>
    </div>
  );
}
