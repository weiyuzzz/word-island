"use server";

import type { ActionResult } from "@/lib/types";
import { getGarden } from "./garden";
import { abandonExploration, finishExploration, getMapState, resolveEvent, startExploration } from "./exploration";
import { buyItem, claimQuest, getShopState } from "./quests";
import { gameSchemas, sanitizeError } from "./validate";

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    console.error("[action]", e);
    return { ok: false, error: sanitizeError(e) };
  }
}

// ---------- 探索 / 战斗 ----------
export async function getMapStateAction() {
  return run(() => getMapState());
}

export async function startExplorationAction(regionKey: string, useTea: boolean) {
  const parsed = gameSchemas.startExploration.safeParse({ regionKey, useTea });
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => startExploration(parsed.data.regionKey, parsed.data.useTea));
}

export async function resolveEventAction(input: { eventKey: string; questionIndex: number; answer: string; responseMs: number }) {
  const parsed = gameSchemas.resolveEvent.safeParse(input);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => resolveEvent(parsed.data));
}

export async function finishExplorationAction(explorationId: number) {
  const parsed = gameSchemas.finishExploration.safeParse(explorationId);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => finishExploration(parsed.data));
}

export async function abandonExplorationAction(explorationId: number) {
  const parsed = gameSchemas.abandonExploration.safeParse(explorationId);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => abandonExploration(parsed.data));
}

// ---------- 任务 / 商店 ----------
export async function claimQuestAction(questKey: string) {
  const parsed = gameSchemas.claimQuest.safeParse(questKey);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => claimQuest(parsed.data));
}

export async function getShopStateAction() {
  return run(() => getShopState());
}

export async function buyItemAction(itemKey: string) {
  const parsed = gameSchemas.buyItem.safeParse(itemKey);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => buyItem(parsed.data));
}

// ---------- 词汇花园 ----------
export async function getGardenAction(filter?: string) {
  const parsed = gameSchemas.getGarden.safeParse(filter ?? "all");
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => getGarden(parsed.data));
}
