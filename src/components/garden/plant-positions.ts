"use client";

import { useSyncExternalStore } from "react";
import type { PlantPosition } from "./garden-world";

/**
 * 植株在 3D 花圃里的位置只影响呈现，不动数据库 / 表结构。
 * 用 localStorage 记住用户自己挪过的位置；useSyncExternalStore 保证 SSR 快照稳定。
 */
const KEY = "word-island:garden-positions-v1";
const EVENT = "word-island:garden-positions-change";
const EMPTY: Record<number, PlantPosition> = {};

let cachedRaw: string | null | undefined;
let cachedValue: Record<number, PlantPosition> = EMPTY;

function parse(raw: string | null): Record<number, PlantPosition> {
  if (!raw) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY;
    const out: Record<number, PlantPosition> = {};
    for (const [k, p] of Object.entries(value)) {
      if (p && typeof p === "object" && Number.isFinite((p as PlantPosition).x) && Number.isFinite((p as PlantPosition).z)) {
        out[Number(k)] = { x: (p as PlantPosition).x, z: (p as PlantPosition).z };
      }
    }
    return out;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): Record<number, PlantPosition> {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = parse(raw);
  }
  return cachedValue;
}

function getServerSnapshot(): Record<number, PlantPosition> {
  return EMPTY;
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function usePlantPositions(): Record<number, PlantPosition> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setPlantPosition(id: number, position: PlantPosition): void {
  const next = { ...getSnapshot(), [id]: position };
  const raw = JSON.stringify(next);
  cachedRaw = raw;
  cachedValue = next;
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // 隐私模式下退化为当前会话内有效
  }
  window.dispatchEvent(new Event(EVENT));
}

export function clearPlantPositions(): void {
  cachedRaw = null;
  cachedValue = EMPTY;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 同上
  }
  window.dispatchEvent(new Event(EVENT));
}
