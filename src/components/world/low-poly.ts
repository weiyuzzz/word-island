/**
 * P2 · 低多边形 3D 场景的纯数学层。
 *
 * 这里不依赖 WebGL / three.js / DOM：用一个极小的软件光栅化管线做
 * 「真 3D」——透视投影、背面朝向、按深度排序的画家算法、Lambert 平面着色。
 * 好处是 SSR 安全、零运行时依赖、可在 Node 下单元测试，且能继续复用
 * P0/P1 已有的手绘色板与交互契约。
 *
 * 坐标约定：x 向东，y 向上，z 向北；地面为 y = 0。
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export interface Camera {
  /** 绕 Y 轴的方位角（弧度），0 表示相机在 +Z */
  yaw: number;
  /** 仰角（弧度），越大越俯视 */
  pitch: number;
  /** 相机到 target 的距离 */
  distance: number;
  /** 垂直视场角（弧度） */
  fov: number;
  w: number;
  h: number;
  target: Vec3;
}

export interface Projected {
  x: number;
  y: number;
  depth: number;
  scale: number;
  visible: boolean;
}

export interface Face {
  points: Vec3[];
  color: string;
  /** 0–1，默认 1 */
  alpha?: number;
  stroke?: string;
  /** 闭合实体可开启背面剔除，减少 overdraw */
  cull?: boolean;
  /** 不受光照影响（发光体 / 水面高光） */
  emissive?: boolean;
}

export interface Anchor {
  id: string;
  position: Vec3;
  /** 屏幕拾取半径（px），默认 26 */
  radius?: number;
  label?: string;
  kind?: "slot" | "building" | "plant";
}

export interface WorldFrame {
  faces: Face[];
  anchors: Anchor[];
}

export const DEFAULT_CAMERA = {
  yaw: 0.58,
  pitch: 0.36,
  distance: 22,
  fov: Math.PI / 3,
} as const;

export const CAMERA_LIMITS = {
  pitchMin: 0.18,
  pitchMax: 1.18,
  distanceMin: 9,
  distanceMax: 48,
} as const;

export function makeCamera(w: number, h: number, init: Partial<Camera> = {}): Camera {
  return { ...DEFAULT_CAMERA, w, h, target: v3(0, 0.6, 0), ...init };
}

