"use client";

import { useTranslations } from "next-intl";
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
const th: CSSProperties = { fontSize: 12, color: "var(--muted)", padding: "4px 6px", textAlign: "center", whiteSpace: "nowrap" };
const rowLabel: CSSProperties = { fontSize: 12, color: "var(--ink)", padding: "4px 8px 4px 0", whiteSpace: "nowrap", textAlign: "right" };

function heat(score: number): CSSProperties {
  const a = Math.max(0, Math.min(100, score)) / 100;
  return {
    ...cellBase,
    background: `rgba(223,75,66,${0.18 + a * 0.72})`,
    color: a > 0.5 ? "#fff" : "var(--ink)",
  };
}

export default function SuspicionPanel({
  snapshots,
  suspecting,
}: {
  snapshots: SuspicionSnapshot[];
  suspecting: boolean;
}) {
  const t = useTranslations("Suspicion");
  // null = follow the latest snapshot; a number pins to that index.
  const [pinned, setPinned] = useState<number | null>(null);
  const n = snapshots.length;

  if (n === 0) {
    return (
      <div style={wrap}>
        <div style={head}>
          <span style={titleS}>{t("title")}</span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{suspecting ? t("evaluating") : t("waiting")}</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>{t("intro")}</p>
      </div>
    );
  }

  const idx = pinned == null ? n - 1 : Math.max(0, Math.min(n - 1, pinned));
  const snap = snapshots[idx];
  const targets = snap.targets;

  return (
    <div style={wrap}>
      <div style={head}>
        <span style={titleS}>{t("title")}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button style={navBtn} disabled={idx === 0} onClick={() => setPinned(idx - 1)}>
            ◀
          </button>
          <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 150, textAlign: "center" }}>
            {t("nav", { round: snap.round, name: snap.afterSpeakerName, idx: idx + 1, n })}
          </span>
          <button style={navBtn} disabled={idx >= n - 1} onClick={() => setPinned(idx + 1 >= n - 1 ? null : idx + 1)}>
            ▶
          </button>
          <button style={{ ...navBtn, opacity: pinned == null ? 0.5 : 1 }} onClick={() => setPinned(null)}>
            {t("latest")}
          </button>
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 4 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "right" }}>{t("tableHeader")}</th>
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
            <div key={r.id} style={{ fontSize: 12, color: "var(--muted)" }}>
              <b style={{ color: "var(--ink)" }}>
                {r.emoji} {r.name}
              </b>
              ：{reason}
            </div>
          );
        })}
      </div>
      {suspecting && (
        <div style={{ fontSize: 12, color: "var(--amber)", marginTop: 8, fontFamily: "var(--font-mono)" }}>{t("evaluatingNext")}</div>
      )}
    </div>
  );
}
