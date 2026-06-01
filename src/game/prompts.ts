// Prompt builders shared by the server route. Phase B injects each agent's
// thinking style, "初始素质" attributes, private working memory, and lessons
// recalled from past games — all as CONTEXT the agent reasons over itself.
import type { AgentAttributes } from "./types";
import { thinkingStyleScaffold } from "./thinkingStyles";

export const GAME_RULES = `你正在玩“谁是卧底”游戏。规则：N 名玩家，其中少数人(卧底)拿到的词和大多数人(平民)不同，但没有人知道自己是不是卧底，也不知道谁是卧底。每轮每人用一句话描述自己拿到的词，不能直接说出这个词。描述太具体会暴露，太模糊会被怀疑。每轮结束后大家投票，票数最高者出局。平民目标是票出全部卧底；卧底目标是潜伏到最后。`;

// Fields every agent call may carry to shape the agent's identity & memory.
export interface AgentContext {
  thinkingStyle?: string; // key into THINKING_STYLES
  attributes?: AgentAttributes; // 初始素质 (prompt context only)
  learnings?: string[]; // recalled long-term lessons (agent-authored)
  memory?: string; // private working memory (agent-authored, this game)
  isBlank?: boolean; // this agent is the 白板 (got no word)
}

function attrText(a?: AgentAttributes): string {
  if (!a) return "";
  return `你的素质自评(满分10)：推理力${a.reasoning}、谨慎度${a.caution}、伪装力${a.disguise}、表达力${a.expressiveness}。请让你的发言与判断风格符合这些素质。`;
}

// The persona/context block shared by describe / vote / suspect prompts.
function personaBlock(name: string, trait: string, ctx: AgentContext): string {
  const lines = [`你的身份设定：${name}，性格：${trait}。请用符合这个性格的语气说话。`];
  const style = thinkingStyleScaffold(ctx.thinkingStyle);
  if (style) lines.push(`你的思维方式：${style}`);
  const at = attrText(ctx.attributes);
  if (at) lines.push(at);
  if (ctx.learnings && ctx.learnings.length) {
    lines.push(`你从过往对局中积累的经验(仅供参考，不必照搬)：\n${ctx.learnings.map((l) => `· ${l}`).join("\n")}`);
  }
  if (ctx.memory && ctx.memory.trim()) {
    lines.push(`你目前的私人笔记/判断：\n${ctx.memory.trim()}`);
  }
  return lines.join("\n");
}

const MEMORY_INSTRUCTION =
  "最后，在 memoryUpdate 里更新你的私人笔记(你现在最怀疑谁、依据是什么、你的词可能是不是少数派)，简短几句，供你下一回合参考。";

// 说话像真人，不像念谜面 —— 提升“活人感”。
const HUMANLIKE =
  "说话要像真人在牌桌上聊天：口语、自然、简短，符合你的性格；可以顺着接别人的话、表个态度或调侃一句(如“我跟老K想的差不多”“这说法有点虚啊”)，但别暴露词。别每句都是工整的谜面式描述。";

// 全局核心策略 —— 修复“第一轮泄底/卧底一轮游”，并把描述从“干巴定义”升级为“巧妙间接”。
const STRATEGY =
  "这个游戏拼的是脑洞与表达，乐趣全在于“猜”。高手的描述讲究【巧、绕、有梗】：用谐音、拆字、补全固定搭配、近义联想、用典/歌词/影视梗、双关、场景演绎、抓本质特征等手法【间接】指向自己的词——让“懂的人能品出来、卧底和白板却难以破译”。务必守三不要：①忌近描——别干巴巴下定义(如“一种水果/一种工具书/一种交通工具”)，那既无趣又最容易被跟描；②忌爆字——不出现词里的任何字及其明显谐音/偏旁；③忌跟描——别重复或换皮重复别人说过的，自己另起新角度。同时点到为止：太直白会让卧底一轮出局、一局就结束、毫无意思——宁可巧妙含蓄，也绝不报出能让人一眼锁定的细节。";

// 十大描法 + 现挂 + 范例(供 describe 注入)。让 agent 有”招”可使，而不是干巴定义。
const TECHNIQUES =
  `十大描法(按需混用，越多越巧)：
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
范例：汉语字典→”此生无悔入华夏”；兵马俑→”敌不动，我不动”；星空→”银汉迢迢暗渡”；世界杯→”你为什么要玩泥巴，把脸弄那么脏”；红楼梦→”大锤80，小锤40”；护照→”新的风暴已经出现，怎么能够停滞不前”。`;

