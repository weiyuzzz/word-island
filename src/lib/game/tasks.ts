import type { Reward } from "@/lib/types";

export type DailyMetric = "newLearned" | "reviewed" | "bestStreak" | "total";

export interface DailyTaskDef {
  key: string;
  title: string;
  description: string;
  metric: DailyMetric;
  target: number | "dailyGoal";
  reward: Reward;
}

export const DAILY_TASKS: DailyTaskDef[] = [
  {
    key: "new10",
    title: "学习 10 个新单词",
    description: "认识 10 个从未学过的单词",
    metric: "newLearned",
    target: 10,
    reward: { coins: 20, xp: 10 },
  },
  {
    key: "review20",
    title: "完成 20 次复习",
    description: "复习已经学过的单词 20 次",
    metric: "reviewed",
    target: 20,
    reward: { coins: 30, xp: 15 },
  },
  {
    key: "streak10",
    title: "连续答对 10 道题",
    description: "在一组学习中连续答对 10 题",
    metric: "bestStreak",
    target: 10,
    reward: { coins: 15, xp: 10 },
  },
  {
    key: "goal",
    title: "完成今日学习目标",
    description: "完成今日设定的答题目标",
    metric: "total",
    target: "dailyGoal",
    reward: { coins: 50, xp: 30 },
  },
];

export interface AchievementContext {
  sessionsCompleted: number;
  learnedCount: number;
  masteredCount: number;
  streak: number;
  buildingsCount: number;
  perfectSession: boolean;
  level: number;
}

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  icon: string;
  reward: Reward;
  check: (ctx: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    key: "first_voyage",
    title: "初次启航",
    description: "完成第一次学习",
    icon: "sail",
    reward: { coins: 30, xp: 20 },
    check: (c) => c.sessionsCompleted >= 1,
  },
  {
    key: "perfect_session",
    title: "完美一课",
    description: "一组学习（≥10 题）全部答对",
    icon: "trophy",
    reward: { coins: 40, xp: 20 },
    check: (c) => c.perfectSession,
  },
  {
    key: "learner_100",
    title: "勤奋学习者",
    description: "累计学习 100 个单词",
    icon: "book",
    reward: { coins: 100, xp: 50 },
    check: (c) => c.learnedCount >= 100,
  },
  {
    key: "master_50",
    title: "记忆新星",
    description: "掌握 50 个单词",
    icon: "star",
    reward: { coins: 80, xp: 40 },
    check: (c) => c.masteredCount >= 50,
  },
  {
    key: "master_500",
    title: "记忆大师",
    description: "掌握 500 个单词",
    icon: "brain",
    reward: { coins: 500, xp: 200 },
    check: (c) => c.masteredCount >= 500,
  },
  {
    key: "streak_7",
    title: "坚持不懈",
    description: "连续学习 7 天",
    icon: "flame",
    reward: { coins: 150, xp: 60 },
    check: (c) => c.streak >= 7,
  },
  {
    key: "builder_10",
    title: "岛屿建设者",
    description: "建设 10 个建筑",
    icon: "hammer",
    reward: { coins: 200, xp: 80 },
    check: (c) => c.buildingsCount >= 10,
  },
  {
    key: "level_10",
    title: "岛屿之星",
    description: "达到 10 级",
    icon: "crown",
    reward: { coins: 300, xp: 0 },
    check: (c) => c.level >= 10,
  },
];

export function getAchievementDef(key: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.key === key);
}
