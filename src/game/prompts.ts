// Prompt builders shared by the server route. Phase B injects each agent's
// thinking style, attribute sheet, private working memory, and lessons
// recalled from past games — all as CONTEXT the agent reasons over itself.
//
// Every block has a zh and an en variant, picked by payload.locale, so an
// English game's agents genuinely reason and clue in English (English wordplay,
// English-culture allusions) rather than reading translated Chinese.
import type { AgentAttributes } from "./types";
import { thinkingStyleScaffold } from "./thinkingStyles";

export type Locale = "zh" | "en";

export const GAME_RULES: Record<Locale, string> = {
  zh: `你正在玩“谁是卧底”游戏。规则：N 名玩家，其中少数人(卧底)拿到的词和大多数人(平民)不同，但没有人知道自己是不是卧底，也不知道谁是卧底。每轮每人用一句话描述自己拿到的词，不能直接说出这个词。描述太具体会暴露，太模糊会被怀疑。每轮结束后大家投票，票数最高者出局。平民目标是票出全部卧底；卧底目标是潜伏到最后。`,
  en: `You're playing "Who's the Undercover," a social word-deduction game. Rules: N players; a minority (the undercover) hold a word that differs from the majority (the civilians) — but nobody is told whether they are undercover, nor who the undercover are. Each round everyone gives a one-sentence clue about their own word, without ever saying the word itself. Too specific and you expose yourself; too vague and you draw suspicion. After each round everyone votes, and whoever gets the most votes is eliminated. Civilians win by voting out every undercover; the undercover win by surviving to the end.`,
};

// Fields every agent call may carry to shape the agent's identity & memory.
export interface AgentContext {
  locale?: Locale; // which language the whole game (and this prompt) is in
  thinkingStyle?: string; // key into THINKING_STYLES
  attributes?: AgentAttributes; // attribute sheet (prompt context only)
  learnings?: string[]; // recalled long-term lessons (agent-authored)
  memory?: string; // private working memory (agent-authored, this game)
  isBlank?: boolean; // this agent is the blank (got no word)
}

const L = (ctx: { locale?: Locale }): Locale => ctx.locale ?? "zh";

function attrText(a: AgentAttributes | undefined, locale: Locale): string {
  if (!a) return "";
  if (locale === "en") {
    return `Your self-rated attributes (out of 10): reasoning ${a.reasoning}, caution ${a.caution}, disguise ${a.disguise}, expressiveness ${a.expressiveness}. Let your clues and judgments match these traits.`;
  }
  return `你的素质自评(满分10)：推理力${a.reasoning}、谨慎度${a.caution}、伪装力${a.disguise}、表达力${a.expressiveness}。请让你的发言与判断风格符合这些素质。`;
}

// The persona/context block shared by describe / vote / suspect prompts.
function personaBlock(name: string, trait: string, ctx: AgentContext): string {
  const locale = L(ctx);
  const lines: string[] = [];
  const style = thinkingStyleScaffold(ctx.thinkingStyle, locale);
  if (locale === "en") {
    lines.push(`Your character: ${name}; personality: ${trait}. Speak in a voice that fits this personality.`);
    if (style) lines.push(`Your thinking style: ${style}`);
    const at = attrText(ctx.attributes, locale);
    if (at) lines.push(at);
    if (ctx.learnings && ctx.learnings.length) {
      lines.push(`Lessons you've banked from past games (for reference, don't copy blindly):\n${ctx.learnings.map((l) => `· ${l}`).join("\n")}`);
    }
    if (ctx.memory && ctx.memory.trim()) {
      lines.push(`Your current private notes/judgment:\n${ctx.memory.trim()}`);
    }
    return lines.join("\n");
  }
  lines.push(`你的身份设定：${name}，性格：${trait}。请用符合这个性格的语气说话。`);
  if (style) lines.push(`你的思维方式：${style}`);
  const at = attrText(ctx.attributes, locale);
  if (at) lines.push(at);
  if (ctx.learnings && ctx.learnings.length) {
    lines.push(`你从过往对局中积累的经验(仅供参考，不必照搬)：\n${ctx.learnings.map((l) => `· ${l}`).join("\n")}`);
  }
  if (ctx.memory && ctx.memory.trim()) {
    lines.push(`你目前的私人笔记/判断：\n${ctx.memory.trim()}`);
  }
  return lines.join("\n");
}

const MEMORY_INSTRUCTION: Record<Locale, string> = {
  zh: "最后，在 memoryUpdate 里更新你的私人笔记(你现在最怀疑谁、依据是什么、你的词可能是不是少数派)，简短几句，供你下一回合参考。",
  en: "Finally, in memoryUpdate, update your private notes (who you suspect most right now and why; whether your word might be the minority one) — just a few short sentences, for your own reference next round.",
};

