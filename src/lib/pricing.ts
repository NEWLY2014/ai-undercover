// LLM token pricing for the cost-per-game model. Rates are USD per 1M tokens from
// published vendor pricing (links below). CNY is derived from USD via a configurable
// FX rate (env USD_CNY_RATE) — that is a conversion for display, NOT an official CNY
// price list. Any rate can be overridden via env if your contract differs.
//
// Sources (fetched 2026-06):
//   Doubao Seed 2.0 (Volcengine Ark): https://www.volcengine.com/docs/82379/1544106
//     rates via https://ofox.ai/zh/blog/doubao-seed-2-api-guide-2026/
//     (Mini $0.06/$0.56, Lite $0.13/$0.76, Pro/Code $0.67/$3.36 per 1M in/out)
//   Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
//     (Sonnet $3/$15, Haiku $1/$5, Opus $5/$25 per 1M in/out)
// Note: Doubao has a tiered discount (output → ¥2/1M when input ≤32K AND output ≤200
//   tokens); our calls output ~1.8k tokens, so the standard rate applies here.
// This module is server-only (reads process.env); import it from API routes only.

export interface TokenPrice {
  inputPerM: number; // USD per 1M input tokens
  outputPerM: number; // USD per 1M output tokens
}

function envNum(name: string, dflt: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : dflt;
}

// Most-specific first. Matched against the lowercased model id.
const TABLE: Array<{ match: RegExp; price: TokenPrice; label: string }> = [
  { match: /doubao-seed-2[.-]0-mini/, price: { inputPerM: 0.06, outputPerM: 0.56 }, label: "doubao-seed-2.0-mini" },
  { match: /doubao-seed-2[.-]0-lite/, price: { inputPerM: 0.13, outputPerM: 0.76 }, label: "doubao-seed-2.0-lite" },
  { match: /doubao-seed-2[.-]0-(pro|code)/, price: { inputPerM: 0.67, outputPerM: 3.36 }, label: "doubao-seed-2.0-pro/code" },
  { match: /sonnet/, price: { inputPerM: 3, outputPerM: 15 }, label: "claude-sonnet" },
  { match: /haiku/, price: { inputPerM: 1, outputPerM: 5 }, label: "claude-haiku" },
  { match: /opus/, price: { inputPerM: 5, outputPerM: 25 }, label: "claude-opus" },
  // Local/self-hosted models have no per-token vendor charge.
  { match: /qwen|llama|mistral|gemma|phi3?|ollama/, price: { inputPerM: 0, outputPerM: 0 }, label: "local (self-hosted)" },
];

// Conservative fallback for unrecognized models (override via env).
function fallback(): TokenPrice {
  return { inputPerM: envNum("PRICE_FALLBACK_INPUT", 0.1), outputPerM: envNum("PRICE_FALLBACK_OUTPUT", 0.5) };
}

export function priceFor(model: string | undefined): { price: TokenPrice; label: string } {
  const m = (model ?? "").toLowerCase();
  for (const t of TABLE) if (t.match.test(m)) return { price: t.price, label: t.label };
  return { price: fallback(), label: `fallback(${model ?? "?"})` };
}

// USD cost for given token counts under a model's rate.
export function usdCost(inputTokens: number, outputTokens: number, model: string | undefined): number {
  const { price } = priceFor(model);
  return (inputTokens / 1e6) * price.inputPerM + (outputTokens / 1e6) * price.outputPerM;
}

export function usdToCny(usd: number): number {
  return usd * envNum("USD_CNY_RATE", 7.1);
}

export function fxRate(): number {
  return envNum("USD_CNY_RATE", 7.1);
}
