import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/serverLog";

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

export async function POST(req: NextRequest) {
  let body: IncomingEvent | IncomingEvent[];
  try {
    body = (await req.json()) as IncomingEvent | IncomingEvent[];
  } catch {
    return NextResponse.json({ ok: false, error: "请求体不是合法 JSON。" }, { status: 400 });
  }

  const events = Array.isArray(body) ? body : [body];
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
