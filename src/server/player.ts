import { db } from "@/db";
import { buildings, dailyStats, decks, players, words } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { BUILTIN_DECKS, rowToWord } from "@/data/vocabulary";
import { INITIAL_CABIN_SLOT } from "@/lib/game/buildings";
import { levelFromXp } from "@/lib/game/economy";
import type { PlayerSnapshot } from "@/lib/types";
import { dateKey, normalizeWord, shiftDateKey } from "@/lib/utils";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbExecutor = typeof db | Tx;
export type PlayerRow = typeof players.$inferSelect;

let seededInProcess = false;

/**
 * 首次访问时确保所有数据库表、索引以及初始种子数据（玩家、初始建筑、内置词库）都已就绪。
 * 即使运行环境在重建容器后没有重新执行 `drizzle-kit push`，`CREATE TABLE IF NOT EXISTS`
 * 也能保证探索 / 花园 / 岛屿商店等新增表自动创建，不会因为缺表导致 500。
 */
export async function ensureSeeded(): Promise<void> {
  if (seededInProcess) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(726001)`);
    await tx.execute(sql`
      create table if not exists players (
        id serial primary key,
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
        slug text unique,
        name text not null,
        description text not null default '',
        kind text not null default 'custom',
        color text not null default 'ocean',
        created_at timestamptz not null default now()
      );
      create table if not exists words (
        id serial primary key,
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
        date text primary key,
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
        type text not null,
        level integer not null default 1,
        slot integer not null unique,
        built_at timestamptz not null default now(),
        upgraded_at timestamptz
      );
      create table if not exists task_claims (
        id serial primary key,
        date text not null,
        task_key text not null,
        claimed_at timestamptz not null default now()
      );
      create unique index if not exists task_claims_date_key_idx on task_claims(date, task_key);
      create table if not exists achievements (
        key text primary key,
        unlocked_at timestamptz not null default now()
      );
      create table if not exists explorations (
        id serial primary key,
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
        event_key text not null unique,
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
        quest_key text not null,
        npc_key text not null,
        progress integer not null default 0,
        target integer not null default 1,
        claimed_at timestamptz,
        updated_at timestamptz not null default now()
      );
      create unique index if not exists player_quests_key_idx on player_quests(quest_key);
      create table if not exists inventory (
        id serial primary key,
        item_key text not null unique,
        qty integer not null default 1,
        created_at timestamptz not null default now()
      );
      create table if not exists purchases (
        id serial primary key,
        item_key text not null,
        name text not null,
        kind text not null,
        price integer not null,
        created_at timestamptz not null default now()
      );
      create table if not exists region_progress (
        region_key text primary key,
        runs integer not null default 0,
        events_resolved integer not null default 0,
        monsters_defeated integer not null default 0,
        chests_found integer not null default 0,
        last_run_at timestamptz
      );
    `);
    const [existing] = await tx.select({ id: players.id }).from(players).limit(1);
    if (!existing) {
      await tx.insert(players).values({});
      await tx.insert(buildings).values({ type: "cabin", level: 1, slot: INITIAL_CABIN_SLOT }).onConflictDoNothing();
    }
    for (const deck of BUILTIN_DECKS) {
      const inserted = await tx
        .insert(decks)
        .values({ slug: deck.slug, name: deck.name, description: deck.description, kind: "builtin", color: deck.color })
        .onConflictDoNothing({ target: decks.slug })
        .returning({ id: decks.id });
      if (inserted.length === 0) continue;
      const deckId = inserted[0].id;
      const rows = deck.words.map((r) => {
        const w = rowToWord(r);
        return { ...w, deckId, wordKey: normalizeWord(w.word) };
      });
      await tx.insert(words).values(rows).onConflictDoNothing();
    }
  });
  seededInProcess = true;
}

/** 仅供测试：测试清空数据库后调用，让 ensureSeeded 重新初始化数据 */
export function resetSeededFlagForTest(): void {
  seededInProcess = false;
}

export async function getPlayer(executor: DbExecutor = db): Promise<PlayerRow> {
  await ensureSeeded();
  const [p] = await executor.select().from(players).orderBy(players.id).limit(1);
  if (!p) throw new Error("玩家档案初始化失败");
  return p;
}

export async function lockPlayer(tx: Tx): Promise<PlayerRow> {
  const [p] = await tx.select().from(players).orderBy(players.id).limit(1).for("update");
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
}

export async function bumpDaily(tx: DbExecutor, date: string, d: DailyDelta): Promise<void> {
  const v = {
    newLearned: d.newLearned ?? 0,
    reviewed: d.reviewed ?? 0,
    correct: d.correct ?? 0,
    total: d.total ?? 0,
    coinsEarned: d.coinsEarned ?? 0,
    xpEarned: d.xpEarned ?? 0,
    sessionsCompleted: d.sessionsCompleted ?? 0,
    bestStreak: d.bestStreak ?? 0,
  };
  await tx
    .insert(dailyStats)
    .values({ date, ...v })
    .onConflictDoUpdate({
      target: dailyStats.date,
      set: {
        newLearned: sql`${dailyStats.newLearned} + ${v.newLearned}`,
        reviewed: sql`${dailyStats.reviewed} + ${v.reviewed}`,
        correct: sql`${dailyStats.correct} + ${v.correct}`,
        total: sql`${dailyStats.total} + ${v.total}`,
        coinsEarned: sql`${dailyStats.coinsEarned} + ${v.coinsEarned}`,
        xpEarned: sql`${dailyStats.xpEarned} + ${v.xpEarned}`,
        sessionsCompleted: sql`${dailyStats.sessionsCompleted} + ${v.sessionsCompleted}`,
        bestStreak: sql`greatest(${dailyStats.bestStreak}, ${v.bestStreak})`,
      },
    });
}

export async function getTodayStats(executor: DbExecutor = db, today: string = dateKey()) {
  const [row] = await executor.select().from(dailyStats).where(eq(dailyStats.date, today));
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
    }
  );
}
