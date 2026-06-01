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

// 全局核心策略 —— 直接修复“第一轮泄底过多导致卧底一轮游”。
const STRATEGY =
  "这个游戏的乐趣全在于“猜”。描述太直白会让一局一轮就结束、毫无意思——无论你是平民、卧底还是白板，都要“白描 + 笼统特点”，点到为止：既保护自己，又不过早泄底。宁可偏笼统，也绝不为了具体而报出能让人一眼锁定的细节。卧底词和平民词往往是相近但特点迥异的一类(如 内衣/秋衣、菊花/桃花)，越往细处说越危险。";

// Round/position-aware guidance on how vague to be.
function vaguenessTip(round: number, position?: number): string {
  if (round === 1 && (position == null || position <= 1)) {
    return "你这一轮很早发言、几乎没有线索可借。首要任务是【隐藏身份】：用类别级、笼统的说法(例:苹果→“一种水果”、岳飞→“一个人物”、秋衣→“一种衣物”)，绝不给出能直接锁定的细节。";
  }
  if (round === 1) {
    return "前面已经有人发言了。别比他们更抽象(那样反而显眼可疑)：承接他们的描述，补一个对这类事物“大多成立”的笼统特点(例:岳飞→“性格挺鲜明、有故事”)，显得跟得上又不泄底。";
  }
  return "已经是第二轮往后，可以比第一轮稍微具体一点点来建立信任，但仍要点到为止、绝不直白报出关键特征。";
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

白板生存要点：
1. 切忌“模棱两可、谁都对”的废话(如“我挺喜欢的”“我也有”)——这种最容易被票出。要从别人的描述里【归纳这类事物的共性】，给一句听起来内行又笼统的话。
   例(别人在说芒果一类水果:“一种水果/热带水果/有黄有绿”)：✅“有的甜，有的酸。”(归纳水果共性，安全过关)　❌“我很喜欢吃。”
2. 如果你很早发言、毫无线索，就说一句极其笼统、放之四海皆准的话。
3. 一句话、不超过 25 字、口语自然。目标是别被认出是白板、多活一轮继续观察。

${HUMANLIKE}

先在 reasoning 里写你从别人发言里推测了什么、打算怎么蒙混；再给出 clue。${MEMORY_INSTRUCTION}`;
  }
  return `${GAME_RULES}

${personaBlock(p.name, p.trait, p)}

你拿到的词是：【${p.word}】

目前本局已经说过的描述(按顺序)：
${p.transcript || "(还没有人描述，你较早发言)"}

【当前】第 ${p.round} 轮${posLine}。

${STRATEGY}

${vaguenessTip(p.round, p.position)}

要求：
1. 一句话、不超过 25 字；绝不能出现“${p.word}”这三个字或其明显谐音/拆字。
2. 不要和别人(或自己上一轮)字面重复，换一个新角度。
3. 如果你发现别人描述的东西和你的词对不上，你很可能就是卧底——这时更要往笼统、安全的方向说，顺着大家、转移视线，别露馅。
4. 宁可偏笼统，也不要为了“具体”而报出能一眼锁定的细节。

${HUMANLIKE}

参考(词是“秋衣”)：✅“一种衣物，有厚有薄。”　❌“冬天贴身穿，有时还穿两件。”(太直白，无论平民卧底都吃亏)

先在 reasoning 里想清楚：我的词、我可能是不是少数派、这一轮该多笼统；再给出 clue。${MEMORY_INSTRUCTION}`;
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

投票要用心，别盲目跟票：
- 重点回看【第一轮】的描述，最能暴露身份。找那个描述和“大多数人共同指向的那类东西”出入最大的人。
- 对只是描述得比较抽象、但并没跑偏的人先放一放(可能只是谨慎的先手玩家，不一定是卧底)；优先怀疑明显和主流对不上的人。
- 别因为某人话笼统/话少就盲投；结合 ta 每一轮的描述综合判断。
${p.isBlank ? "" : "- 如果你怀疑自己才是少数派(卧底)，就策略性地把票投给一个看起来可疑的平民来转移视线。\n"}
先在 reasoning 里写出推理(可以点名“某人第几轮那句话”作依据)，再在 vote 里选一个在场玩家名(必须是上面列出的、且不是你自己)，voteReason 用一句话(不超过30字、口语、带点你的性格)。${MEMORY_INSTRUCTION}`;
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
