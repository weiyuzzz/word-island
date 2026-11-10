import type { WordInput } from "@/lib/vocab/parse";

export type WordStatus = "new" | "learning" | "review" | "mastered";
export type QuizMode = "en2zh" | "zh2en" | "spelling" | "context" | "listen" | "synonym" | "antonym" | "sentence" | "dictation";
export type SessionKind = "mixed" | "review" | "new" | "dictation";

/** 存在数据库里的题目记录（包含正确答案，不会原样发给客户端） */
export interface QuestionRecord {
  wordId: number;
  mode: QuizMode;
  options: string[];
  correct: string;
  prompt: string | null;
  isNew: boolean;
  answered: boolean;
  wasCorrect: boolean | null;
}

/** 发给客户端的题目（不包含答案） */
export interface ClientQuestion {
  index: number;
  wordId: number;
  mode: QuizMode;
  isNew: boolean;
  word?: string;
  phonetic?: string;
  pos?: string;
  meaning?: string;
  prompt?: string | null;
  options?: string[];
  length?: number;
  firstLetter?: string;
}

export interface ClientSession {
  id: number;
  kind: SessionKind;
  deckName: string;
  total: number;
  questions: ClientQuestion[];
}

export interface WordDetail {
  id: number;
  deckId: number;
  word: string;
  phonetic: string;
  pos: string;
  meaning: string;
  example: string;
  translation: string;
  difficulty: number;
}

export interface WordView extends WordDetail {
  status: WordStatus;
  proficiency: number;
  streak: number;
  correctCount: number;
  wrongCount: number;
  nextReviewAt: string | null;
  lastReviewedAt: string | null;
}

export interface PlayerSnapshot {
  coins: number;
  xp: number;
  level: number;
  levelXp: number;
  levelNeed: number;
  streak: number;
  dailyGoal: number;
}

export interface Reward {
  coins: number;
  xp: number;
}

export interface AnswerResult {
  correct: boolean;
  correctAnswer: string;
  word: WordDetail;
  reward: { coins: number; xp: number; streakBonus: number };
  quality: 0 | 1 | 2;
  sessionStreak: number;
  player: PlayerSnapshot;
  leveledUp: boolean;
  statusBefore: WordStatus;
  statusAfter: WordStatus;
  proficiency: number;
  nextReviewAt: string | null;
  alreadyAnswered: boolean;
}

export interface AchievementView {
  key: string;
  title: string;
  description: string;
  icon: string;
  reward: Reward;
  unlockedAt: string | null;
}

export interface DailyTaskView {
  key: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  reward: Reward;
  claimed: boolean;
  claimable: boolean;
}

export interface SessionSummary {
  sessionId: number;
  total: number;
  answered: number;
  correct: number;
  accuracy: number;
  coinsEarned: number;
  xpEarned: number;
  bonusCoins: number;
  bonusXp: number;
  bonusReasons: string[];
  completed: boolean;
  player: PlayerSnapshot;
  leveledUp: boolean;
  newAchievements: AchievementView[];
  wrongWords: { id: number; word: string; meaning: string }[];
  claimableTasks: DailyTaskView[];
}

export interface DeckSummary {
  id: number;
  slug: string | null;
  name: string;
  description: string;
  kind: "builtin" | "custom";
  color: string;
  total: number;
  learned: number;
  mastered: number;
  due: number;
  wrong: number;
}

export interface BuildingView {
  id: number;
  type: string;
  level: number;
  slot: number;
}

export interface IslandProgress {
  ownedTypes: number;
  totalTypes: number;
  totalBuildings: number;
  totalLevels: number;
  nextUnlock: { type: string; name: string; level: number } | null;
}

export interface IslandState {
  buildings: BuildingView[];
  player: PlayerSnapshot;
  progress: IslandProgress;
  /** 背包里的建筑（拆除收进背包的建筑，itemKey 形如 bld:<type>:L<level>） */
  backpack: { itemKey: string; qty: number }[];
}

export interface ImportResult {
  deckId: number;
  deckName: string;
  imported: number;
  duplicates: number;
  duplicatesInFile: number;
  errors: { line: number; reason: string }[];
}

export interface DailyStatPoint {
  date: string;
  label: string;
  newLearned: number;
  reviewed: number;
  correct: number;
  total: number;
  accuracy: number | null;
  sessionsCompleted: number;
}

export interface WeakWord {
  id: number;
  word: string;
  meaning: string;
  status: WordStatus;
  proficiency: number;
  wrongCount: number;
  correctCount: number;
}

export interface StatsData {
  player: PlayerSnapshot;
  series: DailyStatPoint[];
  heatmap: DailyStatPoint[];
  weakWords: WeakWord[];
  statusCounts: Record<WordStatus, number>;
  totalWords: number;
  totalAnswered: number;
  totalCorrect: number;
  bestStreak: number;
  thisWeek: { total: number; newLearned: number; reviewed: number; accuracy: number | null };
  lastWeek: { total: number; newLearned: number; reviewed: number; accuracy: number | null };
  review: { dueNow: number; reviewedToday: number; upcoming24h: number };
  activeDays: number;
}

export interface ProgressBackup {
  app: string;
  version: number;
  exportedAt: string;
  player: { name: string; coins: number; xp: number; streak: number; bestStreak: number; dailyGoal: number; totalAnswered: number; totalCorrect: number };
  decks: { name: string; kind: string; color: string; description: string; words: WordInput[] }[];
  achievements: { key: string; unlockedAt: string }[];
  dailyStats: { date: string; newLearned: number; reviewed: number; correct: number; total: number; sessionsCompleted: number }[];
}

export interface DashboardData {
  player: PlayerSnapshot;
  today: { total: number; newLearned: number; reviewed: number; correct: number; coinsEarned: number; xpEarned: number };
  dueCount: number;
  newAvailable: number;
  tasks: DailyTaskView[];
  achievements: AchievementView[];
  island: IslandProgress;
  loginRewardAvailable: boolean;
  totalLearned: number;
  totalMastered: number;
  decks: { id: number; name: string; kind: string; due: number; total: number; learned: number }[];
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
