import { readdir, readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

// Reads the JSONL backend logs (written by src/lib/serverLog.ts) and returns
// aggregated metrics for the /dashboard page. Read-only: it never feeds back into
// game logic. Unauthenticated — intended for local/LAN self-use.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_DIR = path.join(process.cwd(), "logs");
const FILE_RE = /^undercover-(\d{4}-\d{2}-\d{2})\.jsonl$/;
const EVENT_CAP = 1000;

type Rec = { ts?: string; type?: string } & Record<string, unknown>;
const props = (r: Rec): Record<string, unknown> =>
  r.props && typeof r.props === "object" ? (r.props as Record<string, unknown>) : {};
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

async function listDates(): Promise<string[]> {
  try {
    const files = await readdir(LOG_DIR);
    return files
      .map((f) => FILE_RE.exec(f)?.[1])
      .filter((d): d is string => !!d)
      .sort();
  } catch {
    return [];
  }
}

async function readDate(date: string): Promise<Rec[]> {
  try {
    const raw = await readFile(path.join(LOG_DIR, `undercover-${date}.jsonl`), "utf8");
    const out: Rec[] = [];
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t) as Rec);
      } catch {
        /* skip malformed line */
      }
    }
    return out;
  } catch {
    return [];
  }
}

function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return 0;
  const i = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
  return sortedAsc[i];
}

interface Grouped {
  name: string;
  count: number;
  avgMs: number;
  inTok: number;
  outTok: number;
}
function groupCalls(calls: Rec[], key: string): Grouped[] {
  const m = new Map<string, { count: number; ms: number[]; inTok: number; outTok: number }>();
  for (const r of calls) {
    const k = String(r[key] ?? "?");
    const g = m.get(k) ?? { count: 0, ms: [], inTok: 0, outTok: 0 };
    g.count++;
    if (num(r.ms) > 0) g.ms.push(num(r.ms));
    g.inTok += num(r.inputTokens);
    g.outTok += num(r.outputTokens);
    m.set(k, g);
  }
  return [...m.entries()]
    .map(([name, g]) => ({
      name,
      count: g.count,
      avgMs: g.ms.length ? Math.round(g.ms.reduce((a, b) => a + b, 0) / g.ms.length) : 0,
      inTok: g.inTok,
      outTok: g.outTok,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function GET(req: NextRequest) {
  const dates = await listDates();
  const param = req.nextUrl.searchParams.get("date") ?? "";

  let selected: string;
  let records: Rec[] = [];
  if (param === "all") {
    selected = "all";
    for (const d of dates) records.push(...(await readDate(d)));
  } else {
    const day = dates.includes(param) ? param : dates[dates.length - 1];
    selected = day ?? "";
    if (day) records = await readDate(day);
  }

  // ── agent_call performance ──────────────────────────────────────────────
  const calls = records.filter((r) => r.type === "agent_call");
  const ok = calls.filter((r) => r.ok === true);
  const err = calls.filter((r) => r.ok === false);
  const msAsc = ok
    .map((r) => num(r.ms))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const latencyByMinute = (() => {
    const m = new Map<string, { count: number; ms: number }>();
    for (const r of ok) {
      const minute = String(r.ts ?? "").slice(11, 16); // HH:MM (UTC)
      if (!minute) continue;
      const b = m.get(minute) ?? { count: 0, ms: 0 };
      b.count++;
      b.ms += num(r.ms);
      m.set(minute, b);
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([t, b]) => ({ t, avgMs: Math.round(b.ms / b.count), count: b.count }));
  })();

  const agentCalls = {
    total: calls.length,
    ok: ok.length,
    err: err.length,
    errorRate: calls.length ? +((err.length / calls.length) * 100).toFixed(1) : 0,
    avgMs: msAsc.length ? Math.round(msAsc.reduce((a, b) => a + b, 0) / msAsc.length) : 0,
    p50: percentile(msAsc, 50),
    p95: percentile(msAsc, 95),
    inputTokens: calls.reduce((s, r) => s + num(r.inputTokens), 0),
    outputTokens: calls.reduce((s, r) => s + num(r.outputTokens), 0),
    byProvider: groupCalls(calls, "provider"),
    byModel: groupCalls(calls, "model"),
    byKind: groupCalls(calls, "kind"),
    latencyByMinute,
  };

  // ── game analytics ──────────────────────────────────────────────────────
  const overs = records.filter((r) => r.type === "client:game_over").map(props);
  const civWins = overs.filter((p) => p.winner === "civ").length;
  const spyWins = overs.filter((p) => p.winner === "spy").length;
  const roundsArr = overs.map((p) => num(p.rounds)).filter((n) => n > 0);
  const roundDist = (() => {
    const m = new Map<number, number>();
    for (const n of roundsArr) m.set(n, (m.get(n) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([rounds, count]) => ({ rounds, count }));
  })();

  const starts = records.filter((r) => r.type === "client:game_start").map(props);
  const modeCount = { spectate: 0, play: 0, masterclass: 0 };
  for (const p of starts) {
    if (p.tutorial) modeCount.masterclass++;
    else if (p.hasHuman) modeCount.play++;
    else modeCount.spectate++;
  }
  const themeMap = new Map<string, number>();
  for (const p of starts) {
    const t = typeof p.theme === "string" && p.theme ? p.theme : "(随机/任意)";
    themeMap.set(t, (themeMap.get(t) ?? 0) + 1);
  }
  const byTheme = [...themeMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  const spyElims = records.filter((r) => r.type === "client:eliminate").map(props).filter((p) => p.role === "spy");
  const spyElimR1 = spyElims.filter((p) => num(p.round) === 1);

  const games = {
    total: overs.length,
    civWins,
    spyWins,
    civRate: overs.length ? +((civWins / overs.length) * 100).toFixed(1) : 0,
    spyRate: overs.length ? +((spyWins / overs.length) * 100).toFixed(1) : 0,
    avgRounds: roundsArr.length ? +(roundsArr.reduce((a, b) => a + b, 0) / roundsArr.length).toFixed(1) : 0,
    roundDist,
    byMode: [
      { name: "纯观战", count: modeCount.spectate },
      { name: "我也玩", count: modeCount.play },
      { name: "大师课", count: modeCount.masterclass },
    ],
    byTheme,
    spyElim: spyElims.length,
    spyElimRound1: spyElimR1.length,
    spyRound1Rate: spyElims.length ? +((spyElimR1.length / spyElims.length) * 100).toFixed(1) : 0,
  };

  // ── raw events (most recent first, capped) ──────────────────────────────
  const events = [...records].sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? ""))).slice(0, EVENT_CAP);

  return NextResponse.json({
    dates,
    selected,
    totalRecords: records.length,
    agentCalls,
    games,
    events,
    truncated: records.length > EVENT_CAP,
    eventCap: EVENT_CAP,
  });
}
