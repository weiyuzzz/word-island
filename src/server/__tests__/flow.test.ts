import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { studySessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ensureSeeded, getPlayer, resetSeededFlagForTest } from "../player";
import { createSession, finishSession, submitAnswer } from "../study";
import { buildAt, getIsland, upgradeBuilding } from "../island";
import { claimTask, getDailyTasks } from "../tasks";
import { deleteDeck, exportDeck, getWords, importWords, listDecks } from "../vocab";
import { getDashboard, getStats } from "../dashboard";
import { dateKey } from "@/lib/utils";

async function resetDb() {
  // 测试库可能还没有表（首次运行），先建表再清空
  await ensureSeeded();
  await db.execute(sql`truncate table review_logs, word_progress, study_sessions, daily_stats, task_claims, achievements, buildings, words, decks, players restart identity cascade`);
  resetSeededFlagForTest();
}

describe("完整游戏闭环（真实数据库）", () => {
  beforeAll(async () => {
    await resetDb();
    await ensureSeeded();
  });

  afterAll(async () => {
    await resetDb();
    await pool.end();
  });

  it("学习 → 奖励 → 防重复 → 结算 → 成就 → 任务 → 建造", async () => {
    const before = await getPlayer();
    expect(before.coins).toBe(120);

    const session = await createSession({ deckId: null, kind: "mixed", size: 10 });
    expect(session.questions).toHaveLength(10);
    expect(session.questions.every((q) => q.mode === "en2zh" && q.isNew)).toBe(true);
    // 客户端题目里不应包含答案
    expect(JSON.stringify(session.questions)).not.toContain('"correct"');

    const [stored] = await db.select().from(studySessions).where(eq(studySessions.id, session.id));
    const answers = stored.questions.map((q) => q.correct);

    let coins = before.coins;
    for (let i = 0; i < 10; i++) {
      const wrong = i === 3 || i === 7;
      const answer = wrong ? stored.questions[i].options.find((o) => o !== answers[i])! : answers[i];
      const res = await submitAnswer({ sessionId: session.id, index: i, answer, responseMs: 1500, usedHint: false });
      expect(res.correct).toBe(!wrong);
      expect(res.alreadyAnswered).toBe(false);
      if (wrong) {
        expect(res.reward.coins).toBe(0);
        expect(res.statusAfter).toBe("learning");
      } else {
        expect(res.reward.coins).toBeGreaterThan(0);
      }
      coins += res.reward.coins + res.reward.streakBonus;
      expect(res.player.coins).toBe(coins);
    }

    // 重复提交同一题不再发奖
    const dup = await submitAnswer({ sessionId: session.id, index: 0, answer: answers[0], responseMs: 100, usedHint: false });
    expect(dup.alreadyAnswered).toBe(true);
    expect(dup.reward.coins).toBe(0);
    expect(dup.player.coins).toBe(coins);

    const summary = await finishSession(session.id);
    expect(summary.completed).toBe(true);
    expect(summary.correct).toBe(8);
    expect(summary.bonusCoins).toBe(18);
    expect(summary.newAchievements.map((a) => a.key)).toContain("first_voyage");
    expect(summary.wrongWords).toHaveLength(2);
    const afterFinish = await getPlayer();
    expect(afterFinish.coins).toBe(coins + 18 + 30);
    expect(afterFinish.streak).toBe(1);
    expect(afterFinish.lastStudyDate).toBe(dateKey());

    // 再次结算幂等
    const again = await finishSession(session.id);
    expect(again.newAchievements).toHaveLength(0);
    expect((await getPlayer()).coins).toBe(afterFinish.coins);

    // 会话结束后不能继续作答
    await expect(submitAnswer({ sessionId: session.id, index: 1, answer: "x", responseMs: 1, usedHint: false })).rejects.toThrow();

    // 每日任务：学习 10 个新词可领取，重复领取失败
    const tasks = await getDailyTasks(db, afterFinish.dailyGoal);
    expect(tasks.find((t) => t.key === "new10")?.claimable).toBe(true);
    const claim = await claimTask("new10");
    expect(claim.player.coins).toBe(afterFinish.coins + 20);
    await expect(claimTask("new10")).rejects.toThrow();
    await expect(claimTask("review20")).rejects.toThrow();

    // 建造与升级
    const island = await getIsland();
    expect(island.buildings.map((b) => b.type)).toEqual(["cabin"]);
    const coinsBeforeBuild = (await getPlayer()).coins;
    const built = await buildAt("tree", 1);
    expect(built.island.player.coins).toBe(coinsBeforeBuild - 30);
    expect(built.island.buildings).toHaveLength(2);
    await expect(buildAt("tree", 1)).rejects.toThrow("已经有建筑");
    await expect(buildAt("castle", 2)).rejects.toThrow("15 级");
    await expect(buildAt("boat", 2)).rejects.toThrow("沙滩");
    const tree = built.island.buildings.find((b) => b.type === "tree")!;
    const upgraded = await upgradeBuilding(tree.id);
    expect(upgraded.buildings.find((b) => b.id === tree.id)?.level).toBe(2);
    expect(upgraded.player.coins).toBe(coinsBeforeBuild - 30 - 40);
    await expect(upgradeBuilding(tree.id)).rejects.toThrow("最高等级");

    // 复习队列：刚答错的词 10 分钟后才到期，此时没有待复习
    await expect(createSession({ deckId: null, kind: "review", size: 10 })).rejects.toThrow();

    // 仪表盘与统计
    const dash = await getDashboard();
    expect(dash.today.total).toBe(10);
    expect(dash.today.newLearned).toBe(10);
    expect(dash.totalLearned).toBe(10);
    expect(dash.island.totalBuildings).toBe(2);
    const stats = await getStats();
    expect(stats.series.at(-1)?.total).toBe(10);
    expect(stats.statusCounts.learning).toBe(10);
  });

  it("导入 / 重复检测 / 导出 / 删除词库", async () => {
    const csv = `word,phonetic,pos,meaning,example,translation,difficulty
serendipity,/ˌserənˈdɪpəti/,n.,意外发现美好事物的运气,"Finding this café was pure serendipity.",发现这家咖啡馆纯属意外之喜,4
resilient,/rɪˈzɪliənt/,adj.,有韧性的,"Children are often remarkably resilient.",孩子们往往有惊人的恢复能力,3
Serendipity,,n.,重复,,,
,,,缺少单词,,,`;
    const result = await importWords({ deckId: null, newDeckName: "测试词库", text: csv, format: "csv" });
    expect(result.imported).toBe(2);
    expect(result.duplicatesInFile).toBe(1);
    expect(result.errors).toHaveLength(1);

    const second = await importWords({ deckId: result.deckId, newDeckName: null, text: csv, format: "csv" });
    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(2);

    const json = JSON.stringify([{ word: "ubiquitous", meaning: "无处不在的", pos: "adj." }]);
    const third = await importWords({ deckId: result.deckId, newDeckName: null, text: json, format: "json" });
    expect(third.imported).toBe(1);

    const words = await getWords({ deckId: result.deckId, q: "resil" });
    expect(words.items.map((w) => w.word)).toEqual(["resilient"]);

    const exported = await exportDeck(result.deckId, "csv");
    expect(exported.content).toContain("word,phonetic,pos,meaning");
    expect(exported.content).toContain("serendipity");
    const exportedJson = await exportDeck(result.deckId, "json");
    expect(JSON.parse(exportedJson.content)).toHaveLength(3);

    // 自定义词库可以学习（小词库会用全局词池做干扰项）
    const session = await createSession({ deckId: result.deckId, kind: "new", size: 10 });
    expect(session.questions).toHaveLength(3);
    expect(session.questions.every((q) => q.options?.length === 4)).toBe(true);

    const decks = await listDecks();
    expect(decks.find((d) => d.id === result.deckId)?.total).toBe(3);
    await deleteDeck(result.deckId);
    expect((await listDecks()).some((d) => d.id === result.deckId)).toBe(false);
    await expect(deleteDeck(decks.find((d) => d.kind === "builtin")!.id)).rejects.toThrow("内置");
  });
});
