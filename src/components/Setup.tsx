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

export default function Setup({
  onStart,
  onTutorial,
}: {
  onStart: (c: GameConfig) => void;
  onTutorial: () => void;
}) {
  const [total, setTotal] = useState(5);
  const [human, setHuman] = useState<0 | 1>(0);
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

  const start = () =>
    onStart({
      totalPlayers: total,
      humanPlayers: human,
      spyCount,
      blankEnabled: blankOn,
      wordPairId,
      theme,
      difficulty,
      devMode,
      aiSlots: advanced ? slots.slice(0, aiCount) : undefined,
    });

  return (
    <div style={S.setup}>
      <h2 style={S.setupTitle}>开一局</h2>
      <p style={S.setupP}>配置玩家、卧底数与词，然后看 AI 在牌桌上互相试探。最多可加入 1 名真人(你)。</p>

      <button
        onClick={onTutorial}
        style={{
          width: "100%",
          fontFamily: "var(--font-body)",
          fontSize: 14,
          color: "var(--amber)",
          background: "rgba(232,161,58,.08)",
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: "var(--amber-dim)",
          borderRadius: 10,
          padding: "11px 14px",
          cursor: "pointer",
          marginBottom: 16,
          textAlign: "left",
        }}
      >
        📖 第一次玩？点这里进入<b>新手教学</b> —— 边玩边学规则与技巧 →
      </button>

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
          <span style={S.fieldLabel}>你的角色</span>
          <div style={S.toggle}>
            <button style={{ ...S.toggleBtn, ...(human === 0 ? S.toggleBtnSel : {}) }} onClick={() => setHuman(0)}>
              👀 纯观战
            </button>
            <button style={{ ...S.toggleBtn, ...(human === 1 ? S.toggleBtnSel : {}) }} onClick={() => setHuman(1)}>
              🧑 我也玩
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
        入座开局 →
      </button>
    </div>
  );
}
