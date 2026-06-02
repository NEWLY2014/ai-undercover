"use client";

import { useTranslations } from "next-intl";
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
const tag: CSSProperties = { fontSize: 11.5, color: "var(--amber)", fontFamily: "var(--font-mono)", border: "1px solid var(--amber-dim)", borderRadius: 5, padding: "1px 6px" };
const sub: CSSProperties = { fontSize: 12, color: "var(--muted)", margin: "6px 0 4px", fontFamily: "var(--font-mono)" };
const item: CSSProperties = { fontSize: 12.5, color: "var(--ink)", marginBottom: 4, lineHeight: 1.5 };

// Shows each AI agent's PRIVATE memory: long-term lessons recalled from past
// games + the running working-memory note it updates each turn. Makes the
// "independent memory + learns across games" capability visible.
export default function MemoryPanel({ players }: { players: Player[] }) {
  const t = useTranslations("Memory");
  const ai = players.filter((p) => p.kind === "ai");
  const [open, setOpen] = useState(true);
  if (ai.length === 0) return null;
  const anyMemory = ai.some((p) => p.recalledLearnings.length > 0 || (p.workingMemory && p.workingMemory.trim()));

  return (
    <div style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={title}>{t("title")}</span>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{ fontSize: 12, background: "var(--panel2)", color: "var(--ink)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--line)", borderRadius: 7, padding: "3px 9px", cursor: "pointer" }}
        >
          {open ? t("collapse") : t("expand")}
        </button>
      </div>
      {!anyMemory && <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>{t("empty")}</p>}
      {open && anyMemory && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
          {ai.map((p) => (
            <div key={p.id} style={cardS}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 18 }}>{p.emoji}</span>
                <b style={{ fontSize: 13 }}>{p.name}</b>
                <span style={tag}>{thinkingStyleLabel(p.thinkingStyle)}</span>
              </div>
              <div style={sub}>{t("recalled", { n: p.recalledLearnings.length })}</div>
              {p.recalledLearnings.length === 0 ? (
                <div style={{ ...item, color: "var(--muted)" }}>{t("noExperience")}</div>
              ) : (
                p.recalledLearnings.map((l, i) => (
                  <div key={i} style={item}>
                    · {l}
                  </div>
                ))
              )}
              {p.workingMemory && p.workingMemory.trim() && (
                <>
                  <div style={sub}>{t("workingNote")}</div>
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