// Round/position-aware guidance — favor clever-indirect over dry-vague.
function vaguenessTip(round: number, position?: number): string {
  if (round === 1 && (position == null || position <= 1)) {
    return "你很早发言、没线索可借。争取【一发入魂】：给一个巧妙、间接的描述(用典/谐音/场景/双关皆可)，既藏住身份、又埋下只有懂的人能品到的指向。别用“一种X”这种干巴定义，也别报能直接锁定的细节。";
  }
  if (round === 1) {
    return "前面有人发言了。别简单重复、也别比他们更空洞：承接或现挂他们的话，另起一个新角度，给一个对这类事物成立、却又巧而不露的描述。";
  }
  return "第二轮往后，可以比第一轮稍微具体一点来建立信任，但仍走“巧而不露”的路子，绝不直白报出关键特征。";
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
  const posLine = p.position ? `，你是本轮第 ${p.position} 位发言${p.speakerCount ? `（共 ${p.speakerCount} 人）` : ""}` : "";
  if (p.isBlank) {
    return `${GAME_RULES}

${personaBlock(p.name, p.trait, p)}

⚠️ 你是【白板】：你没有任何词。场上多数人是平民(同一个词)、还藏着卧底(另一个词)，而你两个都不知道。

目前本局已经说过的描述(按顺序)：
${p.transcript || "(还没人描述，你较早发言——对白板很不利)"}

【当前】第 ${p.round} 轮${posLine}。

${STRATEGY}

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

${HUMANLIKE}

先在 reasoning 里写：你从前面发言里推测的词是什么、打算走哪条路；再给出 clue。${MEMORY_INSTRUCTION}`;
  }
  return `${GAME_RULES}

${personaBlock(p.name, p.trait, p)}

你拿到的词是：【${p.word}】

目前本局已经说过的描述(按顺序)：
${p.transcript || "(还没有人描述，你较早发言)"}

【当前】第 ${p.round} 轮${posLine}。

${STRATEGY}

${vaguenessTip(p.round, p.position)}

${TECHNIQUES}

要求：
1. 一句话、不超过 25 字；绝不能出现“${p.word}”这三个字或其明显谐音/拆字/偏旁(忌爆字)。
2. 别干巴巴下定义、也别报能一眼锁定的细节；优先用上面的某种描法，巧妙、间接地指向你的词。
3. 不要和别人(或自己上一轮)字面或换皮重复，自己另起新角度(忌跟描)。
4. 如果你发现别人描述的东西和你的词对不上，你很可能就是卧底——更要往安全、巧妙含蓄的方向说，顺着大家、转移视线，别露馅。
5. 想不到特别巧的，也至少要含蓄、留余地，绝不直白泄底。

${HUMANLIKE}

参考(词是“兵马俑”)：✅“敌不动，我不动。”(巧、绕、不爆字)　❌“一种著名的古代陶土雕像文物。”(干巴定义，太直白)

先在 reasoning 里想清楚：我的词、我可能是不是少数派、用哪种描法巧妙带过；再给出 clue。${MEMORY_INSTRUCTION}`;
}

export interface VotePayload extends AgentContext {
  name: string;
  trait: string;
  word: string;
  allClues: string;
  aliveNames: string[];
}

export function buildVotePrompt(p: VotePayload): string {
  const others = p.aliveNames.filter((n) => n !== p.name);
  return `${GAME_RULES}

现在进入投票环节，要票出你认为“词和大多数人不同”的那个卧底。

${personaBlock(p.name, p.trait, p)}

${p.isBlank ? "你是【白板】，没有词；你和平民一边，目标是票出卧底。" : `你拿到的词是【${p.word}】。`}

本局到目前为止所有人的描述：
${p.allClues}

仍在场、可被投票的玩家：${others.join("、")}
你不能投自己(${p.name})。

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

先在 reasoning 里写出推理(可以点名”某人第几轮那句话”作依据)，再在 vote 里选一个在场玩家名(必须是上面列出的、且不是你自己)，voteReason 用一句话(不超过30字、口语、带点你的性格)。${MEMORY_INSTRUCTION}`;
}

export interface SuspectPayload extends AgentContext {
  name: string;
  trait: string;
  word: string;
  allClues: string;
  aliveNames: string[];
}

export function buildSuspectPrompt(p: SuspectPayload): string {
  const others = p.aliveNames.filter((n) => n !== p.name);
  return `${GAME_RULES}

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
  return `${GAME_RULES}

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
  return `${GAME_RULES}

本局已经结束，现在请你复盘，为自己积累“下次怎么打更好”的经验。

${personaBlock(p.name, p.trait, p)}

本局你的真实身份是【${p.role}】，你拿到的词是【${p.word}】，结果：${p.won ? "你所在阵营赢了" : "你所在阵营输了"}。

本局完整发言记录：
${p.transcript}

${STRATEGY}

请对照上面的核心策略，总结 1-3 条具体、可复用的经验教训。例如：第一轮描述要更笼统、别太直白(太直白会一轮游)；“白描 + 笼统特点”怎么把握；发现自己是少数派时如何往安全方向转移视线；白板要归纳共性而不是说废话；投票要看第一轮、别跟票 等。
- 每条一句话，具体可操作，避免“要更小心”这种空话。
- 放进 learnings 数组。`;
}