// Make the agent sound like a real person at the table, not a riddle reader.
const HUMANLIKE: Record<Locale, string> = {
  zh: "说话要像真人在牌桌上聊天：口语、自然、简短，符合你的性格；可以顺着别人的话题接一句、表个态度或调侃一下(如“我跟老K想的差不多”“这玩意儿我可太熟了”)，但别暴露词。【绝不要把游戏的元策略说出口】：不要点评别人“说得太具体／太明显／太虚／容易被票”，不要提“挨刀／暴露／藏／安全／危险／出局”这类话，也不要宣布“我说得含糊点／我先不暴露”——这些只是你心里的盘算，写进 reasoning，绝不当成台词说出来。要调侃就冲着【话题本身】，而不是冲着别人描述得够不够隐蔽。别每句都是工整的谜面式描述。",
  en: "Talk like a real person chatting at the table: casual, natural, short, true to your personality. You can riff on the topic, take a stance, or tease a little (\"same as Jack, basically\", \"oh I know this one way too well\") — but don't give your word away. NEVER say the game's meta-strategy out loud: don't comment that someone is \"too specific / too obvious / too vague / about to get voted out\", don't mention \"getting knifed / exposed / hiding / safe / risky / eliminated\", and don't announce that you're \"keeping it vague / not exposing myself\" — that's your private calculation, it goes in reasoning ONLY, never in the line you actually say. Any teasing is about the TOPIC itself, not about how well-hidden someone's clue is. Don't make every line a prim, riddle-style definition.",
};

// Core global strategy: stop giving the word away in round one (which gets the
// undercover voted out immediately), and push clues from flat definitions toward
// clever, indirect hints.
const STRATEGY: Record<Locale, string> = {
  zh: "这个游戏拼的是脑洞与表达，乐趣全在于“猜”。高手的描述讲究【巧、绕、有梗】：用谐音、拆字、补全固定搭配、近义联想、用典/歌词/影视梗、双关、场景演绎、抓本质特征等手法【间接】指向自己的词——让“懂的人能品出来、卧底和白板却难以破译”。务必守三不要：①忌近描——别干巴巴下定义(如“一种水果/一种工具书/一种交通工具”)，那既无趣又最容易被跟描；②忌爆字——不出现词里的任何字及其明显谐音/偏旁；③忌跟描——别重复或换皮重复别人说过的，自己另起新角度。同时点到为止：太直白会让卧底一轮出局、一局就结束、毫无意思——宁可巧妙含蓄，也绝不报出能让人一眼锁定的细节。【最关键】再绕也必须【真的在描你这个词】：你的描述要是这个词成立的、可被验证的指向，懂的人一对照就会点头“对，说的就是它”。绝不能跑题成一句放之四海皆准的空话或自夸(如“我才是全场焦点”“我让人眼前一亮”)——那种和你的词毫无关系的话，等于自爆是卧底/白板。绕，是换个偏门角度说【这个词】，不是换个话题。",
  en: "This game is about wit and wordplay; the whole joy is in the guessing. A strong clue is clever, oblique, and layered: use homophones, hidden spellings, completing a set phrase, near-synonym leaps, allusions (a lyric / film line / idiom / famous name), puns, acting out a scene, or seizing the one essential trait — to point at your word INDIRECTLY, so \"those in the know catch it, while the undercover and the blank can't crack it.\" Keep three don'ts: (1) No flat definitions (\"a kind of fruit / a reference book / a means of transport\") — dull, and the easiest for others to copy; (2) No leaked letters — never use any letter-string of the word, nor an obvious homophone/root of it; (3) No echoing — don't repeat or reskin what someone else said; find your own fresh angle. And stop short: too blunt and the undercover is out in one round, the game ends, no fun — better clever-and-veiled than a detail that pins you instantly. MOST IMPORTANT: however oblique, your clue must still be GENUINELY ABOUT your word — a true, checkable pointer to it, so someone who knows the word nods \"yes, that's it.\" Never drift into a generic, fits-anything boast (\"I'm the one who steals the spotlight\", \"everyone's focused on the fruit but I show up uninvited\") — a line unrelated to your word outs you as the undercover/blank. Oblique means an off-beat angle ON your word, not a change of subject.",
};

