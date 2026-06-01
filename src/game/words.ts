import type { WordPair } from "./types";

// Word bank. Each pair is tagged with a theme and difficulty
// (1 = far apart / easy, 2 = medium, 3 = very close / hard).
export const WORD_PAIRS: WordPair[] = [
  // 饮食
  { id: "milk-soymilk", civ: "牛奶", spy: "豆浆", theme: "饮食", difficulty: 2 },
  { id: "cola-sprite", civ: "可乐", spy: "雪碧", theme: "饮食", difficulty: 2 },
  { id: "hotpot-malatang", civ: "火锅", spy: "麻辣烫", theme: "饮食", difficulty: 2 },
  { id: "dumpling-bun", civ: "饺子", spy: "包子", theme: "饮食", difficulty: 2 },
  { id: "coffee-tea", civ: "咖啡", spy: "奶茶", theme: "饮食", difficulty: 1 },
  { id: "icecream-popsicle", civ: "冰淇淋", spy: "雪糕", theme: "饮食", difficulty: 3 },
  { id: "ketchup-chili", civ: "番茄酱", spy: "辣椒酱", theme: "饮食", difficulty: 2 },
  { id: "noodle-ricenoodle", civ: "面条", spy: "米粉", theme: "饮食", difficulty: 2 },
  // 水果
  { id: "strawberry-raspberry", civ: "草莓", spy: "树莓", theme: "水果", difficulty: 3 },
  { id: "orange-tangerine", civ: "橙子", spy: "橘子", theme: "水果", difficulty: 3 },
  { id: "watermelon-melon", civ: "西瓜", spy: "哈密瓜", theme: "水果", difficulty: 2 },
  { id: "grape-raisin", civ: "葡萄", spy: "提子", theme: "水果", difficulty: 3 },
  // 动物
  { id: "cat-tiger", civ: "猫", spy: "老虎", theme: "动物", difficulty: 1 },
  { id: "dog-wolf", civ: "狗", spy: "狼", theme: "动物", difficulty: 2 },
  { id: "rabbit-hamster", civ: "兔子", spy: "仓鼠", theme: "动物", difficulty: 2 },
  { id: "dolphin-shark", civ: "海豚", spy: "鲨鱼", theme: "动物", difficulty: 1 },
  { id: "crow-magpie", civ: "乌鸦", spy: "喜鹊", theme: "动物", difficulty: 2 },
  // 科技数码
  { id: "wechat-qq", civ: "微信", spy: "QQ", theme: "科技", difficulty: 2 },
  { id: "laptop-tablet", civ: "笔记本电脑", spy: "平板电脑", theme: "科技", difficulty: 2 },
  { id: "phone-pad", civ: "手机", spy: "对讲机", theme: "科技", difficulty: 1 },
  { id: "mouse-trackpad", civ: "鼠标", spy: "触控板", theme: "科技", difficulty: 2 },
  { id: "headphone-speaker", civ: "耳机", spy: "音箱", theme: "科技", difficulty: 2 },
  { id: "camera-phone", civ: "相机", spy: "摄像头", theme: "科技", difficulty: 2 },
  // 交通
  { id: "subway-hsr", civ: "地铁", spy: "高铁", theme: "交通", difficulty: 2 },
  { id: "bike-motorbike", civ: "自行车", spy: "摩托车", theme: "交通", difficulty: 2 },
  { id: "bus-coach", civ: "公交车", spy: "大巴", theme: "交通", difficulty: 3 },
  { id: "boat-ship", civ: "小船", spy: "轮船", theme: "交通", difficulty: 2 },
  { id: "plane-helicopter", civ: "飞机", spy: "直升机", theme: "交通", difficulty: 1 },
  // 影视/人物
  { id: "spiderman-batman", civ: "蜘蛛侠", spy: "蝙蝠侠", theme: "影视", difficulty: 1 },
  { id: "wukong-nezha", civ: "孙悟空", spy: "哪吒", theme: "影视", difficulty: 1 },
  { id: "ironman-superman", civ: "钢铁侠", spy: "超人", theme: "影视", difficulty: 2 },
  // 职业
  { id: "police-guard", civ: "警察", spy: "保安", theme: "职业", difficulty: 1 },
  { id: "doctor-nurse", civ: "医生", spy: "护士", theme: "职业", difficulty: 2 },
  { id: "teacher-professor", civ: "老师", spy: "教授", theme: "职业", difficulty: 3 },
  { id: "chef-baker", civ: "厨师", spy: "面包师", theme: "职业", difficulty: 2 },
  // 日用
  { id: "lipstick-balm", civ: "口红", spy: "唇膏", theme: "日用", difficulty: 3 },
  { id: "umbrella-raincoat", civ: "雨伞", spy: "雨衣", theme: "日用", difficulty: 2 },
  { id: "towel-tissue", civ: "毛巾", spy: "纸巾", theme: "日用", difficulty: 2 },
  { id: "soap-shampoo", civ: "肥皂", spy: "洗发水", theme: "日用", difficulty: 2 },
  // 乐器/运动
  { id: "piano-epiano", civ: "钢琴", spy: "电子琴", theme: "乐器", difficulty: 3 },
  { id: "guitar-ukulele", civ: "吉他", spy: "尤克里里", theme: "乐器", difficulty: 2 },
  { id: "basketball-volleyball", civ: "篮球", spy: "排球", theme: "运动", difficulty: 2 },
  { id: "pingpong-tennis", civ: "乒乓球", spy: "网球", theme: "运动", difficulty: 2 },
  { id: "swim-dive", civ: "游泳", spy: "跳水", theme: "运动", difficulty: 2 },
];

export const THEMES: string[] = Array.from(new Set(WORD_PAIRS.map((w) => w.theme!).filter(Boolean)));

const shuffle = <T,>(a: T[]) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

export interface WordFilter {
  theme?: string | null; // null/undefined = any
  difficulty?: number | null; // null/undefined = any
}

export function filterWordPairs(f: WordFilter): WordPair[] {
  return WORD_PAIRS.filter(
    (w) => (!f.theme || w.theme === f.theme) && (!f.difficulty || w.difficulty === f.difficulty),
  );
}

// Pick a pair: explicit id wins; otherwise random within the filter (falls back
// to the whole bank if a filter matches nothing).
export function getWordPair(id: string | null, filter?: WordFilter): WordPair {
  if (id) {
    const found = WORD_PAIRS.find((w) => w.id === id);
    if (found) return found;
  }
  const pool = filter ? filterWordPairs(filter) : WORD_PAIRS;
  const arr = pool.length > 0 ? pool : WORD_PAIRS;
  return shuffle(arr)[0];
}
