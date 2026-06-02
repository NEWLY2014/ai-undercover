// In-memory, per-key sliding-window rate limiter — a first-layer abuse guard for
// the public API routes. NOTE: this is per-process. On a multi-instance or
// serverless deploy each instance keeps its own counters, so it caps a single hot
// instance but is not a global limit. The distributed limiter (Redis/Upstash /
// per-user quota) lands in the full Phase 1 hardening; this protects the current
// single-instance deploy and blocks trivial floods today.

export interface RateRule {
  windowMs: number;
  max: number;
}

const buckets = new Map<string, number[]>();
let lastSweep = 0;

// Returns ok=false with a Retry-After hint (seconds) when any rule is exceeded.
export function rateLimit(key: string, rules: RateRule[]): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const maxWindow = Math.max(...rules.map((r) => r.windowMs));
  const times = (buckets.get(key) ?? []).filter((t) => t > now - maxWindow);

  for (const r of rules) {
    const inWindow = times.filter((t) => t > now - r.windowMs);
    if (inWindow.length >= r.max) {
      buckets.set(key, times);
      const retryAfterSec = Math.max(1, Math.ceil((inWindow[0] + r.windowMs - now) / 1000));
      return { ok: false, retryAfterSec };
    }
  }

  times.push(now);
  buckets.set(key, times);

  // Opportunistic memory sweep so idle keys don't accumulate forever.
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, arr] of buckets) {
      const keep = arr.filter((t) => t > now - 600_000);
      if (keep.length) buckets.set(k, keep);
      else buckets.delete(k);
    }
  }

  return { ok: true, retryAfterSec: 0 };
}

// Best-effort client IP from proxy headers (Vercel/most hosts set x-forwarded-for).
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
