import type { CSSProperties } from "react";

const mono = "var(--font-mono)";
const body = "var(--font-body)";

// Ported verbatim (visually) from the original demo's `S` object so the look
// is preserved. CSS variables + keyframes live in globals.css.
export const S: Record<string, CSSProperties> = {
  root: { position: "relative", fontFamily: body, color: "var(--ink)", background: "var(--bg)", minHeight: "100vh", padding: "26px 22px 14px", overflow: "hidden", lineHeight: 1.5 },
  grain: { position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(120% 80% at 50% -10%, rgba(232,161,58,.10), transparent 55%), radial-gradient(80% 60% at 100% 110%, rgba(223,75,66,.08), transparent 60%)", zIndex: 0 },
  shell: { position: "relative", zIndex: 1, maxWidth: 1180, margin: "0 auto" },
  header: { marginBottom: 18 },
  kicker: { fontFamily: mono, letterSpacing: 3, fontSize: 11, color: "var(--amber)", textTransform: "uppercase" },
  title: { fontFamily: mono, fontWeight: 600, fontSize: 38, margin: "2px 0 0", letterSpacing: 1 },
  sub: { color: "var(--muted)", fontSize: 13.5, maxWidth: 620, marginTop: 6 },

  setup: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: 24 },
  setupTitle: { fontFamily: mono, fontSize: 22, margin: 0, letterSpacing: 1 },
  setupP: { color: "var(--muted)", fontSize: 13.5, margin: "6px 0 16px" },
  fieldRow: { display: "flex", flexWrap: "wrap", gap: 18, marginBottom: 16 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  fieldLabel: { fontSize: 12, color: "var(--muted)", fontFamily: mono, letterSpacing: 0.5 },
  stepper: { display: "flex", alignItems: "center", gap: 10 },
  stepBtn: { width: 30, height: 30, borderRadius: 8, border: "1px solid var(--line)", background: "var(--panel2)", color: "var(--ink)", fontSize: 18, cursor: "pointer", lineHeight: 1 },
  stepVal: { minWidth: 28, textAlign: "center", fontFamily: mono, fontSize: 18 },
  toggle: { display: "flex", gap: 8 },
  toggleBtn: { fontFamily: body, fontSize: 13, color: "var(--ink)", background: "var(--panel2)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--line)", borderRadius: 999, padding: "7px 14px", cursor: "pointer" },
  toggleBtnSel: { borderColor: "var(--amber)", color: "var(--amber)", background: "rgba(232,161,58,.10)" },

  pairGrid: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  pairBtn: { fontFamily: body, fontSize: 13, color: "var(--ink)", background: "var(--panel2)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--line)", borderRadius: 999, padding: "8px 14px", cursor: "pointer" },
  pairBtnSel: { borderColor: "var(--amber)", color: "var(--amber)", background: "rgba(232,161,58,.10)" },
  startBtn: { fontFamily: mono, letterSpacing: 1, fontSize: 16, color: "#1a1208", background: "var(--amber)", border: "none", borderRadius: 10, padding: "12px 22px", cursor: "pointer", fontWeight: 600 },

  board: { display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1.4fr) minmax(0,.9fr)", gap: 14, alignItems: "start" },
  seats: { display: "flex", flexDirection: "column", gap: 10 },

  card: { background: "var(--panel)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--line)", borderRadius: 12, padding: "11px 13px", transition: "all .25s", animation: "fadeUp .3s" },
  cardSpeak: { borderColor: "var(--amber)", boxShadow: "0 0 0 1px var(--amber), 0 6px 22px rgba(232,161,58,.18)" },
  cardDead: { opacity: 0.5, filter: "grayscale(.6)" },
  cardSpyReveal: { borderColor: "var(--red)", boxShadow: "0 0 0 1px var(--red)" },
  cardHuman: { borderColor: "var(--green)" },
  cardTop: { display: "flex", gap: 10, alignItems: "center" },
  orderBadge: { fontFamily: mono, fontSize: 11, fontWeight: 700, color: "var(--amber)", background: "rgba(232,161,58,.12)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--amber-dim)", borderRadius: 999, minWidth: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px", flexShrink: 0 },
  avatar: { fontSize: 26, lineHeight: 1 },
  cardName: { fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 6 },
  cardTrait: { fontSize: 11, color: "var(--muted)", marginTop: 1 },
  cardWord: { fontSize: 12, fontWeight: 700, marginTop: 7, fontFamily: mono, letterSpacing: 0.5 },
  cardClue: { fontSize: 12.5, color: "var(--ink)", marginTop: 7, fontStyle: "italic", opacity: 0.9 },
  speakTag: { fontFamily: mono, fontSize: 11, color: "var(--amber)", marginTop: 6, animation: "pulse 1s infinite" },
  voteTag: { fontFamily: mono, fontSize: 11, color: "var(--muted)", marginTop: 6 },
  spyBadge: { fontSize: 10, background: "var(--red)", color: "#fff", borderRadius: 5, padding: "1px 6px", fontWeight: 700 },
  humanBadge: { fontSize: 10, background: "var(--green)", color: "#06210a", borderRadius: 5, padding: "1px 6px", fontWeight: 700 },
  deadBadge: { fontSize: 10, background: "var(--panel2)", color: "var(--muted)", borderRadius: 5, padding: "1px 6px", border: "1px solid var(--line)" },

  feedWrap: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, display: "flex", flexDirection: "column", minHeight: 420 },
  feedHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--line)" },
  feedTitle: { fontFamily: mono, letterSpacing: 1.5, fontSize: 13, textTransform: "uppercase" },
  phaseTag: { fontFamily: mono, fontSize: 11, color: "var(--amber)", background: "rgba(232,161,58,.10)", border: "1px solid var(--amber-dim)", borderRadius: 999, padding: "3px 10px" },
  feed: { flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, maxHeight: 440 },
  thinking: { fontFamily: mono, fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", marginTop: 2 },

  logSystem: { fontSize: 12, color: "var(--muted)", fontStyle: "italic", animation: "fadeUp .3s" },
  logPhase: { fontFamily: mono, fontSize: 12, letterSpacing: 1, color: "var(--amber)", borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 2, textTransform: "uppercase", animation: "fadeUp .3s" },
  logClue: { display: "flex", gap: 9, animation: "fadeUp .3s" },
  logAvatar: { fontSize: 20, lineHeight: 1.2 },
  logName: { fontSize: 11.5, color: "var(--muted)", marginBottom: 2 },
  bubble: { background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: "2px 11px 11px 11px", padding: "7px 11px", fontSize: 13.5, maxWidth: 360 },
  reasoning: { fontSize: 11, color: "var(--muted)", marginTop: 4, fontStyle: "italic", opacity: 0.85, paddingLeft: 4, borderLeft: "2px solid var(--line)" },
  logVote: { display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "var(--muted)", animation: "fadeUp .3s" },
  logTally: { fontFamily: mono, fontSize: 12.5, color: "var(--ink)", background: "var(--panel2)", borderRadius: 8, padding: "7px 10px", animation: "fadeUp .3s" },
  logElim: { fontSize: 13, padding: "9px 11px", borderWidth: 1, borderStyle: "solid", borderColor: "var(--line)", borderLeftWidth: 3, borderRadius: 8, background: "rgba(0,0,0,.2)", animation: "fadeUp .3s" },
  logResult: { fontFamily: mono, fontSize: 16, letterSpacing: 1, textAlign: "center", padding: "12px", color: "var(--amber)", animation: "fadeUp .3s" },

  controls: { padding: "12px 14px", borderTop: "1px solid var(--line)" },
  actBtn: { width: "100%", fontFamily: mono, letterSpacing: 1, fontSize: 15, color: "#1a1208", background: "var(--amber)", border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontWeight: 600 },
  actBtnDim: { width: "100%", fontFamily: mono, letterSpacing: 1, fontSize: 15, color: "var(--muted)", background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px", cursor: "not-allowed" },
  errorBox: { fontSize: 12.5, color: "var(--red)", background: "rgba(223,75,66,.10)", border: "1px solid var(--red)", borderRadius: 8, padding: "8px 10px", margin: "0 14px 12px" },

  humanPanel: { background: "rgba(95,176,90,.08)", border: "1px solid var(--green)", borderRadius: 10, padding: "12px 14px", margin: "0 14px 12px" },
  humanLabel: { fontSize: 12.5, color: "var(--green)", marginBottom: 8, fontFamily: mono },
  input: { width: "100%", fontFamily: body, fontSize: 14, color: "var(--ink)", background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 11px", marginBottom: 8 },

  guessWrap: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14 },
  guessHead: { fontFamily: mono, letterSpacing: 1.5, fontSize: 13, textTransform: "uppercase", marginBottom: 6 },
  guessHint: { fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" },
  guessChips: { display: "flex", flexDirection: "column", gap: 7 },
  chip: { fontFamily: body, textAlign: "left", fontSize: 13.5, color: "var(--ink)", background: "var(--panel2)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--line)", borderRadius: 9, padding: "9px 12px", cursor: "pointer", transition: "all .2s" },
  chipSel: { borderColor: "var(--amber)", color: "var(--amber)", background: "rgba(232,161,58,.10)" },
  chipSpy: { borderColor: "var(--red)", color: "var(--red)", background: "rgba(223,75,66,.10)" },
  verdict: { fontFamily: mono, fontSize: 14, letterSpacing: 0.5, marginTop: 12, textAlign: "center" },
  wordsBox: { marginTop: 16, paddingTop: 12, borderTop: "1px dashed var(--line)" },
  wordsTitle: { fontSize: 11, color: "var(--muted)", marginBottom: 6 },
  wordsRow: { display: "flex", gap: 14, fontFamily: mono, fontSize: 13 },
  wordCiv: { color: "var(--amber)" },
  wordSpy: { color: "var(--red)" },

  footer: { textAlign: "center", color: "var(--muted)", fontSize: 11.5, marginTop: 16, paddingTop: 10, borderTop: "1px solid var(--line)" },
};
