"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { S } from "@/app/styles";
import AISlotEditor, { defaultSlots } from "@/components/AISlotEditor";
import { maxSpyCount, suggestedSpyCount } from "@/game/engine";
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

const DIFFICULTY_OPTIONS = [
  { value: "", label: "任意难度" },
  { value: "1", label: "简单(差异大)" },
  { value: "2", label: "中等" },
  { value: "3", label: "困难(很接近)" },
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
      <h2 style={S.setupTitle}>开一局</h2>
      <p style={S.setupP}>
        配置玩家、卧底数与词，然后看 AI 在牌桌上互相试探。想亲自下场，选「我也玩」；想边玩边被点拨、精进技术，选「🎓 大师课」。
      </p>

      <div style={S.fieldRow}>
        <div style={S.field}>
          <span style={S.fieldLabel}>总玩家数</span>
          <div style={S.stepper}>
            <button style={S.stepBtn} onClick={() => setTotal((t) => clampTotal(t - 1))} aria-label="减少">
              −
            </button>
            <span style={S.stepVal}>{total}</span>
            <button style={S.stepBtn} onClick={() => setTotal((t) => clampTotal(t + 1))} aria-label="增加">
              +
            </button>
          </div>
        </div>

        <div style={S.field}>
          <span style={S.fieldLabel}>卧底数(最多 {spyMax})</span>
          <div style={S.stepper}>
            <button style={S.stepBtn} onClick={() => setSpyCount((s) => Math.max(1, s - 1))} aria-label="减少">
              −
            </button>
            <span style={S.stepVal}>{spyCount}</span>
            <button
              style={S.stepBtn}
              onClick={() => setSpyCount((s) => Math.min(spyMax, s + 1))}
              aria-label="增加"
            >
              +
            </button>
          </div>
        </div>

        <div style={S.field}>
          <span style={S.fieldLabel}>游戏模式</span>
          <div style={S.toggle}>
            <button
              style={{ ...S.toggleBtn, ...(mode === "spectate" ? S.toggleBtnSel : {}) }}
              onClick={() => setMode("spectate")}
              title="只看 AI 互相博弈，你可以押注谁是卧底"
            >
              👀 纯观战
            </button>
            <button
              style={{ ...S.toggleBtn, ...(mode === "play" ? S.toggleBtnSel : {}) }}
              onClick={() => setMode("play")}
              title="你入座同桌，和 AI 一起玩"
            >
              🧑 我也玩
            </button>
            <button
              style={{ ...S.toggleBtn, ...(mode === "masterclass" ? S.toggleBtnSel : {}) }}
              onClick={() => setMode("masterclass")}
              title="你上场，全程有教练点拨 + 显示每个 AI 的💭推理，帮你精进技术"
            >
              🎓 大师课
            </button>
          </div>
        </div>

        <div style={S.field}>
          <span style={S.fieldLabel}>AI 玩家</span>
          <span style={{ ...S.stepVal, paddingTop: 4 }}>{aiCount} 个</span>
        </div>

        <div style={S.field}>
          <span style={S.fieldLabel}>白板角色</span>
          <div style={S.toggle}>
            <button
              style={{ ...S.toggleBtn, ...(blankOn ? S.toggleBtnSel : {}), opacity: blankAllowed ? 1 : 0.5 }}
              onClick={() => blankAllowed && setBlankEnabled((v) => !v)}
              title="加入 1 名白板：没有词，要靠听别人描述蒙混过关"
              disabled={!blankAllowed}
            >
              {blankOn ? "🃏 已加入" : "关闭"}
            </button>
          </div>
        </div>

        <div style={S.field}>
          <span style={S.fieldLabel}>开发者模式</span>
          <div style={S.toggle}>
            <button
              style={{ ...S.toggleBtn, ...(devMode ? S.toggleBtnSel : {}) }}
              onClick={() => setDevMode((v) => !v)}
              title="每句发言后，所有 AI 实时更新对每个人的卧底嫌疑分(调用量较大)"
            >
              {devMode ? "🔬 已开启" : "关闭"}
            </button>
          </div>
        </div>

        <div style={S.field}>
          <span style={S.fieldLabel}>高级设置</span>
          <div style={S.toggle}>
            <button
              style={{ ...S.toggleBtn, ...(advanced ? S.toggleBtnSel : {}) }}
              onClick={() => setAdvanced((v) => !v)}
              title="逐个调每个 AI 角色的名字/性格/思维方式/模型/初始素质"
            >
              {advanced ? "⚙️ 已展开" : "关闭"}
            </button>
          </div>
        </div>
      </div>

      {advanced && (
        <div style={{ marginBottom: 16 }}>
          <span style={{ ...S.fieldLabel, display: "block", marginBottom: 8 }}>每个 AI 角色(共 {aiCount} 个)</span>
          <AISlotEditor slots={slots.slice(0, aiCount)} onChange={setSlots} />
        </div>
      )}

      <div style={{ ...S.fieldRow, marginBottom: 10 }}>
        <div style={S.field}>
          <span style={S.fieldLabel}>主题</span>
          <select style={sel} value={theme ?? ""} onChange={(e) => setTheme(e.target.value || null)}>
            <option value="">任意主题</option>
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div style={S.field}>
          <span style={S.fieldLabel}>难度</span>
          <select
            style={sel}
            value={difficulty == null ? "" : String(difficulty)}
            onChange={(e) => setDifficulty(e.target.value ? Number(e.target.value) : null)}
          >
            {DIFFICULTY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <span style={{ ...S.fieldLabel, display: "block", marginBottom: 8 }}>
        选一组词（{pairs.length} 组可选）
      </span>
      <div style={S.pairGrid}>
        <button
          onClick={() => setWordPairId(null)}
          style={{ ...S.pairBtn, ...(wordPairId === null ? S.pairBtnSel : {}) }}
        >
          🎲 随机一组
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
        {mode === "masterclass" ? "进入大师课 →" : "入座开局 →"}
      </button>
    </div>
  );
}