export function clampCamera(cam: Camera): Camera {
  return {
    ...cam,
    pitch: clamp(cam.pitch, CAMERA_LIMITS.pitchMin, CAMERA_LIMITS.pitchMax),
    distance: clamp(cam.distance, CAMERA_LIMITS.distanceMin, CAMERA_LIMITS.distanceMax),
  };
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** 把世界坐标点投影到屏幕。depth 越小越靠近相机。 */
export function projectPoint(p: Vec3, cam: Camera): Projected {
  const dx = p.x - cam.target.x;
  const dy = p.y - cam.target.y;
  const dz = p.z - cam.target.z;

  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  // 先把世界绕 Y 轴转到「相机在 +Z」的视角
  const x1 = dx * cy - dz * sy;
  const z1 = dx * sy + dz * cy;

  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  // 再按仰角把相机基向量（right / up / backward）对齐
  const y2 = dy * cp - z1 * sp;
  const z2 = dy * sp + z1 * cp;

  const depth = cam.distance - z2;
  const focal = cam.h / 2 / Math.tan(cam.fov / 2);
  const scale = focal / Math.max(0.2, depth);
  return {
    x: cam.w / 2 + x1 * scale,
    y: cam.h / 2 - y2 * scale,
    depth,
    scale,
    visible: depth > 0.2,
  };
}

export function cameraPosition(cam: Camera): Vec3 {
  const cp = Math.cos(cam.pitch);
  return {
    x: cam.target.x + cam.distance * Math.sin(cam.yaw) * cp,
    y: cam.target.y + cam.distance * Math.sin(cam.pitch),
    z: cam.target.z + cam.distance * Math.cos(cam.yaw) * cp,
  };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a: Vec3): Vec3 {
  const l = length(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function faceNormal(face: Face): Vec3 {
  const [a, b, c] = face.points;
  if (!a || !b || !c) return v3(0, 1, 0);
  return normalize(cross(sub(b, a), sub(c, a)));
}

export function faceCenter(face: Face): Vec3 {
  const n = face.points.length || 1;
  return face.points.reduce((acc, p) => ({ x: acc.x + p.x / n, y: acc.y + p.y / n, z: acc.z + p.z / n }), v3());
}

/** 面是否朝向相机（只用于 cull 标记的闭合实体）。 */
export function faceFacesCamera(face: Face, cam: Camera): boolean {
  const toCam = normalize(sub(cameraPosition(cam), faceCenter(face)));
  return dot(faceNormal(face), toCam) > 0.001;
}

/** Lambert 平面着色：把十六进制颜色按法线与光照夹角调亮/调暗。 */
export function shadeColor(hex: string, normal: Vec3, light: Vec3, ambient = 0.55): string {
  const rgb = parseHex(hex);
  const lambert = Math.max(0, dot(normalize(normal), normalize(light)));
  const f = ambient + (1 - ambient) * lambert;
  const out = rgb.map((c) => Math.round(clamp(c * f, 0, 255)));
  return `rgb(${out[0]},${out[1]},${out[2]})`;
}

function parseHex(hex: string): [number, number, number] {
  const s = hex.replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 画家算法：远的面先画。允许部分顶点在相机背后（由 clipNear 裁剪）。 */
export function sortFaces(faces: Face[], cam: Camera): { face: Face; depth: number }[] {
  const out: { face: Face; depth: number }[] = [];
  for (const face of faces) {
    if (face.points.length < 3) continue;
    let sum = 0;
    let count = 0;
    for (const p of face.points) {
      const q = projectPoint(p, cam);
      if (q.visible) {
        sum += q.depth;
        count++;
      }
    }
    if (count === 0) continue;
    if (face.cull && !faceFacesCamera(face, cam)) continue;
    out.push({ face, depth: sum / count });
  }
  out.sort((a, b) => b.depth - a.depth);
  return out;
}

/**
 * 近平面裁剪（Sutherland–Hodgman）。海面 / 地面这类大平面会越过相机，
 * 必须裁掉背后的部分而不是整面丢弃；插值在「视图坐标」里做才符合透视投影。
 */
export function clipNear(points: Projected[], cam: Camera, near = 0.35): Projected[] {
  const focal = cam.h / 2 / Math.tan(cam.fov / 2);
  const out: Projected[] = [];
  const n = points.length;
  if (n < 3) return out;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const aIn = a.depth >= near;
    const bIn = b.depth >= near;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const s = (near - a.depth) / (b.depth - a.depth);
      const ax = ((a.x - cam.w / 2) * a.depth) / focal;
      const ay = ((cam.h / 2 - a.y) * a.depth) / focal;
      const bx = ((b.x - cam.w / 2) * b.depth) / focal;
      const by = ((cam.h / 2 - b.y) * b.depth) / focal;
      const x1 = ax + (bx - ax) * s;
      const y2 = ay + (by - ay) * s;
      out.push({
        x: cam.w / 2 + (x1 * focal) / near,
        y: cam.h / 2 - (y2 * focal) / near,
        depth: near,
        scale: focal / near,
        visible: true,
      });
    }
  }
  return out;
}

/** 屏幕拾取：返回距离点击位置最近且在容差内的 anchor。 */
export function pickAnchor(anchors: Anchor[], cam: Camera, x: number, y: number): string | null {
  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const a of anchors) {
    const p = projectPoint(a.position, cam);
    if (!p.visible) continue;
    const dist = Math.hypot(p.x - x, p.y - y);
    const tolerance = a.radius ?? 26;
    if (dist > tolerance) continue;
    // 距离优先；几乎重叠时选更靠近相机的实体
    const score = dist + p.depth * 0.02;
    if (score < bestScore) {
      bestScore = score;
      best = a.id;
    }
  }
  return best;
}

/** 把屏幕上的拖拽位移换算成地面平面上的世界位移（用于拖动植株）。 */
export function groundDragDelta(dx: number, dy: number, cam: Camera): { x: number; z: number } {
  const focal = cam.h / 2 / Math.tan(cam.fov / 2);
  const scale = focal / cam.distance;
  const alongRight = dx / scale;
  const alongAway = -dy / (scale * Math.max(0.25, Math.sin(cam.pitch)));
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  // right = (cos yaw, 0, -sin yaw)；away = (-sin yaw, 0, -cos yaw)
  return {
    x: alongRight * cy + alongAway * -sy,
    z: alongRight * -sy + alongAway * -cy,
  };
}

// ---------------- 低多边形网格生成 ----------------

/** 把面的顶点顺序统一成「法线背离实体中心」，省去手写绕序。 */
function orientOutward(faces: Face[], center: Vec3): Face[] {
  return faces.map((f) => {
    const n = faceNormal(f);
    const outward = sub(faceCenter(f), center);
    return dot(n, outward) < 0 ? { ...f, points: [...f.points].reverse() } : f;
  });
}

export function buildBox(center: Vec3, size: Vec3, color: string, alpha = 1): Face[] {
  const x0 = center.x - size.x / 2;
  const x1 = center.x + size.x / 2;
  const y0 = center.y - size.y / 2;
  const y1 = center.y + size.y / 2;
  const z0 = center.z - size.z / 2;
  const z1 = center.z + size.z / 2;
  const p = (x: number, y: number, z: number) => v3(x, y, z);
  const faces: Face[] = [
    { points: [p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)], color, alpha, cull: true },
    { points: [p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)], color, alpha, cull: true },
    { points: [p(x0, y0, z0), p(x1, y0, z0), p(x1, y1, z0), p(x0, y1, z0)], color, alpha, cull: true },
    { points: [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)], color, alpha, cull: true },
    { points: [p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0)], color, alpha, cull: true },
    { points: [p(x1, y0, z0), p(x1, y0, z1), p(x1, y1, z1), p(x1, y1, z0)], color, alpha, cull: true },
  ];
  return orientOutward(faces, center);
}