// The ten describing techniques + callbacks + examples, injected into the
// describe prompt so the agent has real moves to play instead of flat
// definitions. The en set uses genuine English wordplay & English-culture refs.
const TECHNIQUES: Record<Locale, string> = {
  zh: `十大描法(按需混用，越多越巧)：
① 偷言换字——谐音/变音/外语/缩略语替换词里某部分，再顺势解释(如”WOW→哇哦好厉害”)
② 移形换位——把词里的字顺序颠倒后联想(如”迪奥”倒→”奥迪”→”倒车请注意”)
③ 续词填义——找与此词形成固定搭配的另一半，重点描那另一半(如”长袖”→搭”善舞”→描舞)
④ 触类通旁——举出同类/同形/同性质的其他事物代指(如”画饼充饥”→提”望梅止渴”)
⑤ 牵经引礼——用典故/歌词/影视梗/历史人物指代(如”世界杯”→”你为什么要玩泥巴，把脸弄那么脏”引《We Will Rock You》)
⑥ 以偏概全——只描词里的某一个字或某个局部，不管整体(如”杨梅”→只描”杨”→西安事变·张学良杨虎城)
⑦ 拆字填文——拆字说偏旁/结构(如”桂林山水”→很多木很多土→”大兴土木”)
⑧ 摹形拟象——描述它的外形/声音/动态画面(如”万箭齐发”→”全世界白老鼠瞬间变成刺猬”)
⑨ 说文解意——整体意境/全映射/名词解释式但藏在诗句或梗里(如”cosplay”→”其实你爱我像谁，扮演什么角色我都会”)
⑩ 敲骨沥髓——抓最本质的那一个特征发散(如”刻舟求剑”→”没有人能两次踏进同一条河流”)
还可【现挂】——接上一个人的话、拿别人头像/昵称玩梗、续上一局的梗，增加互动与迷惑性，让队友会心一笑。
范例：汉语字典→”此生无悔入华夏”；兵马俑→”敌不动，我不动”；星空→”银汉迢迢暗渡”；世界杯→”你为什么要玩泥巴，把脸弄那么脏”；红楼梦→”大锤80，小锤40”；护照→”新的风暴已经出现，怎么能够停滞不前”。`,
  en: `Ten ways to clue (mix as needed — the more layered, the cleverer):
① Sound-swap — replace part of the word with a homophone / near-sound / foreign word, then play off it (e.g. "flower" → riff on "flour" and baking)
② Anagram / reversal — reorder the letters and riff on the result (e.g. "STRESSED" backward is "DESSERTS")
③ Complete the pair — find the word's usual partner in a set phrase and describe THAT half (e.g. "butter" → its partner "…fly", describe the insect)
④ Same family — name a sibling of the same kind/shape/nature instead (e.g. "leopard" → hint via "the cat that can't change its spots")
⑤ Allusion — point via a lyric, film line, idiom, or famous name (e.g. "ring" → "one to rule them all")
⑥ The part for the whole — describe just one piece or one letter of it, ignore the rest (e.g. "sunflower" → only "sun")
⑦ Spell it sideways — break it into letters / sounds / shape (e.g. "tea" → "just the letter T")
⑧ Paint the picture — describe its look, sound, or motion (e.g. "fireworks" → "the sky briefly grows flowers")
⑨ Riddle it — wrap the whole meaning inside a quote or a meme (e.g. "coffee" → "but first…")
⑩ Strike the essence — seize the single defining trait and spin out (e.g. "mirror" → "it agrees with everyone, yet has no opinion")
You can also riff LIVE — pick up the last person's line, play on someone's name/avatar, or call back an earlier joke — to add interaction and misdirection and make your side smirk.
Examples: Statue of Liberty → "held that torch since 1886, arm never tired"; Tiger → "crouching, hidden, biding its time"; Gandalf → "you shall not pass"; Coffee → "but first…"; Titanic → "I'll never let go… (lets go)"; Snail → "brings its whole house to every meeting".`,
};

// Round/position-aware guidance — favor clever-indirect over dry-vague.
function vaguenessTip(round: number, locale: Locale, position?: number): string {
  if (locale === "en") {
    if (round === 1 && (position == null || position <= 1)) {
      return "You speak early with no clues to borrow. Aim for one perfect shot: a clever, indirect clue (allusion / homophone / scene / pun) that both hides your identity and plants a hint only the in-crowd will catch. Don't say \"a kind of X\", and don't drop a detail that pins you.";
    }
    if (round === 1) {
      return "Others have already spoken — read the table. IMPORTANT: if the earlier clues have ALREADY made the word easy to guess, do NOT add one more detail that nails it down. If the undercover gets voted out, they read the word straight off the board and steal the win with their last-chance guess — so don't be the one who completes the picture. Build on (or riff off) the others, but take a HAZIER, more oblique angle: true for this kind of thing, yet not locking the word in.";
    }
    return "From round two on, read what's already on the table first. If the word is already well established (an outsider could now guess it), go the OTHER way — be vaguer and more oblique, drop a small smokescreen (but one that's still a true, off-beat angle on YOUR word — never an unrelated line that fits anything), and never add the detail that confirms it (that's what hands a caught undercover the word). Only if the word is still genuinely unclear should you firm up slightly to build trust. Never blurt the key trait.";
  }
  if (round === 1 && (position == null || position <= 1)) {
    return "你很早发言、没线索可借。争取【一发入魂】：给一个巧妙、间接的描述(用典/谐音/场景/双关皆可)，既藏住身份、又埋下只有懂的人能品到的指向。别用“一种X”这种干巴定义，也别报能直接锁定的细节。";
  }
  if (round === 1) {
    return "前面有人发言了，先看桌面。【关键】如果前面几句已经把这个词描得八九不离十（外人都能猜出来了），你就别再补一刀、添一个让词更坐实的特征——否则万一卧底被票出去，他照着这些描述就能猜中词、反杀翻盘，别当那个把词描全的人。承接或现挂他们的话，但【另起一个更虚、更绕的角度】，对这类事物成立、却不帮着把词锁死。";
  }
  return "第二轮往后，先看看桌面上已有的描述。如果这个词已经被描得很清楚了（外人都能猜出来），就【反过来更绕、更虚】，放个小烟雾弹（但烟雾弹也得是你这个词的一个偏门角度、对它成立，绝不能跑题成一句和你的词无关的话），绝不再添那个把词坐实的特征（那等于把词亲手送给被票出的卧底）；只有当这个词还真没被点破时，才可以稍微具体一点来建立信任。绝不直白报出关键特征。";
}

