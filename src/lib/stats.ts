// Player stats + achievements for the current session, persisted in
// sessionStorage. No accounts, no server — purely the tab session's record:
// stats survive consecutive games and reloads, and reset when the tab/browser closes.

import type { Player, Winner } from "@/game/types";

const KEY = "undercover:stats";

export interface Stats {
  games: number;
  civWins: number;
  spyWins: number;

  // human-at-table mode
  humanGames: number;
  humanWins: number;
  humanSpyGames: number;
  humanSpyWins: number;

  // spectator betting (guessing the spy)
  bets: number;
  betsCorrect: number;

  // "your success" streak (human win, or correct bet in spectator mode)
  currentStreak: number;
  bestStreak: number;

  blankGames: number;
  achievements: string[]; // unlocked achievement ids
}

export const EMPTY_STATS: Stats = {
  games: 0,
  civWins: 0,
  spyWins: 0,
  humanGames: 0,
  humanWins: 0,
  humanSpyGames: 0,
  humanSpyWins: 0,
  bets: 0,
  betsCorrect: 0,
  currentStreak: 0,
  bestStreak: 0,
  blankGames: 0,
  achievements: [],
};

export interface Achievement {
  id: string;
  label: string;
  desc: string;
  test: (s: Stats) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_win", label: "首战告捷", desc: "第一次取得胜利(你赢或押中卧底)", test: (s) => s.humanWins + s.betsCorrect >= 1 },
  { id: "veteran", label: "老牌玩家", desc: "累计玩满 10 局", test: (s) => s.games >= 10 },
  { id: "streak3", label: "三连胜", desc: "连续 3 局成功", test: (s) => s.bestStreak >= 3 },
  { id: "detective", label: "神探", desc: "累计押中卧底 5 次", test: (s) => s.betsCorrect >= 5 },
  { id: "spy_master", label: "卧底之王", desc: "作为卧底取胜 3 次", test: (s) => s.humanSpyWins >= 3 },
  { id: "both_sides", label: "两面通吃", desc: "平民阵营与卧底阵营各见证一次胜利", test: (s) => s.civWins >= 1 && s.spyWins >= 1 },
];

export function loadStats(): Stats {
  if (typeof window === "undefined") return { ...EMPTY_STATS };
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return { ...EMPTY_STATS };
    return { ...EMPTY_STATS, ...(JSON.parse(raw) as Partial<Stats>) };
  } catch {
    return { ...EMPTY_STATS };
  }
}

function save(s: Stats) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* non-fatal */
  }
}

export interface GameResult {
  winner: Winner; // "civ" | "spy"
  players: Player[];
  spectatorBet?: { made: boolean; correct: boolean }; // only in spectator mode
}

// Record one finished game. Returns the updated stats and any newly-unlocked
// achievement ids (for a toast / highlight).
export function recordGame(result: GameResult): { stats: Stats; newlyUnlocked: string[] } {
  const s = loadStats();
  const { winner, players } = result;
  if (winner !== "civ" && winner !== "spy") return { stats: s, newlyUnlocked: [] };

  s.games += 1;
  if (winner === "civ") s.civWins += 1;
  else s.spyWins += 1;
  if (players.some((p) => p.role === "blank")) s.blankGames += 1;

  const human = players.find((p) => p.kind === "human");
  let success: boolean | null = null; // did "you" succeed this game?

  if (human) {
    s.humanGames += 1;
    const humanWon = (human.isSpy && winner === "spy") || (!human.isSpy && winner === "civ");
    if (humanWon) s.humanWins += 1;
    if (human.isSpy) {
      s.humanSpyGames += 1;
      if (winner === "spy") s.humanSpyWins += 1;
    }
    success = humanWon;
  } else if (result.spectatorBet?.made) {
    s.bets += 1;
    if (result.spectatorBet.correct) s.betsCorrect += 1;
    success = result.spectatorBet.correct;
  }

  if (success === true) {
    s.currentStreak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.currentStreak);
  } else if (success === false) {
    s.currentStreak = 0;
  } // success === null (spectator with no bet) leaves streak unchanged

  const before = new Set(s.achievements);
  s.achievements = ACHIEVEMENTS.filter((a) => a.test(s)).map((a) => a.id);
  const newlyUnlocked = s.achievements.filter((id) => !before.has(id));

  save(s);
  return { stats: s, newlyUnlocked };
}

export function resetStats() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(KEY);
}
