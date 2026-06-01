// Server-side structured logger. Two sinks, both best-effort:
//   1. server console (stdout)        — live, human-scannable while the dev/prod server runs
//   2. logs/undercover-YYYY-MM-DD.jsonl — one JSON object per line, for later analysis
//
// This is pure OBSERVATION (可观测日志): it records what happened, it never changes
// any agent's behaviour. File writes are wrapped so a logging failure can never
// break the request that triggered it.
import { appendFile, mkdir } from "fs/promises";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs");

export interface LogRecord {
  type: string; // event name, e.g. "agent_call" / "client:game_start"
  [key: string]: unknown;
}

// Create the logs dir once (memoised), tolerate races.
let dirReady: Promise<void> | null = null;
function ensureDir(): Promise<void> {
  if (!dirReady) {
    dirReady = mkdir(LOG_DIR, { recursive: true })
      .then(() => undefined)
      .catch(() => undefined);
  }
  return dirReady;
}

function dayFile(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return path.join(LOG_DIR, `undercover-${y}-${m}-${d}.jsonl`);
}

// Record one event. Stamps an ISO timestamp, prints a compact console line, and
// appends a full JSONL row. Awaitable, but callers may fire-and-forget.
export async function logEvent(rec: LogRecord): Promise<void> {
  const now = new Date();
  const line = { ts: now.toISOString(), ...rec };

  // Console: "[undercover] <ts> <type> {…rest}" — keeps the type scannable.
  const { ts, type, ...rest } = line;
  try {
    console.log(`[undercover] ${ts} ${type} ${JSON.stringify(rest)}`);
  } catch {
    /* console must never throw the request down */
  }

  // File: full JSONL row, best-effort.
  try {
    await ensureDir();
    await appendFile(dayFile(now), JSON.stringify(line) + "\n", "utf8");
  } catch (e) {
    try {
      console.warn(`[undercover] log file write failed: ${e instanceof Error ? e.message : String(e)}`);
    } catch {
      /* ignore */
    }
  }
}
