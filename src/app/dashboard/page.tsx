"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── theme ──────────────────────────────────────────────────────────────────
const C = {
  bg: "#0c0a0f",
  panel: "#16131c",
  panel2: "#1d1925",
  ink: "#ece6dd",
  muted: "#a39ab0",
  amber: "#e8a13a",
  green: "#5fb05a",
  red: "#df4b42",
  line: "rgba(255,255,255,0.08)",
};
const PALETTE = [C.amber, C.green, "#6aa8e8", "#c77dff", C.red, C.muted, "#e8c84a"];

// ── data shapes (mirror /api/dashboard) ─────────────────────────────────────
interface Grouped { name: string; count: number; avgMs: number; inTok: number; outTok: number }
interface AgentCalls {
  total: number; ok: number; err: number; errorRate: number; avgMs: number; p50: number; p95: number;
  inputTokens: number; outputTokens: number;
  byProvider: Grouped[]; byModel: Grouped[]; byKind: Grouped[];
  latencyByMinute: Array<{ t: string; avgMs: number; count: number }>;
}
interface Games {
  total: number; civWins: number; spyWins: number; civRate: number; spyRate: number; avgRounds: number;
  roundDist: Array<{ rounds: number; count: number }>;
  byMode: Array<{ name: string; count: number }>;
  byTheme: Array<{ name: string; count: number }>;
  spyElim: number; spyElimRound1: number; spyRound1Rate: number;
}
interface Cost {
  measuredGames: number; ungroupedCalls: number;
  avgUsd: number; p50Usd: number; p95Usd: number; avgCny: number; avgTokens: number;
  fxRate: number; primaryModel: string | null;
  byMode: Array<{ name: string; games: number; avgUsd: number }>;
  devGames: number; devAvgUsd: number; nonDevGames: number; nonDevAvgUsd: number;
  fallbackPerGameUsd: number;
}
type EventRec = { ts?: string; type?: string } & Record<string, unknown>;
interface DashData {
  dates: string[]; selected: string; totalRecords: number;
  agentCalls: AgentCalls; games: Games; cost: Cost;
  events: EventRec[]; truncated: boolean; eventCap: number;
}

// ── small style helpers ─────────────────────────────────────────────────────
const wrap: CSSProperties = { background: C.bg, color: C.ink, minHeight: "100vh", padding: "24px 22px 40px", fontFamily: "var(--font-body)" };
const shell: CSSProperties = { maxWidth: 1180, margin: "0 auto" };
const sectionTitle: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 18, letterSpacing: 1, margin: "26px 0 12px", color: C.ink };
const panel: CSSProperties = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 };
const cardGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, marginBottom: 14 };
const statCard: CSSProperties = { background: C.panel2, borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 3 };
const statBig: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 24, color: C.amber };
const statSmall: CSSProperties = { fontSize: 12.5, color: C.muted };
const chartGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 };
const chartTitle: CSSProperties = { fontSize: 13, color: C.muted, marginBottom: 8, fontFamily: "var(--font-mono)", letterSpacing: 0.5 };
const tooltipStyle: CSSProperties = { background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 12.5 };
const axis = { fontSize: 11, fill: C.muted };