export function buildCylinder(cx: number, cz: number, radius: number, height: number, color: string, segments = 8, yBase = 0, topColor = color): Face[] {
  const center = v3(cx, yBase + height / 2, cz);
  const ring = (i: number, y: number, r: number) => {
    const a = (Math.PI * 2 * i) / segments;
    return v3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
  };
  const faces: Face[] = [];
  for (let i = 0; i < segments; i++) {
    faces.push({ points: [ring(i, yBase, radius), ring(i + 1, yBase, radius), ring(i + 1, yBase + height, radius), ring(i, yBase + height, radius)], color, cull: true });
  }
  faces.push({ points: Array.from({ length: segments }, (_, i) => ring(i, yBase + height, radius)), color: topColor, cull: true });
  faces.push({ points: Array.from({ length: segments }, (_, i) => ring(i, yBase, radius)), color, cull: true });
  return orientOutward(faces, center);
}

export function buildCone(cx: number, cz: number, radius: number, height: number, color: string, segments = 8, yBase = 0): Face[] {
  const center = v3(cx, yBase + height / 3, cz);
  const apex = v3(cx, yBase + height, cz);
  const ring = (i: number) => {
    const a = (Math.PI * 2 * i) / segments;
    return v3(cx + Math.cos(a) * radius, yBase, cz + Math.sin(a) * radius);
  };
  const faces: Face[] = [];
  for (let i = 0; i < segments; i++) {
    faces.push({ points: [ring(i), ring(i + 1), apex], color, cull: true });
  }
  faces.push({ points: Array.from({ length: segments }, (_, i) => ring(i)), color, cull: true });
  return orientOutward(faces, center);
}

export function buildSphere(cx: number, cy: number, cz: number, r: number, color: string, lat = 4, lon = 8): Face[] {
  const center = v3(cx, cy, cz);
  const at = (i: number, j: number) => {
    const theta = (Math.PI * j) / lat;
    const phi = (Math.PI * 2 * i) / lon;
    return v3(cx + r * Math.sin(theta) * Math.cos(phi), cy + r * Math.cos(theta), cz + r * Math.sin(theta) * Math.sin(phi));
  };
  const faces: Face[] = [];
  for (let j = 0; j < lat; j++) {
    for (let i = 0; i < lon; i++) {
      const pts = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      // 极圈上相邻点重合，去掉重复顶点否则法线会退化成零向量
      const uniq = pts.filter((p, k) => k === 0 || length(sub(p, pts[k - 1])) > 1e-6);
      if (uniq.length >= 3) faces.push({ points: uniq, color, cull: true });
    }
  }
  return orientOutward(faces, center);
}

