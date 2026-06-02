"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { S } from "@/app/styles";
import AISlotEditor, { defaultSlots } from "@/components/AISlotEditor";
import { maxSpyCount } from "@/game/engine";
import { PERSONAS } from "@/game/personas";
import { THEMES, filterWordPairs } from "@/game/words";
import type { AgentProfile, GameConfig } from "@/game/types";

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;

const sel: CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 13,
  color: "var(--ink)",
  background: "var(--panel2)",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--line)",
  borderRadius: 8,
  padding: "7px 10px",
  cursor: "pointer",
};

// value = the difficulty filter value; key = i18n message key for the label.
const DIFFICULTY_OPTIONS = [
  { value: "", key: "difficultyAny" },
  { value: "1", key: "difficultyEasy" },
  { value: "2", key: "difficultyMedium" },
  { value: "3", key: "difficultyHard" },
];

// Remember the last-used setup within this tab session: it survives consecutive games
// and reloads (sessionStorage), and clears when the tab/browser is closed.
type Mode = "spectate" | "play" | "masterclass";
interface SetupPrefs {
  total: number;
  mode: Mode;
  spyCount: number;
  blankEnabled: boolean;
  wordPairId: string | null;
  theme: string | null;
  difficulty: number | null;
  devMode: boolean;
  advanced: boolean;
  slots: AgentProfile[];
}
const PREFS_KEY = "undercover:setup";

function loadSetupPrefs(): Partial<SetupPrefs> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Partial<SetupPrefs>) : null;
  } catch {
    return null;
  }
}

function saveSetupPrefs(p: SetupPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* non-fatal */
  }
}

