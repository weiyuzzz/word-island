export interface ItemDef {
  key: string;
  name: string;
  description: string;
  kind: "boat" | "outfit" | "tool" | "consumable" | "decor";
  rarity: "common" | "rare" | "epic" | "legend";
  price: number;
  unlockLevel: number;
  unique: boolean;
  effect: string;
}

export const ITEMS: ItemDef[] = [
  {
    key: "sailboat",
    name: "远航小船",
    description: "解锁港口与远洋群岛区域，开启航海探索。",
    kind: "boat",
    rarity: "epic",
    price: 600,
    unlockLevel: 3,
    unique: true,
    effect: "解锁「港口」「远洋群岛」两个探索区域",
  },
  {
    key: "lucky_charm",
    name: "幸运护符",
    description: "古老的铜钱护符，据说能带来好运。",
    kind: "tool",
    rarity: "rare",
    price: 320,
    unlockLevel: 2,
    unique: true,
    effect: "探索事件的金币奖励 +15%",
  },
  {
    key: "explorer_kit",
    name: "探险工具包",
    description: "绳索、罗盘与火把，让探索走得更远。",
    kind: "tool",
    rarity: "rare",
    price: 380,
    unlockLevel: 4,
    unique: true,
    effect: "每次探索额外触发 1 个事件",
  },
  {
    key: "guard_charm",
    name: "守护护符",
    description: "在危急时刻保护你一次。",
    kind: "tool",
    rarity: "epic",
    price: 450,
    unlockLevel: 5,
    unique: true,
    effect: "每场战斗中，第一次答错不扣除体力",
  },
  {
    key: "telescope",
    name: "黄铜望远镜",
    description: "看得更远，更容易发现稀有宝物。",
    kind: "tool",
    rarity: "rare",
    price: 500,
    unlockLevel: 6,
    unique: true,
    effect: "探索事件的稀有道具掉落率提升",
  },
  {
    key: "energy_tea",
    name: "能量茶",
    description: "热腾腾的草药茶。开始探索时可选择使用，本局体力上限 +1。",
    kind: "consumable",
    rarity: "common",
    price: 80,
    unlockLevel: 1,
    unique: false,
    effect: "消耗品：探索开始时 +1 点体力",
  },
  {
    key: "sailor_hat",
    name: "水手帽",
    description: "经典的条纹水手帽。",
    kind: "outfit",
    rarity: "common",
    price: 150,
    unlockLevel: 2,
    unique: true,
    effect: "角色服装",
  },
  {
    key: "explorer_cloak",
    name: "探险家斗篷",
    description: "耐磨的野外斗篷，风雨无阻。",
    kind: "outfit",
    rarity: "rare",
    price: 260,
    unlockLevel: 4,
    unique: true,
    effect: "角色服装",
  },
  {
    key: "shell_chime",
    name: "贝壳风铃",
    description: "挂在屋檐下，海风吹过就叮当作响。",
    kind: "decor",
    rarity: "common",
    price: 120,
    unlockLevel: 1,
    unique: true,
    effect: "岛屿装饰",
  },
  {
    key: "wind_bell",
    name: "海风铃铛",
    description: "传说能召唤顺风的古老铃铛。",
    kind: "decor",
    rarity: "legend",
    price: 900,
    unlockLevel: 10,
    unique: true,
    effect: "稀有装饰 + 探索金币奖励 +5%",
  },
];

export const RARITY_META: Record<ItemDef["rarity"], { label: string; className: string }> = {
  common: { label: "普通", className: "bg-slate-100 text-slate-500" },
  rare: { label: "稀有", className: "bg-ocean-50 text-ocean-600" },
  epic: { label: "史诗", className: "bg-leaf-100 text-leaf-700" },
  legend: { label: "传说", className: "bg-sun-100 text-sun-600" },
};

export const KIND_LABEL: Record<ItemDef["kind"], string> = {
  boat: "船只",
  outfit: "服装",
  tool: "探索道具",
  consumable: "消耗品",
  decor: "装饰",
};

export function getItemDef(key: string): ItemDef | undefined {
  return ITEMS.find((i) => i.key === key);
}
