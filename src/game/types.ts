// Core game types for 谁是卧底 (Who is the Undercover).
// The engine (engine.ts) operates on these as pure data — no React, no AI calls.

export type Phase =
  | "setup"
  | "ready" // round set up, awaiting "start describing"
  | "describing" // agents/human giving clues this round
  | "described" // all clues in, awaiting vote
  | "voting" // votes being cast
  | "revealed" // someone eliminated, round not final
  | "gameover";

export type Role = "civilian" | "spy" | "blank";

export interface WordPair {
  id: string;
  civ: string;
  spy: string;
  theme?: string;
  difficulty?: number; // 1 (easy/far apart) .. 3 (hard/close)
}

// "初始素质" — a character sheet (0–10). IRON LAW: these are ONLY rendered into
// the agent's own prompt as self-description (giving it info about who it is).
// Code never reads these numbers to bias/override the agent's decisions.
export interface AgentAttributes {
  reasoning: number; // 推理力
  caution: number; // 谨慎度
  disguise: number; // 伪装力
  expressiveness: number; // 表达力
}

export const DEFAULT_ATTRIBUTES: AgentAttributes = {
  reasoning: 6,
  caution: 6,
  disguise: 6,
  expressiveness: 6,
};

// A configurable AI seat. agentId is the STABLE identity used for cross-game
// memory; id is the per-game seat index.
export interface AgentProfile {
  agentId: string; // stable across games (memory key)
  name: string;
  emoji: string;
  trait: string;
  thinkingStyle?: string; // key into THINKING_STYLES (game/thinkingStyles.ts)
  model?: string; // per-agent model override; defaults server-side
  attributes?: AgentAttributes; // 初始素质 — prompt context only
}

export type PlayerKind = "ai" | "human";

// Runtime player: profile + per-game state.
export interface Player {
  id: number; // seat index in the current game
  kind: PlayerKind;
  agentId: string;
  name: string;
  emoji: string;
  trait: string;
  thinkingStyle?: string;
  model?: string;

  attributes?: AgentAttributes;

  word: string;
  role: Role;
  isSpy: boolean;
  alive: boolean;

  clues: string[]; // this game's clues, in order
  vote: string | null; // who they voted for this round (name)
  reason: string | null; // their stated reason this round
  lastReasoning?: string | null; // private "inner OS" from this round (surfaced in dev mode)

  // Private per-game working memory — the agent's own running notes/beliefs.
  // It writes this via memoryUpdate each turn; it is fed back only to itself.
  workingMemory: string;
  // Long-term lessons recalled from past games (this agentId), injected at game start.
  recalledLearnings: string[];
}

export interface GameConfig {
  totalPlayers: number; // 3..10
  humanPlayers: 0 | 1; // Phase A: at most 1 human
  spyCount: number; // number of undercover spies
  blankEnabled: boolean; // include one 白板 (blank) who gets no word
  wordPairId: string | null; // null = random (within theme/difficulty filter)
  theme: string | null; // null = any
  difficulty: number | null; // null = any
  devMode: boolean; // developer mode: after every statement, all AI agents re-score suspicion
  tutorial?: boolean; // guided teaching game: rules intro + phase hints + AI reasoning shown
  // Advanced settings: per-AI-seat overrides (name/emoji/trait/thinkingStyle/model/attributes).
  // When absent, defaults from PERSONAS are used. Length should match AI seat count.
  aiSlots?: AgentProfile[];
  // theme / difficulty / blankEnabled arrive in later phases
}

// A snapshot of every AI agent's suspicion of every other in-play player, taken
// right after a given speaker finished. Scores are 0..100 and are AUTHORED BY
// THE AGENTS (LLM) — code only stores and renders them, never computes them.
export interface SuspicionSnapshot {
  round: number;
  afterSpeakerId: number;
  afterSpeakerName: string;
  raters: Array<{ id: number; name: string; emoji: string }>; // AI agents who scored
  targets: string[]; // names scored (alive players)
  scores: Record<string, Record<string, number>>; // raterId -> (targetName -> score)
  reasons: Record<string, string>; // raterId -> one-line reason
}

export type Winner = "civ" | "spy" | null;

export interface GameState {
  phase: Phase;
  round: number;
  players: Player[];
  pair: WordPair | null;
  order: number[]; // speaking order (player ids) this round
  winner: Winner;
}

// --- Feed / log entries (UI transcript) ---

export type LogEntry =
  | { type: "system"; text: string }
  | { type: "phase"; text: string; round: number }
  | { type: "clue"; id: number; name: string; emoji: string; round: number; text: string; reasoning?: string | null }
  | { type: "vote"; id: number; name: string; emoji: string; target: string; reason: string; reasoning?: string | null }
  | { type: "tally"; text: string }
  | { type: "eliminate"; name: string; emoji: string; isSpy: boolean; word: string; text: string }
  | { type: "result"; text: string };
