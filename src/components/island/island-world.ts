import { canPlaceOnSlot, getBuildingDef, ISLAND_SLOTS } from "@/lib/game/buildings";
import type { BuildingView } from "@/lib/types";
import {
  buildBox,
  buildCone,
  buildCylinder,
  buildDisc,
  buildPrism,
  buildSphere,
  islandOutline,
  upwardFace,
  v3,
  type Anchor,
  type Face,
  type WorldFrame,
} from "@/components/world/low-poly";

const SAND = "#eddcb0";
const CLIFF = "#c9a66c";
const GRASS = "#8fd18a";
const GRASS_LIGHT = "#a9dd9a";
const WOOD = "#a9703f";

/** 把原来 SVG 的 1000×640 画布坐标映射到 3D 世界的地面平面。 */
export function slotToWorld(x: number, y: number): { x: number; z: number } {
  return { x: (x - 500) / 48, z: (y - 350) / 48 };
}

function polygonFace(points: { x: number; z: number }[], y: number, color: string, alpha = 1): Face {
  return upwardFace(points.map((p) => v3(p.x, y, p.z)), color, alpha);
}

function flatRect(x: number, z: number, w: number, d: number, y: number, color: string, alpha = 1): Face {
  return polygonFace(
    [
      { x: x - w / 2, z: z - d / 2 },
      { x: x + w / 2, z: z - d / 2 },
      { x: x + w / 2, z: z + d / 2 },
      { x: x - w / 2, z: z + d / 2 },
    ],
    y,
    color,
    alpha,
  );
}

function tree(x: number, z: number, scale = 1, canopy = "#4faa64"): Face[] {
  return [
    ...buildCylinder(x, z, 0.16 * scale, 1.05 * scale, WOOD, 6, 0),
    ...buildSphere(x, 1.35 * scale, z, 0.72 * scale, canopy, 3, 7),
    ...buildSphere(x - 0.45 * scale, 1.12 * scale, z + 0.2 * scale, 0.46 * scale, "#62bd72", 3, 6),
    ...buildSphere(x + 0.42 * scale, 1.18 * scale, z - 0.15 * scale, 0.5 * scale, "#3f9a52", 3, 6),
  ];
}

function rock(x: number, z: number, r = 0.45): Face[] {
  return buildSphere(x, r * 0.6, z, r, "#a8b0b5", 3, 6);
}

function resident(x: number, z: number, y: number, color: string): Face[] {
  return [
    ...buildCylinder(x, z, 0.19, 0.62, color, 6, y),
    ...buildSphere(x, y + 0.82, z, 0.22, "#f4d3b0", 3, 6),
    ...buildBox({ x, y: y + 1.05, z }, { x: 0.42, y: 0.12, z: 0.42 }, "#e8b86a"),
  ];
}

