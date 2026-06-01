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

export interface DescribePayload extends AgentContext {
  name: string;
  trait: string;
  word: string;
  round: number;
  transcript: string;
}

export function buildDescribePrompt(p: DescribePayload): string {
  if (p.isBlank) {
    return `${GAME_RULES}

${personaBlock(p.name, p.trait, p)}

⚠️ 你是【白板】：你没有拿到任何词！场上多数人是平民(同一个词)，还藏着卧底(另一个词)，而你两个词都不知道。

目前本局已经说过的描述(按顺序)：
${p.transcript || "(还没有人描述，你较早发言——这对白板很不利)"}

请给出你这一轮(第 ${p.round} 轮)的描述。作为白板，你的任务是：
1. 根据别人已经说过的描述，推测大家大概在说什么东西；
2. 含糊、安全地跟着描述一句(一句话、不超过25字)，既要像“我也有词”，又不能说得太具体而露馅；
3. 如果你较早发言、还没线索，就说一句极其笼统、放之四海皆可的话；
4. 目标：别被认出你是白板。

先在 reasoning 里写你的推测与策略，再给出 clue。${MEMORY_INSTRUCTION}`;
  }
  return `${GAME_RULES}

${personaBlock(p.name, p.trait, p)}

你拿到的词是：【${p.word}】

目前本局已经说过的描述(按顺序)：
${p.transcript || "(还没有人描述，你较早发言)"}

请给出你这一轮(第 ${p.round} 轮)的描述。要求：
1. 一句话，不超过 25 字，语气符合你的性格；
2. 【最重要】直接描述这个事物本身能被感知的具体特征——外观、材质、味道、使用场景、用途、给人的感觉等，像在给别人出谜面，让人能据此联想到具体东西；
3. 【禁止】不要说“我的词/这个东西/它如同……”这类元层面空话，也不要用“一场盛宴”“一部电影”“一幅地图”这种空泛比喻来代替描述；
4. 绝对不能出现“${p.word}”这几个字或它明显的谐音/拆字；
5. 如果你发现别人描述的东西好像和你的词不太一样，你可能就是卧底——这时要小心伪装，顺着大家的方向说，别露馅；
6. 绝对不要和别人(或自己上一轮)已经说过的描述字面重复，也不要说“和上面一样”“同上”这类偷懒的话；要给出新的角度。

示例(假设词是“雨伞”)——✅好：“下雨天出门必带，一撑就开。”　❌差：“我的词是一件很常见的东西。”

先在 reasoning 里简短写出你的思考，再给出符合上面要求的 clue。${MEMORY_INSTRUCTION}`;
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

请综合所有描述判断谁最可能是卧底。如果你怀疑自己可能才是卧底(别人描述的东西和你的词对不上)，就策略性地把票投给一个看起来可疑的平民来转移视线。

先在 reasoning 里简短写出你的推理，再在 vote 里选一个在场玩家名(必须是上面列出的、且不是你自己)，并在 voteReason 里用一句话(不超过30字、符合你性格)说明理由。${MEMORY_INSTRUCTION}`;
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

请总结 1-3 条具体、可复用的经验教训(例如：作为卧底第一轮描述应该多模糊、发现自己是少数派时如何转移视线、什么样的描述容易暴露/容易蒙混等)。
- 每条一句话，具体可操作，避免“要更小心”这种空话。
- 放进 learnings 数组。`;
}
