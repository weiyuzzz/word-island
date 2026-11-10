import { describe, expect, it } from "vitest";
import {
  buildBox,
  clipNear,
  buildCone,
  buildCylinder,
  buildDisc,
  buildPrism,
  buildSphere,
  CAMERA_LIMITS,
  clampCamera,
  faceCenter,
  faceNormal,
  groundDragDelta,
  islandOutline,
  lightFor,
  makeCamera,
  pickAnchor,
  projectPoint,
  shadeColor,
  skyColors,
  sortFaces,
  v3,
  type Anchor,
  type Camera,
} from "../low-poly";
import { buildIslandFrame, slotToWorld } from "@/components/island/island-world";
import { buildGardenFrame, clampToPlot, layoutPlant, PLOT } from "@/components/garden/garden-world";
import type { GardenPlant } from "@/lib/game/model";

const cam = (over: Partial<Camera> = {}): Camera => makeCamera(900, 560, over);

function dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

describe("projectPoint / 相机", () => {
  it("把 target 投影到画面中心", () => {
    const c = cam();
    const p = projectPoint(c.target, c);
    expect(p.visible).toBe(true);
    expect(p.x).toBeCloseTo(450, 4);
    expect(p.y).toBeCloseTo(280, 4);
    expect(p.depth).toBeCloseTo(c.distance, 4);
  });

  it("物体越高越靠画面上方，俯视时远处地面也靠上", () => {
    const c = cam({ pitch: 0.5 });
    const base = projectPoint(v3(0, 0, 0), c);
    const high = projectPoint(v3(0, 2, 0), c);
    const far = projectPoint(v3(0, 0, -6), c);
    const near = projectPoint(v3(0, 0, 6), c);
    expect(high.y).toBeLessThan(base.y);
    expect(far.y).toBeLessThan(near.y);
    expect(far.depth).toBeGreaterThan(near.depth);
  });

  it("yaw 旋转会把 +X 变成靠近相机的一侧", () => {
    const c = cam({ yaw: Math.PI / 2, pitch: 0.3 });
    expect(projectPoint(v3(4, 0, 0), c).depth).toBeLessThan(projectPoint(v3(-4, 0, 0), c).depth);
  });

  it("clampCamera 限制俯仰与缩放范围", () => {
    const c = clampCamera(cam({ pitch: 9, distance: -5 }));
    expect(c.pitch).toBe(CAMERA_LIMITS.pitchMax);
    expect(c.distance).toBe(CAMERA_LIMITS.distanceMin);
  });
});

describe("深度排序与着色", () => {
  it("远的面排在前面（画家算法）", () => {
    const near = { points: [v3(0, 0, 4), v3(1, 0, 4), v3(1, 1, 4)], color: "#ffffff" };
    const far = { points: [v3(0, 0, -4), v3(1, 0, -4), v3(1, 1, -4)], color: "#000000" };
    const sorted = sortFaces([near, far], cam());
    expect(sorted).toHaveLength(2);
    expect(sorted[0].face).toBe(far);
    expect(sorted[0].depth).toBeGreaterThan(sorted[1].depth);
  });

  it("正对光源的面比背光的面更亮", () => {
    const light = v3(0.5, 1, 0.4);
    const facing = shadeColor("#808080", v3(0.5, 1, 0.4), light, 0.3);
    const away = shadeColor("#808080", v3(-0.5, -1, -0.4), light, 0.3);
    const luminance = (s: string) => s.match(/\d+/g)!.map(Number).reduce((a, b) => a + b, 0);
    expect(luminance(facing)).toBeGreaterThan(luminance(away));
  });

  it("昼夜光照：夜晚环境光更弱，天空颜色不同", () => {
    expect(lightFor(0.9).ambient).toBeLessThan(lightFor(0).ambient);
    expect(skyColors(0)).not.toEqual(skyColors(0.95));
  });

  it("近平面裁剪保留大平面在相机前方的部分", () => {
    const c = cam();
    const face = buildDisc(0, 0, 34, "#ffffff", -2.35, 24)[0];
    const projected = face.points.map((p) => projectPoint(p, c));
    expect(projected.some((p) => !p.visible)).toBe(true);
    const clipped = clipNear(projected, c);
    expect(clipped.length).toBeGreaterThanOrEqual(3);
    expect(clipped.every((p) => p.depth >= 0.35 - 1e-6)).toBe(true);
    // 完全在相机前方的面裁剪后顶点数不变
    const safe = buildDisc(0, 0, 3, "#ffffff", 0, 12)[0].points.map((p) => projectPoint(p, c));
    expect(clipNear(safe, c)).toHaveLength(safe.length);
  });
});

