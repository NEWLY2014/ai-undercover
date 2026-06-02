import type { AgentProfile, GameConfig, GameState, Player, Role, WordPair, Winner } from "./types";

// ──────────────────────────────────────────────────────────────────────────
// Pure game-rules engine. This is the deterministic REFEREE — it sets up the
// table, counts the votes that were actually cast, eliminates the top vote,
// and judges win/loss. It NEVER decides what an agent says or who an agent
// votes for — it only enforces the rules.
// ──────────────────────────────────────────────────────────────────────────

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// How many spies for a given player count — a game-rules suggestion (not agent
// logic). Default scales with size; user can override within [1, maxSpyCount].
export function suggestedSpyCount(totalPlayers: number): number {
  if (totalPlayers <= 5) return 1;
  if (totalPlayers <= 8) return 2;
  return 3;
}

// Spies must stay a minority or they'd win instantly (spies >= non-spies).
export function maxSpyCount(totalPlayers: number): number {
  return Math.max(1, Math.ceil(totalPlayers / 2) - 1);
}

// Pick which seat indices are spies. Setup randomness — allowed.
export function pickSpyIndices(totalPlayers: number, spyCount: number): number[] {
  const idxs = shuffle(Array.from({ length: totalPlayers }, (_, i) => i));
  return idxs.slice(0, Math.max(1, Math.min(spyCount, totalPlayers - 1))).sort((a, b) => a - b);
}

// Pick one non-spy seat to be the blank. Returns -1 if not applicable.
export function pickBlankIndex(totalPlayers: number, spyIndices: number[]): number {
  const spies = new Set(spyIndices);
  const candidates = Array.from({ length: totalPlayers }, (_, i) => i).filter((i) => !spies.has(i));
  if (candidates.length <= 1) return -1; // keep at least one real civilian
  return shuffle(candidates)[0];
}

export function buildPlayers(
  profiles: Array<AgentProfile & { kind: "ai" | "human" }>,
  pair: WordPair,
  spyIndices: number[],
  blankIndex = -1,
): Player[] {
  const spies = new Set(spyIndices);
  return profiles.map((p, i) => {
    const isSpy = spies.has(i);
    const isBlank = i === blankIndex && !isSpy;
    const role: Role = isSpy ? "spy" : isBlank ? "blank" : "civilian";
    return {
      id: i,
      kind: p.kind,
      agentId: p.agentId,
      name: p.name,
      emoji: p.emoji,
      trait: p.trait,
      thinkingStyle: p.thinkingStyle,
      model: p.model,
      attributes: p.attributes,
      word: isBlank ? "" : isSpy ? pair.spy : pair.civ,
      role,
      isSpy,
      alive: true,
      clues: [],
      vote: null,
      reason: null,
      lastReasoning: null,
      workingMemory: "",
      recalledLearnings: [],
    };
  });
}

export function aliveOf(players: Player[]): Player[] {
  return players.filter((p) => p.alive);
}

// Clue de-duplication helpers (structural checks on a clue's TEXT — they never
// decide content, only reject a repeat so the same agent/human is asked again).
export function normClue(s: string): string {
  return s.replace(/[\s。.,，、!！?？:：;；"'「」()（）]/g, "").toLowerCase();
}
export function isDuplicateClue(clue: string, priorClues: string[]): boolean {
  const n = normClue(clue);
  if (!n) return false;
  return priorClues.some((p) => normClue(p) === n);
}
export function isLazyClue(clue: string): boolean {
  const t = clue.trim();
  return /^同上|和(上面|前面|楼上|他|她|大家|你们).{0,4}一样|跟.{0,4}一样|一模一样|和.{0,5}说的一样|^\+1$|^附议|^同意$/.test(t);
}

export function speakingOrder(players: Player[]): number[] {
  return shuffle(aliveOf(players).map((p) => p.id));
}

export interface TallyResult {
  tally: Record<string, number>;
  max: number;
  topNames: string[];
  tie: boolean;
  // Names tied for elimination. Phase C runs a PK revote; Phase A coin-flips
  // among ties (a referee decision, not an agent decision).
}

// Count only the votes that were actually cast. Does NOT invent votes for
// players who failed to vote — that would be deciding for the agent.
export function tallyVotes(players: Player[]): TallyResult {
  const tally: Record<string, number> = {};
  for (const p of aliveOf(players)) {
    if (p.vote) tally[p.vote] = (tally[p.vote] || 0) + 1;
  }
  let max = -1;
  for (const v of Object.values(tally)) if (v > max) max = v;
  const topNames = Object.keys(tally).filter((n) => tally[n] === max);
  return { tally, max, topNames, tie: topNames.length > 1 };
}

export function tallyText(tally: Record<string, number>): string {
  return Object.entries(tally)
    .map(([n, v]) => `${n} ${v}票`)
    .join("，");
}

// Win check for the general multi-spy rule:
//   - all spies eliminated → civilians win
//   - surviving spies >= surviving civilians → spies win
//   - otherwise game continues
export function checkWinner(players: Player[]): Winner {
  const alive = aliveOf(players);
  const spies = alive.filter((p) => p.isSpy).length;
  const civs = alive.length - spies;
  if (spies === 0) return "civ";
  if (spies >= civs) return "spy";
  return null;
}

// Build the public transcript (clues only — never private reasoning) for prompts.
export function publicTranscript(players: Player[]): string {
  // Reconstructed from each player's clue list, round by round.
  const maxRounds = Math.max(0, ...players.map((p) => p.clues.length));
  const lines: string[] = [];
  for (let r = 0; r < maxRounds; r++) {
    for (const p of players) {
      if (p.clues[r] != null) lines.push(`【第${r + 1}轮】${p.name}：${p.clues[r]}`);
    }
  }
  return lines.join("\n");
}

export function createInitialState(config: GameConfig, players: Player[], pair: WordPair): GameState {
  return {
    phase: "ready",
    round: 1,
    players,
    pair,
    order: speakingOrder(players),
    winner: null,
  };
}