export interface DescribePayload extends AgentContext {
  name: string;
  trait: string;
  word: string;
  round: number;
  transcript: string;
  position?: number; // 1-based speaking slot this round
  speakerCount?: number; // alive speakers this round
}

export function buildDescribePrompt(p: DescribePayload): string {
  const locale = L(p);
  if (locale === "en") return buildDescribePromptEn(p);
  const posLine = p.position ? `，你是本轮第 ${p.position} 位发言${p.speakerCount ? `（共 ${p.speakerCount} 人）` : ""}` : "";
  if (p.isBlank) {
    return `${GAME_RULES.zh}

${personaBlock(p.name, p.trait, p)}

⚠️ 你是【白板】：你没有任何词。场上多数人是平民(同一个词)、还藏着卧底(另一个词)，而你两个都不知道。

目前本局已经说过的描述(按顺序)：
${p.transcript || "(还没人描述，你较早发言——对白板很不利)"}

【当前】第 ${p.round} 轮${posLine}。

${STRATEGY.zh}

白板玩法有两条路，在 reasoning 里自己选：

🔍 路线A——猜词爆词流：
  高手白板的乐趣在于，从别人的描述里高度凝练、推理出民词是什么，然后爆词取胜！
  若你已推测出民词，可以说一句”这类事物”的话来验证/暗示——如果对，则爆词获胜。
  例(前置位都在描西红柿炒鸡蛋周边)：✅”这道菜是由两种食材混合而成的。”(猜对了，敢直接揭！)

🎭 路线B——放飞自我流：
  白板脱离了词语桎梏，拥有最广泛的自由！可以大胆胡编，只要别被认出是白板。
  要点：从别人描述里【归纳共性】给一句”内行但笼统”的话来蒙混，绝不说”我挺喜欢的/我也有”这种空废话——那是最快被票出的。
  如果你很早发言、毫无线索，就说一句放之四海皆准却又合情合理的话。
  例(别人在说芒果周边)：✅”有的甜，有的酸。”(归纳共性)　❌”我很喜欢吃。”(废话，一眼白板)

一句话、不超过 25 字、口语自然。

${HUMANLIKE.zh}

先在 reasoning 里写：你从前面发言里推测的词是什么、打算走哪条路；再给出 clue。${MEMORY_INSTRUCTION.zh}`;
  }
  return `${GAME_RULES.zh}

${personaBlock(p.name, p.trait, p)}

你拿到的词是：【${p.word}】

目前本局已经说过的描述(按顺序)：
${p.transcript || "(还没有人描述，你较早发言)"}

【当前】第 ${p.round} 轮${posLine}。

${STRATEGY.zh}

${vaguenessTip(p.round, "zh", p.position)}

${TECHNIQUES.zh}

要求：
1. 一句话、不超过 25 字；绝不能出现“${p.word}”这三个字或其明显谐音/拆字/偏旁(忌爆字)。
2. 别干巴巴下定义、也别报能一眼锁定的细节；优先用上面的某种描法，巧妙、间接地指向你的词。
3. 不要和别人(或自己上一轮)字面或换皮重复，自己另起新角度(忌跟描)。
4. 如果你发现别人描述的东西和你的词对不上，你很可能就是卧底——更要往安全、巧妙含蓄的方向说，顺着大家、转移视线，别露馅。
5. 想不到特别巧的，也至少要含蓄、留余地，绝不直白泄底。

${HUMANLIKE.zh}

参考(词是“兵马俑”)：✅“敌不动，我不动。”(巧、绕、不爆字)　❌“一种著名的古代陶土雕像文物。”(干巴定义，太直白)

先在 reasoning 里想清楚：我的词、我可能是不是少数派、用哪种描法巧妙带过；再给出 clue。${MEMORY_INSTRUCTION.zh}`;
}

