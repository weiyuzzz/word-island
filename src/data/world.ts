import type { EventKind } from "@/lib/game/model";
import type { QuizMode, Reward } from "@/lib/types";

export interface MonsterConfig {
  key: string;
  name: string;
  hp: number;
  art: "crab" | "slime" | "beast" | "golem" | "serpent" | "dragon";
  flavor: string;
}

export const MONSTERS: Record<string, MonsterConfig> = {
  crab_king: { key: "crab_king", name: "巨钳海蟹", hp: 72, art: "crab", flavor: "它用钳子夹走了你的单词卡！" },
  moss_slime: { key: "moss_slime", name: "苔藓史莱姆", hp: 66, art: "slime", flavor: "软软的，但词汇量惊人。" },
  night_beast: { key: "night_beast", name: "森林夜兽", hp: 90, art: "beast", flavor: "它只在你忘记单词时出现。" },
  stone_golem: { key: "stone_golem", name: "遗迹石像", hp: 110, art: "golem", flavor: "碑文上刻满了同义词。" },
  sea_serpent: { key: "sea_serpent", name: "港湾海蟒", hp: 100, art: "serpent", flavor: "它从水下偷听你的发音。" },
  ridge_dragon: { key: "ridge_dragon", name: "山岭巨龙", hp: 140, art: "dragon", flavor: "只有真正的学习者才能击败它。" },
  word_keeper: { key: "word_keeper", name: "守词者", hp: 120, art: "golem", flavor: "区域首领：精通多种题型。" },
  word_king: { key: "word_king", name: "词汇之王", hp: 165, art: "dragon", flavor: "山脉首领：综合考验全部词汇。" },
};

export interface NpcConfig {
  key: string;
  name: string;
  role: string;
  icon: "fish" | "store" | "compass" | "book" | "ship";
  greeting: string;
  lines: string[];
}

export const NPCS: Record<string, NpcConfig> = {
  fisherman: {
    key: "fisherman",
    name: "阿海",
    role: "渔夫",
    icon: "fish",
    greeting: "潮水送来了新的单词，年轻人，帮我认认？",
    lines: [
      "每记住一个单词，海上的雾就散一分。",
      "我年轻时也背过单词，可惜现在只记得 fish。",
      "答错了没关系，那张词卡会在复习时再回到你手上。",
    ],
  },
  merchant: {
    key: "merchant",
    name: "茉莉",
    role: "商人",
    icon: "store",
    greeting: "我的账本全是英文，帮我读懂它，报酬好说。",
    lines: ["知识是最好的货币。", "宝箱？先解开上面的英文谜题再说。", "熟练掌握的单词，才卖得出好价钱。"],
  },
  explorer: {
    key: "explorer",
    name: "洛克",
    role: "探险家",
    icon: "compass",
    greeting: "前方有怪物出没，我们得靠词汇的力量闯过去。",
    lines: ["地图上每个区域都藏着不同的词库。", "别怕答错，探索本来就是试错。", "把怪物打倒，它们会掉落金币和道具。"],
  },
  librarian: {
    key: "librarian",
    name: "林",
    role: "图书管理员",
    icon: "book",
    greeting: "遗迹里的碑文写着同义词与词根的秘密。",
    lines: ["同义词辨析是理解文章的关键。", "你的词汇花园我看了，长势不错。", "掌握 500 词，你会成为传说。"],
  },
  captain: {
    key: "captain",
    name: "艾伦",
    role: "船长",
    icon: "ship",
    greeting: "买下我的船，就能去听海上的英文信号了。",
    lines: ["听音辨词，是水手的基本功。", "拼写正确，才能把信送到对的岛屿。", "风向变了，出海前再复习几个词吧。"],
  },
};

export type QuestMetric = "correct" | "spelling" | "monsters" | "treasures" | "review" | "mastered";

export interface QuestDef {
  key: string;
  npcKey: string;
  title: string;
  description: string;
  metric: QuestMetric;
  target: number;
  reward: Reward;
  itemReward?: string;
}

