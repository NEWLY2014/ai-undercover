"use client";

import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { THINKING_STYLES } from "@/game/thinkingStyles";
import { DEFAULT_ATTRIBUTES, type AgentAttributes, type AgentProfile } from "@/game/types";

// Model choices for local Ollama. "" = follow server default. msgKey → i18n label.
const MODEL_OPTIONS = [
  { value: "", msgKey: "modelDefault" },
  { value: "qwen2.5:3b", msgKey: "modelFast" },
  { value: "qwen2.5:7b", msgKey: "modelStrong" },
];

const ATTR_KEYS: Array<keyof AgentAttributes> = ["reasoning", "caution", "disguise", "expressiveness"];

const card: CSSProperties = {
  background: "var(--panel2)",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--line)",
  borderRadius: 10,
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const lbl: CSSProperties = { fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)" };
const inp: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 13,
  color: "var(--ink)",
  background: "var(--panel)",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--line)",
  borderRadius: 7,
  padding: "6px 9px",
};
const sel: CSSProperties = { ...inp, cursor: "pointer" };
const row: CSSProperties = { display: "flex", gap: 8, alignItems: "center" };

// Build the default slot list from PERSONAS, ensuring style + attributes are set.
export function defaultSlots(personas: AgentProfile[], aiCount: number): AgentProfile[] {
  return personas.slice(0, aiCount).map((p) => ({
    ...p,
    thinkingStyle: p.thinkingStyle ?? "balanced",
    model: p.model ?? "",
    attributes: p.attributes ?? { ...DEFAULT_ATTRIBUTES },
  }));
}

export default function AISlotEditor({
  slots,
  onChange,
}: {
  slots: AgentProfile[];
  onChange: (slots: AgentProfile[]) => void;
}) {
  const t = useTranslations("AISlot");
  const update = (i: number, patch: Partial<AgentProfile>) => {
    const next = slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onChange(next);
  };
  const updateAttr = (i: number, key: keyof AgentAttributes, value: number) => {
    const cur = slots[i].attributes ?? { ...DEFAULT_ATTRIBUTES };
    update(i, { attributes: { ...cur, [key]: value } });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
      {slots.map((s, i) => {
        const attrs = s.attributes ?? DEFAULT_ATTRIBUTES;
        return (
          <div key={i} style={card}>
            <div style={row}>
              <input
                style={{ ...inp, width: 46, textAlign: "center", fontSize: 18 }}
                value={s.emoji}
                maxLength={2}
                onChange={(e) => update(i, { emoji: e.target.value })}
                aria-label={t("avatar")}
              />
              <input
                style={{ ...inp, flex: 1 }}
                value={s.name}
                onChange={(e) => update(i, { name: e.target.value })}
                aria-label={t("name")}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={lbl}>{t("trait")}</span>
              <textarea
                style={{ ...inp, resize: "vertical", minHeight: 44 }}
                value={s.trait}
                onChange={(e) => update(i, { trait: e.target.value })}
              />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={lbl}>{t("thinkingStyle")}</span>
                <select style={sel} value={s.thinkingStyle ?? "balanced"} onChange={(e) => update(i, { thinkingStyle: e.target.value })}>
                  {THINKING_STYLES.map((ts) => (
                    <option key={ts.key} value={ts.key}>
                      {ts.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={lbl}>{t("model")}</span>
                <select style={sel} value={s.model ?? ""} onChange={(e) => update(i, { model: e.target.value })}>
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {t(m.msgKey)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={lbl}>{t("attributes")}</span>
              {ATTR_KEYS.map((key) => (
                <div key={key} style={row}>
                  <span style={{ fontSize: 12, color: "var(--ink)", width: 52 }}>{t(`attr_${key}`)}</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={attrs[key]}
                    onChange={(e) => updateAttr(i, key, Number(e.target.value))}
                    style={{ flex: 1, accentColor: "var(--amber)" }}
                  />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, width: 20, textAlign: "right" }}>
                    {attrs[key]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
