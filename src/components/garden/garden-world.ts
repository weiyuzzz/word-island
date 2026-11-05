import type { GardenPlant, GardenStage } from "@/lib/game/model";
import {
  buildBox,
  buildCone,
  buildCylinder,
  buildDisc,
  buildSphere,
  clamp,
  v3,
  type Anchor,
  type Face,
  type WorldFrame,
} from "@/components/world/low-poly";

export interface PlantPosition {
  x: number;
  z: number;
}

export const PLOT = { halfW: 6.8, halfD: 4.3 };

const SOIL = "#8a6a45";
const SOIL_TOP = "#a9835a";
const WOOD = "#b9824c";

const STAGE_COLOR: Record<GardenStage, string> = {
  seed: "#c98a4b",
  sprout: "#84d393",
  sapling: "#6cc07a",
  tree: "#3f9a52",
  bloom: "#f7c948",
};

/** 默认按「行数随数量增长」的网格排布，保证 1 株和 100 株都不挤出花圃。 */
export function layoutPlant(index: number, count: number): PlantPosition {
  const cols = Math.max(3, Math.min(9, Math.ceil(Math.sqrt(count * 1.5))));
  const rows = Math.max(1, Math.ceil(count / cols));
  const stepX = (PLOT.halfW * 2 - 1.2) / Math.max(1, cols - 1);
  const stepZ = (PLOT.halfD * 2 - 1.2) / Math.max(1, rows - 1);
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: -PLOT.halfW + 0.6 + col * stepX,
    z: -PLOT.halfD + 0.6 + row * stepZ,
  };
}

export function clampToPlot(p: PlantPosition): PlantPosition {
  return { x: clamp(p.x, -PLOT.halfW + 0.5, PLOT.halfW - 0.5), z: clamp(p.z, -PLOT.halfD + 0.5, PLOT.halfD - 0.5) };
}

function stageHeight(plant: GardenPlant): number {
  const base: Record<GardenStage, number> = { seed: 0.22, sprout: 0.62, sapling: 1.25, tree: 1.9, bloom: 2.0 };
  return base[plant.stage] + plant.proficiency / 100 * 0.28;
}

function plantFaces(plant: GardenPlant, x: number, z: number, t: number, watering: boolean): Face[] {
  const h = stageHeight(plant);
  const sway = Math.sin(t * 1.6 + x * 1.3) * 0.045;
  const faces: Face[] = [];
  const stem = "#4f9a52";

  faces.push(...buildDisc(x, z, 0.55, "#6f5638", 0.012, 12, 0.4));

  switch (plant.stage) {
    case "seed":
      faces.push(...buildSphere(x + sway, 0.13, z, 0.19, STAGE_COLOR.seed, 3, 6));
      faces.push(...buildCone(x, z, 0.07, 0.24, "#84d393", 5, 0.16));
      break;
    case "sprout":
      faces.push(...buildCylinder(x, z, 0.06, h, stem, 5, 0.02));
      faces.push(...buildSphere(x - 0.22, h * 0.82, z, 0.24, "#84d393", 3, 6));
      faces.push(...buildSphere(x + 0.22, h * 0.95, z, 0.22, "#6cc07a", 3, 6));
      break;
    case "sapling":
      faces.push(...buildCylinder(x, z, 0.1, h, "#9c6236", 6, 0.02));
      faces.push(...buildSphere(x, h + 0.15, z, 0.48, "#6cc07a", 3, 7));
      faces.push(...buildSphere(x - 0.34, h - 0.12, z + 0.12, 0.3, "#84d393", 3, 6));
      faces.push(...buildSphere(x + 0.3, h - 0.05, z - 0.16, 0.28, "#55bb6a", 3, 6));
      break;
    case "tree":
    case "bloom": {
      faces.push(...buildCylinder(x, z, 0.14, h, "#9c6236", 6, 0.02));
      faces.push(...buildSphere(x, h + 0.35, z, 0.65, "#3f9a52", 4, 8));
      faces.push(...buildSphere(x - 0.5, h + 0.05, z + 0.1, 0.42, "#55bb6a", 3, 6));
      faces.push(...buildSphere(x + 0.5, h + 0.1, z - 0.1, 0.42, "#6cc07a", 3, 6));
      faces.push(...buildSphere(x, h + 0.85, z, 0.38, "#84d393", 3, 6));
      if (plant.stage === "bloom") {
        const petals = [
          [-0.42, 0.3, 0.2], [0.5, 0.35, -0.15], [0.1, 0.95, 0.4], [-0.25, 1.05, -0.3], [0.35, 0.7, 0.35],
        ];
        for (let i = 0; i < petals.length; i++) {
          const [ox, oy, oz] = petals[i];
          faces.push(...buildSphere(x + ox, h + oy, z + oz, 0.16, i % 2 ? "#f98b73" : "#f7c948", 3, 6));
        }
      }
      break;
    }
  }

  if (watering) {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 + t * 2;
      const dropY = 0.6 + ((t * 1.7 + i * 0.31) % 1) * 1.4;
      faces.push(...buildSphere(x + Math.cos(a) * 0.5, dropY, z + Math.sin(a) * 0.5, 0.09, "#8fd0f2", 3, 5).map((f) => ({ ...f, emissive: true, alpha: 0.9 })));
    }
  }
  return faces;
}