/** 不同建筑用不同的低多边形组合，等级越高体量略大。 */
function buildingFaces(b: BuildingView, x: number, z: number, t: number, popping: boolean): Face[] {
  const k = 1 + (b.level - 1) * 0.11;
  const bob = popping ? Math.abs(Math.sin(t * 9)) * 0.16 : 0;
  const base = 0.02 + bob;
  const faces: Face[] = [];

  switch (b.type) {
    case "lighthouse":
      faces.push(...buildCylinder(x, z, 0.72 * k, 3.3 * k, "#f3f0e6", 10, base, "#ef6a4f"));
      faces.push(...buildCone(x, z, 0.82 * k, 0.75 * k, "#ef6a4f", 10, base + 3.3 * k));
      faces.push(...buildSphere(x, base + 3.65 * k, z, 0.28 * k, "#ffe9a3", 3, 7).map((f) => ({ ...f, emissive: true })));
      break;
    case "windmill":
      faces.push(...buildCylinder(x, z, 0.78 * k, 2.6 * k, "#f0e6d2", 8, base));
      faces.push(...buildCone(x, z, 0.95 * k, 0.8 * k, "#c96f4a", 8, base + 2.6 * k));
      // 叶片随时间转动（建筑产出动画）
      for (let i = 0; i < 4; i++) {
        const a = t * 0.9 + (Math.PI * i) / 2;
        const bx = x + Math.cos(a) * 1.05 * k;
        const bz = z + Math.sin(a) * 1.05 * k;
        faces.push(...buildBox({ x: bx, y: base + 2.3 * k, z: bz }, { x: 0.16, y: 1.7 * k, z: 0.16 }, "#fff4dc"));
      }
      break;
    case "castle":
      faces.push(...buildBox({ x, y: base + 1.05 * k, z }, { x: 2.3 * k, y: 2.1 * k, z: 1.9 * k }, "#d9d4c6"));
      for (const [ox, oz] of [[-1, -0.8], [1, -0.8], [-1, 0.8], [1, 0.8]] as const) {
        faces.push(...buildCylinder(x + ox * k, z + oz * k, 0.36 * k, 2.7 * k, "#c9c4b6", 7, base));
        faces.push(...buildCone(x + ox * k, z + oz * k, 0.46 * k, 0.8 * k, "#4f8fc4", 7, base + 2.7 * k));
      }
      break;
    case "fountain":
      faces.push(...buildCylinder(x, z, 1.05 * k, 0.35 * k, "#c9d4dc", 12, base, "#8fc7e8"));
      faces.push(...buildCylinder(x, z, 0.22 * k, 1.1 * k, "#dbe4e8", 8, base + 0.35 * k));
      faces.push(...buildSphere(x, base + 1.6 * k, z, 0.34 * k, "#9fd8f2", 3, 7));
      break;
    case "statue":
      faces.push(...buildBox({ x, y: base + 0.3 * k, z }, { x: 1.3 * k, y: 0.6 * k, z: 1.3 * k }, "#c9c4b6"));
      faces.push(...buildCylinder(x, z, 0.34 * k, 1.5 * k, "#e2ddd0", 7, base + 0.6 * k));
      faces.push(...buildSphere(x, base + 2.25 * k, z, 0.34 * k, "#e2ddd0", 3, 7));
      break;
    case "tree":
      faces.push(...tree(x, z, 1.15 * k, "#4faa64"));
      break;
    case "palm":
      faces.push(...buildCylinder(x, z, 0.14 * k, 2.2 * k, "#a9703f", 6, base));
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5;
        faces.push(...buildSphere(x + Math.cos(a) * 0.62 * k, base + 2.25 * k, z + Math.sin(a) * 0.62 * k, 0.52 * k, "#4faa64", 3, 6));
      }
      break;
    case "flowers":
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5;
        const fx = x + Math.cos(a) * 0.5 * k;
        const fz = z + Math.sin(a) * 0.5 * k;
        faces.push(...buildCylinder(fx, fz, 0.07, 0.34 * k, "#4faa64", 5, base));
        faces.push(...buildSphere(fx, base + 0.42 * k, fz, 0.22 * k, i % 2 ? "#f7c948" : "#ef8a73", 3, 6));
      }
      break;
    case "bench":
      faces.push(...buildBox({ x, y: base + 0.38 * k, z }, { x: 1.5 * k, y: 0.14 * k, z: 0.48 * k }, "#b9824c"));
      faces.push(...buildBox({ x, y: base + 0.72 * k, z: z - 0.2 * k }, { x: 1.5 * k, y: 0.5 * k, z: 0.12 * k }, "#a9703f"));
      break;
    case "campfire":
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        faces.push(...buildSphere(x + Math.cos(a) * 0.5, base + 0.12, z + Math.sin(a) * 0.5, 0.18, "#a8b0b5", 3, 5));
      }
      faces.push(...buildCone(x, z, 0.36, 0.85 + Math.sin(t * 7) * 0.08, "#f7a93f", 6, base).map((f) => ({ ...f, emissive: true })));
      break;
    case "boat":
      faces.push(...buildBox({ x, y: base + 0.32 * k, z }, { x: 1.8 * k, y: 0.5 * k, z: 0.8 * k }, "#b9824c"));
      faces.push(...buildCylinder(x, z, 0.08, 1.5 * k, "#8a5a3c", 5, base + 0.5 * k));
      faces.push(polygonFace([{ x: x - 0.1, z }, { x: x + 0.9 * k, z }, { x: x - 0.1, z: z + 0.9 * k }], base + 1.1 * k, "#fff4dc"));
      break;
    case "library":
    case "market":
    case "garden":
    case "cabin":
    default: {
      const wall = b.type === "library" ? "#e5d7bd" : b.type === "market" ? "#e8c9a0" : b.type === "garden" ? "#d9e7c6" : "#e0c39a";
      const roof = b.type === "library" ? "#4f8fc4" : b.type === "market" ? "#ef8a73" : b.type === "garden" ? "#62bd72" : "#c96f4a";
      faces.push(...buildBox({ x, y: base + 0.9 * k, z }, { x: 1.9 * k, y: 1.8 * k, z: 1.6 * k }, wall));
      faces.push(...buildCone(x, z, 1.5 * k, 1.0 * k, roof, 4, base + 1.8 * k));
      faces.push(...buildBox({ x, y: base + 0.45 * k, z: z + 0.82 * k }, { x: 0.46 * k, y: 0.9 * k, z: 0.08 }, "#8a5a3c"));
      break;
    }
  }

  // 建成后的「产出」光点：轻微上下浮动，纯装饰
  const pulse = 0.12 * Math.sin(t * 2.2 + x * 1.7);
  faces.push(...buildSphere(x, base + 3.0 * k + pulse, z, 0.12 * k, "#fff3c4", 3, 6).map((f) => ({ ...f, emissive: true, alpha: 0.85 })));
  return faces;
}

export interface IslandFrameInput {
  buildings: BuildingView[];
  selectedId: number | null;
  pendingType: string | null;
  popId: number | null;
  time: number;
  /** 入住居民（颜色轮换出 walkers） */
  residentColors?: string[];
  /** 未解锁的扩建槽位 id（暗色虚位、不可点击） */
  lockedSlotIds?: number[];
}

