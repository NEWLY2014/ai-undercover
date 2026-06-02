import Anthropic from "@anthropic-ai/sdk";
import { Ollama } from "ollama";
import { NextRequest, NextResponse } from "next/server";
import {
  buildDescribePrompt,
  buildReflectPrompt,
  buildSpyGuessPrompt,
  buildSuspectPrompt,
  buildVotePrompt,
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

type Provider = "ollama" | "anthropic" | "volcengine";
const PROVIDER: Provider = (process.env.UNDERCOVER_PROVIDER as Provider) || "ollama";
const OLLAMA_HOST = process.env.UNDERCOVER_OLLAMA_HOST || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.UNDERCOVER_OLLAMA_MODEL || "qwen2.5:3b";
const ANTHROPIC_MODEL = process.env.UNDERCOVER_DEFAULT_MODEL || "claude-sonnet-4-6";
// Volcengine Ark — OpenAI-compatible. ARK_MODEL is the inference
// endpoint id (ep-...) or an activated model name from the Ark console.
const ARK_KEY = process.env.ARK_API_KEY || "";
const ARK_BASE = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
const ARK_MODEL = process.env.ARK_MODEL || "";

const SYSTEM =
  "你是一个正在玩“谁是卧底”社交推理游戏的玩家智能体。只输出符合给定 JSON 结构的内容，不要输出结构之外的任何文字。";

type JsonSchema = Record<string, unknown>;

type AgentRequest =
  | { kind: "describe"; payload: DescribePayload; model?: string; gameId?: string }
  | { kind: "vote"; payload: VotePayload; model?: string; gameId?: string }
  | { kind: "suspect"; payload: SuspectPayload; model?: string; gameId?: string }
  | { kind: "reflect"; payload: ReflectPayload; model?: string; gameId?: string }
  | { kind: "spyGuess"; payload: SpyGuessPayload; model?: string; gameId?: string };

// One JSON schema per kind. tool_choice (Anthropic) / format (Ollama) force the
// model to return exactly this shape. The `vote`/`name` enums make "must be a
// real in-play opponent" a STRUCTURAL guarantee — schema validation, not
// deciding the content for the agent.
function buildSchema(body: AgentRequest): { name: string; description: string; schema: JsonSchema } {
  if (body.kind === "describe") {
    return {
      name: "submit_clue",
      description: "提交你这一轮对自己词语的一句话描述。",
      schema: {
        type: "object",
        properties: {
          reasoning: { type: "string", description: "你的简短内心思考。" },
          clue: { type: "string", description: "你这一轮的描述，一句话，不超过25字。" },
          memoryUpdate: { type: "string", description: "更新你的私人笔记(怀疑谁、依据、你是否可能是少数派)，几句话。" },
        },
        required: ["reasoning", "clue", "memoryUpdate"],
        additionalProperties: false,
      },
    };
  }
  if (body.kind === "vote") {
    const others = body.payload.aliveNames.filter((n) => n !== body.payload.name);
    return {
      name: "submit_vote",
      description: "投出你认为是卧底的那一票。",
      schema: {
        type: "object",
        properties: {
          reasoning: { type: "string", description: "你的简短推理。" },
          vote: { type: "string", enum: others, description: "你要投的在场玩家名（不能是你自己）。" },
          voteReason: { type: "string", description: "一句话理由，不超过30字。" },
          memoryUpdate: { type: "string", description: "更新你的私人笔记，几句话。" },
        },
        required: ["reasoning", "vote", "voteReason", "memoryUpdate"],
        additionalProperties: false,
      },
    };
  }
  if (body.kind === "spyGuess") {
    return {
      name: "submit_guess",
      description: "猜出平民拿到的词(反杀)。",
      schema: {
        type: "object",
        properties: {
          reasoning: { type: "string", description: "你的简短推理。" },
          guess: { type: "string", description: "你猜的平民词，只写这一个词。" },
        },
        required: ["reasoning", "guess"],
        additionalProperties: false,
      },
    };
  }
  if (body.kind === "reflect") {
    return {
      name: "submit_reflection",
      description: "复盘本局，给出可复用的经验教训。",
      schema: {
        type: "object",
        properties: {
          learnings: {
            type: "array",
            description: "1-3 条具体、可复用的经验，每条一句话。",
            items: { type: "string" },
          },
        },
        required: ["learnings"],
        additionalProperties: false,
      },
    };
  }
  // suspect
  const others = body.payload.aliveNames.filter((n) => n !== body.payload.name);
  return {
    name: "submit_suspicion",
    description: "给出你此刻对每个在场对手是卧底的怀疑分。",
    schema: {
      type: "object",
      properties: {
        reasoning: { type: "string", description: "一句话整体看法。" },
        suspicions: {
          type: "array",
          description: "对每个对手的怀疑分。",
          items: {
            type: "object",
            properties: {
              name: { type: "string", enum: others },
              score: { type: "integer", description: "0-100 的怀疑分。" },
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
): Promise<RunOutput> {
  const client = new Anthropic();
  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM,
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

async function runOllama(spec: { schema: JsonSchema }, prompt: string, model: string): Promise<RunOutput> {
  const client = new Ollama({ host: OLLAMA_HOST });
  const res = await client.chat({
    model,
    stream: false,
    format: spec.schema as object,
    options: { temperature: 0.8 },
    messages: [
      { role: "system", content: SYSTEM },
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

// Derive a short "only output JSON with these keys" instruction from the schema.
function jsonShapeHint(schema: JsonSchema): string {
  const props = (schema as { properties?: Record<string, unknown> }).properties || {};
  const keys = Object.keys(props);
  return `你必须只输出一个 JSON 对象（不要任何额外文字、解释或 markdown 代码块），且只包含这些字段：${keys.join("、")}。`;
}

// Volcengine Ark via its OpenAI-compatible /chat/completions. Older doubao
// models may not support response_format, so we don't send it — instead we
// instruct the exact JSON shape and robustly extract the object from the reply.
// (vote validity is still enforced downstream by re-asking the agent.)
async function runVolcengine(spec: { schema: JsonSchema }, prompt: string, model: string): Promise<RunOutput> {
  const res = await fetch(`${ARK_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ARK_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: `${SYSTEM} ${jsonShapeHint(spec.schema)}` },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
      // doubao-seed is a reasoning model: chain-of-thought consumes tokens before
      // the JSON content. Give ample headroom so richer prompts never truncate the
      // content (which would yield an empty clue).
      max_tokens: 3072,
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
  const cleaned = txt.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return { result: JSON.parse(cleaned), usage };
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return { result: JSON.parse(m[0]), usage };
      } catch {
        /* fall through */
      }
    }
    throw new Error(`Ark 返回无法解析为 JSON：${cleaned.slice(0, 200)}`);
  }
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
  if (!["describe", "vote", "suspect", "reflect", "spyGuess"].includes(body.kind)) {
    return NextResponse.json({ error: `未知的 kind: ${(body as { kind?: string }).kind}` }, { status: 400 });
  }
  const capErr = payloadCapError(body);
  if (capErr) {
    return NextResponse.json({ error: capErr }, { status: 400 });
  }

  const spec = buildSchema(body);
  const prompt =
    body.kind === "describe"
      ? buildDescribePrompt(body.payload)
      : body.kind === "vote"
        ? buildVotePrompt(body.payload)
        : body.kind === "suspect"
          ? buildSuspectPrompt(body.payload)
          : body.kind === "spyGuess"
            ? buildSpyGuessPrompt(body.payload)
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
      out = await runAnthropic(spec, prompt, usedModel);
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
      out = await runVolcengine(spec, prompt, ARK_MODEL);
    } else {
      usedModel = body.model || OLLAMA_MODEL;
      out = await runOllama(spec, prompt, usedModel);
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
    }
    return NextResponse.json({ error: `${PROVIDER} 调用失败: ${detail}${hint}` }, { status });
  }
}
