/* Deterministic check of the elimination messages with the SAME ICU engine
 * next-intl uses (intl-messageformat). Proves:
 *  - the OLD en pattern '{word}' (single-quoted) renders a LITERAL {word} — the bug;
 *  - the NEW messages interpolate {name} and never reveal the word.
 * Run: npx tsx scripts/check-elim-msg.ts   (no server / LLM needed) */
import IntlMessageFormat from "intl-messageformat";
import en from "../messages/en.json";
import zh from "../messages/zh.json";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}`); }
}
const fmt = (msg: string, values: Record<string, string>, locale: string) =>
  String(new IntlMessageFormat(msg, locale).format(values));

// 1) Reproduce the OLD bug: single-quoted placeholder is ICU-escaped → literal.
const OLD = "{name} is voted out, but was a civilian (word: '{word}').";
const oldOut = fmt(OLD, { name: "Mia", word: "Watermelon" }, "en");
ok("OLD '{word}' renders literal (the reported bug)", oldOut.includes("{word}") && !oldOut.includes("Watermelon"));

// 2) NEW messages: {name} interpolates, no literal {word}, word never shown.
for (const [loc, m] of [["en", en], ["zh", zh]] as const) {
  const gl = (m as { GameLog: Record<string, string> }).GameLog;
  for (const key of ["elimSpy", "elimCiv", "elimBlank"] as const) {
    const out = fmt(gl[key], { name: "Mia" }, loc);
    ok(`${loc}.${key}: name interpolated`, out.includes("Mia"));
    ok(`${loc}.${key}: no literal {word}`, !out.includes("{word}"));
    ok(`${loc}.${key}: word not revealed`, !/Watermelon|西瓜/.test(out));
  }
}

console.log(`\n=== check-elim-msg: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
