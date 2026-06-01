import React, { useState, useRef, useEffect } from "react";

/* ------------------------------------------------------------------ */
/*  AI 谁是卧底 — 多智能体社交博弈 Demo                                  */
/*  5 个性格各异的 AI 玩家。其中 1 人是卧底(拿到的词不同),               */
/*  但没有人知道自己是不是卧底。每轮一句话描述 → 互相投票淘汰。            */
/*  全程由 AI API 真实驱动,你可以围观并下注猜卧底。                   */
/* ------------------------------------------------------------------ */

const WORD_PAIRS = [
  { civ: "牛奶", spy: "豆浆" },
  { civ: "可乐", spy: "雪碧" },
  { civ: "风扇", spy: "空调" },
  { civ: "微信", spy: "QQ" },
  { civ: "警察", spy: "保安" },
  { civ: "火锅", spy: "麻辣烫" },
  { civ: "草莓", spy: "树莓" },
  { civ: "钢琴", spy: "电子琴" },
  { civ: "地铁", spy: "高铁" },
  { civ: "口红", spy: "唇膏" },
  { civ: "蜘蛛侠", spy: "蝙蝠侠" },
  { civ: "笔记本电脑", spy: "平板电脑" },
];

const PERSONAS = [
  { name: "老K", emoji: "🕵️", trait: "沉稳老练，说话简短克制，擅长抓逻辑漏洞" },
  { name: "丁丁", emoji: "🐤", trait: "话有点多、容易紧张，偶尔不小心说太细" },
  { name: "Mia", emoji: "🦊", trait: "心机深、谨慎，爱用模糊的词，喜欢误导别人" },
  { name: "阿成", emoji: "🐲", trait: "自信果断，投票很坚决，有时略显武断" },
  { name: "小七", emoji: "🌸", trait: "天真直接，想到啥说啥，反而让人猜不透" },
];