export const QUESTS: QuestDef[] = [
  { key: "q_catch_words", npcKey: "fisherman", title: "渔网里的单词", description: "在探索中答对 3 道题", metric: "correct", target: 3, reward: { coins: 40, xp: 25 } },
  { key: "q_spell_net", npcKey: "fisherman", title: "修补渔网", description: "完成 2 次拼写挑战并答对", metric: "spelling", target: 2, reward: { coins: 55, xp: 30 }, itemReward: "energy_tea" },
  { key: "q_ledger", npcKey: "merchant", title: "读懂账本", description: "完成 5 次有效复习", metric: "review", target: 5, reward: { coins: 60, xp: 35 } },
  { key: "q_treasure", npcKey: "merchant", title: "找回商队宝箱", description: "在探索中找到 1 个宝箱", metric: "treasures", target: 1, reward: { coins: 70, xp: 30 }, itemReward: "lucky_charm" },
  { key: "q_hunt", npcKey: "explorer", title: "驱散怪物", description: "击败 2 只怪物", metric: "monsters", target: 2, reward: { coins: 80, xp: 45 } },
  { key: "q_deep", npcKey: "explorer", title: "深入腹地", description: "累计答对 10 道探索题目", metric: "correct", target: 10, reward: { coins: 100, xp: 55 }, itemReward: "explorer_kit" },
  { key: "q_master", npcKey: "librarian", title: "碑文研究", description: "掌握 5 个单词", metric: "mastered", target: 5, reward: { coins: 90, xp: 50 } },
  { key: "q_syn", npcKey: "librarian", title: "同义词迷宫", description: "在探索中答对 5 道题", metric: "correct", target: 5, reward: { coins: 75, xp: 40 } },
  { key: "q_sea", npcKey: "captain", title: "海上信号", description: "击败 3 只怪物", metric: "monsters", target: 3, reward: { coins: 120, xp: 60 }, itemReward: "guard_charm" },
  { key: "q_voyage", npcKey: "captain", title: "远洋补给", description: "完成 10 次有效复习", metric: "review", target: 10, reward: { coins: 130, xp: 70 } },
];

export interface RegionDef {
  key: string;
  name: string;
  subtitle: string;
  description: string;
  unlock: { level?: number; learned?: number; item?: string };
  deckSlugs: string[];
  difficulty: [number, number];
  modes: QuizMode[];
  monsters: string[];
  boss: string;
  npcs: string[];
  plans: EventKind[][];
  mapLabel: { x: number; y: number };
  tint: string;
  position: "island" | "voyage";
}

