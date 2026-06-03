import Anthropic from "@anthropic-ai/sdk";
import { Ollama } from "ollama";
import { NextRequest, NextResponse } from "next/server";
import {
  buildCoachPrompt,
  buildDescribePrompt,
  buildReflectPrompt,
  buildSpyGuessPrompt,
  buildSuspectPrompt,
  buildVotePrompt,
  type CoachPayload,
  type DescribePayload,
  type ReflectPayload,
  type SpyGuessPayload,
  type SuspectPayload,
  type VotePayload,
} from "@/game/prompts";
import { logEvent } from "@/lib/serverLog";
import { clientIp, rateLimit } from "@/lib/rateLimit";

// Normalised token usage so every provider logs the same shape (fields optional —
// some providers/models don't report counts).
interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}
interface RunOutput {
  result: unknown;
  usage?: Usage;
}

// Server-side only. Secrets (Anthropic key) and the local Ollama host live here,
// never in the browser. Provider is switchable so the same game can run on a
// free local model (Ollama) or on Anthropic.
//   Anthropic tool-use:   https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview.md
//   Ollama structured out: https://ollama.com/blog/structured-outputs
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Provider = "ollama" | "anthropic" | "volcengine" | "minimax";
const PROVIDER: Provider = (process.env.UNDERCOVER_PROVIDER as Provider) || "ollama";
const OLLAMA_HOST = process.env.UNDERCOVER_OLLAMA_HOST || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.UNDERCOVER_OLLAMA_MODEL || "qwen2.5:3b";
const ANTHROPIC_MODEL = process.env.UNDERCOVER_DEFAULT_MODEL || "claude-sonnet-4-6";
// Volcengine Ark — OpenAI-compatible. ARK_MODEL is the inference
// endpoint id (ep-...) or an activated model name from the Ark console.
const ARK_KEY = process.env.ARK_API_KEY || "";
const ARK_BASE = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
const ARK_MODEL = process.env.ARK_MODEL || "";
// MiniMax — OpenAI-compatible (POST {base}/chat/completions). Model id e.g.
// "MiniMax-M2". Note the body uses max_completion_tokens, not max_tokens.
//   docs: https://platform.minimax.io/docs/api-reference/text-chat
const MINIMAX_KEY = process.env.MINIMAX_API_KEY || "";
const MINIMAX_BASE = process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1";
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || "MiniMax-M2";

type Locale = "zh" | "en";
const SYSTEM: Record<Locale, string> = {
  zh: "你是一个正在玩“谁是卧底”社交推理游戏的玩家智能体。只输出符合给定 JSON 结构的内容，不要输出结构之外的任何文字。",
  en: 'You are a player-agent in the social-deduction word game "Who\'s the Undercover." Think and write in English. Output only content matching the given JSON structure — no text outside that structure.',
};
// The game's language travels in the payload; default to zh for older clients.
function localeOf(body: AgentRequest): Locale {
  const l = (body.payload as { locale?: string } | undefined)?.locale;
  return l === "en" ? "en" : "zh";
}

type JsonSchema = Record<string, unknown>;

type AgentRequest =
  | { kind: "describe"; payload: DescribePayload; model?: string; gameId?: string }
  | { kind: "vote"; payload: VotePayload; model?: string; gameId?: string }
  | { kind: "suspect"; payload: SuspectPayload; model?: string; gameId?: string }
  | { kind: "reflect"; payload: ReflectPayload; model?: string; gameId?: string }
  | { kind: "spyGuess"; payload: SpyGuessPayload; model?: string; gameId?: string }
  | { kind: "coach"; payload: CoachPayload; model?: string; gameId?: string };

