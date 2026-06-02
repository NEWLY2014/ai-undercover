import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/serverLog";
import { clientIp, rateLimit } from "@/lib/rateLimit";

// Sink for client-side telemetry events. The browser POSTs (often via sendBeacon) and
// we write each event to the backend log. We only OBSERVE/record what the client
// reports — nothing here feeds back into game logic.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IncomingEvent {
  event?: unknown;
  sessionId?: unknown;
  gameId?: unknown;
  ts?: unknown;
  props?: unknown;
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

// Abuse guards: cap body size, batch size, and per-IP rate so the log sink can't
// be used to flood disk or spam events.
const MAX_BODY_BYTES = 16 * 1024;
const MAX_EVENTS = 50;

export async function POST(req: NextRequest) {
  const rl = rateLimit(`track:${clientIp(req)}`, [
    { windowMs: 10_000, max: 60 },
    { windowMs: 60_000, max: 400 },
  ]);
  if (!rl.ok) {
    return NextResponse.json({ ok: false }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "payload too large" }, { status: 413 });
  }

  let body: IncomingEvent | IncomingEvent[];
  try {
    body = JSON.parse(raw) as IncomingEvent | IncomingEvent[];
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  const events = Array.isArray(body) ? body : [body];
  if (events.length > MAX_EVENTS) {
    return NextResponse.json({ ok: false, error: "too many events" }, { status: 413 });
  }
  for (const ev of events) {
    const name = str(ev?.event);
    if (!name) continue; // ignore malformed entries rather than failing the batch
    await logEvent({
      type: `client:${name}`,
      sessionId: str(ev?.sessionId),
      gameId: str(ev?.gameId),
      clientTs: str(ev?.ts),
      props: ev?.props && typeof ev.props === "object" ? ev.props : undefined,
    });
  }

  return NextResponse.json({ ok: true });
}
