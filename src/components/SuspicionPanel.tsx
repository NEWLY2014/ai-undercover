"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { SuspicionSnapshot } from "@/game/types";

const wrap: CSSProperties = {
  background: "var(--panel)",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--line)",
  borderRadius: 12,
  padding: 14,
  marginTop: 14,
};
const head: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" };
const titleS: CSSProperties = { fontFamily: "var(--font-mono)", letterSpacing: 1, fontSize: 13, textTransform: "uppercase" };
const navBtn: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)", background: "var(--panel2)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--line)", borderRadius: 7, padding: "4px 9px", cursor: "pointer" };
const cellBase: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", padding: "6px 4px", borderRadius: 6, minWidth: 40 };
const th: CSSProperties = { fontSize: 11, color: "var(--muted)", padding: "4px 6px", textAlign: "center", whiteSpace: "nowrap" };
const rowLabel: CSSProperties = { fontSize: 12, color: "var(--ink)", padding: "4px 8px 4px 0", whiteSpace: "nowrap", textAlign: "right" };

function heat(score: number): CSSProperties {
  const a = Math.max(0, Math.min(100, score)) / 100;
  return {
    ...cellBase,
    background: `rgba(223,75,66,${0.12 + a * 0.78})`,
    color: a > 0.55 ? "#fff" : "var(--ink)",
  };
}

export default function SuspicionPanel({
  snapshots,
  suspecting,
}: {
  snapshots: SuspicionSnapshot[];
  suspecting: boolean;
}) {
  // null = follow the latest snapshot; a number pins to that index.
  const [pinned, setPinned] = useState<number | null>(null);
  const n = snapshots.length;

  if (n === 0) {
    return (
      <div style={wrap}>
        <div style={head}>
          <span style={titleS}>🔬 实时嫌疑矩阵</span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{suspecting ? "评估中…" : "等待第一句发言…"}</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
          每句发言之后，每个 AI 都会重新评估它对其他人的卧底嫌疑(0–100)。这里会随发言实时变化。
        </p>
      </div>
    );
  }

  const idx = pinned == null ? n - 1 : Math.max(0, Math.min(n - 1, pinned));
  const snap = snapshots[idx];
  const targets = snap.targets;

  return (
    <div style={wrap}>
      <div style={head}>
        <span style={titleS}>🔬 实时嫌疑矩阵</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button style={navBtn} disabled={idx === 0} onClick={() => setPinned(idx - 1)}>
            ◀
          </button>
          <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 150, textAlign: "center" }}>
            第 {snap.round} 轮 · {snap.afterSpeakerName} 发言后 ({idx + 1}/{n})
          </span>
          <button style={navBtn} disabled={idx >= n - 1} onClick={() => setPinned(idx + 1 >= n - 1 ? null : idx + 1)}>
            ▶
          </button>
          <button style={{ ...navBtn, opacity: pinned == null ? 0.5 : 1 }} onClick={() => setPinned(null)}>
            最新
          </button>
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 4 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "right" }}>评估者 ＼ 怀疑</th>
              {targets.map((t) => (
                <th key={t} style={th}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snap.raters.map((r) => {
              const row = snap.scores[String(r.id)] || {};
              return (
                <tr key={r.id}>
                  <td style={rowLabel}>
                    {r.emoji} {r.name}
                  </td>
                  {targets.map((t) => {
                    if (t === r.name) return <td key={t} style={{ ...cellBase, color: "var(--muted)", background: "transparent" }}>—</td>;
                    const v = row[t];
                    if (v == null) return <td key={t} style={{ ...cellBase, color: "var(--muted)", background: "var(--panel2)" }}>·</td>;
                    return (
                      <td key={t} style={heat(v)}>
                        {v}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
        {snap.raters.map((r) => {
          const reason = snap.reasons[String(r.id)];
          if (!reason) return null;
          return (
            <div key={r.id} style={{ fontSize: 11.5, color: "var(--muted)" }}>
              <b style={{ color: "var(--ink)" }}>
                {r.emoji} {r.name}
              </b>
              ：{reason}
            </div>
          );
        })}
      </div>
      {suspecting && (
        <div style={{ fontSize: 11.5, color: "var(--amber)", marginTop: 8, fontFamily: "var(--font-mono)" }}>● 正在评估下一句…</div>
      )}
    </div>
  );
}