/** 水平面统一把法线朝上，否则顺时针绕序会被 Lambert 着色压成暗色。 */
export function upwardFace(points: Vec3[], color: string, alpha = 1): Face {
  const face: Face = { points, color, alpha };
  return faceNormal(face).y < 0 ? { ...face, points: [...points].reverse() } : face;
}

export function buildDisc(cx: number, cz: number, radius: number, color: string, y = 0, segments = 20, alpha = 1): Face[] {
  const points = Array.from({ length: segments }, (_, i) => {
    const a = (Math.PI * 2 * i) / segments;
    return v3(cx + Math.cos(a) * radius, y, cz + Math.sin(a) * radius);
  });
  return [upwardFace(points, color, alpha)];
}

/** 任意 2D 多边形沿 Y 轴挤出，用于岛屿地块与花圃土台。 */
export function buildPrism(outline: { x: number; z: number }[], yBottom: number, yTop: number, topColor: string, sideColor: string): Face[] {
  const center = v3(
    outline.reduce((s, p) => s + p.x, 0) / outline.length,
    (yBottom + yTop) / 2,
    outline.reduce((s, p) => s + p.z, 0) / outline.length,
  );
  const faces: Face[] = [
    upwardFace(outline.map((p) => v3(p.x, yTop, p.z)), topColor),
  ];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    faces.push({ points: [v3(a.x, yBottom, a.z), v3(b.x, yBottom, b.z), v3(b.x, yTop, b.z), v3(a.x, yTop, a.z)], color: sideColor, cull: true });
  }
  faces.push({ points: outline.map((p) => v3(p.x, yBottom, p.z)), color: sideColor, cull: true });
  return orientOutward(faces, center);
}

/** 生成带轻微起伏的椭圆轮廓，避免完美圆形显得太「程序化」。 */
export function islandOutline(rx: number, rz: number, segments = 18, seed = 1): { x: number; z: number }[] {
  return Array.from({ length: segments }, (_, i) => {
    const a = (Math.PI * 2 * i) / segments;
    const wobble = 1 + 0.055 * Math.sin(a * 3 + seed) + 0.035 * Math.cos(a * 5 - seed * 1.7);
    return { x: Math.cos(a) * rx * wobble, z: Math.sin(a) * rz * wobble };
  });
}

// ---------------- 昼夜与天气 ----------------

export type Weather = "clear" | "rain" | "snow";

/** dayT: 0 = 正午，1 = 深夜。返回天空上下两色。 */
export function skyColors(dayT: number): [string, string] {
  const day: [string, string] = ["#bfe7fb", "#f3f7df"];
  const night: [string, string] = ["#202b4a", "#4a5a80"];
  const dusk: [string, string] = ["#f3b98a", "#f9dfae"];
  const t = clamp(dayT, 0, 1);
  const a = t < 0.55 ? day : dusk;
  const b = t < 0.55 ? dusk : night;
  const k = t < 0.55 ? t / 0.55 : (t - 0.55) / 0.45;
  return [mixHex(a[0], b[0], k), mixHex(a[1], b[1], k)];
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const k = clamp(t, 0, 1);
  const out = ca.map((c, i) => Math.round(c + (cb[i] - c) * k));
  return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** 光照方向随昼夜从东南高空移到西侧低空；ambient 夜间降低但仍保留可读性。 */
export function lightFor(dayT: number): { direction: Vec3; ambient: number } {
  const t = clamp(dayT, 0, 1);
  return {
    direction: normalize(v3(0.55 - t * 1.1, 1 - t * 0.72, 0.42 + t * 0.25)),
    ambient: 0.7 - t * 0.28,
  };
}
