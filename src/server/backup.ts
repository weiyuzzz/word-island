import { db } from "@/db";
import { achievements, dailyStats, decks, players, words } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import type { ProgressBackup } from "@/lib/types";
import type { WordInput } from "@/lib/vocab/parse";
import { ensureSeeded } from "./player";
import { currentUserId } from "./session";

/**
 * 导出完整学习进度备份：玩家档案、全部词库及其单词、已解锁成就、每日统计。
 * 内容为纯 JSON，可供用户本地保存或日后恢复（恢复功能为后续迭代）。
 */
export async function exportProgress(): Promise<{ filename: string; content: string; mime: string }> {
  await ensureSeeded();
  const uid = await currentUserId();
  const [player] = await db.select().from(players).where(eq(players.userId, uid)).limit(1);
  const deckRows = await db.select().from(decks).where(eq(decks.userId, uid)).orderBy(asc(decks.id));
  const achievementRows = await db.select().from(achievements).where(eq(achievements.userId, uid)).orderBy(asc(achievements.key));
  const statRows = await db.select().from(dailyStats).where(eq(dailyStats.userId, uid)).orderBy(asc(dailyStats.date));

  const decksPayload = await Promise.all(
    deckRows.map(async (d) => {
      const wordRows = await db.select().from(words).where(eq(words.deckId, d.id)).orderBy(asc(words.id));
      const items: WordInput[] = wordRows.map((r) => ({
        word: r.word,
        phonetic: r.phonetic,
        pos: r.pos,
        meaning: r.meaning,
        example: r.example,
        translation: r.translation,
        difficulty: r.difficulty,
      }));
      return { name: d.name, kind: d.kind, color: d.color, description: d.description, words: items };
    }),
  );

  const backup: ProgressBackup = {
    app: "word-island",
    version: 1,
    exportedAt: new Date().toISOString(),
    player: {
      name: player?.name ?? "岛主",
      coins: player?.coins ?? 0,
      xp: player?.xp ?? 0,
      streak: player?.streak ?? 0,
      bestStreak: player?.bestStreak ?? 0,
      dailyGoal: player?.dailyGoal ?? 30,
      totalAnswered: player?.totalAnswered ?? 0,
      totalCorrect: player?.totalCorrect ?? 0,
    },
    decks: decksPayload,
    achievements: achievementRows.map((a) => ({ key: a.key, unlockedAt: a.unlockedAt.toISOString() })),
    dailyStats: statRows.map((s) => ({
      date: s.date,
      newLearned: s.newLearned,
      reviewed: s.reviewed,
      correct: s.correct,
      total: s.total,
      sessionsCompleted: s.sessionsCompleted,
    })),
  };

  const safeDate = backup.exportedAt.slice(0, 10);
  return { filename: `word-island-backup-${safeDate}.json`, content: JSON.stringify(backup, null, 2), mime: "application/json" };
}