function buildDescribePromptEn(p: DescribePayload): string {
  const posLine = p.position ? `, you're speaker #${p.position} this round${p.speakerCount ? ` (of ${p.speakerCount})` : ""}` : "";
  if (p.isBlank) {
    return `${GAME_RULES.en}

${personaBlock(p.name, p.trait, p)}

⚠️ You're the BLANK: you have no word at all. Most players are civilians (one shared word), a few are undercover (a different word), and you know neither.

Clues given so far this game (in order):
${p.transcript || "(no one has described yet — you're speaking early, which is rough for a blank)"}

[Now] Round ${p.round}${posLine}.

${STRATEGY.en}

A blank has two routes — pick one in reasoning:

🔍 Route A — deduce & call it:
  The joy of a great blank is to compress everyone's clues, deduce the civilians' word, and call it to win!
  If you think you've got the civilian word, say one "this kind of thing" line to test/hint — if it's right, you win by calling it.
  e.g. (everyone before you has been circling a tomato-and-egg dish): ✅ "this one's just two ingredients folded together." (guessed right — dare to reveal it!)

🎭 Route B — wing it:
  The blank is free of any word — the widest freedom of all! Make things up boldly, just don't get spotted as the blank.
  Key: from others' clues, distill the COMMON THREAD into one "insider-but-general" line to blend in; never say "I kinda like it / I have one too" — that's the fastest way to get voted out.
  If you speak early with no clues at all, say something universally true yet still plausible.
  e.g. (others are on mango): ✅ "some are sweet, some are sour." (common thread) ❌ "I love eating it." (filler — instantly reads as the blank)

One sentence, under ~15 words, casual and natural.

${HUMANLIKE.en}

First, in reasoning, write the word you've inferred from earlier clues and which route you'll take; then give your clue. ${MEMORY_INSTRUCTION.en}`;
  }
  return `${GAME_RULES.en}

${personaBlock(p.name, p.trait, p)}

Your word is: 【${p.word}】

Clues given so far this game (in order):
${p.transcript || "(no one has described yet — you're speaking early)"}

[Now] Round ${p.round}${posLine}.

${STRATEGY.en}

${vaguenessTip(p.round, "en", p.position)}

${TECHNIQUES.en}

Requirements:
1. One sentence, under ~15 words; never show the letters of "${p.word}", nor an obvious homophone/anagram/root of it (no leaked letters).
2. Don't flatly define it or drop a pin-it detail; prefer one of the techniques above to point at your word cleverly and indirectly.
3. Don't repeat others (or your own last round) literally or reskinned — find a fresh angle (no echoing).
4. If you notice others' clues don't match your word, you're probably the undercover — steer even safer and more veiled, go with the flow, redirect, don't slip.
5. If nothing clever comes, at least stay veiled and leave room — never blurt your word.

${HUMANLIKE.en}

Example (word = "Tiger"): ✅ "crouching, hidden, biding its time." (clever, oblique, no leaked letters) ❌ "a large striped wild cat." (flat definition, far too blunt)

First, in reasoning, think it through: my word, whether I might be the minority, which technique to use; then give your clue. ${MEMORY_INSTRUCTION.en}`;
}

export interface VotePayload extends AgentContext {
  name: string;
  trait: string;
  word: string;
  allClues: string;
  aliveNames: string[];
}

