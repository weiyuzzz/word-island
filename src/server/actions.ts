"use server";

import type { ActionResult, SessionKind, WordStatus } from "@/lib/types";
import type { ImportFormat, WordInput } from "@/lib/vocab/parse";
import { claimLoginReward, updateDailyGoal } from "./dashboard";
import { buildAt, removeBuilding, upgradeBuilding } from "./island";
import { createSession, finishSession, submitAnswer } from "./study";
import { claimTask } from "./tasks";
import { addWord, createDeck, deleteDeck, deleteWord, exportDeck, getWords, importWords, listDecks, updateWord } from "./vocab";

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    console.error("[action]", e);
    return { ok: false, error: e instanceof Error ? e.message : "操作失败，请稍后重试" };
  }
}

// ---------- 学习 ----------
export async function startSessionAction(input: { deckId: number | null; kind: SessionKind; size: number }) {
  return run(() => createSession(input));
}

export async function answerAction(input: { sessionId: number; index: number; answer: string; responseMs: number; usedHint: boolean }) {
  return run(() => submitAnswer(input));
}

export async function finishSessionAction(sessionId: number) {
  return run(() => finishSession(sessionId));
}

// ---------- 任务 / 奖励 ----------
export async function claimTaskAction(taskKey: string) {
  return run(() => claimTask(taskKey));
}

export async function claimLoginRewardAction() {
  return run(() => claimLoginReward());
}

export async function updateDailyGoalAction(goal: number) {
  return run(() => updateDailyGoal(goal));
}

// ---------- 岛屿 ----------
export async function buildAction(type: string, slot: number) {
  return run(() => buildAt(type, slot));
}

export async function upgradeAction(buildingId: number) {
  return run(() => upgradeBuilding(buildingId));
}

export async function removeBuildingAction(buildingId: number) {
  return run(() => removeBuilding(buildingId));
}

// ---------- 词库 ----------
export async function listDecksAction() {
  return run(() => listDecks());
}

export async function getWordsAction(input: { deckId: number | null; q?: string; status?: WordStatus | "all"; wrongOnly?: boolean; limit?: number; offset?: number }) {
  return run(() => getWords(input));
}

export async function createDeckAction(name: string, description: string) {
  return run(() => createDeck(name, description));
}

export async function deleteDeckAction(id: number) {
  return run(() => deleteDeck(id));
}

export async function addWordAction(deckId: number, input: WordInput) {
  return run(() => addWord(deckId, input));
}

export async function updateWordAction(id: number, input: WordInput) {
  return run(() => updateWord(id, input));
}

export async function deleteWordAction(id: number) {
  return run(() => deleteWord(id));
}

export async function importWordsAction(input: { deckId: number | null; newDeckName: string | null; text: string; format: ImportFormat }) {
  return run(() => importWords(input));
}

export async function exportDeckAction(deckId: number, format: ImportFormat) {
  return run(() => exportDeck(deckId, format));
}
