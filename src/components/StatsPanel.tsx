"use client";

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
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    setStats(loadStats());
  }, [version]);

  if (!stats) return null; // avoid SSR/client localStorage mismatch on first paint
  if (stats.games === 0) {
    return (
      <div style={wrap}>
        <div style={title}>📊 你的战绩</div>
        <p style={{ ...small, margin: "8px 0 0" }}>还没有记录。玩一局(观战押注或人机同桌)后，这里会出现你的胜率、连胜与成就。</p>
      </div>
    );
  }

  const unlocked = new Set(stats.achievements);

  return (
    <div style={wrap}>
      <div style={head}>
        <span style={title}>📊 你的战绩</span>
        <button
          onClick={() => {
            resetStats();
            setStats(loadStats());
          }}
          style={{ fontSize: 11, background: "var(--panel2)", color: "var(--muted)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--line)", borderRadius: 7, padding: "4px 9px", cursor: "pointer" }}
        >
          清空
        </button>
      </div>

      <div style={grid}>
        <div style={cell}>
          <span style={big}>{stats.games}</span>
          <span style={small}>对局数</span>
        </div>
        <div style={cell}>
          <span style={big}>{stats.bestStreak}</span>
          <span style={small}>最佳连胜(当前 {stats.currentStreak})</span>
        </div>
        <div style={cell}>
          <span style={big}>{pct(stats.betsCorrect, stats.bets)}</span>
          <span style={small}>押中卧底率({stats.betsCorrect}/{stats.bets})</span>
        </div>
        <div style={cell}>
          <span style={big}>{pct(stats.humanWins, stats.humanGames)}</span>
          <span style={small}>同桌胜率({stats.humanWins}/{stats.humanGames})</span>
        </div>
        <div style={cell}>
          <span style={big}>{stats.civWins}/{stats.spyWins}</span>
          <span style={small}>平民胜 / 卧底胜</span>
        </div>
        <div style={cell}>
          <span style={big}>{stats.humanSpyWins}</span>
          <span style={small}>你当卧底取胜</span>
        </div>
      </div>

      <div style={{ ...small, marginBottom: 6 }}>成就 {unlocked.size}/{ACHIEVEMENTS.length}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {ACHIEVEMENTS.map((a) => {
          const got = unlocked.has(a.id);
          return (
            <span
              key={a.id}
              title={a.desc}
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
              {got ? "🏆" : "🔒"} {a.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
