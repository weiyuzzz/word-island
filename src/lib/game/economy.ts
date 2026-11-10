/**
 * 经济系统：等级曲线与奖励规则。
 * 设计目标：一次 10 题的学习约获得 40~60 金币、50~70 经验；
 * 15 级（城堡）大约需要 6000 XP ≈ 两个月的每日学习。
 */

export const INITIAL_COINS = 120;
export const MAX_LEVEL = 60;

export function xpToNext(level: number): number {
  return 100 + (level - 1) * 50;
}

export function levelFromXp(xp: number): { level: number; levelXp: number; levelNeed: number } {
  let level = 1;
  let remaining = Math.max(0, xp);
  while (level < MAX_LEVEL && remaining >= xpToNext(level)) {
    remaining -= xpToNext(level);
    level++;
  }
  return { level, levelXp: remaining, levelNeed: xpToNext(level) };
}

/** 升到某一级累计需要的 XP */
export function totalXpForLevel(level: number): number {
  let sum = 0;
  for (let l = 1; l < level; l++) sum += xpToNext(l);
  return sum;
}

export const ANSWER_REWARDS = {
  correct: { coins: 3, xp: 4 },
  correctNew: { coins: 4, xp: 5 },
  hesitant: { coins: 2, xp: 3 },
  wrong: { coins: 0, xp: 1 },
  reviewXpBonus: 1,
} as const;

export const STREAK_BONUS = { every: 5, coins: 5 } as const;

export interface AnswerRewardInput {
  quality: 0 | 1 | 2;
  isNew: boolean;
  isReview: boolean;
  streakAfter: number;
}

export function answerReward(input: AnswerRewardInput): { coins: number; xp: number; streakBonus: number } {
  if (input.quality === 0) {
    return { coins: ANSWER_REWARDS.wrong.coins, xp: ANSWER_REWARDS.wrong.xp, streakBonus: 0 };
  }
  const base =
    input.quality === 1
      ? ANSWER_REWARDS.hesitant
      : input.isNew
        ? ANSWER_REWARDS.correctNew
        : ANSWER_REWARDS.correct;
  const xp = base.xp + (input.isReview ? ANSWER_REWARDS.reviewXpBonus : 0);
  const streakBonus =
    input.streakAfter > 0 && input.streakAfter % STREAK_BONUS.every === 0 ? STREAK_BONUS.coins : 0;
  return { coins: base.coins, xp, streakBonus };
}

export interface SessionBonusInput {
  total: number;
  answered: number;
  correct: number;
}

export function sessionBonus(input: SessionBonusInput): { coins: number; xp: number; reasons: string[] } {
  if (input.total <= 0 || input.answered < input.total) {
    return { coins: 0, xp: 0, reasons: [] };
  }
  let coins = 10;
  let xp = 15;
  const reasons = ["完成一组学习 +10 金币 +15 XP"];
  const accuracy = input.correct / input.total;
  if (accuracy >= 0.8) {
    coins += 8;
    xp += 8;
    reasons.push("正确率 ≥ 80% +8 金币 +8 XP");
  }
  if (accuracy === 1 && input.total >= 10) {
    coins += 10;
    xp += 10;
    reasons.push("全部答对 +10 金币 +10 XP");
  }
  return { coins, xp, reasons };
}

export const LOGIN_REWARD = { coins: 15, xp: 5 } as const;
export const SESSION_SIZES = [10, 30, 50, 100] as const;
export const SESSION_SIZE_MAX = 200;
export const DAILY_GOAL_OPTIONS = [20, 30, 50, 80] as const;
