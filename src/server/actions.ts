"use server";

import type { ActionResult } from "@/lib/types";
import type { ImportFormat, WordInput } from "@/lib/vocab/parse";
import { claimLoginReward, updateDailyGoal } from "./dashboard";
import { buildAt, buyTheme, claimIsleReward, lighthouseCheckIn, moveBuilding, placeFromInventory, removeBuilding, upgradeBuilding, windmillHarvest } from "./island";
import { getRaidDetail, resolveRaidWave } from "./island-raid";
import { createSession, finishSession, selfAssess, submitAnswer } from "./study";
import { claimTask } from "./tasks";
import { addWord, createDeck, deleteDeck, deleteWord, exportDeck, getWords, importWords, listDecks, restoreBuiltinDeck, shareDeck, updateWord } from "./vocab";
import { exportProgress } from "./backup";
import {
  adminCreateUser,
  adminDeleteUser,
  adminResetPassword,
  listUsersForAdmin,
  loginUser,
  registerAndLogin,
} from "./auth";
import { audioStats, backfillAllAudio } from "./audio";
import { destroySession, requireAdmin } from "./session";
import {
  addToReadingVocab,
  analyzeSentenceAction,
  deleteNote,
  finishArticle,
  lookupWord,
  removeHighlight,
  replaceDelivery,
  saveHighlight,
  saveNote,
  saveProgress,
  setNoteFamiliarity,
} from "./reading";
import { importManualArticle, ingestNews, ingestSource } from "./reading-source";
import { sanitizeError, schemas } from "./validate";

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    console.error("[action]", e);
    return { ok: false, error: sanitizeError(e) };
  }
}

// ---------- 学习 ----------
export async function startSessionAction(input: { deckId: number | null; kind: string; size: number }) {
  const parsed = schemas.startSession.safeParse(input);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => createSession(parsed.data as Parameters<typeof createSession>[0]));
}

export async function answerAction(input: { sessionId: number; index: number; answer: string; responseMs: number; usedHint: boolean }) {
  const parsed = schemas.answer.safeParse(input);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => submitAnswer(parsed.data));
}

export async function finishSessionAction(sessionId: number) {
  const parsed = schemas.finishSession.safeParse(sessionId);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => finishSession(parsed.data));
}

export async function selfAssessAction(input: { wordId: number; grade: "familiar" | "ok" | "forgotten" }) {
  const parsed = schemas.selfAssess.safeParse(input);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => selfAssess(parsed.data.wordId, parsed.data.grade));
}

// ---------- 任务 / 奖励 ----------
export async function claimTaskAction(taskKey: string) {
  const parsed = schemas.claimTask.safeParse(taskKey);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => claimTask(parsed.data));
}

export async function claimLoginRewardAction() {
  return run(() => claimLoginReward());
}

export async function updateDailyGoalAction(goal: number) {
  const parsed = schemas.updateDailyGoal.safeParse(goal);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => updateDailyGoal(parsed.data));
}

// ---------- 岛屿 ----------
export async function buildAction(type: string, slot: number) {
  const parsed = schemas.build.safeParse({ type, slot });
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => buildAt(parsed.data.type, parsed.data.slot));
}

export async function upgradeAction(buildingId: number) {
  const parsed = schemas.upgrade.safeParse(buildingId);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => upgradeBuilding(parsed.data));
}

export async function removeBuildingAction(buildingId: number) {
  const parsed = schemas.removeBuilding.safeParse(buildingId);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => removeBuilding(parsed.data));
}

export async function moveBuildingAction(buildingId: number, slot: number) {
  const parsed = schemas.moveBuilding.safeParse({ id: buildingId, slot });
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => moveBuilding(parsed.data.id, parsed.data.slot));
}

export async function placeFromInventoryAction(itemKey: string, slot: number) {
  const parsed = schemas.placeFromInventory.safeParse({ itemKey, slot });
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => placeFromInventory(parsed.data.itemKey, parsed.data.slot));
}

export async function lighthouseCheckInAction() {
  return run(() => lighthouseCheckIn());
}

export async function windmillHarvestAction() {
  return run(() => windmillHarvest());
}

export async function claimIsleRewardAction(slug: string) {
  const parsed = schemas.isleSlug.safeParse(slug);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => claimIsleReward(parsed.data));
}

export async function buyThemeAction(key: "tropical" | "aurora" | "sunset") {
  const parsed = schemas.themeKey.safeParse(key);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => buyTheme(parsed.data));
}

export async function getRaidDetailAction(raidId: number) {
  const parsed = schemas.finishArticle.safeParse(raidId);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => getRaidDetail(parsed.data));
}

export async function resolveRaidWaveAction(input: { raidId: number; waveIndex: number; answerIndex: number }) {
  const parsed = schemas.resolveRaidWave.safeParse(input);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => resolveRaidWave(parsed.data.raidId, parsed.data.waveIndex, parsed.data.answerIndex));
}

// ---------- 词库 ----------
export async function listDecksAction() {
  return run(() => listDecks());
}

export async function getWordsAction(input: { deckId: number | null; q?: string; status?: string; wrongOnly?: boolean; limit?: number; offset?: number }) {
  const parsed = schemas.getWords.safeParse(input);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => getWords(parsed.data as Parameters<typeof getWords>[0]));
}

export async function createDeckAction(name: string, description: string) {
  const parsed = schemas.createDeck.safeParse({ name, description });
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => createDeck(parsed.data.name, parsed.data.description));
}

export async function deleteDeckAction(id: number) {
  const parsed = schemas.deleteDeck.safeParse(id);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => deleteDeck(parsed.data));
}

export async function restoreBuiltinDeckAction(slug: string) {
  const parsed = schemas.restoreBuiltinDeck.safeParse(slug);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => restoreBuiltinDeck(parsed.data));
}

