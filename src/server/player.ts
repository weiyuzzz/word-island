import { db } from "@/db";
import { dailyStats, players } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { levelFromXp } from "@/lib/game/economy";
import type { PlayerSnapshot } from "@/lib/types";
import { dateKey, shiftDateKey } from "@/lib/utils";
import { currentUserId } from "./session";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbExecutor = typeof db | Tx;
export type PlayerRow = typeof players.$inferSelect;

let seededInProcess = false;

/**
 * 首次访问时确保所有数据库表、索引以及多账号迁移都已完成：
 * - 建 users / sessions 表；
 * - 给所有用户级数据表补 user_id 列；
 * - 把「单人版」的唯一约束换成 (user_id, …) 组合唯一，多账号互不冲突。
 * 注意：本函数不再播种任何数据——玩家档案与内置词库在账号注册时按用户创建（auth.ts seedUserGames）。
 */
export async function ensureSeeded(): Promise<void> {
  if (seededInProcess) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(726001)`);
    await tx.execute(sql`
      create table if not exists users (
        id serial primary key,
        username text not null unique,
        password_hash text not null,
        role text not null default 'user',
        created_at timestamptz not null default now()
      );
      create table if not exists sessions (
        token text primary key,
        user_id integer not null references users(id) on delete cascade,
        expires_at timestamptz not null,
        created_at timestamptz not null default now()
      );
      create table if not exists players (
        id serial primary key,
        user_id integer,
        name text not null default '岛主',
        coins integer not null default 120,
        xp integer not null default 0,
        streak integer not null default 0,
        best_streak integer not null default 0,
        last_study_date text,
        daily_goal integer not null default 30,
        last_login_reward_date text,
        total_answered integer not null default 0,
        total_correct integer not null default 0,
        created_at timestamptz not null default now()
      );
      create table if not exists decks (
        id serial primary key,
        user_id integer,
        slug text,
        name text not null,
        description text not null default '',
        kind text not null default 'custom',
        color text not null default 'ocean',
        created_at timestamptz not null default now()
      );
      create table if not exists words (
        id serial primary key,
        user_id integer,
        deck_id integer not null references decks(id) on delete cascade,
        word text not null,
        word_key text not null,
        phonetic text not null default '',
        pos text not null default '',
        meaning text not null,
        example text not null default '',
        translation text not null default '',
        difficulty integer not null default 2,
        created_at timestamptz not null default now()
      );
      create unique index if not exists words_deck_word_key_idx on words(deck_id, word_key);
      create table if not exists word_progress (
        id serial primary key,
        user_id integer,
        word_id integer not null unique references words(id) on delete cascade,
        status text not null default 'new',
        proficiency integer not null default 0,
        streak integer not null default 0,
        correct_count integer not null default 0,
        wrong_count integer not null default 0,
        lapses integer not null default 0,
        interval_minutes integer not null default 0,
        last_reviewed_at timestamptz,
        next_review_at timestamptz,
        first_learned_at timestamptz,
        mastered_at timestamptz
      );
      create index if not exists word_progress_next_review_idx on word_progress(next_review_at);
      create table if not exists review_logs (
        id serial primary key,
        user_id integer,
        word_id integer not null references words(id) on delete cascade,
        session_id integer,
        mode text not null,
        correct boolean not null,
        quality integer not null,
        response_ms integer not null default 0,
        created_at timestamptz not null default now()
      );
      create index if not exists review_logs_created_idx on review_logs(created_at);
      create table if not exists study_sessions (
        id serial primary key,
        user_id integer,
        deck_id integer,
        deck_name text not null default '全部词库',
        kind text not null default 'mixed',
        questions jsonb not null,
        total integer not null,
        answered integer not null default 0,
        correct integer not null default 0,
        current_streak integer not null default 0,
        best_streak integer not null default 0,
        coins_earned integer not null default 0,
        xp_earned integer not null default 0,
        bonus_coins integer not null default 0,
        bonus_xp integer not null default 0,
        started_at timestamptz not null default now(),
        finished_at timestamptz
      );
      create table if not exists daily_stats (
        id serial primary key,
        user_id integer,
        date text not null,
        new_learned integer not null default 0,
        reviewed integer not null default 0,
        correct integer not null default 0,
        total integer not null default 0,
        coins_earned integer not null default 0,
        xp_earned integer not null default 0,
        sessions_completed integer not null default 0,
        best_streak integer not null default 0
      );
      create table if not exists buildings (
        id serial primary key,
        user_id integer,
        type text not null,
        level integer not null default 1,
        slot integer not null,
        built_at timestamptz not null default now(),
        upgraded_at timestamptz
      );
      create table if not exists task_claims (
        id serial primary key,
        user_id integer,
        date text not null,
        task_key text not null,
        claimed_at timestamptz not null default now()
      );
      create table if not exists achievements (
        id serial primary key,
        user_id integer,
        key text not null,
        unlocked_at timestamptz not null default now()
      );
      create table if not exists explorations (
        id serial primary key,
        user_id integer,
        region_key text not null,
        status text not null default 'active',
        total_events integer not null default 0,
        resolved_events integer not null default 0,
        hearts integer not null default 3,
        max_hearts integer not null default 3,
        answered integer not null default 0,
        correct integer not null default 0,
        current_streak integer not null default 0,
        best_streak integer not null default 0,
        coins_earned integer not null default 0,
        xp_earned integer not null default 0,
        monsters_defeated integer not null default 0,
        chests_found integer not null default 0,
        bonus_coins integer not null default 0,
        bonus_xp integer not null default 0,
        items_found jsonb not null default '[]'::jsonb,
        report jsonb not null default '[]'::jsonb,
        started_at timestamptz not null default now(),
        finished_at timestamptz
      );
      create table if not exists exploration_events (
        id serial primary key,
        exploration_id integer not null references explorations(id) on delete cascade,
        event_key text not null,
        kind text not null,
        position integer not null,
        status text not null default 'pending',
        payload jsonb not null,
        coins_earned integer not null default 0,
        xp_earned integer not null default 0,
        resolved_at timestamptz
      );
      create index if not exists exploration_events_run_idx on exploration_events(exploration_id);
      create table if not exists player_quests (
        id serial primary key,
        user_id integer,
        quest_key text not null,
        npc_key text not null,
        progress integer not null default 0,
        target integer not null default 1,
        claimed_at timestamptz,
        updated_at timestamptz not null default now()
      );
      create table if not exists inventory (
        id serial primary key,
        user_id integer,
        item_key text not null,
        qty integer not null default 1,
        created_at timestamptz not null default now()
      );
      create table if not exists purchases (
        id serial primary key,
        user_id integer,
        item_key text not null,
        name text not null,
        kind text not null,
        price integer not null,
        created_at timestamptz not null default now()
      );
      create table if not exists region_progress (
        id serial primary key,
        user_id integer,
        region_key text not null,
        runs integer not null default 0,
        events_resolved integer not null default 0,
        monsters_defeated integer not null default 0,
        chests_found integer not null default 0,
        last_run_at timestamptz
      );
      create table if not exists word_audio (
        word_key text not null,
        accent text not null default 'us',
        audio bytea not null,
        content_type text not null default 'audio/mpeg',
        created_at timestamptz not null default now(),
        primary key (word_key, accent)
      );
    `);
    // 给老库补 user_id 列，以及原先作为主键、现在改为普通列的 id
    for (const table of ["players", "decks", "words", "word_progress", "review_logs", "study_sessions", "daily_stats", "buildings", "task_claims", "achievements", "explorations", "player_quests", "inventory", "purchases", "region_progress"]) {
      await tx.execute(sql.raw(`alter table ${table} add column if not exists user_id integer`));
    }
    await tx.execute(sql`
      alter table daily_stats add column if not exists id serial;
      alter table achievements add column if not exists id serial;
      alter table region_progress add column if not exists id serial;
    `);
    // 单人版的单列唯一约束 → (user_id, …) 组合唯一（多账号互不冲突）
    // 约束名同时覆盖 drizzle-kit push 生成（*_unique）与手写 SQL（*_key）两种来源
    await tx.execute(sql`
      alter table daily_stats drop constraint if exists daily_stats_pkey;
      alter table buildings drop constraint if exists buildings_slot_key;
      alter table buildings drop constraint if exists buildings_slot_unique;
      alter table achievements drop constraint if exists achievements_pkey;
      alter table region_progress drop constraint if exists region_progress_pkey;
      alter table inventory drop constraint if exists inventory_item_key_key;
      alter table inventory drop constraint if exists inventory_item_key_unique;
      alter table decks drop constraint if exists decks_slug_key;
      alter table decks drop constraint if exists decks_slug_unique;
      drop index if exists task_claims_date_key_idx;
      drop index if exists player_quests_key_idx;
      create unique index if not exists daily_stats_user_date_idx on daily_stats(user_id, date);
      create unique index if not exists buildings_user_slot_idx on buildings(user_id, slot);
      create unique index if not exists achievements_user_key_idx on achievements(user_id, key);
      create unique index if not exists task_claims_user_date_key_idx on task_claims(user_id, date, task_key);
      create unique index if not exists player_quests_user_key_idx on player_quests(user_id, quest_key);
      create unique index if not exists inventory_user_item_idx on inventory(user_id, item_key);
      create unique index if not exists region_progress_user_region_idx on region_progress(user_id, region_key);
      create unique index if not exists decks_user_slug_idx on decks(user_id, slug);
    `);
  });
  seededInProcess = true;
}

/** 仅供测试：测试清空数据库后调用，让 ensureSeeded 重新执行迁移 */
export function resetSeededFlagForTest(): void {
  seededInProcess = false;
}

/** 按当前登录用户取玩家档案（注册时已创建，这里只做兜底） */
export async function getPlayer(executor: DbExecutor = db, userId?: number): Promise<PlayerRow> {
  await ensureSeeded();
  const uid = userId ?? (await currentUserId());
  const [p] = await executor.select().from(players).where(eq(players.userId, uid)).limit(1);
  if (!p) throw new Error("玩家档案初始化失败，请重新登录");
  return p;
}

export async function lockPlayer(tx: Tx, userId: number): Promise<PlayerRow> {
  const [p] = await tx.select().from(players).where(eq(players.userId, userId)).limit(1).for("update");
  if (!p) throw new Error("玩家档案不存在");
  return p;
}

export function snapshot(p: PlayerRow): PlayerSnapshot {
  const lv = levelFromXp(p.xp);
  return {
    coins: p.coins,
    xp: p.xp,
    level: lv.level,
    levelXp: lv.levelXp,
    levelNeed: lv.levelNeed,
    streak: p.streak,
    dailyGoal: p.dailyGoal,
  };
}

/** 计算学习连续天数（在当天第一次学习时触发） */
export function nextStreak(p: PlayerRow, today: string): { streak: number; bestStreak: number; lastStudyDate: string } {
  if (p.lastStudyDate === today) {
    return { streak: p.streak, bestStreak: p.bestStreak, lastStudyDate: today };
  }
  const yesterday = shiftDateKey(today, -1);
  const streak = p.lastStudyDate === yesterday ? p.streak + 1 : 1;
  return { streak, bestStreak: Math.max(p.bestStreak, streak), lastStudyDate: today };
}

/** 如果昨天没学习，当前连续天数视为中断（用于展示） */
export function effectiveStreak(p: PlayerRow, today: string = dateKey()): number {
  if (!p.lastStudyDate) return 0;
  if (p.lastStudyDate === today || p.lastStudyDate === shiftDateKey(today, -1)) return p.streak;
  return 0;
}

export async function grantRewards(tx: Tx, playerId: number, coins: number, xp: number): Promise<PlayerRow> {
  const [updated] = await tx
    .update(players)
    .set({
      coins: sql`${players.coins} + ${coins}`,
      xp: sql`${players.xp} + ${xp}`,
    })
    .where(eq(players.id, playerId))
    .returning();
  return updated;
}

export interface DailyDelta {
  newLearned?: number;
  reviewed?: number;
  correct?: number;
  total?: number;
  coinsEarned?: number;
  xpEarned?: number;
  sessionsCompleted?: number;
  bestStreak?: number;
  articlesRead?: number;
  readingSeconds?: number;
}

export async function bumpDaily(tx: DbExecutor, userId: number, date: string, d: DailyDelta): Promise<void> {
  const v = {
    newLearned: d.newLearned ?? 0,
    reviewed: d.reviewed ?? 0,
    correct: d.correct ?? 0,
    total: d.total ?? 0,
    coinsEarned: d.coinsEarned ?? 0,
    xpEarned: d.xpEarned ?? 0,
    sessionsCompleted: d.sessionsCompleted ?? 0,
    bestStreak: d.bestStreak ?? 0,
    articlesRead: d.articlesRead ?? 0,
    readingSeconds: d.readingSeconds ?? 0,
  };
  await tx
    .insert(dailyStats)
    .values({ userId, date, ...v })
    .onConflictDoUpdate({
      target: [dailyStats.userId, dailyStats.date],
      set: {
        newLearned: sql`${dailyStats.newLearned} + ${v.newLearned}`,
        reviewed: sql`${dailyStats.reviewed} + ${v.reviewed}`,
        correct: sql`${dailyStats.correct} + ${v.correct}`,
        total: sql`${dailyStats.total} + ${v.total}`,
        coinsEarned: sql`${dailyStats.coinsEarned} + ${v.coinsEarned}`,
        xpEarned: sql`${dailyStats.xpEarned} + ${v.xpEarned}`,
        sessionsCompleted: sql`${dailyStats.sessionsCompleted} + ${v.sessionsCompleted}`,
        bestStreak: sql`greatest(${dailyStats.bestStreak}, ${v.bestStreak})`,
        articlesRead: sql`${dailyStats.articlesRead} + ${v.articlesRead}`,
        readingSeconds: sql`${dailyStats.readingSeconds} + ${v.readingSeconds}`,
      },
    });
}

export async function getTodayStats(executor: DbExecutor = db, userId?: number, today: string = dateKey()) {
  const uid = userId ?? (await currentUserId());
  const [row] = await executor.select().from(dailyStats).where(and(eq(dailyStats.userId, uid), eq(dailyStats.date, today)));
  return (
    row ?? {
      date: today,
      newLearned: 0,
      reviewed: 0,
      correct: 0,
      total: 0,
      coinsEarned: 0,
      xpEarned: 0,
      sessionsCompleted: 0,
      bestStreak: 0,
      articlesRead: 0,
      readingSeconds: 0,
    }
  );
}
