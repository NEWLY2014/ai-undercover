/* Pure-function assertions for the word-leak guard + transcript dead-marking.
 * Run: npx tsx scripts/check-guards.ts   (no server / LLM needed) */
import { buildPlayers, clueLeaksWord, publicTranscript } from "../src/game/engine";
import type { AgentProfile } from "../src/game/types";

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  if (got === want) pass++;
  else { fail++; console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
}

// ── clueLeaksWord ──
eq("en: mouse's better half", clueLeaksWord("a certain mouse's better half", "Mouse", "en"), true);
eq("en: all this mouse talk", clueLeaksWord("all this mouse talk", "Mouse", "en"), true);
eq("en: Ice cream -> cream", clueLeaksWord("topped with fresh cream", "Ice cream", "en"), true);
eq("en: Spider-Man -> spider", clueLeaksWord("your friendly neighbourhood spider", "Spider-Man", "en"), true);
eq("en: Cat NOT in category", clueLeaksWord("filed under that category", "Cat", "en"), false);
eq("en: Cat whole word", clueLeaksWord("a sneaky little cat", "Cat", "en"), true);
eq("en: Iron Man — 'man' FP avoided", clueLeaksWord("the old man waved", "Iron Man", "en"), false);
eq("en: Iron Man -> iron", clueLeaksWord("forged from solid iron", "Iron Man", "en"), true);
eq("en: blank (no word)", clueLeaksWord("anything at all", "", "en"), false);
eq("en: clean clue", clueLeaksWord("the squeaky thing behind the wall", "Mouse", "en"), false);
eq("zh: full word", clueLeaksWord("夏天买个西瓜消暑", "西瓜", "zh"), true);
eq("zh: no false positive (西安)", clueLeaksWord("我去西安出差了", "西瓜", "zh"), false);
eq("zh: blank", clueLeaksWord("随便说点啥", "", "zh"), false);

// ── publicTranscript dead-marking ──
const profiles: Array<AgentProfile & { kind: "ai" | "human" }> = [
  { agentId: "a", name: "Alice", emoji: "🦊", trait: "x", kind: "ai" },
  { agentId: "b", name: "Bob", emoji: "🐲", trait: "y", kind: "ai" },
];
const players = buildPlayers(profiles, { id: "p", civ: "Mouse", spy: "Trackpad" }, [1], -1);
players[0].clues = ["clue A1"];
players[1].clues = ["clue B1"];
players[1].alive = false; // Bob eliminated

const marked = publicTranscript(players, "en", true);
eq("dead name marked", marked.includes("Bob (out)"), true);
eq("alive name not marked", marked.includes("Alice (out)"), false);
eq("dead clue text intact", marked.includes("clue B1") && marked.includes("clue A1"), true);
eq("default (markEliminated=false) has no marker", publicTranscript(players, "en").includes("(out)"), false);
const markedZh = publicTranscript(players, "zh", true);
eq("zh dead marker", markedZh.includes("Bob（已出局）"), true);

console.log(`\n=== check-guards: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