// One JSON schema per kind. tool_choice (Anthropic) / format (Ollama) force the
// model to return exactly this shape. The `vote`/`name` enums make "must be a
// real in-play opponent" a STRUCTURAL guarantee — schema validation, not
// deciding the content for the agent.
// Per-kind, per-locale text for the tool spec + field descriptions. Picking the
// right language here keeps the model's reasoning/output in the game's language.
const SCHEMA_TEXT = {
  describe: {
    zh: { tool: "提交你这一轮对自己词语的一句话描述。", reasoning: "你的简短内心思考。", clue: "你这一轮的描述，一句话，不超过25字。", memoryUpdate: "更新你的私人笔记(怀疑谁、依据、你是否可能是少数派)，几句话。" },
    en: { tool: "Submit your one-sentence clue about your own word for this round.", reasoning: "Your brief inner reasoning.", clue: "Your clue this round — one sentence, under ~15 words.", memoryUpdate: "Update your private notes (who you suspect, why, whether you might be the minority), a few sentences." },
  },
  vote: {
    zh: { tool: "投出你认为是卧底的那一票。", reasoning: "你的简短推理。", vote: "你要投的在场玩家名（不能是你自己）。", voteReason: "一句话理由，不超过30字。", memoryUpdate: "更新你的私人笔记，几句话。" },
    en: { tool: "Cast your vote for whoever you think is the undercover.", reasoning: "Your brief reasoning.", vote: "The in-play player name you're voting for (not yourself).", voteReason: "A one-sentence reason, under ~18 words.", memoryUpdate: "Update your private notes, a few sentences." },
  },
  spyGuess: {
    zh: { tool: "猜出平民拿到的词(反杀)。", reasoning: "你的简短推理。", guess: "你猜的平民词，只写这一个词。" },
    en: { tool: "Guess the civilians' word for the comeback win.", reasoning: "Your brief reasoning.", guess: "Your guess of the civilians' word — write just that one word." },
  },
  reflect: {
    zh: { tool: "复盘本局，给出可复用的经验教训。", learnings: "1-3 条具体、可复用的经验，每条一句话。" },
    en: { tool: "Review this game and give reusable lessons.", learnings: "1-3 concrete, reusable lessons, one sentence each." },
  },
  suspect: {
    zh: { tool: "给出你此刻对每个在场对手是卧底的怀疑分。", reasoning: "一句话整体看法。", suspicions: "对每个对手的怀疑分。", score: "0-100 的怀疑分。" },
    en: { tool: "Give your current 0-100 suspicion score for each remaining opponent.", reasoning: "A one-sentence overall view.", suspicions: "A suspicion score for each opponent.", score: "A 0-100 suspicion score." },
  },
  coach: {
    zh: { tool: "给学员一句实战指点。", tip: "2-4 句具体、实战、有人味的指点。" },
    en: { tool: "Give the student one piece of tactical coaching.", tip: "2-4 sentences of specific, tactical, human coaching." },
  },
} as const;

function buildSchema(body: AgentRequest, locale: Locale): { name: string; description: string; schema: JsonSchema } {
  if (body.kind === "describe") {
    const T = SCHEMA_TEXT.describe[locale];
    return {
      name: "submit_clue",
      description: T.tool,
      schema: {
        type: "object",
        properties: {
          reasoning: { type: "string", description: T.reasoning },
          clue: { type: "string", description: T.clue },
          memoryUpdate: { type: "string", description: T.memoryUpdate },
        },
        required: ["reasoning", "clue", "memoryUpdate"],
        additionalProperties: false,
      },
    };
  }
  if (body.kind === "vote") {
    const T = SCHEMA_TEXT.vote[locale];
    const others = body.payload.aliveNames.filter((n) => n !== body.payload.name);
    return {
      name: "submit_vote",
      description: T.tool,
      schema: {
        type: "object",
        properties: {
          reasoning: { type: "string", description: T.reasoning },
          vote: { type: "string", enum: others, description: T.vote },
          voteReason: { type: "string", description: T.voteReason },
          memoryUpdate: { type: "string", description: T.memoryUpdate },
        },
        required: ["reasoning", "vote", "voteReason", "memoryUpdate"],
        additionalProperties: false,
      },
    };
  }
  if (body.kind === "spyGuess") {
    const T = SCHEMA_TEXT.spyGuess[locale];
    return {
      name: "submit_guess",
      description: T.tool,
      schema: {
        type: "object",
        properties: {
          reasoning: { type: "string", description: T.reasoning },
          guess: { type: "string", description: T.guess },
        },
        required: ["reasoning", "guess"],
        additionalProperties: false,
      },
    };
  }
  if (body.kind === "coach") {
    const T = SCHEMA_TEXT.coach[locale];
    return {
      name: "submit_coaching",
      description: T.tool,
      schema: {
        type: "object",
        properties: {
          tip: { type: "string", description: T.tip },
        },
        required: ["tip"],
        additionalProperties: false,
      },
    };
  }
  if (body.kind === "reflect") {
    const T = SCHEMA_TEXT.reflect[locale];
    return {
      name: "submit_reflection",
      description: T.tool,
      schema: {
        type: "object",
        properties: {
          learnings: {
            type: "array",
            description: T.learnings,
            items: { type: "string" },
          },
        },
        required: ["learnings"],
        additionalProperties: false,
      },
    };
  }
  // suspect
  const T = SCHEMA_TEXT.suspect[locale];
  const others = body.payload.aliveNames.filter((n) => n !== body.payload.name);
  return {
    name: "submit_suspicion",
    description: T.tool,
    schema: {
      type: "object",
      properties: {
        reasoning: { type: "string", description: T.reasoning },
        suspicions: {
          type: "array",
          description: T.suspicions,
          items: {
            type: "object",
            properties: {
              name: { type: "string", enum: others },
              score: { type: "integer", description: T.score },
            },
            required: ["name", "score"],
            additionalProperties: false,
          },
        },
      },
      required: ["reasoning", "suspicions"],
      additionalProperties: false,
    },
  };
}