/** 纯函数：把岛屿状态翻译成 3D 面与可点击锚点，便于单测。 */
export function buildIslandFrame({ buildings, selectedId, pendingType, popId, time, residentColors, lockedSlotIds }: IslandFrameInput): WorldFrame {
  const t = time;
  const faces: Face[] = [];
  const anchors: Anchor[] = [];

  // 海面由引擎按地平线铺底（无限远平面不能用有限圆盘模拟），这里只加岛屿周围的浅滩光晕
  faces.push(...buildDisc(0, 0, 11.4, "#b9dff2", -2.1, 22, 0.85));
  faces.push(...buildDisc(0, 0, 10.2, "#d6edfa", -1.92, 22, 0.6));

  // 岛屿地块：沙滩基座 → 草地 → 小路
  const shore = islandOutline(9.3, 7.3, 18, 1.2);
  faces.push(...buildPrism(shore, -1.9, -0.14, SAND, CLIFF));
  const grass = islandOutline(8.25, 6.35, 18, 1.2);
  faces.push(...buildPrism(grass, -0.14, -0.02, GRASS, "#6bb373"));
  faces.push(flatRect(0, 0.2, 2.0, 11.2, 0.001, "#e8d9b0", 0.85));
  faces.push(flatRect(0, -0.6, 11.5, 1.4, 0.002, "#e8d9b0", 0.6));
  faces.push(...buildDisc(-6.6, 2.0, 1.3, GRASS_LIGHT, 0.002, 12, 0.55));

  // 静态装饰（避开建筑位）
  faces.push(...tree(-7.7, -2.5, 0.85));
  faces.push(...tree(7.7, -2.3, 0.95));
  faces.push(...tree(-7.4, 3.6, 0.7));
  faces.push(...tree(7.3, 3.8, 0.8));
  faces.push(...rock(-8.4, 0.6, 0.42));
  faces.push(...rock(8.5, 0.5, 0.5));
  faces.push(...rock(6.9, 5.2, 0.35));

  const bySlot = new Map(buildings.map((b) => [b.slot, b]));
  const pendingDef = pendingType ? getBuildingDef(pendingType) : undefined;

  for (const slot of ISLAND_SLOTS) {
    const p = slotToWorld(slot.x, slot.y);
    const b = bySlot.get(slot.id);
    if (b) {
      faces.push(...buildDisc(p.x, p.z, 0.95 * slot.scale, "#6f9f68", 0.004, 12, 0.35));
      faces.push(...buildingFaces(b, p.x, p.z, t, popId === b.id));
      anchors.push({ id: `b:${b.id}`, position: v3(p.x, 0.12, p.z), radius: 36, kind: "building", label: getBuildingDef(b.type)?.name });
    } else if (lockedSlotIds?.includes(slot.id)) {
      // 未解锁的扩建地块：暗色虚位，不生成锚点（不可点击）
      faces.push(...buildDisc(p.x, p.z, 0.86 * slot.scale, "#3d4a5c", 0.006, 12, 0.12));
    } else {
      const valid = pendingDef ? canPlaceOnSlot(pendingDef, slot) : true;
      faces.push(...buildDisc(p.x, p.z, 0.86 * slot.scale, pendingDef ? (valid ? "#8fd0ff" : "#ffffff") : "#ffffff", 0.006, 12, pendingDef ? (valid ? 0.55 : 0.1) : 0.22));
      anchors.push({ id: `s:${slot.id}`, position: v3(p.x, 0.02, p.z), radius: 30, kind: "slot" });
    }
  }

  // 居民在岛上散步（数量随入住人数增长）
  const colors = residentColors?.length ? residentColors : ["#4f8fc4"];
  const walkers: [string, number][] = colors.map((color, i) => [color, i * 2.1]);
  for (const [color, phase] of walkers) {
    const a = t * 0.24 + phase;
    const x = Math.cos(a) * 5.6;
    const z = Math.sin(a) * 4.2;
    const bob = Math.abs(Math.sin(t * 5 + phase)) * 0.06;
    faces.push(...resident(x, z, bob, color));
  }

  // 选中建筑的地面光环
  const selected = buildings.find((b) => b.id === selectedId);
  if (selected) {
    const slot = ISLAND_SLOTS.find((s) => s.id === selected.slot);
    if (slot) {
      const p = slotToWorld(slot.x, slot.y);
      faces.push(...buildDisc(p.x, p.z, 1.5, "#2b8ad6", 0.008, 16, 0.24));
    }
  }

  return { faces, anchors };
}

export function islandA11yItems(buildings: BuildingView[]): { id: string; label: string }[] {
  const bySlot = new Map(buildings.map((b) => [b.slot, b]));
  return ISLAND_SLOTS.map((slot) => {
    const b = bySlot.get(slot.id);
    return b
      ? { id: `b:${b.id}`, label: `${getBuildingDef(b.type)?.name ?? b.type} Lv.${b.level}，查看详情` }
      : { id: `s:${slot.id}`, label: `${slot.terrain === "beach" ? "沙滩" : "草地"}空位 ${slot.id}，点击选中` };
  });
}

