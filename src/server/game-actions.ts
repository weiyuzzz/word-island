"use server";

import type { GardenStage } from "@/lib/game/model";
import type { ActionResult } from "@/lib/types";
import { getGarden } from "./garden";
import { abandonExploration, finishExploration, getMapState, resolveEvent, startExploration } from "./exploration";
import { buyItem, claimQuest, getShopState } from "./quests";

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    console.error("[action]", e);
    return { ok: false, error: e instanceof Error ? e.message : "操作失败，请稍后重试" };
  }
}

// ---------- 探索 / 战斗 ----------
export async function getMapStateAction() {
  return run(() => getMapState());
}

export async function startExplorationAction(regionKey: string, useTea: boolean) {
  return run(() => startExploration(regionKey, useTea));
}

export async function resolveEventAction(input: { eventKey: string; questionIndex: number; answer: string; responseMs: number }) {
  return run(() => resolveEvent(input));
}

export async function finishExplorationAction(explorationId: number) {
  return run(() => finishExploration(explorationId));
}

export async function abandonExplorationAction(explorationId: number) {
  return run(() => abandonExploration(explorationId));
}

// ---------- 任务 / 商店 ----------
export async function claimQuestAction(questKey: string) {
  return run(() => claimQuest(questKey));
}

export async function getShopStateAction() {
  return run(() => getShopState());
}

export async function buyItemAction(itemKey: string) {
  return run(() => buyItem(itemKey));
}

// ---------- 词汇花园 ----------
export async function getGardenAction(filter: GardenStage | "all" = "all") {
  return run(() => getGarden(filter));
}