async function runAnthropic(
  spec: { name: string; description: string; schema: JsonSchema },
  prompt: string,
  model: string,
  system: string,
): Promise<RunOutput> {
  const client = new Anthropic();
  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    tools: [{ name: spec.name, description: spec.description, input_schema: spec.schema as Anthropic.Tool.InputSchema }],
    tool_choice: { type: "tool", name: spec.name, disable_parallel_tool_use: true },
    messages: [{ role: "user", content: prompt }],
  });
  const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new Error(`模型未返回工具调用 (stop_reason=${message.stop_reason})`);
  return {
    result: toolUse.input,
    usage: { inputTokens: message.usage?.input_tokens, outputTokens: message.usage?.output_tokens },
  };
}

async function runOllama(spec: { schema: JsonSchema }, prompt: string, model: string, system: string): Promise<RunOutput> {
  const client = new Ollama({ host: OLLAMA_HOST });
  const res = await client.chat({
    model,
    stream: false,
    format: spec.schema as object,
    options: { temperature: 0.8 },
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  });
  const usage: Usage = { inputTokens: res.prompt_eval_count, outputTokens: res.eval_count };
  const txt = res.message.content ?? "";
  try {
    return { result: JSON.parse(txt), usage };
  } catch {
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return { result: JSON.parse(m[0]), usage };
      } catch {
        /* fall through */
      }
    }
    throw new Error(`Ollama 返回无法解析为 JSON：${txt.slice(0, 200)}`);
  }
}