function Stat({ big, small }: { big: string | number; small: string }) {
  return (
    <div style={statCard}>
      <span style={statBig}>{big}</span>
      <span style={statSmall}>{small}</span>
    </div>
  );
}
function ChartBox({ title, height = 240, children }: { title: string; height?: number; children: React.ReactElement }) {
  return (
    <div style={panel}>
      <div style={chartTitle}>{title}</div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

// Pull a short "who" + "detail" out of any event for the raw table.
function describe(e: EventRec): { who: string; round: string; detail: string } {
  const p = (e.props && typeof e.props === "object" ? (e.props as Record<string, unknown>) : null) ?? e;
  const s = (v: unknown) => (v == null ? "" : String(v));
  const who = s(e.agent) || s((p as Record<string, unknown>).name) || s((p as Record<string, unknown>).voter) || s((p as Record<string, unknown>).guesser) || "";
  const round = s(e.round) || s((p as Record<string, unknown>).round) || "";
  let detail = "";
  if (e.type === "agent_call") {
    detail = `${s(e.provider)}/${s(e.model)} · ${s(e.ms)}ms · ok=${s(e.ok)}${e.error ? " · " + s(e.error) : ""}`;
  } else {
    detail = JSON.stringify(p).slice(0, 160);
  }
  return { who, round, detail };
}

export default function Dashboard() {
  const [date, setDate] = useState<string>("");
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [authKey, setAuthKey] = useState<string>("");
  const [needKey, setNeedKey] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [gamesPerDay, setGamesPerDay] = useState(1000);
  const [marginPct, setMarginPct] = useState(80);

  // Pick up an admin key from ?key= (persisted) or sessionStorage once on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromUrl = new URL(window.location.href).searchParams.get("key");
    if (fromUrl) window.sessionStorage.setItem("undercover:dashkey", fromUrl);
    setAuthKey(fromUrl ?? window.sessionStorage.getItem("undercover:dashkey") ?? "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const q = date ? `?date=${encodeURIComponent(date)}` : "";
    const headers: Record<string, string> = authKey ? { "x-dashboard-key": authKey } : {};
    fetch(`/api/dashboard${q}`, { headers })
      .then(async (r) => {
        if (r.status === 401) {
          if (!cancelled) {
            setNeedKey(true);
            setLoading(false);
          }
          return null;
        }
        return (await r.json()) as DashData;
      })
      .then((d) => {
        if (cancelled || !d) return;
        setNeedKey(false);
        setData(d);
        if (!date && d.selected) setDate(d.selected);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, authKey]);

  const eventTypes = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.events.map((e) => e.type ?? "?"))].sort();
  }, [data]);
  const shownEvents = useMemo(() => {
    if (!data) return [];
    return typeFilter === "all" ? data.events : data.events.filter((e) => e.type === typeFilter);
  }, [data, typeFilter]);

  const okErr = data ? [{ name: "成功", value: data.agentCalls.ok }, { name: "失败", value: data.agentCalls.err }] : [];
  const winData = data ? [{ name: "平民胜", value: data.games.civWins }, { name: "卧底胜", value: data.games.spyWins }] : [];

  return (
    <div style={wrap}>
      <div style={shell}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", letterSpacing: 3, fontSize: 11.5, color: C.amber, textTransform: "uppercase" }}>
              TELEMETRY · 数据看板
            </div>
            <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 30, margin: "2px 0 0" }}>谁是卧底 · 看板</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 12.5, color: C.muted }}>日期</label>
            <select
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ fontSize: 13, color: C.ink, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px" }}
            >
              {data?.dates.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
              <option value="all">全部</option>
            </select>
            <a href="/" style={{ fontSize: 13, color: C.amber, textDecoration: "none" }}>← 返回游戏</a>
          </div>
        </div>

        {needKey && (
          <div style={{ ...panel, marginTop: 24, maxWidth: 440 }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>需要管理员密钥</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>
              此看板已受保护。请输入管理员密钥（服务端 DASHBOARD_KEY）。
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="管理员密钥"
                style={{ flex: 1, fontSize: 13, color: C.ink, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px" }}
              />
              <button
                onClick={() => {
                  if (typeof window !== "undefined") window.sessionStorage.setItem("undercover:dashkey", keyInput);
                  setAuthKey(keyInput);
                }}
                style={{ fontSize: 13, color: "#1a1208", background: C.amber, border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 600 }}
              >
                进入
              </button>
            </div>
          </div>
        )}

        {loading && <p style={{ color: C.muted, marginTop: 24 }}>加载中…</p>}
        {err && <p style={{ color: C.red, marginTop: 24 }}>加载失败：{err}</p>}
        {data && !loading && data.totalRecords === 0 && (
          <p style={{ color: C.muted, marginTop: 24 }}>这一天还没有日志。先玩一两局，或对 /api/track 灌入事件后再来看。</p>
        )}

        {data && !loading && data.totalRecords > 0 && (
          <>
            {/* ── AI call performance ── */}
            <div style={sectionTitle}>🤖 AI 调用性能</div>
            <div style={cardGrid}>
              <Stat big={data.agentCalls.total} small="调用数" />
              <Stat big={`${data.agentCalls.errorRate}%`} small={`错误率 (${data.agentCalls.err} 失败)`} />
              <Stat big={`${data.agentCalls.avgMs}ms`} small={`均延迟 · p95 ${data.agentCalls.p95}ms`} />
              <Stat big={data.agentCalls.inputTokens.toLocaleString()} small="输入 token 合计" />
              <Stat big={data.agentCalls.outputTokens.toLocaleString()} small="输出 token 合计" />
            </div>
            <div style={chartGrid}>
              <ChartBox title="延迟随时间 (按分钟均值 ms)">
                <LineChart data={data.agentCalls.latencyByMinute} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} />
                  <XAxis dataKey="t" tick={axis} stroke={C.line} />
                  <YAxis tick={axis} stroke={C.line} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="avgMs" stroke={C.amber} dot={false} strokeWidth={2} />
                </LineChart>
              </ChartBox>
              <ChartBox title="按 kind 调用次数 / 均延迟">
                <BarChart data={data.agentCalls.byKind} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} />
                  <XAxis dataKey="name" tick={axis} stroke={C.line} />
                  <YAxis tick={axis} stroke={C.line} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12, color: C.muted }} />
                  <Bar dataKey="count" name="次数" fill={C.amber} />
                  <Bar dataKey="avgMs" name="均延迟ms" fill={C.green} />
                </BarChart>
              </ChartBox>
              <ChartBox title="按 provider 调用次数">
                <BarChart data={data.agentCalls.byProvider} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} />
                  <XAxis dataKey="name" tick={axis} stroke={C.line} />
                  <YAxis tick={axis} stroke={C.line} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="次数" fill={PALETTE[2]} />
                </BarChart>
              </ChartBox>
              <ChartBox title="成功 / 失败">
                <PieChart>
                  <Pie data={okErr} dataKey="value" nameKey="name" outerRadius={80} label>
                    <Cell fill={C.green} />
                    <Cell fill={C.red} />
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12, color: C.muted }} />
                </PieChart>
              </ChartBox>
            </div>

            {/* ── Game analytics ── */}
            <div style={sectionTitle}>🎯 对局分析</div>
            <div style={cardGrid}>
              <Stat big={data.games.total} small="完成对局数" />
              <Stat big={`${data.games.civRate}%`} small={`平民胜率 (${data.games.civWins})`} />
              <Stat big={`${data.games.spyRate}%`} small={`卧底胜率 (${data.games.spyWins})`} />
              <Stat big={data.games.avgRounds} small="平均轮数" />
              <Stat big={`${data.games.spyRound1Rate}%`} small={`卧底一轮游率 (${data.games.spyElimRound1}/${data.games.spyElim})`} />
            </div>
            <div style={chartGrid}>
              <ChartBox title="胜负分布">
                <PieChart>
                  <Pie data={winData} dataKey="value" nameKey="name" outerRadius={80} label>
                    <Cell fill={C.green} />
                    <Cell fill={C.red} />
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12, color: C.muted }} />
                </PieChart>
              </ChartBox>
              <ChartBox title="轮数分布">
                <BarChart data={data.games.roundDist} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} />
                  <XAxis dataKey="rounds" tick={axis} stroke={C.line} />
                  <YAxis tick={axis} stroke={C.line} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="对局数" fill={C.amber} />
                </BarChart>
              </ChartBox>
              <ChartBox title="按模式分布">
                <BarChart data={data.games.byMode} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} />
                  <XAxis dataKey="name" tick={axis} stroke={C.line} />
                  <YAxis tick={axis} stroke={C.line} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="开局数" fill={PALETTE[3]} />
                </BarChart>
              </ChartBox>
              <ChartBox title="按主题分布">
                <BarChart data={data.games.byTheme} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={C.line} />
                  <XAxis dataKey="name" tick={axis} stroke={C.line} />
                  <YAxis tick={axis} stroke={C.line} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="开局数" fill={C.green} />
                </BarChart>
              </ChartBox>
            </div>

            {/* ── Cost & pricing ── */}
            <div style={sectionTitle}>💰 成本与定价</div>
            {data.cost.measuredGames === 0 ? (
              <div style={{ ...panel, marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
                  还没有带 gameId 的对局成本数据（本次起新对局才会记录 gameId）。
                  {data.cost.fallbackPerGameUsd > 0
                    ? ` 按全局估算，每局约 $${data.cost.fallbackPerGameUsd}（总 token ÷ 完成对局数，模型 ${data.cost.primaryModel ?? "?"}）。`
                    : ""}
                </div>
              </div>
            ) : (
              <>
                <div style={cardGrid}>
                  <Stat big={`$${data.cost.avgUsd}`} small={`均成本/局 · ≈¥${data.cost.avgCny}`} />
                  <Stat big={`$${data.cost.p95Usd}`} small="p95 成本/局" />
                  <Stat big={data.cost.avgTokens.toLocaleString()} small="均 token/局" />
                  <Stat big={`$${data.cost.devAvgUsd}`} small={`开发者模式均成本 (${data.cost.devGames} 局)`} />
                  <Stat big={data.cost.measuredGames} small={`已计成本对局 · ${data.cost.primaryModel ?? "?"}`} />
                </div>
                <div style={chartGrid}>
                  <ChartBox title="按模式 · 均成本/局 ($)">
                    <BarChart data={data.cost.byMode} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={C.line} />
                      <XAxis dataKey="name" tick={axis} stroke={C.line} />
                      <YAxis tick={axis} stroke={C.line} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="avgUsd" name="均成本$" fill={C.amber} />
                    </BarChart>
                  </ChartBox>
                  <div style={panel}>
                    <div style={chartTitle}>投放 / 定价测算</div>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
                      <label style={{ fontSize: 12.5, color: C.muted }}>
                        每日对局数{" "}
                        <input
                          type="number"
                          value={gamesPerDay}
                          onChange={(e) => setGamesPerDay(Math.max(0, Number(e.target.value) || 0))}
                          style={{ width: 90, fontSize: 13, color: C.ink, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 6, padding: "4px 8px" }}
                        />
                      </label>
                      <label style={{ fontSize: 12.5, color: C.muted }}>
                        目标毛利率 %{" "}
                        <input
                          type="number"
                          value={marginPct}
                          onChange={(e) => setMarginPct(Math.min(99, Math.max(0, Number(e.target.value) || 0)))}
                          style={{ width: 70, fontSize: 13, color: C.ink, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 6, padding: "4px 8px" }}
                        />
                      </label>
                    </div>
                    {(() => {
                      const avg = data.cost.avgUsd;
                      const fx = data.cost.fxRate;
                      const monthly = avg * gamesPerDay * 30;
                      const freeCap = avg > 0 ? Math.floor(0.5 / (avg * 30)) : 0;
                      const priceFloor = (avg * 60) / (1 - marginPct / 100);
                      const row = (k: string, v: string) => (
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "6px 0", borderTop: `1px solid ${C.line}` }}>
                          <span style={{ color: C.muted }}>{k}</span>
                          <span style={{ fontFamily: "var(--font-mono)", textAlign: "right" }}>{v}</span>
                        </div>
                      );
                      return (
                        <div>
                          {row(`月成本 @ ${gamesPerDay} 局/日`, `$${monthly.toFixed(2)} ≈ ¥${(monthly * fx).toFixed(0)}`)}
                          {row("建议免费上限 (≤$0.5/人·月)", `${freeCap} 局/日`)}
                          {row(`订阅价下限 (毛利${marginPct}% @60局/月)`, `$${priceFloor.toFixed(2)} ≈ ¥${(priceFloor * fx).toFixed(1)}`)}
                        </div>
                      );
                    })()}
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
                      按已发布 LLM 费率估算（USD；¥ 按汇率 {data.cost.fxRate} 换算）。可在 src/lib/pricing.ts 或环境变量调整。
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── Raw event browser ── */}
            <div style={sectionTitle}>🧾 原始事件浏览</div>
            <div style={{ ...panel, padding: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
                <label style={{ fontSize: 12.5, color: C.muted }}>类型</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  style={{ fontSize: 13, color: C.ink, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "5px 9px" }}
                >
                  <option value="all">全部 ({data.events.length})</option>
                  {eventTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <span style={{ fontSize: 12, color: C.muted }}>
                  显示 {shownEvents.length} 条{data.truncated ? ` · 已截断到最近 ${data.eventCap} 条（共 ${data.totalRecords}）` : ""}
                </span>
              </div>
              <div style={{ overflowX: "auto", maxHeight: 460, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ position: "sticky", top: 0, background: C.panel2 }}>
                      {["时间", "类型", "对象", "轮", "详情"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "7px 10px", color: C.muted, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shownEvents.map((e, i) => {
                      const d = describe(e);
                      return (
                        <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                          <td style={{ padding: "6px 10px", color: C.muted, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{String(e.ts ?? "").slice(11, 19)}</td>
                          <td style={{ padding: "6px 10px", color: e.type === "agent_call" ? C.amber : C.ink, whiteSpace: "nowrap" }}>{e.type}</td>
                          <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{d.who}</td>
                          <td style={{ padding: "6px 10px", color: C.muted }}>{d.round}</td>
                          <td style={{ padding: "6px 10px", color: C.muted, maxWidth: 460, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.detail}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
