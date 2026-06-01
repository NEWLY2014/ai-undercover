"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { Player } from "@/game/types";
import { thinkingStyleLabel } from "@/game/thinkingStyles";

const wrap: CSSProperties = {
  background: "var(--panel)",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--line)",
  borderRadius: 12,
  padding: 14,
  marginTop: 14,
};
const title: CSSProperties = { fontFamily: "var(--font-mono)", letterSpacing: 1, fontSize: 13, textTransform: "uppercase", marginBottom: 10 };
const cardS: CSSProperties = {
  background: "var(--panel2)",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--line)",
  borderRadius: 10,
  padding: 10,
};
const tag: CSSProperties = { fontSize: 10, color: "var(--amber)", fontFamily: "var(--font-mono)", border: "1px solid var(--amber-dim)", borderRadius: 5, padding: "1px 6px" };
const sub: CSSProperties = { fontSize: 11, color: "var(--muted)", margin: "6px 0 3px", fontFamily: "var(--font-mono)" };
const item: CSSProperties = { fontSize: 12, color: "var(--ink)", marginBottom: 3, lineHeight: 1.45 };

// Shows each AI agent's PRIVATE memory: long-term lessons recalled from past
// games + the running working-memory note it updates each turn. Makes the
// "independent memory + learns across games" capability visible.
export default function MemoryPanel({ players }: { players: Player[] }) {
  const ai = players.filter((p) => p.kind === "ai");
  const [open, setOpen] = useState(true);
  if (ai.length === 0) return null;
  const anyMemory = ai.some((p) => p.recalledLearnings.length > 0 || (p.workingMemory && p.workingMemory.trim()));

  return (
    <div style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={title}>🧠 AI 记忆(独立空间)</span>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{ fontSize: 12, background: "var(--panel2)", color: "var(--ink)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--line)", borderRadius: 7, padding: "3px 9px", cursor: "pointer" }}
        >
          {open ? "收起" : "展开"}
        </button>
      </div>
      {!anyMemory && <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>暂无记忆。玩过一局后,每个 AI 会积累经验并在下一局召回。</p>}
      {open && anyMemory && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
          {ai.map((p) => (
            <div key={p.id} style={cardS}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 18 }}>{p.emoji}</span>
                <b style={{ fontSize: 13 }}>{p.name}</b>
                <span style={tag}>{thinkingStyleLabel(p.thinkingStyle)}</span>
              </div>
              <div style={sub}>过往经验(本局开局召回 {p.recalledLearnings.length} 条)</div>
              {p.recalledLearnings.length === 0 ? (
                <div style={{ ...item, color: "var(--muted)" }}>（首次登场，暂无经验）</div>
              ) : (
                p.recalledLearnings.map((l, i) => (
                  <div key={i} style={item}>
                    · {l}
                  </div>
                ))
              )}
              {p.workingMemory && p.workingMemory.trim() && (
                <>
                  <div style={sub}>本局私人笔记(实时更新)</div>
                  <div style={{ ...item, fontStyle: "italic", color: "var(--muted)" }}>{p.workingMemory}</div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