describe("低多边形网格", () => {
  it("box 有 6 个面且法线全部朝外", () => {
    const center = v3(1, 1, 1);
    const faces = buildBox(center, v3(2, 2, 2), "#ffffff");
    expect(faces).toHaveLength(6);
    for (const f of faces) {
      const outward = {
        x: faceCenter(f).x - center.x,
        y: faceCenter(f).y - center.y,
        z: faceCenter(f).z - center.z,
      };
      expect(dot(faceNormal(f), outward)).toBeGreaterThan(0);
    }
  });

  it("cylinder / cone / sphere / disc / prism 都生成非退化面", () => {
    const groups = [
      buildCylinder(0, 0, 1, 2, "#ffffff", 8),
      buildCone(0, 0, 1, 2, "#ffffff", 8),
      buildSphere(0, 1, 0, 1, "#ffffff", 4, 8),
      buildPrism(islandOutline(3, 2, 10), -1, 0, "#ffffff", "#cccccc"),
    ];
    for (const faces of groups) {
      expect(faces.length).toBeGreaterThan(2);
      for (const f of faces) {
        expect(f.points.length).toBeGreaterThanOrEqual(3);
        const n = faceNormal(f);
        expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 5);
      }
    }
    // 平面圆盘只有 1 个面，单独校验
    const disc = buildDisc(0, 0, 2, "#ffffff", 0, 16);
    expect(disc).toHaveLength(1);
    for (const f of disc) {
      expect(f.points.length).toBeGreaterThanOrEqual(3);
      const n = faceNormal(f);
      expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1, 5);
    }
  });

  it("islandOutline 生成闭合起伏轮廓", () => {
    const outline = islandOutline(9, 7, 18, 1.2);
    expect(outline).toHaveLength(18);
    for (const p of outline) {
      expect(Math.abs(p.x)).toBeLessThan(9.9);
      expect(Math.abs(p.z)).toBeLessThan(7.7);
    }
  });
});

describe("交互换算", () => {
  it("拾取命中容差内最近的锚点，超出返回 null", () => {
    const c = cam();
    const center = projectPoint(v3(0, 0, 0), c);
    const anchors: Anchor[] = [
      { id: "a", position: v3(0, 0, 0), radius: 20 },
      { id: "b", position: v3(3, 0, 0), radius: 20 },
    ];
    expect(pickAnchor(anchors, c, center.x + 4, center.y + 2)).toBe("a");
    expect(pickAnchor(anchors, c, 5, 5)).toBeNull();
  });

  it("地面拖拽：右移 = +X，下移 = 靠近相机（yaw=0 时 +Z）", () => {
    const c = cam({ yaw: 0, pitch: 0.5 });
    const right = groundDragDelta(40, 0, c);
    const down = groundDragDelta(0, 40, c);
    expect(right.x).toBeGreaterThan(0);
    expect(Math.abs(right.z)).toBeLessThan(1e-9);
    expect(Math.abs(down.x)).toBeLessThan(1e-9);
    expect(down.z).toBeGreaterThan(0);
  });
});

describe("场景装配", () => {
  it("岛屿锚点只覆盖开放槽位（扩建位默认锁定），slot 坐标落在地块范围内", () => {
    const frame = buildIslandFrame({ buildings: [], selectedId: null, pendingType: null, popId: null, time: 0, lockedSlotIds: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24] });
    expect(frame.anchors).toHaveLength(12);
    expect(frame.faces.length).toBeGreaterThan(40);
    expect(slotToWorld(500, 350)).toEqual({ x: 0, z: 0 });
    expect(Math.abs(slotToWorld(170, 445).x)).toBeLessThan(9);
  });

  const plant = (id: number, stage: GardenPlant["stage"], proficiency: number): GardenPlant => ({
    id, word: `w${id}`, meaning: "释义", phonetic: "", pos: "n.", example: "", translation: "",
    stage, proficiency, streak: 0, correctCount: 0, wrongCount: 0, status: "learning", nextReviewAt: null, lastReviewedAt: null,
  });

  it("花园每个植株对应一个锚点，熟练度越高植株越高", () => {
    const plants = [plant(1, "seed", 5), plant(2, "bloom", 98)];
    const frame = buildGardenFrame({ plants, positions: {}, selectedId: null, wateringId: null, time: 0 });
    expect(frame.anchors).toHaveLength(2);
    expect(frame.anchors[1].position.y).toBeGreaterThan(frame.anchors[0].position.y);
    expect(frame.faces.length).toBeGreaterThan(20);
  });

  it("默认网格与拖拽位置都被限制在花圃内", () => {
    for (let i = 0; i < 30; i++) {
      const p = layoutPlant(i, 30);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(PLOT.halfW);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(PLOT.halfD);
    }
    expect(clampToPlot({ x: 99, z: -99 })).toEqual({ x: PLOT.halfW - 0.5, z: -PLOT.halfD + 0.5 });
  });
});