export const REGIONS: RegionDef[] = [
  {
    key: "beach",
    name: "沙滩",
    subtitle: "基础英语词汇",
    description: "阳光、贝壳与最常用的英语单词。适合作为冒险的起点。",
    unlock: {},
    deckSlugs: ["basic"],
    difficulty: [1, 2],
    modes: ["en2zh", "listen", "spelling", "sentence"],
    monsters: ["crab_king"],
    boss: "word_keeper",
    npcs: ["fisherman", "merchant"],
    plans: [
      ["monster", "npc", "treasure", "npc", "rest", "boss"],
      ["npc", "monster", "bottle", "npc", "rest", "boss"],
    ],
    mapLabel: { x: 618, y: 566 },
    tint: "#f2ddad",
    position: "island",
  },
  {
    key: "forest",
    name: "森林",
    subtitle: "IELTS 高频词汇",
    description: "茂密的森林里藏着雅思高频词，怪物也更聪明。",
    unlock: { level: 2, learned: 10 },
    deckSlugs: ["ielts-core"],
    difficulty: [2, 3],
    modes: ["zh2en", "en2zh", "context", "listen"],
    monsters: ["moss_slime", "night_beast"],
    boss: "word_keeper",
    npcs: ["explorer", "librarian"],
    plans: [
      ["monster", "npc", "cave", "npc", "treasure", "rest", "boss"],
      ["npc", "monster", "treasure", "npc", "bottle", "rest", "boss"],
    ],
    mapLabel: { x: 366, y: 318 },
    tint: "#8fd19b",
    position: "island",
  },
  {
    key: "ruins",
    name: "神秘遗迹",
    subtitle: "词根、词缀与同义词",
    description: "碑文记录着构词的秘密。这里以同义词、反义词和语境题为主。",
    unlock: { level: 4, learned: 30 },
    deckSlugs: ["ielts-reading", "ielts-writing"],
    difficulty: [3, 4],
    modes: ["synonym", "antonym", "sentence", "context"],
    monsters: ["stone_golem"],
    boss: "word_keeper",
    npcs: ["librarian"],
    plans: [
      ["monster", "stone", "npc", "monster", "npc", "rest", "boss"],
      ["stone", "monster", "npc", "bottle", "npc", "rest", "boss"],
    ],
    mapLabel: { x: 622, y: 356 },
    tint: "#cbb9e6",
    position: "island",
  },
  {
    key: "harbor",
    name: "港口",
    subtitle: "听力与单词拼写",
    description: "海风里飘着英文信号。以听音辨词和拼写挑战为主（需要先买下小船）。",
    unlock: { item: "sailboat" },
    deckSlugs: ["ielts-speaking"],
    difficulty: [2, 3],
    modes: ["listen", "spelling", "zh2en", "sentence"],
    monsters: ["sea_serpent"],
    boss: "word_keeper",
    npcs: ["captain", "merchant"],
    plans: [
      ["monster", "bottle", "npc", "monster", "npc", "rest", "boss"],
      ["npc", "monster", "treasure", "npc", "bottle", "rest", "boss"],
    ],
    mapLabel: { x: 902, y: 396 },
    tint: "#8ec9e8",
    position: "island",
  },
  {
    key: "mountain",
    name: "山脉",
    subtitle: "高难度词汇与综合挑战",
    description: "词汇之王守在山顶。只有综合运用各种题型才能登顶。",
    unlock: { level: 8, learned: 100 },
    deckSlugs: ["ielts-core", "ielts-reading", "ielts-writing"],
    difficulty: [3, 5],
    modes: ["en2zh", "zh2en", "spelling", "context", "synonym", "antonym", "sentence", "listen"],
    monsters: ["stone_golem", "ridge_dragon"],
    boss: "word_king",
    npcs: ["explorer", "librarian"],
    plans: [
      ["monster", "cave", "monster", "npc", "rest", "npc", "boss"],
      ["monster", "stone", "monster", "npc", "cave", "npc", "boss"],
    ],
    mapLabel: { x: 762, y: 226 },
    tint: "#b7c2cf",
    position: "island",
  },
  {
    key: "voyage",
    name: "远洋群岛",
    subtitle: "航海探索 · 混合词库",
    description: "乘船出海才能抵达的新岛屿，词汇来自全部词库，难度更高。",
    unlock: { item: "sailboat", level: 6, learned: 60 },
    deckSlugs: ["ielts-core", "ielts-reading", "ielts-writing", "ielts-speaking", "basic"],
    difficulty: [2, 5],
    modes: ["listen", "synonym", "antonym", "context", "spelling", "sentence", "zh2en"],
    monsters: ["sea_serpent", "ridge_dragon"],
    boss: "word_king",
    npcs: ["captain", "explorer", "merchant"],
    plans: [
      ["monster", "bottle", "monster", "npc", "rest", "npc", "boss"],
      ["monster", "stone", "monster", "treasure", "npc", "npc", "boss"],
    ],
    mapLabel: { x: 216, y: 636 },
    tint: "#9ad9c8",
    position: "voyage",
  },
];

export function getRegion(key: string): RegionDef | undefined {
  return REGIONS.find((r) => r.key === key);
}

export function getQuest(key: string): QuestDef | undefined {
  return QUESTS.find((q) => q.key === key);
}

export function questsForNpc(npcKey: string): QuestDef[] {
  return QUESTS.filter((q) => q.npcKey === npcKey);
}

export const EVENT_META: Record<EventKind, { label: string; hint: string }> = {
  monster: { label: "遭遇怪物", hint: "答对题目即可造成伤害" },
  boss: { label: "首领战", hint: "综合题型，打败它获得稀有奖励" },
  npc: { label: "遇见 NPC", hint: "对话并完成他的单词挑战" },
  treasure: { label: "发现宝箱", hint: "拼写正确才能打开宝箱" },
  bottle: { label: "漂流瓶", hint: "听懂 / 读懂瓶中的英文线索" },
  stone: { label: "神秘石碑", hint: "辨析同义词与反义词" },
  cave: { label: "隐藏洞穴", hint: "用语境填空解开洞口的谜题" },
  rest: { label: "营地休息", hint: "快速回忆一个单词，恢复 1 点体力" },
};
