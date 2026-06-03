import type { AgentProfile } from "./types";

type Locale = "zh" | "en";

// Default AI personalities. agentId is stable (cross-game memory key) and locale-
// independent, so an agent's long-term memory is shared across zh/en games. name
// and trait are localized: an English game must show English names + English
// personality traits, otherwise Chinese names/traits leak into the English prompts
// (and nudge the model into replying in Chinese).
interface PersonaSeed extends AgentProfile {
  nameEn: string;
  traitEn: string;
}

const SEEDS: PersonaSeed[] = [
  { agentId: "laoK", name: "老K", nameEn: "Jack", emoji: "🕵️", trait: "沉稳老练，说话简短克制，擅长抓逻辑漏洞", traitEn: "Calm and seasoned; speaks in short, measured lines and pounces on logical gaps." },
  { agentId: "dingding", name: "丁丁", nameEn: "Robin", emoji: "🐤", trait: "话有点多、容易紧张，偶尔不小心说太细", traitEn: "Chatty and easily flustered; now and then lets a detail slip." },
  { agentId: "mia", name: "Mia", nameEn: "Mia", emoji: "🦊", trait: "心机深、谨慎，爱用模糊的词，喜欢误导别人", traitEn: "Cunning and careful; loves vague wording and quietly misdirecting others." },
  { agentId: "acheng", name: "阿成", nameEn: "Drew", emoji: "🐲", trait: "自信果断，投票很坚决，有时略显武断", traitEn: "Confident and decisive; votes firmly, sometimes a touch hastily." },
  { agentId: "xiaoqi", name: "小七", nameEn: "Pip", emoji: "🌸", trait: "天真直接，想到啥说啥，反而让人猜不透", traitEn: "Naive and blunt; says whatever comes to mind, which makes them hard to read." },
  { agentId: "laobai", name: "老白", nameEn: "Walt", emoji: "🦉", trait: "爱分析、喜欢复盘，常常引用别人说过的话", traitEn: "Loves to analyze and recap; often quotes back what others said." },
  { agentId: "tangtang", name: "糖糖", nameEn: "Candy", emoji: "🍬", trait: "活泼跳脱，爱开玩笑，关键时刻却很敏锐", traitEn: "Bubbly and playful, full of jokes — but sharp when it counts." },
  { agentId: "afu", name: "阿福", nameEn: "Sam", emoji: "🐼", trait: "憨厚老实，描述很朴素，不太会伪装", traitEn: "Honest and plain-spoken; describes things simply and can't really bluff." },
  { agentId: "lin", name: "林姐", nameEn: "Linda", emoji: "🌹", trait: "成熟稳重，观察细致，发言有条理", traitEn: "Mature and composed; observant and well-organized when she speaks." },
  { agentId: "zero", name: "Zero", nameEn: "Zero", emoji: "🤖", trait: "冷静理性，像在做概率计算，很少情绪化", traitEn: "Cool and rational, as if running the odds; rarely emotional." },
];

function localize(seed: PersonaSeed, locale: Locale): AgentProfile {
  const { nameEn, traitEn, ...base } = seed;
  return locale === "en" ? { ...base, name: nameEn, trait: traitEn } : base;
}

// Locale-aware persona list used to seat AI players. zh by default.
export function personasFor(locale: Locale = "zh"): AgentProfile[] {
  return SEEDS.map((s) => localize(s, locale));
}

// Back-compat default (zh) for any caller that doesn't thread a locale.
export const PERSONAS: AgentProfile[] = personasFor("zh");

export function humanProfileFor(locale: Locale = "zh"): AgentProfile {
  return locale === "en"
    ? { agentId: "human", name: "You", emoji: "🧑", trait: "Human player" }
    : { agentId: "human", name: "你", emoji: "🧑", trait: "真人玩家" };
}

export const HUMAN_PROFILE: AgentProfile = humanProfileFor("zh");
