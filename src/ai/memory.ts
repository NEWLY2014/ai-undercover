// Per-agent memory for the current session, persisted in sessionStorage and
// keyed by the agent's STABLE agentId. The contents are LESSONS THE AGENT WROTE
// ABOUT ITSELF (via the reflect call) — this module only stores and recalls them.
// It never interprets a learning's meaning or changes any agent behavior based on
// it (iron law: memory is information given back to the agent, not a decision made
// for it). sessionStorage scopes memory to the tab session: it survives "再来一局"
// and page reloads, but clears when the tab/browser is closed.

const PREFIX = "undercover:mem:";
const MAX_STORED = 40; // cap per agent to keep sessionStorage small

interface AgentMemoryFile {
  agentId: string;
  learnings: string[]; // newest last
}

function read(agentId: string): AgentMemoryFile {
  if (typeof window === "undefined") return { agentId, learnings: [] };
  try {
    const raw = window.sessionStorage.getItem(PREFIX + agentId);
    if (!raw) return { agentId, learnings: [] };
    const parsed = JSON.parse(raw) as AgentMemoryFile;
    if (!Array.isArray(parsed.learnings)) return { agentId, learnings: [] };
    return { agentId, learnings: parsed.learnings };
  } catch {
    return { agentId, learnings: [] };
  }
}

function write(file: AgentMemoryFile): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PREFIX + file.agentId, JSON.stringify(file));
  } catch {
    /* sessionStorage full / disabled — non-fatal */
  }
}

// Recall the most recent N lessons for this agent (to inject into its prompt).
export function recall(agentId: string, limit = 8): string[] {
  const { learnings } = read(agentId);
  return learnings.slice(Math.max(0, learnings.length - limit));
}

// Append agent-authored lessons after a game.
export function append(agentId: string, newLearnings: string[]): void {
  const trimmed = newLearnings.map((s) => s.trim()).filter(Boolean);
  if (trimmed.length === 0) return;
  const file = read(agentId);
  file.learnings = [...file.learnings, ...trimmed].slice(-MAX_STORED);
  write(file);
}

export function countLearnings(agentId: string): number {
  return read(agentId).learnings.length;
}

export function clearAgent(agentId: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PREFIX + agentId);
}
