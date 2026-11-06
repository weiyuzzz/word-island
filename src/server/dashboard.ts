import { db } from "@/db";
import { buildings, dailyStats, decks, players, wordProgress, words } from "@/db/schema";
import { and, asc, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { LOGIN_REWARD, levelFromXp } from "@/lib/game/economy";
import type { DashboardData, DailyStatPoint, StatsData, WeakWord, WordStatus } from "@/lib/types";
import { dateKey, shiftDateKey, shortDateLabel } from "@/lib/utils";
import { islandProgress } from "./island";
import { bumpDaily, effectiveStreak, ensureSeeded, getPlayer, getTodayStats, lockPlayer, snapshot } from "./player";
import { currentUserId } from "./session";
import { getDailyTasks, listAchievements } from "./tasks";

export async function getDashboard(): Promise<DashboardData> {
  await ensureSeeded();
  const uid = await currentUserId();
  const player = await getPlayer(db, uid);
  const today = dateKey();
  const todayStats = await getTodayStats(db, uid, today);
  const now = new Date();

  const [dueRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(wordProgress)
    .where(and(eq(wordProgress.userId, uid), ne(wordProgress.status, "new"), lte(wordProgress.nextReviewAt, now)));
  const [progressRow] = await db
    .select({
      learned: sql<number>`count(*) filter (where ${wordProgress.status} <> 'new')::int`,
      mastered: sql<number>`count(*) filter (where ${wordProgress.status} = 'mastered')::int`,
    })
    .from(wordProgress)
    .where(eq(wordProgress.userId, uid));
  const [wordsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(words).where(eq(words.userId, uid));
  const buildingRows = await db.select().from(buildings).where(eq(buildings.userId, uid));
  const tasks = await getDailyTasks(db, uid, player.dailyGoal, today);
  const achievements = await listAchievements(db, uid);
  const deckRows = await db
    .select({
      id: decks.id,
      name: decks.name,
      kind: decks.kind,
      total: sql<number>`count(${words.id})::int`,
      learned: sql<number>`count(${wordProgress.id}) filter (where ${wordProgress.status} <> 'new')::int`,
      due: sql<number>`count(${wordProgress.id}) filter (where ${wordProgress.status} <> 'new' and ${wordProgress.nextReviewAt} <= now())::int`,
    })
    .from(decks)
    .leftJoin(words, eq(words.deckId, decks.id))
    .leftJoin(wordProgress, eq(wordProgress.wordId, words.id))
    .where(eq(decks.userId, uid))
    .groupBy(decks.id)
    .orderBy(asc(decks.kind), asc(decks.id));

  const snap = snapshot(player);
  snap.streak = effectiveStreak(player, today);
  const learned = progressRow?.learned ?? 0;

  return {
    player: snap,
    today: {
      total: todayStats.total,
      newLearned: todayStats.newLearned,
      reviewed: todayStats.reviewed,
      correct: todayStats.correct,
      coinsEarned: todayStats.coinsEarned,
      xpEarned: todayStats.xpEarned,
    },
    dueCount: dueRow?.count ?? 0,
    newAvailable: Math.max(0, (wordsRow?.count ?? 0) - learned),
    tasks,
    achievements,
    island: islandProgress(
      buildingRows.map((b) => ({ id: b.id, type: b.type, level: b.level, slot: b.slot })),
      snap.level,
    ),
    loginRewardAvailable: player.lastLoginRewardDate !== today,
    totalLearned: learned,
    totalMastered: progressRow?.mastered ?? 0,
    decks: deckRows,
  };
}

export async function claimLoginReward() {
  const uid = await currentUserId();
  const today = dateKey();
  return db.transaction(async (tx) => {
    const player = await lockPlayer(tx, uid);
    if (player.lastLoginRewardDate === today) throw new Error("今天的登录奖励已经领取过了");
    const [updated] = await tx
      .update(players)
      .set({ coins: player.coins + LOGIN_REWARD.coins, xp: player.xp + LOGIN_REWARD.xp, lastLoginRewardDate: today })
      .where(eq(players.id, player.id))
      .returning();
    await bumpDaily(tx, uid, today, { coinsEarned: LOGIN_REWARD.coins, xpEarned: LOGIN_REWARD.xp });
    return { player: snapshot(updated), reward: LOGIN_REWARD, leveledUp: levelFromXp(updated.xp).level > levelFromXp(player.xp).level };
  });
}

export async function updateDailyGoal(goal: number) {
  const uid = await currentUserId();
  const value = Math.min(200, Math.max(10, Math.round(goal)));
  const player = await getPlayer(db, uid);
  await db.update(players).set({ dailyGoal: value }).where(eq(players.id, player.id));
  return value;
}

function summarize(points: DailyStatPoint[]) {
  const total = points.reduce((n, p) => n + p.total, 0);
  const correct = points.reduce((n, p) => n + p.correct, 0);
  return {
    total,
    newLearned: points.reduce((n, p) => n + p.newLearned, 0),
    reviewed: points.reduce((n, p) => n + p.reviewed, 0),
    accuracy: total ? correct / total : null,
  };
}

export async function getStats(): Promise<StatsData> {
  await ensureSeeded();
  const uid = await currentUserId();
  const player = await getPlayer(db, uid);
  const today = dateKey();
  const start = shiftDateKey(today, -29);
  const rows = await db.select().from(dailyStats).where(and(eq(dailyStats.userId, uid), gte(dailyStats.date, start))).orderBy(asc(dailyStats.date));
  const map = new Map(rows.map((r) => [r.date, r]));
  const series: DailyStatPoint[] = [];
  const heatmap: DailyStatPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const key = shiftDateKey(today, -i);
    const r = map.get(key);
    const point: DailyStatPoint = {
      date: key,
      label: shortDateLabel(key),
      newLearned: r?.newLearned ?? 0,
      reviewed: r?.reviewed ?? 0,
      correct: r?.correct ?? 0,
      total: r?.total ?? 0,
      accuracy: r && r.total > 0 ? Math.round((r.correct / r.total) * 100) : null,
      sessionsCompleted: r?.sessionsCompleted ?? 0,
    };
    heatmap.push(point);
    if (i <= 13) series.push(point);
  }

  const statusRows = await db
    .select({ status: wordProgress.status, count: sql<number>`count(*)::int` })
    .from(wordProgress)
    .where(eq(wordProgress.userId, uid))
    .groupBy(wordProgress.status);
  const [wordsRow] = await db.select({ count: sql<number>`count(*)::int` }).from(words).where(eq(words.userId, uid));
  const statusCounts: Record<WordStatus, number> = { new: 0, learning: 0, review: 0, mastered: 0 };
  for (const r of statusRows) statusCounts[r.status as WordStatus] = r.count;
  const totalWords = wordsRow?.count ?? 0;
  statusCounts.new = Math.max(0, totalWords - statusCounts.learning - statusCounts.review - statusCounts.mastered);

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 3600 * 1000);
  const [reviewRow] = await db
    .select({
      dueNow: sql<number>`count(*) filter (where ${wordProgress.status} <> 'new' and ${wordProgress.nextReviewAt} <= ${now.toISOString()}::timestamptz)::int`,
      upcoming: sql<number>`count(*) filter (where ${wordProgress.status} <> 'new' and ${wordProgress.nextReviewAt} > ${now.toISOString()}::timestamptz and ${wordProgress.nextReviewAt} <= ${in24h.toISOString()}::timestamptz)::int`,
    })
    .from(wordProgress)
    .where(eq(wordProgress.userId, uid));
  const [activeRow] = await db.select({ count: sql<number>`count(*)::int` }).from(dailyStats).where(and(eq(dailyStats.userId, uid), sql`${dailyStats.total} > 0`));
  const todayStats = series[series.length - 1];

  const weakRows = await db
    .select({
      id: words.id,
      word: words.word,
      meaning: words.meaning,
      status: wordProgress.status,
      proficiency: wordProgress.proficiency,
      wrongCount: wordProgress.wrongCount,
      correctCount: wordProgress.correctCount,
    })
    .from(words)
    .innerJoin(wordProgress, eq(wordProgress.wordId, words.id))
    .where(and(eq(words.userId, uid), ne(wordProgress.status, "new")))
    .orderBy(desc(wordProgress.wrongCount), asc(wordProgress.proficiency))
    .limit(12);
  const weakWords: WeakWord[] = weakRows.map((r) => ({
    id: r.id,
    word: r.word,
    meaning: r.meaning,
    status: r.status as WordStatus,
    proficiency: r.proficiency,
    wrongCount: r.wrongCount,
    correctCount: r.correctCount,
  }));

  const snap = snapshot(player);
  snap.streak = effectiveStreak(player, today);

  return {
    player: snap,
    series,
    heatmap,
    weakWords,
    statusCounts,
    totalWords,
    totalAnswered: player.totalAnswered,
    totalCorrect: player.totalCorrect,
    bestStreak: player.bestStreak,
    thisWeek: summarize(series.slice(7)),
    lastWeek: summarize(series.slice(0, 7)),
    review: { dueNow: reviewRow?.dueNow ?? 0, reviewedToday: todayStats.reviewed, upcoming24h: reviewRow?.upcoming ?? 0 },
    activeDays: activeRow?.count ?? 0,
  };
}
