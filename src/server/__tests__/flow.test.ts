import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { players, reviewLogs, studySessions, wordProgress } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createUserAccount } from "../auth";
import { ensureSeeded, getPlayer, resetSeededFlagForTest } from "../player";
import { __setUserForTest } from "../session";
import { countDue, createSession, finishSession, submitAnswer } from "../study";
import { buildAt, getIsland, upgradeBuilding } from "../island";
import { claimTask, getDailyTasks } from "../tasks";
import { deleteDeck, exportDeck, getWords, importWords, listDecks } from "../vocab";
import { getDashboard, getStats } from "../dashboard";
import { dateKey } from "@/lib/utils";

async function resetDb() {
  // 测试库可能还没有表（首次运行），先建表再清空
  await ensureSeeded();
  await db.execute(sql`truncate table review_logs, word_progress, study_sessions, daily_stats, task_claims, achievements, buildings, words, decks, players, sessions, users restart identity cascade`);
  resetSeededFlagForTest();
  __setUserForTest(null);
}

describe("完整游戏闭环（真实数据库）", () => {
  let testerId = 0;
  beforeAll(async () => {
    await resetDb();
    await ensureSeeded();
    const user = await createUserAccount("tester", "test123456");
    testerId = user.id;
    __setUserForTest(user.id);
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
    const tasks = await getDailyTasks(db, testerId, afterFinish.dailyGoal);
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
    // 删除不存在的词库应报错（内置词库现已允许删除）
    await expect(deleteDeck(result.deckId)).rejects.toThrow("词库不存在");
  });

  it("混合+听写穿插听写题；错题复习不计入统计", async () => {
    // 延续第一个用例的状态：答错了 2 个词，错题池应有这 2 个词
    const totals = await countDue(null);
    expect(totals.wrong).toBe(2);

    // 混合+听写：约 40% 的题为纯拼写听写，其余按掌握度混合出题
    const md = await createSession({ deckId: null, kind: "mixed_dictation", size: 10 });
    expect(md.questions).toHaveLength(10);
    expect(md.questions.filter((q) => q.mode === "dictation")).toHaveLength(4);
    expect(md.questions.some((q) => q.mode !== "dictation")).toBe(true);

    // 错题复习：只从答错过（wrongCount > 0）的词里随机抽取
    const wrongSession = await createSession({ deckId: null, kind: "wrong", size: 5 });
    expect(wrongSession.questions).toHaveLength(2);
    expect(wrongSession.questions.every((q) => q.mode !== "dictation")).toBe(true);

    const playerBefore = await getPlayer();
    const dashBefore = await getDashboard();
    const [logsBefore] = await db.select({ count: sql<number>`count(*)::int` }).from(reviewLogs);

    const [stored] = await db.select().from(studySessions).where(eq(studySessions.id, wrongSession.id));
    const wpBefore = (await db.select().from(wordProgress).where(eq(wordProgress.wordId, stored.questions[0].wordId)))[0];
    expect(wpBefore.wrongCount).toBeGreaterThan(0);

    // 答错：不发奖、不扣熟练度、不计错误次数
    const q0 = stored.questions[0];
    const wrongAnswer = q0.options?.length ? q0.options.find((o) => o !== q0.correct)! : "zzz-nope";
    const resWrong = await submitAnswer({ sessionId: wrongSession.id, index: 0, answer: wrongAnswer, responseMs: 1000, usedHint: false });
    expect(resWrong.correct).toBe(false);
    expect(resWrong.reward).toEqual({ coins: 0, xp: 0, streakBonus: 0 });
    expect(resWrong.statusAfter).toBe(resWrong.statusBefore);
    expect(resWrong.player.coins).toBe(playerBefore.coins);

    // 答对：同样不发奖、不更新玩家统计
    const resRight = await submitAnswer({ sessionId: wrongSession.id, index: 1, answer: stored.questions[1].correct, responseMs: 1000, usedHint: false });
    expect(resRight.correct).toBe(true);
    expect(resRight.reward.coins).toBe(0);
    expect(resRight.player.coins).toBe(playerBefore.coins);
    const [pBefore] = await db.select().from(players).where(eq(players.id, testerId));

    const wpAfter = (await db.select().from(wordProgress).where(eq(wordProgress.wordId, stored.questions[0].wordId)))[0];
    expect(wpAfter.wrongCount).toBe(wpBefore.wrongCount);
    expect(wpAfter.proficiency).toBe(wpBefore.proficiency);
    expect(wpAfter.nextReviewAt?.getTime()).toBe(wpBefore.nextReviewAt?.getTime());

    // 结算：无完成奖励，玩家数据、每日统计与复习日志都不变
    const summary = await finishSession(wrongSession.id);
    expect(summary.bonusCoins).toBe(0);
    expect(summary.bonusXp).toBe(0);
    expect(summary.coinsEarned).toBe(0);

    const playerAfter = await getPlayer();
    expect(playerAfter.coins).toBe(playerBefore.coins);
    expect(playerAfter.xp).toBe(playerBefore.xp);
    const [pAfter] = await db.select().from(players).where(eq(players.id, testerId));
    expect(pAfter.totalAnswered).toBe(pBefore.totalAnswered);
    expect(pAfter.totalCorrect).toBe(pBefore.totalCorrect);
    expect(pAfter.lastStudyDate).toBe(pBefore.lastStudyDate);
    const [logsAfter] = await db.select({ count: sql<number>`count(*)::int` }).from(reviewLogs);
    expect(logsAfter.count).toBe(logsBefore.count);
    const dashAfter = await getDashboard();
    expect(dashAfter.today.total).toBe(dashBefore.today.total);

    // 纯拼写错题复习：整组听写
    const wd = await createSession({ deckId: null, kind: "wrong_dictation", size: 5 });
    expect(wd.questions).toHaveLength(2);
    expect(wd.questions.every((q) => q.mode === "dictation")).toBe(true);
  });
});
