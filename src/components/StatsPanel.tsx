"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { ACHIEVEMENTS, loadStats, resetStats, type Stats } from "@/lib/stats";

const wrap: CSSProperties = {
  background: "var(--panel)",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--line)",
  borderRadius: 14,
  padding: 18,
  marginTop: 14,
};
const head: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 };
const title: CSSProperties = { fontFamily: "var(--font-mono)", letterSpacing: 1, fontSize: 15, textTransform: "uppercase" };
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10, marginBottom: 14 };
const cell: CSSProperties = {
  background: "var(--panel2)",
  borderRadius: 10,
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 2,
};
const big: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 22, color: "var(--amber)" };
const small: CSSProperties = { fontSize: 12, color: "var(--muted)" };

function pct(n: number, d: number): string {
  if (d <= 0) return "—";
  return Math.round((n / d) * 100) + "%";
}

export default function StatsPanel({ version = 0 }: { version?: number }) {
  const t = useTranslations("Stats");
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    setStats(loadStats());
  }, [version]);

  if (!stats) return null; // avoid SSR/client localStorage mismatch on first paint
  if (stats.games === 0) {
    return (
      <div style={wrap}>
        <div style={title}>{t("title")}</div>
        <p style={{ ...small, margin: "8px 0 0" }}>{t("empty")}</p>
      </div>
    );
  }

  const unlocked = new Set(stats.achievements);

  return (
    <div style={wrap}>
      <div style={head}>
        <span style={title}>{t("title")}</span>
        <button
          onClick={() => {
            resetStats();
            setStats(loadStats());
          }}
          style={{ fontSize: 11, background: "var(--panel2)", color: "var(--muted)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--line)", borderRadius: 7, padding: "4px 9px", cursor: "pointer" }}
        >
          {t("reset")}
        </button>
      </div>

      <div style={grid}>
        <div style={cell}>
          <span style={big}>{stats.games}</span>
          <span style={small}>{t("games")}</span>
        </div>
        <div style={cell}>
          <span style={big}>{stats.bestStreak}</span>
          <span style={small}>{t("bestStreak", { current: stats.currentStreak })}</span>
        </div>
        <div style={cell}>
          <span style={big}>{pct(stats.betsCorrect, stats.bets)}</span>
          <span style={small}>{t("betRate", { correct: stats.betsCorrect, total: stats.bets })}</span>
        </div>
        <div style={cell}>
          <span style={big}>{pct(stats.humanWins, stats.humanGames)}</span>
          <span style={small}>{t("humanRate", { wins: stats.humanWins, games: stats.humanGames })}</span>
        </div>
        <div style={cell}>
          <span style={big}>{stats.civWins}/{stats.spyWins}</span>
          <span style={small}>{t("civSpy")}</span>
        </div>
        <div style={cell}>
          <span style={big}>{stats.humanSpyWins}</span>
          <span style={small}>{t("spyWins")}</span>
        </div>
      </div>

      <div style={{ ...small, marginBottom: 6 }}>{t("achievements", { got: unlocked.size, total: ACHIEVEMENTS.length })}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {ACHIEVEMENTS.map((a) => {
          const got = unlocked.has(a.id);
          return (
            <span
              key={a.id}
              title={t(`ach_${a.id}_desc`)}
              style={{
                fontSize: 12,
                padding: "5px 10px",
                borderRadius: 999,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: got ? "var(--amber)" : "var(--line)",
                color: got ? "var(--amber)" : "var(--muted)",
                background: got ? "rgba(232,161,58,.10)" : "transparent",
              }}
            >
              {got ? "🏆" : "🔒"} {t(`ach_${a.id}_label`)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