// Reasoning models (MiniMax-M2, doubao-seed) wrap their chain-of-thought in
// <think>...</think> INSIDE the content field (they do NOT use a separate
// reasoning_content in OpenAI-compatible mode). Strip it before extracting the
// JSON answer. Safe here: we never feed the assistant's output back as history,
// so dropping <think> can't hurt multi-turn quality. A dangling, unclosed
// <think> means the reply was truncated mid-reasoning (no answer) → parse fails →
// the caller retries.
//   https://platform.minimax.io/docs/guides/text-m2-function-call
function parseAgentJson(content: string, label: string): unknown {
  let s = content.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "");
  s = s.replace(/```json/gi, "").replace(/```/g, "").trim();
  const tryParse = (x: string): { ok: true; v: unknown } | { ok: false } => {
    try {
      return { ok: true, v: JSON.parse(x) };
    } catch {
      return { ok: false };
    }
  };
  let r = tryParse(s);
  if (r.ok) return r.v;
  const m = s.match(/\{[\s\S]*\}/);
  const obj = m ? m[0] : s;
  r = tryParse(obj);
  if (r.ok) return r.v;
  // Light repair for common reasoning-model malformations, only after a strict
  // parse already failed (so it can never corrupt valid JSON):
  //  - array elements as adjacent groups with no comma ("[a] [b]", "}{");
  //  - unescaped ASCII double-quotes used for emphasis INSIDE a Chinese string
  //    (e.g. 用"黄豆"做 or …常见"，). A real JSON string delimiter is always
  //    adjacent to ASCII structure (:,[]{} or whitespace), never wedged between
  //    CJK ideographs/fullwidth punctuation, so a quote with CJK context on BOTH
  //    sides is provably an inner quote — strip it. (CJK class = ideographs +
  //    CJK/fullwidth punctuation: 　-〿, 一-鿿, ＀-￯.)
  const cjk = "\\u3000-\\u303f\\u4e00-\\u9fff\\uff00-\\uffef";
  const innerQuote = new RegExp(`(?<=[${cjk}])"(?=[${cjk}])`, "g");
  r = tryParse(
    obj
      .replace(/\]\s*\[/g, ", ")
      .replace(/\}\s*\{/g, "}, {")
      .replace(innerQuote, ""),
  );
  if (r.ok) return r.v;
  throw new Error(`${label} 返回无法解析为 JSON：${(s || content).slice(0, 200)}`);
}

// Derive a short "only output JSON with these keys" instruction from the schema.
function jsonShapeHint(schema: JsonSchema, locale: Locale): string {
  const props = (schema as { properties?: Record<string, unknown> }).properties || {};
  const keys = Object.keys(props);
  if (locale === "en") {
    return `You must output exactly one JSON object (no extra text, explanation, or markdown code block), containing only these fields: ${keys.join(", ")}. The JSON must be strictly valid: do NOT put unescaped double-quotes inside a string value (use single quotes for emphasis, or escape them as \\"); put every array element inside ONE [] separated by commas.`;
  }
  return `你必须只输出一个 JSON 对象（不要任何额外文字、解释或 markdown 代码块），且只包含这些字段：${keys.join("、")}。必须是严格合法的 JSON：字符串值内部不要使用英文双引号 "（需要强调或引用时改用中文引号「」）；数组的所有元素必须放在同一个 [] 里、用英文逗号分隔。`;
}

// Volcengine Ark via its OpenAI-compatible /chat/completions. Older doubao
// models may not support response_format, so we don't send it — instead we
// instruct the exact JSON shape and robustly extract the object from the reply.
// (vote validity is still enforced downstream by re-asking the agent.)
async function runVolcengine(spec: { schema: JsonSchema }, prompt: string, model: string, system: string, locale: Locale): Promise<RunOutput> {
  const res = await fetch(`${ARK_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ARK_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: `${system} ${jsonShapeHint(spec.schema, locale)}` },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
      // doubao-seed is a reasoning model: its chain-of-thought consumes tokens
      // before the JSON answer, so the budget must hold the reasoning AND the
      // answer or the content truncates (yielding an empty/garbled clue).
      max_tokens: 16384,
    }),
  });
  const data = (await res.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  if (!res.ok) {
    throw new Error(`Ark HTTP ${res.status}: ${data?.error?.message || JSON.stringify(data).slice(0, 300)}`);
  }
  const usage: Usage = { inputTokens: data?.usage?.prompt_tokens, outputTokens: data?.usage?.completion_tokens };
  const txt = data?.choices?.[0]?.message?.content ?? "";
  return { result: parseAgentJson(txt, "Ark"), usage };
}

// MiniMax via its OpenAI-compatible /chat/completions. MiniMax-M2 is a reasoning
// model whose chain-of-thought is wrapped in <think>...</think> INSIDE `content`
// (no separate reasoning_content), so parseAgentJson strips it before reading the
// JSON answer. The body uses max_completion_tokens (not max_tokens); MiniMax
// recommends temperature 1.0 / top_p 0.95 for M2.
//   docs: https://platform.minimax.io/docs/api-reference/text-chat
//   thinking format: https://platform.minimax.io/docs/guides/text-m2-function-call
async function runMinimax(spec: { schema: JsonSchema }, prompt: string, model: string, system: string, locale: Locale): Promise<RunOutput> {
  const res = await fetch(`${MINIMAX_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MINIMAX_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: `${system} ${jsonShapeHint(spec.schema, locale)}` },
        { role: "user", content: prompt },
      ],
      temperature: 1,
      top_p: 0.95,
      // M2's <think> reasoning is counted against this budget BEFORE the JSON
      // answer is emitted. 8192 was far too low — long prompts (reflect/vote with
      // the full transcript) exhausted it mid-reasoning, truncating before any
      // JSON (~19% of calls 500'd in load testing). M2 allows up to 200k output;
      // 32768 comfortably holds the reasoning + the answer. You only pay for the
      // tokens actually generated, so a high cap costs nothing on short replies.
      max_completion_tokens: 32768,
    }),
  });
  const data = (await res.json()) as {
    error?: { message?: string };
    base_resp?: { status_code?: number; status_msg?: string };
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  if (!res.ok) {
    throw new Error(
      `MiniMax HTTP ${res.status}: ${data?.error?.message || data?.base_resp?.status_msg || JSON.stringify(data).slice(0, 300)}`,
    );
  }
  // MiniMax can signal app-level errors via base_resp even on HTTP 200.
  if (data?.base_resp?.status_code) {
    throw new Error(`MiniMax error ${data.base_resp.status_code}: ${data.base_resp.status_msg ?? ""}`);
  }
  const usage: Usage = { inputTokens: data?.usage?.prompt_tokens, outputTokens: data?.usage?.completion_tokens };
  const txt = data?.choices?.[0]?.message?.content ?? "";
  return { result: parseAgentJson(txt, "MiniMax"), usage };
}

