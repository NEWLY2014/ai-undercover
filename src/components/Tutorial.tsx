"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { CSSProperties } from "react";
import type { HumanTurn } from "@/store/useGameLoop";
import type { Phase, Player, Winner } from "@/game/types";

// ── Rules intro (shown before the practice game) ───────────────────────────

// Icons only; titles/bodies come from the Tutorial.card{i}Title/Body messages.
const CARD_ICONS = ["🎭", "🗣️", "🎯", "💡", "🔍"];

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
  const t = useTranslations("Tutorial");
  const [i, setI] = useState(0);
  const last = i === CARD_ICONS.length - 1;
  return (
    <div style={overlay}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "var(--font-mono)", letterSpacing: 2, fontSize: 12, color: "var(--amber)" }}>
          {t("introHeader", { n: i + 1, total: CARD_ICONS.length })}
        </div>
        <button
          onClick={onStart}
          title={t("skipTip")}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12.5,
            color: "var(--muted)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 4,
          }}
        >
          {t("skip")}
        </button>
      </div>
      <div style={{ fontSize: 46, margin: "14px 0 6px" }}>{CARD_ICONS[i]}</div>
      <h2 style={{ fontFamily: "var(--font-mono)", fontSize: 24, margin: "0 0 10px" }}>{t(`card${i}Title`)}</h2>
      <p style={{ color: "var(--ink)", fontSize: 15, lineHeight: 1.7, margin: "0 0 22px" }}>{t(`card${i}Body`)}</p>

      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {CARD_ICONS.map((_, k) => (
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
          {i === 0 ? t("back") : t("prev")}
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
          {last ? t("startMasterclass") : t("next")}
        </button>
      </div>
    </div>
  );
}

// ── In-game coach (phase-based hints during the practice game) ──────────────

interface Hint {
  titleKey: string;
  bodyKey: string;
  params?: Record<string, string | number>;
}

// Returns message KEYS (rendered with t() in TutorialCoach) so this stays a plain
// function with no hook dependency.
function hintFor(phase: Phase, humanTurn: HumanTurn | null, winner: Winner, players: Player[]): Hint | null {
  const human = players.find((p) => p.kind === "human");
  if (winner) {
    const spy = players.find((p) => p.isSpy);
    return { titleKey: "hintEndTitle", bodyKey: "hintEndBody", params: { name: spy?.name ?? "?", word: spy?.word ?? "" } };
  }
  if (humanTurn?.kind === "describe") {
    return { titleKey: "hintDescribeTitle", bodyKey: "hintDescribeBody", params: { word: humanTurn.player.word } };
  }
  if (humanTurn?.kind === "vote") {
    return { titleKey: "hintVoteTitle", bodyKey: "hintVoteBody" };
  }
  switch (phase) {
    case "ready":
      return { titleKey: "hintReadyTitle", bodyKey: "hintReadyBody" };
    case "describing":
      return { titleKey: "hintDescribingTitle", bodyKey: human ? "hintDescribingBodyHuman" : "hintDescribingBodySpectator" };
    case "described":
      return { titleKey: "hintDescribedTitle", bodyKey: "hintDescribedBody" };
    case "voting":
      return { titleKey: "hintVotingTitle", bodyKey: "hintVotingBody" };
    case "revealed":
      return { titleKey: "hintRevealedTitle", bodyKey: "hintRevealedBody" };
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
  const t = useTranslations("Tutorial");
  const hint = hintFor(phase, humanTurn, winner, players);
  if (!hint) return null;
  return (
    <div style={coachWrap}>
      <span style={{ fontSize: 26, lineHeight: 1 }}>🧑‍🏫</span>
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--amber)", marginBottom: 3 }}>
          {t("coachLabel")} · {t(hint.titleKey)}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.6 }}>{t(hint.bodyKey, hint.params)}</div>
      </div>
    </div>
  );
}