export default function Setup({ onStart }: { onStart: (c: GameConfig) => void }) {
  const t = useTranslations("Setup");
  const [total, setTotal] = useState(5);
  // Three game modes. "masterclass" = you play WITH coaching: forces
  // humanPlayers=1 and sets tutorial=true (hints + AI reasoning shown).
  const [mode, setMode] = useState<Mode>("spectate");
  const human: 0 | 1 = mode === "spectate" ? 0 : 1;
  const [spyCount, setSpyCount] = useState(1);
  const [blankEnabled, setBlankEnabled] = useState(false);
  const [wordPairId, setWordPairId] = useState<string | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [slots, setSlots] = useState<AgentProfile[]>(() => defaultSlots(PERSONAS, 5));

  const clampTotal = (n: number) => Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, n));
  const aiCount = total - human;
  const spyMax = maxSpyCount(total);
  // A blank needs at least one real civilian left beside it.
  const blankAllowed = total - spyCount >= 2;
  const blankOn = blankEnabled && blankAllowed;

  // Keep the editable slot list sized to the AI seat count, preserving edits.
  useEffect(() => {
    setSlots((prev) => defaultSlots(PERSONAS, aiCount).map((d, i) => prev[i] ?? d));
  }, [aiCount]);

  // When player count changes, snap spy count into the legal range.
  useEffect(() => {
    setSpyCount((s) => Math.max(1, Math.min(s, maxSpyCount(total))));
  }, [total]);

  const pairs = filterWordPairs({ theme, difficulty });
  // If the chosen word no longer matches the filter, fall back to random.
  useEffect(() => {
    if (wordPairId && !pairs.some((p) => p.id === wordPairId)) setWordPairId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, difficulty]);

  // Restore the last-used setup once after mount (defaults first → effect updates,
  // matching StatsPanel's pattern, so server/client first paint agree).
  useEffect(() => {
    const p = loadSetupPrefs();
    if (!p) return;
    if (typeof p.total === "number") setTotal(clampTotal(p.total));
    if (p.mode) setMode(p.mode);
    if (typeof p.spyCount === "number") setSpyCount(p.spyCount);
    if (typeof p.blankEnabled === "boolean") setBlankEnabled(p.blankEnabled);
    if (p.wordPairId !== undefined) setWordPairId(p.wordPairId);
    if (p.theme !== undefined) setTheme(p.theme);
    if (p.difficulty !== undefined) setDifficulty(p.difficulty);
    if (typeof p.devMode === "boolean") setDevMode(p.devMode);
    if (typeof p.advanced === "boolean") setAdvanced(p.advanced);
    if (Array.isArray(p.slots) && p.slots.length) setSlots(p.slots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = () => {
    saveSetupPrefs({ total, mode, spyCount, blankEnabled, wordPairId, theme, difficulty, devMode, advanced, slots });
    onStart({
      totalPlayers: total,
      humanPlayers: human,
      spyCount,
      blankEnabled: blankOn,
      wordPairId,
      theme,
      difficulty,
      devMode,
      tutorial: mode === "masterclass",
      aiSlots: advanced ? slots.slice(0, aiCount) : undefined,
    });
  };

  return (
    <div style={S.setup}>
      <h2 style={S.setupTitle}>{t("title")}</h2>
      <p style={S.setupP}>{t("desc")}</p>

      <div style={S.fieldRow}>
        <div style={S.field}>
          <span style={S.fieldLabel}>{t("totalPlayers")}</span>
          <div style={S.stepper}>
            <button style={S.stepBtn} onClick={() => setTotal((n) => clampTotal(n - 1))} aria-label={t("decrease")}>
              −
            </button>
            <span style={S.stepVal}>{total}</span>
            <button style={S.stepBtn} onClick={() => setTotal((n) => clampTotal(n + 1))} aria-label={t("increase")}>
              +
            </button>
          </div>
        </div>

        <div style={S.field}>
          <span style={S.fieldLabel}>{t("spyCount", { max: spyMax })}</span>
          <div style={S.stepper}>
            <button style={S.stepBtn} onClick={() => setSpyCount((s) => Math.max(1, s - 1))} aria-label={t("decrease")}>
              −
            </button>
            <span style={S.stepVal}>{spyCount}</span>
            <button style={S.stepBtn} onClick={() => setSpyCount((s) => Math.min(spyMax, s + 1))} aria-label={t("increase")}>
              +
            </button>
          </div>
        </div>

        <div style={S.field}>
          <span style={S.fieldLabel}>{t("mode")}</span>
          <div style={S.toggle}>
            <button
              style={{ ...S.toggleBtn, ...(mode === "spectate" ? S.toggleBtnSel : {}) }}
              onClick={() => setMode("spectate")}
              title={t("modeSpectateTip")}
            >
              {t("modeSpectate")}
            </button>
            <button
              style={{ ...S.toggleBtn, ...(mode === "play" ? S.toggleBtnSel : {}) }}
              onClick={() => setMode("play")}
              title={t("modePlayTip")}
            >
              {t("modePlay")}
            </button>
            <button
              style={{ ...S.toggleBtn, ...(mode === "masterclass" ? S.toggleBtnSel : {}) }}
              onClick={() => setMode("masterclass")}
              title={t("modeMasterclassTip")}
            >
              {t("modeMasterclass")}
            </button>
          </div>
        </div>

        <div style={S.field}>
          <span style={S.fieldLabel}>{t("aiPlayers")}</span>
          <span style={{ ...S.stepVal, paddingTop: 4 }}>{t("aiCountValue", { n: aiCount })}</span>
        </div>

        <div style={S.field}>
          <span style={S.fieldLabel}>{t("blank")}</span>
          <div style={S.toggle}>
            <button
              style={{ ...S.toggleBtn, ...(blankOn ? S.toggleBtnSel : {}), opacity: blankAllowed ? 1 : 0.5 }}
              onClick={() => blankAllowed && setBlankEnabled((v) => !v)}
              title={t("blankTip")}
              disabled={!blankAllowed}
            >
              {blankOn ? t("blankOn") : t("off")}
            </button>
          </div>
        </div>

        <div style={S.field}>
          <span style={S.fieldLabel}>{t("devMode")}</span>
          <div style={S.toggle}>
            <button
              style={{ ...S.toggleBtn, ...(devMode ? S.toggleBtnSel : {}) }}
              onClick={() => setDevMode((v) => !v)}
              title={t("devModeTip")}
            >
              {devMode ? t("devModeOn") : t("off")}
            </button>
          </div>
        </div>

        <div style={S.field}>
          <span style={S.fieldLabel}>{t("advanced")}</span>
          <div style={S.toggle}>
            <button
              style={{ ...S.toggleBtn, ...(advanced ? S.toggleBtnSel : {}) }}
              onClick={() => setAdvanced((v) => !v)}
              title={t("advancedTip")}
            >
              {advanced ? t("advancedOn") : t("off")}
            </button>
          </div>
        </div>
      </div>

      {advanced && (
        <div style={{ marginBottom: 16 }}>
          <span style={{ ...S.fieldLabel, display: "block", marginBottom: 8 }}>{t("advancedSlots", { n: aiCount })}</span>
          <AISlotEditor slots={slots.slice(0, aiCount)} onChange={setSlots} />
        </div>
      )}

      <div style={{ ...S.fieldRow, marginBottom: 10 }}>
        <div style={S.field}>
          <span style={S.fieldLabel}>{t("theme")}</span>
          <select style={sel} value={theme ?? ""} onChange={(e) => setTheme(e.target.value || null)}>
            <option value="">{t("anyTheme")}</option>
            {THEMES.map((th) => (
              <option key={th} value={th}>
                {th}
              </option>
            ))}
          </select>
        </div>
        <div style={S.field}>
          <span style={S.fieldLabel}>{t("difficulty")}</span>
          <select
            style={sel}
            value={difficulty == null ? "" : String(difficulty)}
            onChange={(e) => setDifficulty(e.target.value ? Number(e.target.value) : null)}
          >
            {DIFFICULTY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {t(d.key)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <span style={{ ...S.fieldLabel, display: "block", marginBottom: 8 }}>{t("pickWord", { count: pairs.length })}</span>
      <div style={S.pairGrid}>
        <button onClick={() => setWordPairId(null)} style={{ ...S.pairBtn, ...(wordPairId === null ? S.pairBtnSel : {}) }}>
          {t("randomPair")}
        </button>
        {pairs.map((w) => (
          <button
            key={w.id}
            onClick={() => setWordPairId(w.id)}
            style={{ ...S.pairBtn, ...(wordPairId === w.id ? S.pairBtnSel : {}) }}
          >
            {w.civ} / {w.spy}
          </button>
        ))}
      </div>

      <button onClick={start} style={S.startBtn}>
        {mode === "masterclass" ? t("startMasterclass") : t("startGame")}
      </button>
    </div>
  );
}
