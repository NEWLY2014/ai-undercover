// Different "ways of thinking" for agents. Each style is a REASONING SCAFFOLD
// injected into the agent's prompt — it shapes HOW the agent is told to think,
// it does not decide WHAT it concludes (iron law: no substituting agent judgment).

export interface ThinkingStyle {
  key: string;
  label: string;
  scaffold: string; // injected into prompts (zh)
  scaffoldEn: string; // injected into prompts (en)
}

export const THINKING_STYLES: ThinkingStyle[] = [
  {
    key: "balanced",
    label: "均衡型",
    scaffold: "你综合运用逻辑与直觉，平衡地参与讨论，不偏激。",
    scaffoldEn: "You blend logic and intuition, taking part in a balanced way without going to extremes.",
  },
  {
    key: "deduction",
    label: "演绎型",
    scaffold: "你偏好严密的逻辑推理：死抠每个人描述里的矛盾与不一致，用排除法一步步锁定最可疑的人。",
    scaffoldEn: "You favor tight deduction: pick at every contradiction and inconsistency in people's clues, and narrow down the most suspect by elimination.",
  },
  {
    key: "intuition",
    label: "直觉型",
    scaffold: "你凭语感和第一直觉判断，关注谁的描述“感觉不对劲”，不纠结细枝末节。",
    scaffoldEn: "You go by feel and first instinct, watching for whoever's clue \"feels off,\" not fussing over fine details.",
  },
  {
    key: "schemer",
    label: "心机型",
    scaffold: "你擅长伪装与误导：发言刻意模糊、留有余地，并伺机把矛头引向别人，优先保全自己。",
    scaffoldEn: "You're skilled at disguise and misdirection: keep your clues deliberately vague with room to spare, and steer suspicion onto others to protect yourself first.",
  },
  {
    key: "probabilistic",
    label: "概率型",
    scaffold: "你像在做概率计算：综合全部线索为每个人估一个可疑度，再选可疑度最高的下手。",
    scaffoldEn: "You think like a probability engine: weigh all the clues to estimate a suspicion level for each player, then move on the highest.",
  },
  {
    key: "conservative",
    label: "保守型",
    scaffold: "你惜字如金：描述尽量安全、不出错、不暴露；投票时倾向跟随多数人的合理判断。",
    scaffoldEn: "You're sparing with words: keep clues safe, error-free, and unrevealing; when voting, lean toward the crowd's reasonable read.",
  },
];

const BY_KEY = new Map(THINKING_STYLES.map((s) => [s.key, s]));

export function thinkingStyleScaffold(key: string | undefined, locale: "zh" | "en" = "zh"): string {
  if (!key) return "";
  const s = BY_KEY.get(key);
  if (!s) return "";
  return locale === "en" ? s.scaffoldEn : s.scaffold;
}

export function thinkingStyleLabel(key: string | undefined): string {
  if (!key) return "均衡型";
  return BY_KEY.get(key)?.label ?? "均衡型";
}
