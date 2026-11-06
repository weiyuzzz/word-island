import { db } from "@/db";
import { achievements, buildings, players, studySessions, taskClaims, wordProgress } from "@/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { ACHIEVEMENTS, DAILY_TASKS, type AchievementContext } from "@/lib/game/tasks";
import { levelFromXp } from "@/lib/game/economy";
import type { AchievementView, DailyTaskView } from "@/lib/types";
import { dateKey } from "@/lib/utils";
import { bumpDaily, getTodayStats, grantRewards, lockPlayer, snapshot, type DbExecutor, type Tx } from "./player";
import { currentUserId } from "./session";

export async function getDailyTasks(executor: DbExecutor, userId: number, dailyGoal: number, today: string = dateKey()): Promise<DailyTaskView[]> {
  const stats = await getTodayStats(executor, userId, today);
  const claims = await executor.select({ key: taskClaims.taskKey }).from(taskClaims).where(and(eq(taskClaims.userId, userId), eq(taskClaims.date, today)));
  const claimed = new Set(claims.map((c) => c.key));
  return DAILY_TASKS.map((t) => {
    const target = t.target === "dailyGoal" ? dailyGoal : t.target;
    const progress = Math.min(target, stats[t.metric]);
    const isClaimed = claimed.has(t.key);
    return {
      key: t.key,
      title: t.title,
      description: t.description,
      target,
      progress,
      reward: t.reward,
      claimed: isClaimed,
      claimable: !isClaimed && progress >= target,
    };
  });
}

/** 领取每日任务奖励：利用唯一索引保证同一天同一任务只能领取一次 */
export async function claimTask(taskKey: string) {
  const def = DAILY_TASKS.find((t) => t.key === taskKey);
  if (!def) throw new Error("任务不存在");
  const uid = await currentUserId();
  const today = dateKey();
  return db.transaction(async (tx) => {
    const player = await lockPlayer(tx, uid);
    const tasks = await getDailyTasks(tx, uid, player.dailyGoal, today);
    const task = tasks.find((t) => t.key === taskKey)!;
    if (task.claimed) throw new Error("该任务奖励今天已经领取过了");
    if (!task.claimable) throw new Error("任务尚未完成");
    const inserted = await tx
      .insert(taskClaims)
      .values({ userId: uid, date: today, taskKey })
      .onConflictDoNothing()
      .returning({ id: taskClaims.id });
    if (inserted.length === 0) throw new Error("该任务奖励今天已经领取过了");
    const updated = await grantRewards(tx, player.id, def.reward.coins, def.reward.xp);
    await bumpDaily(tx, uid, today, { coinsEarned: def.reward.coins, xpEarned: def.reward.xp });
    const refreshed = await getDailyTasks(tx, uid, player.dailyGoal, today);
    return { player: snapshot(updated), tasks: refreshed, reward: def.reward, leveledUp: levelFromXp(updated.xp).level > levelFromXp(player.xp).level };
  });
}

export async function listAchievements(executor: DbExecutor = db, userId?: number): Promise<AchievementView[]> {
  const uid = userId ?? (await currentUserId());
  const rows = await executor.select().from(achievements).where(eq(achievements.userId, uid));
  const map = new Map(rows.map((r) => [r.key, r.unlockedAt]));
  return ACHIEVEMENTS.map((a) => ({
    key: a.key,
    title: a.title,
    description: a.description,
    icon: a.icon,
    reward: a.reward,
    unlockedAt: map.get(a.key)?.toISOString() ?? null,
  }));
}

async function buildContext(tx: Tx, userId: number, extra: Partial<AchievementContext>): Promise<AchievementContext> {
  const [sessionRow] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), sql`${studySessions.finishedAt} is not null`, sql`${studySessions.answered} >= ${studySessions.total}`));
  const [learnedRow] = await tx
    .select({
      learned: sql<number>`count(*) filter (where ${wordProgress.status} <> 'new')::int`,
      mastered: sql<number>`count(*) filter (where ${wordProgress.status} = 'mastered')::int`,
    })
    .from(wordProgress)
    .where(eq(wordProgress.userId, userId));
  const [buildingRow] = await tx.select({ count: sql<number>`count(*)::int` }).from(buildings).where(eq(buildings.userId, userId));
  const [player] = await tx.select().from(players).where(eq(players.userId, userId)).limit(1);
  return {
    sessionsCompleted: sessionRow?.count ?? 0,
    learnedCount: learnedRow?.learned ?? 0,
    masteredCount: learnedRow?.mastered ?? 0,
    streak: player?.streak ?? 0,
    buildingsCount: buildingRow?.count ?? 0,
    level: player ? levelFromXp(player.xp).level : 1,
    perfectSession: false,
    ...extra,
  };
}

/** 检查并解锁成就；奖励即时发放（插入成功才发放，避免重复） */
export async function checkAchievements(tx: Tx, userId: number, extra: Partial<AchievementContext> = {}): Promise<AchievementView[]> {
  const unlockedRows = await tx.select({ key: achievements.key }).from(achievements).where(eq(achievements.userId, userId));
  const unlocked = new Set(unlockedRows.map((r) => r.key));
  const pending = ACHIEVEMENTS.filter((a) => !unlocked.has(a.key));
  if (pending.length === 0) return [];
  const ctx = await buildContext(tx, userId, extra);
  const results: AchievementView[] = [];
  const [player] = await tx.select({ id: players.id }).from(players).where(eq(players.userId, userId)).limit(1);
  for (const def of pending) {
    if (!def.check(ctx)) continue;
    const inserted = await tx.insert(achievements).values({ userId, key: def.key }).onConflictDoNothing().returning();
    if (inserted.length === 0) continue;
    await grantRewards(tx, player.id, def.reward.coins, def.reward.xp);
    await bumpDaily(tx, userId, dateKey(), { coinsEarned: def.reward.coins, xpEarned: def.reward.xp });
    results.push({
      key: def.key,
      title: def.title,
      description: def.description,
      icon: def.icon,
      reward: def.reward,
      unlockedAt: inserted[0].unlockedAt.toISOString(),
    });
  }
  return results;
}

export async function countNonNewProgress(executor: DbExecutor = db, userId?: number): Promise<number> {
  const uid = userId ?? (await currentUserId());
  const [row] = await executor.select({ count: sql<number>`count(*)::int` }).from(wordProgress).where(and(eq(wordProgress.userId, uid), ne(wordProgress.status, "new")));
  return row?.count ?? 0;
}
