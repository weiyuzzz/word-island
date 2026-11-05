/**
 * P1 Canvas 场景的纯几何计算：词贝布局、命中检测与施法判定。
 * 不依赖 DOM / React，便于在 node 环境下单元测试。
 */

export interface TokenBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CastTarget {
  x: number;
  y: number;
  r: number;
}

/** 触屏命中区域下限（Apple HIG / WCAG 建议 44px）。 */
export const MIN_HIT_SIZE = 44;

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

/** 2×2 网格；窄屏自动改单列，保证每个词贝仍有足够大的点击区域。 */
export function layoutTokens(count: number, w: number, h: number): TokenBox[] {
  if (count <= 0 || w <= 0 || h <= 0) return [];
  const cols = w < 540 || count === 1 ? 1 : 2;
  const rows = Math.ceil(count / cols);
  const gap = 12;
  const areaW = Math.min(cols === 2 ? w * 0.5 : w * 0.66, 460);
  const boxW = (areaW - (cols - 1) * gap) / cols;
  const boxH = Math.max(MIN_HIT_SIZE, Math.min(56, (h * 0.34 - (rows - 1) * gap) / rows));
  const startX = (w - areaW) / 2;
  const startY = h * 0.47;
  const boxes: TokenBox[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    boxes.push({
      x: startX + col * (boxW + gap),
      y: startY + row * (boxH + gap),
      w: boxW,
      h: boxH,
    });
  }
  return boxes;
}

/** 返回命中的词贝下标；后绘制的在上层，所以逆序遍历。 */
export function hitToken(boxes: TokenBox[], x: number, y: number): number {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
  }
  return -1;
}

/** 怪物身上的施法法阵位置。 */
export function castTarget(w: number, h: number): CastTarget {
  return { x: w * 0.8, y: h * 0.6, r: Math.max(MIN_HIT_SIZE / 2, Math.min(62, w * 0.075)) };
}

/** 词贝被拖到法阵范围内即视为施放（允许中心略微偏出）。 */
export function inCastZone(box: TokenBox, x: number, y: number, target: CastTarget): boolean {
  const cx = x + box.w / 2;
  const cy = y + box.h / 2;
  return Math.hypot(cx - target.x, cy - target.y) <= target.r + Math.min(box.w, box.h) * 0.35;
}