/* ----------------------------- API ------------------------------- */
async function callModel(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  const text = (data.content || [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");
  const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    // 尝试从文本中抠出第一个 {...}
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch (_) {}
    }
    return { _raw: clean };
  }
}

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* --------------------------- Component --------------------------- */
export default function App() {
  const [phase, setPhase] = useState("setup"); // setup | describing | voting | revealed | gameover
  const [players, setPlayers] = useState([]);
  const [round, setRound] = useState(1);
  const [pair, setPair] = useState(null);
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);
  const [guess, setGuess] = useState(null);
  const [winner, setWinner] = useState(null); // 'civ' | 'spy'
  const [order, setOrder] = useState([]);
  const [pickIdx, setPickIdx] = useState(-1); // -1 = 随机
  const feedRef = useRef(null);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [log, phase]);

  const addLog = (entry) => setLog((l) => [...l, entry]);

  /* --------------------------- 开局 --------------------------- */
  const startGame = async () => {
    const chosen = pickIdx >= 0 ? WORD_PAIRS[pickIdx] : WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
    const spyIndex = Math.floor(Math.random() * PERSONAS.length);
    const ps = PERSONAS.map((p, i) => ({
      id: i,
      name: p.name,
      emoji: p.emoji,
      trait: p.trait,
      word: i === spyIndex ? chosen.spy : chosen.civ,
      isSpy: i === spyIndex,
      alive: true,
      clues: [],
      vote: null,
      reason: null,
    }));
    setPair(chosen);
    setPlayers(ps);
    setRound(1);
    setLog([
      { type: "system", text: `本局开始 · 5 名玩家入座，其中潜伏着 1 名卧底。` },
      { type: "system", text: `平民与卧底各自拿到了一个相近但不同的词。连他们自己都还不知道谁是那个例外。` },
    ]);
    setGuess(null);
    setWinner(null);
    setOrder(shuffle(ps.map((p) => p.id)));
    setPhase("ready");
  };

  const aliveOf = (ps) => ps.filter((p) => p.alive);

  /* ----------------------- 描述环节 ----------------------- */
  const runDescribe = async () => {
    setBusy(true);
    setPhase("describing");
    addLog({ type: "phase", text: `第 ${round} 轮 · 描述环节` });

    const speakOrder = order.filter((id) => players.find((p) => p.id === id)?.alive);
    let working = players.map((p) => ({ ...p }));
    // 本局已公开的全部描述(包含往轮),随发言实时追加,避免 React 状态滞后
    const transcript = buildPublicClues(log).split("\n").filter(Boolean);

    for (const id of speakOrder) {
      const sp = working.find((p) => p.id === id);
      setSpeakingId(id);
      await sleep(350);

      const cluesText = transcript.join("\n");

      const prompt =
`你正在玩"谁是卧底"游戏。规则：5 名玩家，其中 1 人拿到的词和其他人不同(即卧底)，但没有人知道自己是不是卧底，也不知道谁是卧底。每轮每人用一句话描述自己拿到的词，不能直接说出这个词。描述太具体会暴露，太模糊会被怀疑。

你的身份设定：${sp.name}，性格：${sp.trait}。请用符合这个性格的语气说话。

你拿到的词是：【${sp.word}】

目前本局已经说过的描述(按顺序)：
${cluesText || "(还没有人描述，你较早发言)"}

请给出你这一轮的描述。要求：
1. 一句话，不超过 25 字，语气符合你的性格；
2. 绝对不能出现"${sp.word}"这几个字或它明显的谐音/拆字；
3. 如果你发现别人描述的东西好像和你的词不太一样，你可能就是卧底——这时要小心伪装，顺着大家的方向说，别露馅；
4. 不要和别人已经说过的描述重复。

只返回 JSON：{"clue":"你的描述"}。不要任何多余文字。`;

      let clue = "(……一时语塞)";
      try {
        const r = await callModel(prompt);
        clue = (r.clue || r._raw || clue).toString().trim();
      } catch (e) {
        clue = "(网络好像有点问题)";
      }

      sp.clues.push(clue);
      transcript.push(`【第${round}轮】${sp.name}：${clue}`);
      working = working.map((p) => (p.id === id ? sp : p));
      setPlayers(working.map((p) => ({ ...p })));
      addLog({ type: "clue", id, name: sp.name, emoji: sp.emoji, round, text: clue });
      await sleep(250);
    }

    setSpeakingId(null);
    setBusy(false);
    setPhase("described");
  };

  /* ----------------------- 投票环节 ----------------------- */
  const runVote = async () => {
    setBusy(true);
    setPhase("voting");
    addLog({ type: "phase", text: `第 ${round} 轮 · 投票环节` });

    let working = players.map((p) => ({ ...p, vote: null, reason: null }));
    const alive = aliveOf(working);
    const aliveNames = alive.map((p) => p.name).join("、");
    const allClues = buildPublicClues(log);
    const tally = {};

    for (const voter of alive) {
      setSpeakingId(voter.id);
      await sleep(300);
      const prompt =
`你正在玩"谁是卧底"。现在进入投票环节，要票出你认为"词和大多数人不同"的那个卧底。

你的身份：${voter.name}(${voter.trait})，你拿到的词是【${voter.word}】。

本局到目前为止所有人的描述：
${allClues}

仍在场、可被投票的玩家：${aliveNames}
你不能投自己(${voter.name})。

请综合所有描述判断谁最可能是卧底，投出一票。如果你怀疑自己可能才是卧底(别人描述的东西和你的词对不上)，就策略性地把票投给一个看起来可疑的平民来转移视线。

只返回 JSON：{"vote":"玩家名","reason":"一句话理由(不超过30字，符合你性格)"}。vote 必须是在场玩家名之一，且不是你自己。`;

      let voteName = null, reason = "凭直觉。";
      try {
        const r = await callModel(prompt);
        reason = (r.reason || "凭直觉。").toString().trim();
        const raw = (r.vote || "").toString().trim();
        const target = alive.find((p) => p.id !== voter.id && (raw.includes(p.name) || p.name.includes(raw)));
        voteName = target ? target.name : null;
      } catch (e) {}
      if (!voteName) {
        const others = alive.filter((p) => p.id !== voter.id);
        voteName = others[Math.floor(Math.random() * others.length)].name;
      }
      tally[voteName] = (tally[voteName] || 0) + 1;
      working = working.map((p) => (p.id === voter.id ? { ...p, vote: voteName, reason } : p));
      setPlayers(working.map((p) => ({ ...p })));
      addLog({ type: "vote", id: voter.id, name: voter.name, emoji: voter.emoji, target: voteName, reason });
      await sleep(250);
    }

    setSpeakingId(null);

    // 统计票数，最高者出局(平票随机)
    let max = -1;
    Object.values(tally).forEach((v) => { if (v > max) max = v; });
    const topNames = Object.keys(tally).filter((n) => tally[n] === max);
    const tie = topNames.length > 1;
    const outName = topNames[Math.floor(Math.random() * topNames.length)];
    const out = working.find((p) => p.name === outName);

    const tallyText = Object.entries(tally).map(([n, v]) => `${n} ${v}票`).join("，");
    addLog({ type: "tally", text: `计票结果：${tallyText}。` + (tie ? `出现平票，随机抽出 ${outName}。` : "") });

    await sleep(500);
    out.alive = false;
    working = working.map((p) => (p.id === out.id ? out : p));
    setPlayers(working.map((p) => ({ ...p })));
    addLog({
      type: "eliminate",
      name: out.name,
      emoji: out.emoji,
      isSpy: out.isSpy,
      word: out.word,
      text: out.isSpy
        ? `${out.name} 被票出——他正是卧底！他的词是「${out.word}」。`
        : `${out.name} 被票出，但他是平民，词是「${out.word}」。卧底还在场……`,
    });

    // 胜负判定
    const aliveNow = aliveOf(working);
    const spyAlive = aliveNow.some((p) => p.isSpy);
    setBusy(false);
    if (!spyAlive) {
      setWinner("civ");
      setPhase("gameover");
      addLog({ type: "result", text: "🎉 平民阵营胜利！卧底已被揪出。" });
    } else if (aliveNow.length <= 2) {
      setWinner("spy");
      setPhase("gameover");
      addLog({ type: "result", text: "🩸 卧底潜伏到了最后，卧底阵营胜利！" });
    } else {
      setPhase("revealed");
    }
  };

  const nextRound = () => {
    setRound((r) => r + 1);
    setOrder(shuffle(aliveOf(players).map((p) => p.id)));
    setPhase("ready");
    addLog({ type: "system", text: `进入第 ${round + 1} 轮，场上还剩 ${aliveOf(players).length} 人。` });
  };

  /* --------------------------- 渲染 --------------------------- */
  const spyName = players.find((p) => p.isSpy)?.name;
  const guessCorrect = winner && guess != null && players.find((p) => p.id === guess)?.isSpy;

  return (
    <div style={S.root}>
      <style>{CSS}</style>
      <div style={S.grain} />

      <header style={S.header}>
        <div>
          <div style={S.kicker}>MULTI-AGENT · 社交博弈</div>
          <h1 style={S.title}>谁是卧底 <span style={{ color: "var(--amber)" }}>· AI 局</span></h1>
        </div>
        <p style={S.sub}>5 个 AI 各执一词，1 个是卧底，连它们自己都还蒙在鼓里。看它们如何描述、试探、互相指认。</p>
      </header>

      {phase === "setup" ? (
        <Setup pickIdx={pickIdx} setPickIdx={setPickIdx} onStart={startGame} />
      ) : (
        <div style={S.board} className="board">
          {/* 玩家席 */}
          <section style={S.seats}>
            {players.map((p) => (
              <PlayerCard key={p.id} p={p} speaking={speakingId === p.id} revealAll={phase === "gameover"} />
            ))}
          </section>

          {/* 直播间 */}
          <section style={S.feedWrap}>
            <div style={S.feedHead}>
              <span style={S.feedTitle}>现场直播</span>
              <span style={S.phaseTag}>{phaseLabel(phase, round)}</span>
            </div>
            <div style={S.feed} ref={feedRef}>
              {log.map((e, i) => <LogItem key={i} e={e} />)}
              {busy && <div style={S.thinking}><span className="dot" />AI 思考中…</div>}
            </div>

            {/* 控制台 */}
            <div style={S.controls}>
              <Controls
                phase={phase} busy={busy}
                onDescribe={runDescribe} onVote={runVote} onNext={nextRound}
                onRestart={() => setPhase("setup")}
              />
            </div>
          </section>

          {/* 你的推理 */}
          <section style={S.guessWrap}>
            <div style={S.guessHead}>你的推理</div>
            <p style={S.guessHint}>
              {winner ? "本局已结束，看看你押对了没：" : "你觉得谁是卧底？点一个名字下注。"}
            </p>
            <div style={S.guessChips}>
              {players.map((p) => {
                const sel = guess === p.id;
                const revealSpy = winner && p.isSpy;
                return (
                  <button
                    key={p.id}
                    onClick={() => !winner && setGuess(p.id)}
                    style={{
                      ...S.chip,
                      ...(sel ? S.chipSel : {}),
                      ...(revealSpy ? S.chipSpy : {}),
                      opacity: p.alive || winner ? 1 : 0.4,
                    }}
                  >
                    {p.emoji} {p.name}{revealSpy ? " · 卧底" : ""}
                  </button>
                );
              })}
            </div>
            {winner && guess != null && (
              <div style={{ ...S.verdict, color: guessCorrect ? "var(--green)" : "var(--red)" }}>
                {guessCorrect ? "🎯 你押对了！卧底就是 " + spyName : "❌ 没猜中，卧底其实是 " + spyName}
              </div>
            )}
            {pair && (
              <div style={S.wordsBox}>
                <div style={S.wordsTitle}>本局词对{winner ? "" : "(剧透，慎看)"}</div>
                <div style={S.wordsRow}>
                  <span style={S.wordCiv}>平民：{pair.civ}</span>
                  <span style={S.wordSpy}>卧底：{pair.spy}</span>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <footer style={S.footer}>每个 AI 的发言与投票都由 AI 实时生成 · 同样的词，每局走向都不同</footer>
    </div>
  );
}

/* --------------------------- 子组件 --------------------------- */
function Setup({ pickIdx, setPickIdx, onStart }) {
  return (
    <div style={S.setup}>
      <h2 style={S.setupTitle}>开一局</h2>
      <p style={S.setupP}>选一组词，或者交给运气。然后看 5 个 AI 在牌桌上互相试探。</p>
      <div style={S.pairGrid}>
        <button
          onClick={() => setPickIdx(-1)}
          style={{ ...S.pairBtn, ...(pickIdx === -1 ? S.pairBtnSel : {}) }}
        >🎲 随机一组</button>
        {WORD_PAIRS.map((w, i) => (
          <button
            key={i}
            onClick={() => setPickIdx(i)}
            style={{ ...S.pairBtn, ...(pickIdx === i ? S.pairBtnSel : {}) }}
          >{w.civ} / {w.spy}</button>
        ))}
      </div>
      <button onClick={onStart} style={S.startBtn}>入座开局 →</button>
    </div>
  );
}

function PlayerCard({ p, speaking, revealAll }) {
  const dead = !p.alive;
  const lastClue = p.clues[p.clues.length - 1];
  return (
    <div style={{
      ...S.card,
      ...(speaking ? S.cardSpeak : {}),
      ...(dead ? S.cardDead : {}),
      ...(revealAll && p.isSpy ? S.cardSpyReveal : {}),
    }}>
      <div style={S.cardTop}>
        <span style={S.avatar}>{p.emoji}</span>
        <div>
          <div style={S.cardName}>
            {p.name}
            {(revealAll && p.isSpy) && <span style={S.spyBadge}>卧底</span>}
            {dead && <span style={S.deadBadge}>出局</span>}
          </div>
          <div style={S.cardTrait}>{p.trait}</div>
        </div>
      </div>
      {(revealAll || dead) && (
        <div style={{ ...S.cardWord, color: p.isSpy ? "var(--red)" : "var(--amber)" }}>
          词：{p.word}
        </div>
      )}
      {lastClue && <div style={S.cardClue}>“{lastClue}”</div>}
      {speaking && <div style={S.speakTag}>● 发言中</div>}
      {p.vote && !dead && <div style={S.voteTag}>投给 → {p.vote}</div>}
    </div>
  );
}

function LogItem({ e }) {
  if (e.type === "system") return <div style={S.logSystem}>{e.text}</div>;
  if (e.type === "phase") return <div style={S.logPhase}>{e.text}</div>;
  if (e.type === "clue")
    return (
      <div style={S.logClue}>
        <span style={S.logAvatar}>{e.emoji}</span>
        <div>
          <div style={S.logName}>{e.name}</div>
          <div style={S.bubble}>{e.text}</div>
        </div>
      </div>
    );
  if (e.type === "vote")
    return (
      <div style={S.logVote}>
        <span style={S.logAvatar}>{e.emoji}</span>
        <span><b style={{ color: "var(--ink)" }}>{e.name}</b> 投给 <b style={{ color: "var(--amber)" }}>{e.target}</b>：<span style={{ color: "var(--muted)" }}>{e.reason}</span></span>
      </div>
    );
  if (e.type === "tally") return <div style={S.logTally}>{e.text}</div>;
  if (e.type === "eliminate")
    return <div style={{ ...S.logElim, borderColor: e.isSpy ? "var(--red)" : "var(--line)" }}>
      <b>{e.emoji} {e.text}</b>
    </div>;
  if (e.type === "result") return <div style={S.logResult}>{e.text}</div>;
  return null;
}

function Controls({ phase, busy, onDescribe, onVote, onNext, onRestart }) {
  if (phase === "ready") return <button style={S.actBtn} disabled={busy} onClick={onDescribe}>▶ 开始本轮描述</button>;
  if (phase === "describing") return <button style={S.actBtnDim} disabled>描述进行中…</button>;
  if (phase === "described") return <button style={S.actBtn} disabled={busy} onClick={onVote}>🗳 进入投票</button>;
  if (phase === "voting") return <button style={S.actBtnDim} disabled>投票进行中…</button>;
  if (phase === "revealed") return <button style={S.actBtn} disabled={busy} onClick={onNext}>↻ 进入下一轮</button>;
  if (phase === "gameover")
    return <button style={S.actBtn} onClick={onRestart}>🔄 再来一局</button>;
  return null;
}

/* --------------------------- 工具 --------------------------- */
function buildPublicClues(log) {
  const lines = [];
  let curRound = null;
  log.forEach((e) => {
    if (e.type === "phase") curRound = e.text;
    if (e.type === "clue") lines.push(`【第${e.round}轮】${e.name}：${e.text}`);
  });
  return lines.join("\n");
}
function phaseLabel(phase, round) {
  const map = {
    ready: `第 ${round} 轮 · 待开始`,
    describing: `第 ${round} 轮 · 描述中`,
    described: `第 ${round} 轮 · 待投票`,
    voting: `第 ${round} 轮 · 投票中`,
    revealed: `第 ${round} 轮 · 已揭晓`,
    gameover: "本局结束",
  };
  return map[phase] || "";
}

/* --------------------------- 样式 --------------------------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;700&display=swap');
:root{
  --bg:#0c0a0f; --panel:#16131c; --panel2:#1d1925; --ink:#ece6dd; --muted:#8b8295;
  --amber:#e8a13a; --amber-dim:#9a6f2c; --red:#df4b42; --green:#5fb05a; --line:rgba(255,255,255,.08);
}
*{box-sizing:border-box}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--amber);margin-right:8px;animation:pulse 1s infinite}
@media (max-width: 820px){
  .board{grid-template-columns:1fr !important;}
}
`;

const mono = "'Oswald', sans-serif";
const body = "'Noto Sans SC', sans-serif";

const S = {
  root: { position: "relative", fontFamily: body, color: "var(--ink)", background: "var(--bg)", borderRadius: 16, padding: "26px 22px 14px", overflow: "hidden", lineHeight: 1.5 },
  grain: { position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(120% 80% at 50% -10%, rgba(232,161,58,.10), transparent 55%), radial-gradient(80% 60% at 100% 110%, rgba(223,75,66,.08), transparent 60%)", zIndex: 0 },
  header: { position: "relative", zIndex: 1, marginBottom: 18 },
  kicker: { fontFamily: mono, letterSpacing: 3, fontSize: 11, color: "var(--amber)", textTransform: "uppercase" },
  title: { fontFamily: mono, fontWeight: 600, fontSize: 38, margin: "2px 0 0", letterSpacing: 1 },
  sub: { color: "var(--muted)", fontSize: 13.5, maxWidth: 620, marginTop: 6 },

  setup: { position: "relative", zIndex: 1, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, padding: 24 },
  setupTitle: { fontFamily: mono, fontSize: 22, margin: 0, letterSpacing: 1 },
  setupP: { color: "var(--muted)", fontSize: 13.5, margin: "6px 0 16px" },
  pairGrid: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  pairBtn: { fontFamily: body, fontSize: 13, color: "var(--ink)", background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 999, padding: "8px 14px", cursor: "pointer" },
  pairBtnSel: { borderColor: "var(--amber)", color: "var(--amber)", background: "rgba(232,161,58,.10)" },
  startBtn: { fontFamily: mono, letterSpacing: 1, fontSize: 16, color: "#1a1208", background: "var(--amber)", border: "none", borderRadius: 10, padding: "12px 22px", cursor: "pointer", fontWeight: 600 },

  board: { position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1.4fr) minmax(0,.9fr)", gap: 14, alignItems: "start" },
  seats: { display: "flex", flexDirection: "column", gap: 10 },

  card: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: "11px 13px", transition: "all .25s", animation: "fadeUp .3s" },
  cardSpeak: { borderColor: "var(--amber)", boxShadow: "0 0 0 1px var(--amber), 0 6px 22px rgba(232,161,58,.18)" },
  cardDead: { opacity: 0.5, filter: "grayscale(.6)" },
  cardSpyReveal: { borderColor: "var(--red)", boxShadow: "0 0 0 1px var(--red)" },
  cardTop: { display: "flex", gap: 10, alignItems: "center" },
  avatar: { fontSize: 26, lineHeight: 1 },
  cardName: { fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 6 },
  cardTrait: { fontSize: 11, color: "var(--muted)", marginTop: 1 },
  cardWord: { fontSize: 12, fontWeight: 700, marginTop: 7, fontFamily: mono, letterSpacing: .5 },
  cardClue: { fontSize: 12.5, color: "var(--ink)", marginTop: 7, fontStyle: "italic", opacity: .9 },
  speakTag: { fontFamily: mono, fontSize: 11, color: "var(--amber)", marginTop: 6, animation: "pulse 1s infinite" },
  voteTag: { fontFamily: mono, fontSize: 11, color: "var(--muted)", marginTop: 6 },
  spyBadge: { fontSize: 10, background: "var(--red)", color: "#fff", borderRadius: 5, padding: "1px 6px", fontWeight: 700 },
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
  logVote: { display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "var(--muted)", animation: "fadeUp .3s" },
  logTally: { fontFamily: mono, fontSize: 12.5, color: "var(--ink)", background: "var(--panel2)", borderRadius: 8, padding: "7px 10px", animation: "fadeUp .3s" },
  logElim: { fontSize: 13, padding: "9px 11px", border: "1px solid var(--line)", borderLeftWidth: 3, borderRadius: 8, background: "rgba(0,0,0,.2)", animation: "fadeUp .3s" },
  logResult: { fontFamily: mono, fontSize: 16, letterSpacing: 1, textAlign: "center", padding: "12px", color: "var(--amber)", animation: "fadeUp .3s" },

  controls: { padding: "12px 14px", borderTop: "1px solid var(--line)" },
  actBtn: { width: "100%", fontFamily: mono, letterSpacing: 1, fontSize: 15, color: "#1a1208", background: "var(--amber)", border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontWeight: 600 },
  actBtnDim: { width: "100%", fontFamily: mono, letterSpacing: 1, fontSize: 15, color: "var(--muted)", background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px", cursor: "not-allowed" },

  guessWrap: { background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 14 },
  guessHead: { fontFamily: mono, letterSpacing: 1.5, fontSize: 13, textTransform: "uppercase", marginBottom: 6 },
  guessHint: { fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" },
  guessChips: { display: "flex", flexDirection: "column", gap: 7 },
  chip: { fontFamily: body, textAlign: "left", fontSize: 13.5, color: "var(--ink)", background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 9, padding: "9px 12px", cursor: "pointer", transition: "all .2s" },
  chipSel: { borderColor: "var(--amber)", color: "var(--amber)", background: "rgba(232,161,58,.10)" },
  chipSpy: { borderColor: "var(--red)", color: "var(--red)", background: "rgba(223,75,66,.10)" },
  verdict: { fontFamily: mono, fontSize: 14, letterSpacing: .5, marginTop: 12, textAlign: "center" },
  wordsBox: { marginTop: 16, paddingTop: 12, borderTop: "1px dashed var(--line)" },
  wordsTitle: { fontSize: 11, color: "var(--muted)", marginBottom: 6 },
  wordsRow: { display: "flex", gap: 14, fontFamily: mono, fontSize: 13 },
  wordCiv: { color: "var(--amber)" },
  wordSpy: { color: "var(--red)" },

  footer: { position: "relative", zIndex: 1, textAlign: "center", color: "var(--muted)", fontSize: 11.5, marginTop: 16, paddingTop: 10, borderTop: "1px solid var(--line)" },
};