// Abuse guards: bound the request body and the long prompt-feeding fields BEFORE
// anything reaches the paid LLM. Legitimate games stay well under these caps;
// these only reject oversized/abusive payloads (reject, never truncate — so a
// real agent's input is never silently altered).
const MAX_BODY_BYTES = 32 * 1024;
const FIELD_CAPS: Record<string, number> = {
  transcript: 12000,
  allClues: 12000,
  memory: 4000,
  name: 100,
  trait: 200,
  word: 100,
};
function payloadCapError(body: AgentRequest): string | null {
  const p = body.payload as unknown as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object") return "缺少 payload。";
  for (const [k, max] of Object.entries(FIELD_CAPS)) {
    const v = p[k];
    if (typeof v === "string" && v.length > max) return `字段 ${k} 超出长度上限。`;
  }
  if (Array.isArray(p.learnings)) {
    if (p.learnings.length > 20) return "learnings 数量超限。";
    for (const l of p.learnings) if (typeof l === "string" && l.length > 800) return "learnings 单条过长。";
  }
  if (typeof p.model === "string" && p.model.length > 120) return "model 名过长。";
  return null;
}

export async function POST(req: NextRequest) {
  // Per-IP rate limit first — cheapest rejection, before reading the body.
  const rl = rateLimit(`agent:${clientIp(req)}`, [
    { windowMs: 10_000, max: 30 },
    { windowMs: 60_000, max: 200 },
  ]);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "请求过于频繁，请稍后再试。" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "无法读取请求体。" }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "请求体过大。" }, { status: 413 });
  }

  let body: AgentRequest;
  try {
    body = JSON.parse(raw) as AgentRequest;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON。" }, { status: 400 });
  }
  if (!["describe", "vote", "suspect", "reflect", "spyGuess", "coach"].includes(body.kind)) {
    return NextResponse.json({ error: `未知的 kind: ${(body as { kind?: string }).kind}` }, { status: 400 });
  }
  const capErr = payloadCapError(body);
  if (capErr) {
    return NextResponse.json({ error: capErr }, { status: 400 });
  }

  const locale = localeOf(body);
  const sys = SYSTEM[locale];
  const spec = buildSchema(body, locale);
  const prompt =
    body.kind === "describe"
      ? buildDescribePrompt(body.payload)
      : body.kind === "vote"
        ? buildVotePrompt(body.payload)
        : body.kind === "suspect"
          ? buildSuspectPrompt(body.payload)
          : body.kind === "spyGuess"
            ? buildSpyGuessPrompt(body.payload)
            : body.kind === "coach"
              ? buildCoachPrompt(body.payload)
              : buildReflectPrompt(body.payload);

  // Identity bits for the backend log (who/what — pure observation).
  const agentName = (body.payload as { name?: string })?.name;
  const round = (body.payload as { round?: number })?.round;
  const gameId = typeof body.gameId === "string" ? body.gameId.slice(0, 64) : undefined;
  const startedAt = Date.now();
  let usedModel = "";

  try {
    let out: RunOutput;
    if (PROVIDER === "anthropic") {
      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
          { error: "服务端 provider=anthropic 但未配置 ANTHROPIC_API_KEY。" },
          { status: 500 },
        );
      }
      usedModel = body.model || ANTHROPIC_MODEL;
      out = await runAnthropic(spec, prompt, usedModel, sys);
    } else if (PROVIDER === "volcengine") {
      if (!ARK_KEY) {
        return NextResponse.json({ error: "服务端 provider=volcengine 但未配置 ARK_API_KEY。" }, { status: 500 });
      }
      if (!ARK_MODEL) {
        return NextResponse.json(
          { error: "未配置 ARK_MODEL（需填火山方舟“在线推理接入点” ep-... 或已开通的模型名）。" },
          { status: 500 },
        );
      }
      // Per-agent model overrides are Ollama tags (qwen2.5:*) — ignore them here
      // and use the single configured Ark model/endpoint.
      usedModel = ARK_MODEL;
      out = await runVolcengine(spec, prompt, ARK_MODEL, sys, locale);
    } else if (PROVIDER === "minimax") {
      if (!MINIMAX_KEY) {
        return NextResponse.json({ error: "服务端 provider=minimax 但未配置 MINIMAX_API_KEY。" }, { status: 500 });
      }
      // Per-agent model overrides are Ollama tags — ignore them; use the configured
      // MiniMax model (e.g. MiniMax-M2).
      usedModel = MINIMAX_MODEL;
      out = await runMinimax(spec, prompt, MINIMAX_MODEL, sys, locale);
    } else {
      usedModel = body.model || OLLAMA_MODEL;
      out = await runOllama(spec, prompt, usedModel, sys);
    }

    await logEvent({
      type: "agent_call",
      ok: true,
      kind: body.kind,
      agent: agentName,
      round,
      gameId,
      provider: PROVIDER,
      model: usedModel,
      ms: Date.now() - startedAt,
      inputTokens: out.usage?.inputTokens,
      outputTokens: out.usage?.outputTokens,
    });
    return NextResponse.json({ result: out.result, provider: PROVIDER });
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status ?? 500 : 500;
    const detail = err instanceof Error ? err.message : String(err);

    await logEvent({
      type: "agent_call",
      ok: false,
      kind: body.kind,
      agent: agentName,
      round,
      gameId,
      provider: PROVIDER,
      model: usedModel,
      ms: Date.now() - startedAt,
      error: detail.slice(0, 300),
    });

    let hint = "";
    if (PROVIDER === "ollama" && /fetch failed|ECONNREFUSED|connect/i.test(detail)) {
      hint = `（无法连接本地 Ollama @ ${OLLAMA_HOST}，请确认 Ollama 已启动且已 pull 模型 ${OLLAMA_MODEL}）`;
    } else if (PROVIDER === "volcengine" && /NotFound|does not exist|access/i.test(detail)) {
      hint = "（火山方舟该 key 无法访问此模型：请在控制台创建“在线推理接入点”拿到 ep-... 填入 ARK_MODEL，或先在模型广场开通该模型）";
    } else if (PROVIDER === "minimax" && /401|403|unauthor|invalid|api[ _-]?key|token/i.test(detail)) {
      hint = "（MiniMax 鉴权失败：请确认 MINIMAX_API_KEY 正确，且 MINIMAX_MODEL（如 MiniMax-M2）已开通）";
    }
    return NextResponse.json({ error: `${PROVIDER} 调用失败: ${detail}${hint}` }, { status });
  }
}