export function buildVotePrompt(p: VotePayload): string {
  const locale = L(p);
  const others = p.aliveNames.filter((n) => n !== p.name);
  if (locale === "en") {
    return `${GAME_RULES.en}

Now it's the vote: vote out the one whose "word differs from most" — the undercover.

${personaBlock(p.name, p.trait, p)}

${p.isBlank ? "You're the BLANK, with no word; you're on the civilians' side, aiming to vote out the undercover." : `Your word is 【${p.word}】.`}

Every clue so far this game:
${p.allClues}

Players still in and votable: ${others.join(", ")}
You can't vote for yourself (${p.name}).
⚠️ Your vote MUST be exactly one name from that list. Anyone not on it — including players eliminated in earlier rounds who still show up in the transcript — is NOT a valid choice.

How to vote:

${p.isBlank ? `You're the BLANK, on the civilians' side — but you don't know the civilian word, so vote by observation:
- Follow the "solid civilians": vote toward whoever the crowd suspects.
- Prefer voting out anyone clearly off-topic, coasting on vague filler all game, or saying nothing of substance ("I kinda like it / I have one too").
- Don't be too passive (never voting looks odd), nor too reckless (random votes expose you).
- After voting, don't over-explain; one go-with-the-crowd line is enough.` : `Your word is 【${p.word}】; voting as a civilian:
- Blanks first, undercover second: prioritize whoever gives zero substance, stays wishy-washy, or spouts universally-true filler (likely the blank); then converge on the undercover.
- Re-read ROUND ONE most closely — it exposes identity best — and find whoever diverges most from "the thing everyone's circling."
- Give a pass (for now) to those who are merely clever/abstract but not off-target (could be experts); watch those who only follow along with no angle of their own (blank-ish).
- Beware the "civilian-thinks-they're-undercover" trap: don't assume you're the minority just because you didn't get someone's clever clue — they may just be playing oblique; stay calm and weigh many players.
- If you suspect YOU'RE the undercover (the minority), strategically throw your vote at a suspicious-looking civilian to redirect.`}

Don't blind-vote someone just for being quiet or vague; weigh their clues across all the rounds.

First, in reasoning, write your reasoning (you may cite "so-and-so's line in round N"), then in vote pick one in-play player name (must be on the list above, and not yourself), with voteReason in one sentence (under ~18 words, casual, with a touch of your personality). ${MEMORY_INSTRUCTION.en}`;
  }
  return `${GAME_RULES.zh}

现在进入投票环节，要票出你认为“词和大多数人不同”的那个卧底。

${personaBlock(p.name, p.trait, p)}

${p.isBlank ? "你是【白板】，没有词；你和平民一边，目标是票出卧底。" : `你拿到的词是【${p.word}】。`}

本局到目前为止所有人的描述：
${p.allClues}

仍在场、可被投票的玩家：${others.join("、")}
你不能投自己(${p.name})。
⚠️ 你的票必须从上面这份名单里恰好选一个名字。名单之外的人一律不能投——包括前几轮已经出局、只是还出现在发言记录里的人。

投票心法：

${p.isBlank ? `你是【白板】，和平民一边——但你不知道民词，投票靠观察：
- 跟着大多数”铁民”的判断走：看谁被多人怀疑就往那个方向投。
- 优先投描述明显跑偏、或全程跟风蒙混、或说废话(“我挺喜欢的/我也有”)的人。
- 不能太消极(不投显异常)，也不能太莽撞乱投暴露自己。
- 投票后别过度解释理由，随大流的一句话就够。` : `你拿到的词是【${p.word}】，作为平民的投票思路：
- 【先投白后投卧】：优先票出那个说话毫无实质内容、全程模棱两可或放之四海皆准的废话的人(很可能是白板)，剩下再集中票卧底。
- 重点回看【第一轮】的描述，最能暴露身份——找描述和”大家共同指向的那类事物”出入最大的人。
- 对只是描述得巧妙/抽象、但并没跑偏的人先放一放(可能是高手)；留意全程跟风、没有自己角度的人(白板嫌疑)。
- 警惕”民伪卧”陷阱：别因为看不懂前面某人的话就以为自己是少数派，可能对方只是在玩巧描，沉住气综合多人判断。
- 如果你怀疑自己才是卧底(少数派)，策略性地把票投给一个看起来可疑的平民，转移视线。`}

别因为某人话少/话笼统就盲投；结合 ta 每轮描述综合看。

先在 reasoning 里写出推理(可以点名”某人第几轮那句话”作依据)，再在 vote 里选一个在场玩家名(必须是上面列出的、且不是你自己)，voteReason 用一句话(不超过30字、口语、带点你的性格)。${MEMORY_INSTRUCTION.zh}`;
}

export interface SuspectPayload extends AgentContext {
  name: string;
  trait: string;
  word: string;
  allClues: string;
  aliveNames: string[];
}

export function buildSuspectPrompt(p: SuspectPayload): string {
  const locale = L(p);
  const others = p.aliveNames.filter((n) => n !== p.name);
  if (locale === "en") {
    return `${GAME_RULES.en}

This is a live suspicion read — no vote yet, but based on every clue so far, update how strongly you suspect each remaining opponent of being undercover.

${personaBlock(p.name, p.trait, p)}

${p.isBlank ? "You're the BLANK, with no word; judge from the clues who's most likely undercover." : `Your word is 【${p.word}】.`}

Every clue so far this game:
${p.allClues}

Opponents to rate: ${others.join(", ")}

Key: lean on round-one clues most (they expose identity best); don't over-score someone who's merely abstract-but-on-target (just cautious) — save the high scores for those clearly off the mainstream word.

Give your read now:
1. First, in reasoning, one sentence on your latest overall view (who's most suspect, and why).
2. In suspicions, give each opponent above a 0-100 suspicion score (0 = almost certainly not undercover, 100 = almost certainly undercover); cover every opponent, using names only from the list above.`;
  }
  return `${GAME_RULES.zh}

现在是“实时怀疑评估”——还没到投票，但你要根据目前所有线索，更新你对每个在场对手是卧底的怀疑程度。

${personaBlock(p.name, p.trait, p)}

${p.isBlank ? "你是【白板】，没有词；凭描述判断谁最可能是卧底。" : `你拿到的词是【${p.word}】。`}

本局到目前为止所有人的描述：
${p.allClues}

需要你评估的在场对手：${others.join("、")}

评估要点：重点参考【第一轮】描述(最能暴露身份)；对“只是抽象但没跑偏”的人别给太高分(可能只是谨慎)，把高分留给明显和主流词对不上的人。

请给出你此刻的判断：
1. 先在 reasoning 里用一句话说明你最新的整体看法(谁最可疑、为什么)。
2. 在 suspicions 里，为上面每一个对手各给一个 0-100 的怀疑分(0=几乎不可能是卧底，100=几乎肯定是卧底)，必须覆盖全部对手、且名字只能取自上面的列表。`;
}

export interface SpyGuessPayload extends AgentContext {
  name: string;
  trait: string;
  allClues: string;
}

export function buildSpyGuessPrompt(p: SpyGuessPayload): string {
  const locale = L(p);
  if (locale === "en") {
    return `${GAME_RULES.en}

Crunch time: you've just been voted out as the last undercover. By the rules you get one final shot — if you can guess the word the civilians hold, the undercover side wins outright (a reversal)!

${personaBlock(p.name, p.trait, p)}

Every clue from this whole game:
${p.allClues}

From these clues, deduce the word the civilians hold. First reason briefly in reasoning, then in guess write only that one word (as precise as you can — a single word).`;
  }
  return `${GAME_RULES.zh}

关键时刻：你刚刚作为最后一名卧底被票出了。按规则，你还有最后一次机会——如果你能猜中平民们拿到的那个词，卧底阵营就直接翻盘获胜(反杀)！

${personaBlock(p.name, p.trait, p)}

本局所有人的全部描述：
${p.allClues}

请根据这些描述，推断出平民拿到的那个词是什么。先在 reasoning 里简短推理，再在 guess 里只写出那个词本身(尽量精确，就写一个词)。`;
}

export interface ReflectPayload extends AgentContext {
  name: string;
  trait: string;
  word: string;
  role: "卧底" | "平民";
  won: boolean;
  transcript: string;
  outcome: string; // human-readable result line
}

export function buildReflectPrompt(p: ReflectPayload): string {
  const locale = L(p);
  if (locale === "en") {
    const roleText = p.role === "卧底" ? "the Undercover" : "a Civilian";
    return `${GAME_RULES.en}

This game is over; now review it and bank lessons for "how to play better next time."

${personaBlock(p.name, p.trait, p)}

This game your true role was 【${roleText}】, your word was 【${p.word}】, and the result: ${p.won ? "your side won" : "your side lost"}.

Full transcript of this game:
${p.transcript}

${STRATEGY.en}

Against the core strategy above, sum up 1-3 concrete, reusable lessons. For example: round-one clues should be more general, not too blunt (too blunt = one-and-done); how to balance "plain description + a general trait"; how to redirect safely the moment you realize you're the minority; the blank should distill the common thread instead of spouting filler; vote by round one, don't just follow-vote.
- One sentence each, concrete and actionable; avoid empty "be more careful" platitudes.
- Put them in the learnings array.`;
  }
  return `${GAME_RULES.zh}

本局已经结束，现在请你复盘，为自己积累“下次怎么打更好”的经验。

${personaBlock(p.name, p.trait, p)}

本局你的真实身份是【${p.role}】，你拿到的词是【${p.word}】，结果：${p.won ? "你所在阵营赢了" : "你所在阵营输了"}。

本局完整发言记录：
${p.transcript}

${STRATEGY.zh}

请对照上面的核心策略，总结 1-3 条具体、可复用的经验教训。例如：第一轮描述要更笼统、别太直白(太直白会一轮游)；“白描 + 笼统特点”怎么把握；发现自己是少数派时如何往安全方向转移视线；白板要归纳共性而不是说废话；投票要看第一轮、别跟票 等。
- 每条一句话，具体可操作，避免“要更小心”这种空话。
- 放进 learnings 数组。`;
}

// The masterclass coach: a seasoned, wily veteran who sits beside the HUMAN
// student and gives sharp, board-specific tactical advice — so the student
// genuinely improves. It reasons only from the PUBLIC clues (it never cheats by
// being told who the spy is), like a strong player would.
// CoachPayload deliberately does NOT extend AgentContext. The masterclass coach
// must reason ONLY from the public clues (allClues) plus the human student's own
// role/word — never from any agent's private memory / banked learnings / inner
// reasoning. Keeping those fields out of the TYPE makes that leak structurally
// impossible (not just unused).
export interface CoachPayload {
  locale?: Locale;
  decision: "describe" | "vote";
  name: string;
  role: "civilian" | "spy" | "blank";
  word: string;
  allClues: string;
  aliveNames: string[];
  round: number;
}

export function buildCoachPrompt(p: CoachPayload): string {
  const locale = L(p);
  if (locale === "en") {
    const roleEn = p.role === "spy" ? "the undercover (a minority word)" : p.role === "blank" ? "the blank (no word at all)" : "a civilian";
    const wordLine = p.role === "blank" ? "You have NO word." : `Your word is 【${p.word}】.`;
    const task =
      p.decision === "describe"
        ? "It's their turn to give a one-line clue. Coach them on the smartest way to clue here."
        : "It's the vote. Coach them on who to suspect and why.";
    const rule =
      p.decision === "describe"
        ? "Offer 1-2 concrete angles/techniques for their word (a homophone, an allusion, completing a set phrase, the one essential trait...) and one trap to avoid (too blunt / too flat / echoing someone). Never hand them a finished line — coach the move so they can make it themselves next time."
        : "Read the clues for them like a strong player would: name who looks most off and exactly why (whose clue doesn't fit what everyone's circling, who's coasting on filler). If THEY are the minority/undercover, coach them to deflect safely instead.";
    // 由浅入深 — scaffold the teaching depth to how far into the game we are.
    const depth =
      p.round <= 1
        ? "This is the very start — teach a FUNDAMENTAL, gently. Pick just ONE core idea (e.g. a good clue hints without exposing the word; or 'find the player whose clue doesn't fit what everyone else is circling'). Keep it beginner-friendly."
        : p.round === 2
          ? "They've seen one round — go a level DEEPER: how to line several clues up side by side and spot the one that doesn't fit, and why round-one clues expose identity the most."
          : "They're warmed up — teach something ADVANCED now: reading a bluff or misdirection, telling a blank apart from the undercover, or how vote dynamics and follow-voting can be played.";
    return `${GAME_RULES.en}

You are a patient masterclass coach sitting beside a human student during a practice game. Your goal is to TEACH them to read the table on their own — guide step by step, build from simple to deep over the game, and always explain the WHY so the skill sticks. The student CANNOT see the other players' private thoughts — you are their only window, so briefly read the key clue(s) for them in plain words.

The student: ${roleEn}. ${wordLine} It is round ${p.round}.

Clues on the table so far:
${p.allClues || "(no clues yet — they're among the first to speak)"}

Players still in: ${p.aliveNames.join(", ")}

${task}

Teach at the right depth for round ${p.round}:
${depth}

How to coach:
- Ground it in THIS board — point at the actual clue(s)/player(s) that matter and say plainly what they reveal.
- ${rule}
- Explain the principle behind your advice in one breath, so they learn the read and not just the move.
- 2-4 warm, plain sentences, like a teacher leaning in. No headings, no lists. Don't just give the answer — coach the read.

Put your advice in the tip field.`;
  }
  const roleZh = p.role === "spy" ? "卧底（少数派词）" : p.role === "blank" ? "白板（没有词）" : "平民";
  const wordLine = p.role === "blank" ? "你没有词（你是白板）。" : `你的词是【${p.word}】。`;
  const task =
    p.decision === "describe"
      ? "轮到他描述了，要给一句话。请指点他这一手最聪明该怎么打。"
      : "到投票了。请指点他该怀疑谁、为什么。";
  const rule =
    p.decision === "describe"
      ? "给他这个词的 1-2 个具体角度/描法（谐音、用典、补全固定搭配、抓最本质的特征……），再点一个要避开的坑（太直白／太干巴／跟描别人）。别直接把成句喂给他——把“这一手怎么打”教给他，让他下次能自己使出来。"
      : "替他像高手一样读牌：点名谁最不对劲、到底哪句话露了馅（谁和大家共同指向的那类东西对不上、谁全程在蒙）。如果【他自己】就是少数派／卧底，就教他怎么安全地转移视线。";
  // 由浅入深 —— 教学深度随对局推进逐层加深。
  const depth =
    p.round <= 1
      ? "这是最开头——讲【最基础】的，温柔一点。只点一个核心概念（比如：好描述是“点到为止地暗示”而不是把词说穿；或者“找出那个和大家指向不一样的人”）。适合新手。"
      : p.round === 2
        ? "他已经历过一轮——可以【深一层】：教他怎么把几条描述摆在一起对比、揪出那个不合群的，以及为什么第一轮的描述最能暴露身份。"
        : "他热身好了——讲点【进阶】的：怎么识破伪装与误导、怎么区分白板和卧底、投票时的跟票与心理博弈怎么玩。";
  return `${GAME_RULES.zh}

你是一位耐心的“大师课”教练，正坐在一位人类学员旁边陪练。你的目标是【教会他自己读牌】——一步步引导、随着对局由浅入深，而且每次都把“为什么”讲清楚，让本事能留在他身上。学员【看不到】其他玩家的内心想法——你是他唯一的窗口，所以要用大白话替他把关键的那句描述读一读。

学员：他是${roleZh}。${wordLine} 现在是第 ${p.round} 轮。

目前桌上的描述：
${p.allClues || "（还没有描述——他在最早发言之列）"}

仍在场的玩家：${p.aliveNames.join("、")}

${task}

按第 ${p.round} 轮该有的深度来教：
${depth}

指点方式：
- 扎根【这一局的实际牌面】——点出真正关键的那句描述／那个人，用大白话说清它暴露了什么。
- ${rule}
- 用一句话把建议背后的【道理】讲明白，让他学到的是“读法”而不只是“这一步”。
- 2-4 句，温和、口语，像老师凑过来轻声讲。别用标题、别列点。别直接给答案——教他怎么读。

把你的建议写进 tip 字段。`;
}
