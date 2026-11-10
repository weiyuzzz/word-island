export type BuildingCategory = "building" | "decoration";
export type Terrain = "land" | "beach" | "any";

export interface BuildingDef {
  type: string;
  name: string;
  category: BuildingCategory;
  description: string;
  unlockLevel: number;
  buildCost: number;
  /** 升到 Lv2、Lv3 … 的费用 */
  upgradeCosts: number[];
  unique: boolean;
  terrain: Terrain;
  levelNotes: string[];
}

export const BUILDING_CATALOG: BuildingDef[] = [
  {
    type: "cabin",
    name: "小木屋",
    category: "building",
    description: "岛主的家，一切从这里开始。",
    unlockLevel: 1,
    buildCost: 0,
    upgradeCosts: [80, 160],
    unique: true,
    terrain: "land",
    levelNotes: ["温馨的小屋", "加盖烟囱与花箱", "两层小楼与门廊"],
  },
  {
    type: "tree",
    name: "果树",
    category: "decoration",
    description: "结满果实的小树，让岛屿更有生机。",
    unlockLevel: 1,
    buildCost: 30,
    upgradeCosts: [40],
    unique: false,
    terrain: "land",
    levelNotes: ["幼苗长成小树", "硕果累累"],
  },
  {
    type: "flowers",
    name: "花丛",
    category: "decoration",
    description: "一簇色彩缤纷的小花。",
    unlockLevel: 1,
    buildCost: 20,
    upgradeCosts: [],
    unique: false,
    terrain: "land",
    levelNotes: ["点缀草地"],
  },
  {
    type: "palm",
    name: "棕榈树",
    category: "decoration",
    description: "海边的棕榈树，随风摇曳。",
    unlockLevel: 1,
    buildCost: 40,
    upgradeCosts: [],
    unique: false,
    terrain: "any",
    levelNotes: ["沙滩标配"],
  },
  {
    type: "bench",
    name: "长椅",
    category: "decoration",
    description: "坐下来背几个单词吧。",
    unlockLevel: 2,
    buildCost: 35,
    upgradeCosts: [],
    unique: false,
    terrain: "land",
    levelNotes: ["休息角落"],
  },
  {
    type: "library",
    name: "单词图书馆",
    category: "building",
    description: "收藏你掌握的每一个单词，展示学习成果。",
    unlockLevel: 3,
    buildCost: 150,
    upgradeCosts: [200, 300],
    unique: true,
    terrain: "land",
    levelNotes: ["小小阅览室", "加盖穹顶", "双翼藏书楼"],
  },
  {
    type: "fountain",
    name: "喷泉",
    category: "decoration",
    description: "广场中央的喷泉，水花四溅。",
    unlockLevel: 4,
    buildCost: 120,
    upgradeCosts: [],
    unique: true,
    terrain: "land",
    levelNotes: ["岛屿地标"],
  },
  {
    type: "garden",
    name: "花园",
    category: "building",
    description: "精心打理的花园，让岛屿更加精致。",
    unlockLevel: 5,
    buildCost: 60,
    upgradeCosts: [90, 140],
    unique: false,
    terrain: "land",
    levelNotes: ["围栏小花园", "添加小温室", "花园拱门"],
  },
  {
    type: "campfire",
    name: "篝火",
    category: "decoration",
    description: "夜晚沙滩上的温暖篝火。",
    unlockLevel: 5,
    buildCost: 50,
    upgradeCosts: [],
    unique: false,
    terrain: "any",
    levelNotes: ["温暖的火光"],
  },
  {
    type: "boat",
    name: "小船",
    category: "decoration",
    description: "停靠在沙滩上的小木船。",
    unlockLevel: 6,
    buildCost: 90,
    upgradeCosts: [],
    unique: false,
    terrain: "beach",
    levelNotes: ["出海的准备"],
  },
  {
    type: "windmill",
    name: "风车",
    category: "building",
    description: "转动的风车，为岛屿带来能量。",
    unlockLevel: 6,
    buildCost: 220,
    upgradeCosts: [260, 320],
    unique: true,
    terrain: "land",
    levelNotes: ["木质风车", "石砌底座", "彩绘风叶"],
  },
  {
    type: "lighthouse",
    name: "灯塔",
    category: "building",
    description: "成就建筑，照亮夜晚的海面。",
    unlockLevel: 8,
    buildCost: 400,
    upgradeCosts: [450, 550],
    unique: true,
    terrain: "any",
    levelNotes: ["红白灯塔", "更高的塔身", "守塔人小屋"],
  },
  {
    type: "market",
    name: "集市",
    category: "building",
    description: "热闹的集市，岛上的居民都来了。",
    unlockLevel: 10,
    buildCost: 500,
    upgradeCosts: [550, 650],
    unique: true,
    terrain: "land",
    levelNotes: ["一个小摊位", "两个摊位", "彩旗飘扬的集市"],
  },
  {
    type: "statue",
    name: "雕像",
    category: "decoration",
    description: "纪念勤奋学习者的雕像。",
    unlockLevel: 12,
    buildCost: 200,
    upgradeCosts: [],
    unique: true,
    terrain: "land",
    levelNotes: ["荣耀象征"],
  },
  {
    type: "castle",
    name: "城堡",
    category: "building",
    description: "岛屿的最高荣耀，只有坚持不懈的学习者才能建成。",
    unlockLevel: 15,
    buildCost: 1200,
    upgradeCosts: [1500, 2000],
    unique: true,
    terrain: "land",
    levelNotes: ["石砌城堡", "双塔城堡", "王者城堡"],
  },
];

