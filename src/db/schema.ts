import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { EventPayload, RunReportWord } from "@/lib/game/model";
import type { QuestionRecord } from "@/lib/types";

/** 二进制音频存储 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// ---------- 单词发音缓存（按归一化单词 + 口音存储，导入时预取） ----------

export const wordAudio = pgTable("word_audio", {
  wordKey: text("word_key").notNull(),
  accent: text("accent").notNull().default("us"), // us | uk
  audio: bytea("audio").notNull(),
  contentType: text("content_type").notNull().default("audio/mpeg"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("word_audio_key_accent_idx").on(t.wordKey, t.accent)]);

// ---------- 账号 ----------

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"), // admin | user
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- 学习数据（全部按 user_id 隔离，每个用户拥有独立的词库与进度副本） ----------

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull().default("岛主"),
  coins: integer("coins").notNull().default(120),
  xp: integer("xp").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  bestStreak: integer("best_streak").notNull().default(0),
  lastStudyDate: text("last_study_date"),
  dailyGoal: integer("daily_goal").notNull().default(30),
  lastLoginRewardDate: text("last_login_reward_date"),
  totalAnswered: integer("total_answered").notNull().default(0),
  totalCorrect: integer("total_correct").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const decks = pgTable(
  "decks",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    slug: text("slug"),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    kind: text("kind").notNull().default("custom"), // builtin | custom
    color: text("color").notNull().default("ocean"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("decks_user_slug_idx").on(t.userId, t.slug)],
);

export const words = pgTable(
  "words",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    deckId: integer("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    word: text("word").notNull(),
    wordKey: text("word_key").notNull(),
    phonetic: text("phonetic").notNull().default(""),
    pos: text("pos").notNull().default(""),
    meaning: text("meaning").notNull(),
    example: text("example").notNull().default(""),
    translation: text("translation").notNull().default(""),
    difficulty: integer("difficulty").notNull().default(2),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("words_deck_word_key_idx").on(t.deckId, t.wordKey)],
);

export const wordProgress = pgTable(
  "word_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    wordId: integer("word_id")
      .notNull()
      .unique()
      .references(() => words.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("new"), // new | learning | review | mastered
    proficiency: integer("proficiency").notNull().default(0),
    streak: integer("streak").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    wrongCount: integer("wrong_count").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    intervalMinutes: integer("interval_minutes").notNull().default(0),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    firstLearnedAt: timestamp("first_learned_at", { withTimezone: true }),
    masteredAt: timestamp("mastered_at", { withTimezone: true }),
  },
  (t) => [index("word_progress_next_review_idx").on(t.nextReviewAt)],
);

export const reviewLogs = pgTable(
  "review_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    wordId: integer("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    sessionId: integer("session_id"),
    mode: text("mode").notNull(),
    correct: boolean("correct").notNull(),
    quality: integer("quality").notNull(),
    responseMs: integer("response_ms").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_logs_created_idx").on(t.createdAt)],
);

export const studySessions = pgTable("study_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  deckId: integer("deck_id"),
  deckName: text("deck_name").notNull().default("全部词库"),
  kind: text("kind").notNull().default("mixed"),
  questions: jsonb("questions").$type<QuestionRecord[]>().notNull(),
  total: integer("total").notNull(),
  answered: integer("answered").notNull().default(0),
  correct: integer("correct").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  bestStreak: integer("best_streak").notNull().default(0),
  coinsEarned: integer("coins_earned").notNull().default(0),
  xpEarned: integer("xp_earned").notNull().default(0),
  bonusCoins: integer("bonus_coins").notNull().default(0),
  bonusXp: integer("bonus_xp").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const dailyStats = pgTable(
  "daily_stats",
  {
    userId: integer("user_id"),
    date: text("date").notNull(), // YYYY-MM-DD
    newLearned: integer("new_learned").notNull().default(0),
    reviewed: integer("reviewed").notNull().default(0),
    correct: integer("correct").notNull().default(0),
    total: integer("total").notNull().default(0),
    coinsEarned: integer("coins_earned").notNull().default(0),
    xpEarned: integer("xp_earned").notNull().default(0),
    sessionsCompleted: integer("sessions_completed").notNull().default(0),
    bestStreak: integer("best_streak").notNull().default(0),
  },
  (t) => [uniqueIndex("daily_stats_user_date_idx").on(t.userId, t.date)],
);

export const buildings = pgTable(
  "buildings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    type: text("type").notNull(),
    level: integer("level").notNull().default(1),
    slot: integer("slot").notNull(),
    builtAt: timestamp("built_at", { withTimezone: true }).notNull().defaultNow(),
    upgradedAt: timestamp("upgraded_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("buildings_user_slot_idx").on(t.userId, t.slot)],
);

export const taskClaims = pgTable(
  "task_claims",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    date: text("date").notNull(),
    taskKey: text("task_key").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("task_claims_user_date_key_idx").on(t.userId, t.date, t.taskKey)],
);

export const achievements = pgTable(
  "achievements",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    key: text("key").notNull(),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("achievements_user_key_idx").on(t.userId, t.key)],
);

// ---------- 探索 / 战斗 / 任务 / 道具 ----------

export const explorations = pgTable("explorations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  regionKey: text("region_key").notNull(),
  status: text("status").notNull().default("active"), // active | finished | retreated
  totalEvents: integer("total_events").notNull().default(0),
  resolvedEvents: integer("resolved_events").notNull().default(0),
  hearts: integer("hearts").notNull().default(3),
  maxHearts: integer("max_hearts").notNull().default(3),
  answered: integer("answered").notNull().default(0),
  correct: integer("correct").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  bestStreak: integer("best_streak").notNull().default(0),
  coinsEarned: integer("coins_earned").notNull().default(0),
  xpEarned: integer("xp_earned").notNull().default(0),
  monstersDefeated: integer("monsters_defeated").notNull().default(0),
  chestsFound: integer("chests_found").notNull().default(0),
  bonusCoins: integer("bonus_coins").notNull().default(0),
  bonusXp: integer("bonus_xp").notNull().default(0),
  itemsFound: jsonb("items_found").$type<string[]>().notNull().default([]),
  report: jsonb("report").$type<RunReportWord[]>().notNull().default([]),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const explorationEvents = pgTable(
  "exploration_events",
  {
    id: serial("id").primaryKey(),
    explorationId: integer("exploration_id")
      .notNull()
      .references(() => explorations.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    kind: text("kind").notNull(),
    position: integer("position").notNull(),
    status: text("status").notNull().default("pending"), // pending | resolved
    payload: jsonb("payload").$type<EventPayload>().notNull(),
    coinsEarned: integer("coins_earned").notNull().default(0),
    xpEarned: integer("xp_earned").notNull().default(0),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("exploration_events_run_idx").on(t.explorationId)],
);

export const playerQuests = pgTable(
  "player_quests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    questKey: text("quest_key").notNull(),
    npcKey: text("npc_key").notNull(),
    progress: integer("progress").notNull().default(0),
    target: integer("target").notNull().default(1),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("player_quests_user_key_idx").on(t.userId, t.questKey)],
);

export const inventory = pgTable(
  "inventory",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    itemKey: text("item_key").notNull(),
    qty: integer("qty").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("inventory_user_item_idx").on(t.userId, t.itemKey)],
);

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  itemKey: text("item_key").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  price: integer("price").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const regionProgress = pgTable(
  "region_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    regionKey: text("region_key").notNull(),
    runs: integer("runs").notNull().default(0),
    eventsResolved: integer("events_resolved").notNull().default(0),
    monstersDefeated: integer("monsters_defeated").notNull().default(0),
    chestsFound: integer("chests_found").notNull().default(0),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("region_progress_user_region_idx").on(t.userId, t.regionKey)],
);
