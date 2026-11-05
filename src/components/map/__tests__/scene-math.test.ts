import { describe, expect, it } from "vitest";
import { MIN_HIT_SIZE, castTarget, clamp, easeOutCubic, hitToken, inCastZone, layoutTokens } from "../scene-math";

describe("layoutTokens", () => {
  it("lays 4 options out in a 2x2 grid inside the stage", () => {
    const boxes = layoutTokens(4, 900, 470);
    expect(boxes).toHaveLength(4);
    expect(boxes[0].y).toBe(boxes[1].y);
    expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
    expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
    for (const b of boxes) {
      expect(b.h).toBeGreaterThanOrEqual(MIN_HIT_SIZE);
      expect(b.w).toBeGreaterThanOrEqual(MIN_HIT_SIZE);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(900);
      expect(b.y + b.h).toBeLessThanOrEqual(470);
    }
  });

  it("switches to a single column on narrow screens without shrinking hit targets", () => {
    const boxes = layoutTokens(4, 375, 400);
    expect(boxes).toHaveLength(4);
    expect(boxes[1].x).toBe(boxes[0].x);
    expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
    for (const b of boxes) {
      expect(b.h).toBeGreaterThanOrEqual(MIN_HIT_SIZE);
      expect(b.y + b.h).toBeLessThanOrEqual(400);
    }
  });

  it("returns an empty layout for spelling questions", () => {
    expect(layoutTokens(0, 900, 470)).toEqual([]);
  });
});

describe("hitToken", () => {
  const boxes = layoutTokens(4, 900, 470);

  it("finds the box under a point and misses outside points", () => {
    const b = boxes[2];
    expect(hitToken(boxes, b.x + b.w / 2, b.y + b.h / 2)).toBe(2);
    expect(hitToken(boxes, -10, -10)).toBe(-1);
    expect(hitToken(boxes, 900, 470)).toBe(-1);
  });
});

describe("cast target", () => {
  it("accepts a token dropped on the monster and rejects one left at home", () => {
    const target = castTarget(900, 470);
    const box = layoutTokens(4, 900, 470)[0];
    expect(target.r).toBeGreaterThanOrEqual(MIN_HIT_SIZE / 2);
    expect(inCastZone(box, box.x, box.y, target)).toBe(false);
    expect(inCastZone(box, target.x - box.w / 2, target.y - box.h / 2, target)).toBe(true);
  });
});

describe("animation helpers", () => {
  it("clamps values and eases monotonically", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});