export interface IslandSlot {
  id: number;
  x: number;
  y: number;
  scale: number;
  terrain: "land" | "beach";
  /** 解锁条件：等级 + 累计已学词数；未设置则随岛开放 */
  unlock?: { level: number; learned: number };
}

/** 岛屿场景的建造点（viewBox 1000×640）：1-12 初始开放，13-24 随等级与词量解锁，岛屿逐渐变大 */
export const ISLAND_SLOTS: IslandSlot[] = [
  { id: 1, x: 340, y: 262, scale: 0.72, terrain: "land" },
  { id: 2, x: 500, y: 248, scale: 0.72, terrain: "land" },
  { id: 3, x: 660, y: 262, scale: 0.72, terrain: "land" },
  { id: 4, x: 255, y: 340, scale: 0.84, terrain: "land" },
  { id: 5, x: 420, y: 335, scale: 0.84, terrain: "land" },
  { id: 6, x: 590, y: 335, scale: 0.84, terrain: "land" },
  { id: 7, x: 755, y: 345, scale: 0.84, terrain: "land" },
  { id: 8, x: 330, y: 425, scale: 0.95, terrain: "land" },
  { id: 9, x: 500, y: 432, scale: 0.95, terrain: "land" },
  { id: 10, x: 670, y: 425, scale: 0.95, terrain: "land" },
  { id: 11, x: 170, y: 445, scale: 0.9, terrain: "beach" },
  { id: 12, x: 835, y: 455, scale: 0.9, terrain: "beach" },
  // —— 环带扩建：解锁后岛屿向四周生长 ——
  { id: 13, x: 150, y: 320, scale: 0.8, terrain: "land", unlock: { level: 4, learned: 60 } },
  { id: 14, x: 850, y: 320, scale: 0.8, terrain: "land", unlock: { level: 4, learned: 60 } },
  { id: 15, x: 230, y: 200, scale: 0.75, terrain: "land", unlock: { level: 4, learned: 60 } },
  { id: 16, x: 770, y: 195, scale: 0.75, terrain: "land", unlock: { level: 4, learned: 60 } },
  { id: 17, x: 640, y: 520, scale: 0.85, terrain: "land", unlock: { level: 6, learned: 150 } },
  { id: 18, x: 360, y: 545, scale: 0.85, terrain: "land", unlock: { level: 6, learned: 150 } },
  { id: 19, x: 105, y: 400, scale: 0.8, terrain: "beach", unlock: { level: 6, learned: 150 } },
  { id: 20, x: 895, y: 400, scale: 0.8, terrain: "beach", unlock: { level: 6, learned: 150 } },
  { id: 21, x: 500, y: 195, scale: 0.8, terrain: "land", unlock: { level: 8, learned: 300 } },
  { id: 22, x: 660, y: 175, scale: 0.7, terrain: "land", unlock: { level: 8, learned: 300 } },
  { id: 23, x: 340, y: 175, scale: 0.7, terrain: "land", unlock: { level: 8, learned: 300 } },
  { id: 24, x: 500, y: 555, scale: 0.8, terrain: "beach", unlock: { level: 8, learned: 300 } },
];

export function slotUnlockLabel(slot: IslandSlot): string | null {
  if (!slot.unlock) return null;
  return `需要 Lv.${slot.unlock.level} 且累计学习 ${slot.unlock.learned} 词`;
}

export function isSlotUnlocked(slot: IslandSlot, level: number, learnedWords: number): boolean {
  if (!slot.unlock) return true;
  return level >= slot.unlock.level && learnedWords >= slot.unlock.learned;
}

export const INITIAL_CABIN_SLOT = 5;

export function getBuildingDef(type: string): BuildingDef | undefined {
  return BUILDING_CATALOG.find((b) => b.type === type);
}

export function maxLevel(def: BuildingDef): number {
  return def.upgradeCosts.length + 1;
}

export function upgradeCost(def: BuildingDef, currentLevel: number): number | null {
  if (currentLevel >= maxLevel(def)) return null;
  return def.upgradeCosts[currentLevel - 1] ?? null;
}

export function getSlot(id: number): IslandSlot | undefined {
  return ISLAND_SLOTS.find((s) => s.id === id);
}

export function canPlaceOnSlot(def: BuildingDef, slot: IslandSlot): boolean {
  if (def.terrain === "any") return true;
  return def.terrain === slot.terrain;
}

export function refundFor(def: BuildingDef, level: number): number {
  const spent = def.buildCost + def.upgradeCosts.slice(0, Math.max(0, level - 1)).reduce((a, b) => a + b, 0);
  return Math.floor(spent * 0.5);
}

// ---------- 岛屿主题 ----------

export interface IslandThemeDef {
  key: string;
  name: string;
  description: string;
  cost: number;
}

export const ISLAND_THEMES: IslandThemeDef[] = [
  { key: "tropical", name: "阳光海岛", description: "经典的碧海蓝天", cost: 0 },
  { key: "aurora", name: "极光雪岛", description: "雪原与极光冷色盘", cost: 300 },
  { key: "sunset", name: "黄昏金岛", description: "落日染金的海面", cost: 500 },
];
