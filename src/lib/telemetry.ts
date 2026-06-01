// Client-side data instrumentation (数据埋点). Each call to track() does two things:
//   1. console.debug(...)  — visible in the browser devtools while playing
//   2. POST /api/track     — so the event is logged on the BACKEND (在后台打日志)
//
// Events are keyed by a per-tab sessionId and a per-game gameId so a JSONL log can
// be grouped back into individual games/sessions. Fire-and-forget: a telemetry
// failure must never affect gameplay.

const SESSION_KEY = "undercover:sid";

function rand(n: number): string {
  // Short random suffix; only needs to be unique-enough within a session.
  return Math.random().toString(36).slice(2, 2 + n);
}

function sessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let s = window.sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = `s_${Date.now().toString(36)}_${rand(6)}`;
      window.sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch {
    return "nostore";
  }
}

let currentGameId: string | null = null;

// Start a new game scope; returns the id so the caller can also use it if needed.
export function newGameId(): string {
  currentGameId = `g_${Date.now().toString(36)}_${rand(4)}`;
  return currentGameId;
}

export function getGameId(): string | null {
  return currentGameId;
}

export interface TrackEvent {
  event: string;
  sessionId: string;
  gameId: string | null;
  ts: string;
  props: Record<string, unknown>;
}

export function track(event: string, props: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  const payload: TrackEvent = {
    event,
    sessionId: sessionId(),
    gameId: currentGameId,
    ts: new Date().toISOString(),
    props,
  };

  try {
    console.debug(`[track] ${event}`, props);
  } catch {
    /* ignore */
  }

  try {
    const body = JSON.stringify(payload);
    // sendBeacon survives page unload and doesn't block; fall back to keepalive fetch.
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    /* telemetry is never allowed to break gameplay */
  }
}
