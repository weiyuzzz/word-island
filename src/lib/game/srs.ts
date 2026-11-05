import type { QuizMode, WordStatus } from "@/lib/types";

/**
 * 简化版间隔复习算法（非 SM-2）：
 * - 每个单词有 proficiency(0~100)、连续答对 streak、复习间隔阶梯。
 * - 答错：熟练度下降、streak 归零、10 分钟后再次出现。
 * - 答对但犹豫（用时过长 / 用了提示）：小幅提升，间隔回退一档。
 * - 正常答对：按题型权重提升熟练度，间隔沿阶梯延长。
 * - 熟练度、连续答对次数、总答对次数同时达标才算“已掌握”，
 *   已掌握的单词仍会在 30 天左右周期性复习。
 */

export interface ProgressState {
  status: WordStatus;
  proficiency: number;
  streak: number;
  correctCount: number;
  wrongCount: number;
  lapses: number;
  intervalMinutes: number;
  nextReviewAt: Date | null;
  lastReviewedAt: Date | null;
}

export const MODE_WEIGHT: Record<QuizMode, number> = {
  en2zh: 1,
  zh2en: 1.2,
  context: 1.3,
  spelling: 1.5,
  listen: 1.3,
  synonym: 1.4,
  antonym: 1.4,
  sentence: 1.5,
};

export const MODE_META: Record<QuizMode, { label: string; short: string; description: string }> = {
  en2zh: { label: "英译中", short: "英→中", description: "看英文选中文释义" },
  zh2en: { label: "中译英", short: "中→英", description: "看中文释义选英文单词" },
  spelling: { label: "拼写挑战", short: "拼写", description: "根据释义与例句拼写单词" },
  context: { label: "语境选择", short: "语境", description: "根据例句上下文选择单词" },
  listen: { label: "听音辨词", short: "听音", description: "听发音，选择正确的释义" },
  synonym: { label: "同义词辨析", short: "同义", description: "选择与单词意思最接近的表达" },
  antonym: { label: "反义词匹配", short: "反义", description: "选择单词的反义词" },
  sentence: { label: "句子构建", short: "构句", description: "选择在句中正确的单词形式" },
};

/** 超过该用时视为“犹豫” */
export const HESITATION_MS: Record<QuizMode, number> = {
  en2zh: 8000,
  zh2en: 10000,
  context: 14000,
  spelling: 25000,
  listen: 12000,
  synonym: 12000,
  antonym: 12000,
  sentence: 18000,
};

const MIN = 1;
const HOUR = 60;
const DAY = 24 * HOUR;

export const INTERVAL_LADDER_MINUTES = [10 * MIN, 4 * HOUR, 1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 60 * DAY];

export const MASTERY_RULE = { proficiency: 85, streak: 5, correctCount: 5 } as const;
export const MASTERED_MIN_INTERVAL = 30 * DAY;

export const STATUS_META: Record<WordStatus, { label: string; order: number }> = {
  new: { label: "未学习", order: 0 },
  learning: { label: "学习中", order: 1 },
  review: { label: "复习中", order: 2 },
  mastered: { label: "已掌握", order: 3 },
};

export function initialProgress(): ProgressState {
  return {
    status: "new",
    proficiency: 0,
    streak: 0,
    correctCount: 0,
    wrongCount: 0,
    lapses: 0,
    intervalMinutes: 0,
    nextReviewAt: null,
    lastReviewedAt: null,
  };
}

/** 0 = 答错，1 = 答对但犹豫 / 用了提示，2 = 干脆答对 */
export function gradeAnswer(correct: boolean, mode: QuizMode, responseMs: number, usedHint = false): 0 | 1 | 2 {
  if (!correct) return 0;
  if (usedHint) return 1;
  if (responseMs > HESITATION_MS[mode]) return 1;
  return 2;
}

function resolveStatus(prev: WordStatus, next: Omit<ProgressState, "status">): WordStatus {
  if (
    next.proficiency >= MASTERY_RULE.proficiency &&
    next.streak >= MASTERY_RULE.streak &&
    next.correctCount >= MASTERY_RULE.correctCount
  ) {
    return "mastered";
  }
  if (next.proficiency >= 40 && next.streak >= 2) return "review";
  if (prev === "mastered" || prev === "review") {
    // 掉出掌握/复习区间后回到复习中或学习中
    return next.proficiency >= 40 ? "review" : "learning";
  }
  return "learning";
}

export function applyReview(prev: ProgressState, mode: QuizMode, quality: 0 | 1 | 2, now: Date = new Date()): ProgressState {
  const weight = MODE_WEIGHT[mode];
  let proficiency = prev.proficiency;
  let streak = prev.streak;
  let correctCount = prev.correctCount;
  let wrongCount = prev.wrongCount;
  let lapses = prev.lapses;
  let intervalMinutes: number;

  if (quality === 0) {
    const penalty = prev.status === "mastered" ? 30 : 20;
    proficiency = Math.max(0, proficiency - penalty);
    streak = 0;
    wrongCount += 1;
    if (prev.status !== "new") lapses += 1;
    intervalMinutes = INTERVAL_LADDER_MINUTES[0];
  } else {
    streak += 1;
    correctCount += 1;
    const gain = quality === 1 ? 6 : 12;
    proficiency = Math.min(100, proficiency + Math.round(gain * weight));
    const stage = Math.min(streak, INTERVAL_LADDER_MINUTES.length - 1);
    const effectiveStage = quality === 1 ? Math.max(1, stage - 1) : stage;
    intervalMinutes = INTERVAL_LADDER_MINUTES[effectiveStage];
  }

  const partial = { proficiency, streak, correctCount, wrongCount, lapses, intervalMinutes, nextReviewAt: null, lastReviewedAt: now };
  const status = resolveStatus(prev.status, partial);
  if (status === "mastered") {
    intervalMinutes = Math.max(intervalMinutes, MASTERED_MIN_INTERVAL);
  }
  const nextReviewAt = new Date(now.getTime() + intervalMinutes * 60_000);
  return { ...partial, status, intervalMinutes, nextReviewAt };
}

/** 根据掌握状态选择题型：越熟练越偏向主动回忆（中译英、语境、拼写） */
export function chooseMode(status: WordStatus, hasContext: boolean, rng: () => number = Math.random): QuizMode {
  const r = rng();
  switch (status) {
    case "new":
      return "en2zh";
    case "learning":
      return r < 0.55 ? "en2zh" : "zh2en";
    case "review":
      if (hasContext && r < 0.35) return "context";
      if (r < 0.65) return "zh2en";
      return "spelling";
    case "mastered":
      return hasContext && r < 0.5 ? "context" : "spelling";
  }
}

export function proficiencyLabel(p: number): string {
  if (p >= 85) return "非常熟悉";
  if (p >= 60) return "比较熟悉";
  if (p >= 40) return "有印象";
  if (p > 0) return "刚接触";
  return "未学习";
}