export interface GardenFrameInput {
  plants: GardenPlant[];
  positions: Record<number, PlantPosition>;
  selectedId: number | null;
  wateringId: number | null;
  time: number;
}

/** 纯函数：把「单词熟练度」翻译成一整块可旋转的低多边形花圃。 */
export function buildGardenFrame({ plants, positions, selectedId, wateringId, time }: GardenFrameInput): WorldFrame {
  const faces: Face[] = [];
  const anchors: Anchor[] = [];
  const t = time;

  // 远景草地由引擎按地平线铺底；这里只建模花圃土台、木框与垄沟
  faces.push(...buildBox({ x: 0, y: -0.35, z: 0 }, { x: PLOT.halfW * 2 + 0.5, y: 0.7, z: PLOT.halfD * 2 + 0.5 }, SOIL));
  faces.push(...buildBox({ x: 0, y: 0.02, z: 0 }, { x: PLOT.halfW * 2, y: 0.06, z: PLOT.halfD * 2 }, SOIL_TOP));
  for (const sign of [-1, 1]) {
    faces.push(...buildBox({ x: sign * (PLOT.halfW + 0.2), y: 0.1, z: 0 }, { x: 0.22, y: 0.28, z: PLOT.halfD * 2 + 0.7 }, WOOD));
    faces.push(...buildBox({ x: 0, y: 0.1, z: sign * (PLOT.halfD + 0.2) }, { x: PLOT.halfW * 2 + 0.7, y: 0.28, z: 0.22 }, WOOD));
  }
  const rows = Math.max(2, Math.min(9, Math.ceil(Math.sqrt(plants.length * 1.5))));
  for (let i = 1; i < rows; i++) {
    const z = -PLOT.halfD + (i * PLOT.halfD * 2) / rows;
    faces.push(...buildBox({ x: 0, y: 0.06, z }, { x: PLOT.halfW * 2 - 0.6, y: 0.03, z: 0.12 }, "#8a6a45"));
  }

  // 四角装饰
  faces.push(...buildCylinder(-PLOT.halfW - 0.2, -PLOT.halfD - 0.2, 0.12, 0.9, WOOD, 6, 0.1));
  faces.push(...buildCylinder(PLOT.halfW + 0.2, -PLOT.halfD - 0.2, 0.12, 0.9, WOOD, 6, 0.1));
  faces.push(...buildCone(-PLOT.halfW + 1.1, -PLOT.halfD - 1.5, 0.8, 1.6, "#4faa64", 7, -0.4));
  faces.push(...buildCone(PLOT.halfW - 0.8, -PLOT.halfD - 1.7, 0.65, 1.3, "#62bd72", 7, -0.4));

  plants.forEach((plant, index) => {
    const p = positions[plant.id] ?? layoutPlant(index, plants.length);
    const watering = wateringId === plant.id;
    faces.push(...plantFaces(plant, p.x, p.z, t, watering));
    if (selectedId === plant.id) faces.push(...buildDisc(p.x, p.z, 0.8, "#2b8ad6", 0.014, 14, 0.28));
    anchors.push({
      id: `p:${plant.id}`,
      position: v3(p.x, 0.55 + stageHeight(plant) * 0.35, p.z),
      radius: 32,
      kind: "plant",
      label: plant.word,
    });
  });

  return { faces, anchors };
}
