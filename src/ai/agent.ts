// Client-side wrapper around the /api/agent backend proxy. The browser never
// sees the Anthropic key — it only talks to our own route.
import type { CoachPayload, DescribePayload, ReflectPayload, SpyGuessPayload, SuspectPayload, VotePayload } from "@/game/prompts";
import { getGameId } from "@/lib/telemetry";

export interface DescribeResult {
  reasoning: string;
  clue: string;
  memoryUpdate?: string;
}
export interface VoteResult {
  reasoning: string;
  vote: string;
  voteReason: string;
  memoryUpdate?: string;
}
export interface SuspectResult {
  reasoning: string;
  suspicions: Array<{ name: string; score: number }>;
}
export interface ReflectResult {
  learnings: string[];
}
export interface SpyGuessResult {
  reasoning: string;
  guess: string;
}
export interface CoachResult {
  tip: string;
}

async function callAgent<T>(
  kind: "describe" | "vote" | "suspect" | "reflect" | "spyGuess" | "coach",
  payload: DescribePayload | VotePayload | SuspectPayload | ReflectPayload | SpyGuessPayload | CoachPayload,
  model?: string,
): Promise<T> {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // gameId ties this call's cost (tokens) back to a specific game for the
    // cost-per-game dashboard. It's just an opaque id, never used in game logic.
    body: JSON.stringify({ kind, payload, model, gameId: getGameId() }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data.result as T;
}

export function agentDescribe(payload: DescribePayload, model?: string): Promise<DescribeResult> {
  return callAgent<DescribeResult>("describe", payload, model);
}

export function agentVote(payload: VotePayload, model?: string): Promise<VoteResult> {
  return callAgent<VoteResult>("vote", payload, model);
}

export function agentSuspect(payload: SuspectPayload, model?: string): Promise<SuspectResult> {
  return callAgent<SuspectResult>("suspect", payload, model);
}

export function agentReflect(payload: ReflectPayload, model?: string): Promise<ReflectResult> {
  return callAgent<ReflectResult>("reflect", payload, model);
}

export function agentSpyGuess(payload: SpyGuessPayload, model?: string): Promise<SpyGuessResult> {
  return callAgent<SpyGuessResult>("spyGuess", payload, model);
}

export function agentCoach(payload: CoachPayload, model?: string): Promise<CoachResult> {
  return callAgent<CoachResult>("coach", payload, model);
}