export async function addWordAction(deckId: number, input: WordInput) {
  const parsed = schemas.addWord.safeParse({ deckId, input });
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => addWord(parsed.data.deckId, parsed.data.input));
}

export async function updateWordAction(id: number, input: WordInput) {
  const parsed = schemas.updateWord.safeParse({ id, input });
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => updateWord(parsed.data.id, parsed.data.input));
}

export async function deleteWordAction(id: number) {
  const parsed = schemas.deleteWord.safeParse(id);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => deleteWord(parsed.data));
}

export async function importWordsAction(input: { deckId: number | null; newDeckName: string | null; text: string; format: ImportFormat }) {
  const parsed = schemas.importWords.safeParse(input);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => importWords(parsed.data as Parameters<typeof importWords>[0]));
}

export async function exportDeckAction(deckId: number, format: ImportFormat) {
  const parsed = schemas.exportDeck.safeParse({ deckId, format });
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => exportDeck(parsed.data.deckId, parsed.data.format));
}

export async function shareDeckAction(deckId: number) {
  const parsed = schemas.shareDeck.safeParse({ deckId });
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => shareDeck(parsed.data.deckId));
}

export async function exportProgressAction() {
  return run(() => exportProgress());
}

// ---------- 账号 ----------

export async function loginAction(input: { username: string; password: string }) {
  const parsed = schemas.login.safeParse(input);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => loginUser(parsed.data.username, parsed.data.password));
}

export async function registerAction(input: { username: string; password: string }) {
  const parsed = schemas.register.safeParse(input);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => registerAndLogin(parsed.data.username, parsed.data.password));
}

export async function logoutAction() {
  return run(() => destroySession());
}

// ---------- 后台管理 ----------

export async function adminCreateUserAction(input: { username: string; password: string }) {
  const parsed = schemas.adminCreateUser.safeParse(input);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => adminCreateUser(parsed.data.username, parsed.data.password));
}

export async function adminResetPasswordAction(userId: number, password: string) {
  const parsed = schemas.adminResetPassword.safeParse({ userId, password });
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => adminResetPassword(parsed.data.userId, parsed.data.password));
}

export async function adminDeleteUserAction(userId: number) {
  const parsed = schemas.adminDeleteUser.safeParse(userId);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => adminDeleteUser(parsed.data));
}

export async function listUsersForAdminAction() {
  return run(() => listUsersForAdmin());
}

export async function backfillAudioAction() {
  return run(() => backfillAllAudio());
}

export async function audioStatsAction() {
  return run(() => audioStats());
}

// ---------- 书屿 ----------

export async function replaceDeliveryAction(slot: "deep" | "broad" | "news") {
  const parsed = schemas.readingSlot.safeParse(slot);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => replaceDelivery(parsed.data));
}

export async function saveReadingProgressAction(input: { deliveryId: number; paragraphIndex: number; addSeconds: number }) {
  const parsed = schemas.saveProgress.safeParse(input);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => saveProgress(parsed.data.deliveryId, parsed.data.paragraphIndex, parsed.data.addSeconds));
}

export async function finishArticleAction(deliveryId: number) {
  const parsed = schemas.finishArticle.safeParse(deliveryId);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => finishArticle(parsed.data));
}

export async function saveHighlightAction(input: {
  articleId: number;
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
  color: "sun" | "leaf" | "ocean";
}) {
  const parsed = schemas.saveHighlight.safeParse(input);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => saveHighlight(parsed.data));
}

export async function removeHighlightAction(id: number) {
  const parsed = schemas.removeHighlight.safeParse(id);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => removeHighlight(parsed.data));
}

export async function saveNoteAction(
  input: {
    articleId: number;
    paragraphIndex: number;
    startOffset: number;
    endOffset: number;
    quote: string;
    noteType: "expression" | "phrase" | "grammar" | "long_sentence";
    content: string;
    tags: string[];
    aiAnalysis?: string | null;
  },
) {
  const parsed = schemas.saveNote.safeParse(input);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => saveNote(parsed.data));
}

export async function noteFamiliarityAction(ids: number[], familiarity: string) {
  const parsed = schemas.noteFamiliarity.safeParse({ ids, familiarity });
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => setNoteFamiliarity(parsed.data.ids, parsed.data.familiarity));
}

export async function deleteNoteAction(id: number) {
  const parsed = schemas.deleteNote.safeParse(id);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => deleteNote(parsed.data));
}

export async function lookupWordAction(word: string) {
  const parsed = schemas.lookupWord.safeParse(word);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => lookupWord(parsed.data));
}

export async function addReadingWordAction(input: {
  word: string;
  meaning: string;
  phonetic?: string;
  pos?: string;
  example?: string;
  translation?: string;
}) {
  const parsed = schemas.addReadingWord.safeParse(input);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => addToReadingVocab(parsed.data));
}

export async function analyzeSentenceAIAction(quote: string) {
  const parsed = schemas.analyzeSentence.safeParse(quote);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(() => analyzeSentenceAction(parsed.data));
}

export async function manualImportArticleAction(input: {
  title: string;
  author?: string;
  url?: string;
  topic?: string;
  text: string;
}) {
  const parsed = schemas.manualImport.safeParse(input);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(async () => {
    await requireAdmin();
    return importManualArticle(parsed.data);
  });
}

export async function ingestArticlesAction(source: "conversation" | "guardian" | "bbc" | "news") {
  const parsed = schemas.ingestSource.safeParse(source);
  if (!parsed.success) return { ok: false, error: sanitizeError(parsed.error) } as ActionResult<never>;
  return run(async () => {
    await requireAdmin();
    if (parsed.data === "news") return ingestNews();
    return ingestSource(parsed.data);
  });
}
