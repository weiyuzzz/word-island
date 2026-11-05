import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { explorationEvents, inventory, wordProgress, words } from "@/db/schema";
import { ensureSeeded } from "../player";
import { finishExploration, getMapState, resolveEvent, startExploration } from "../exploration";
import { buyItem, claimQuest, getQuestViews, getShopState } from "../quests";
import { getGarden } from "../garden";
import { getWords } from "../vocab";
import type { EventPayload } from "@/lib/game/model";

async function resetDb() {
  await db.execute(sql`truncate table review_logs, word_progress, study_sessions, daily_stats, task_claims, achievements, buildings, words, decks, players, explorations, exploration_events, player_quests, inventory, purchases, region_progress restart identity cascade`);
}

describe("探索 / 战斗 / 任务 / 花园 闭环", () => {
  beforeAll(async () => {
    await resetDb();
    await ensureSeeded();
    // 给玩家足够金币用于商店测试
    await db.execute(sql`update players set coins = 5000, xp = 1200`);
  });

  afterAll(async () => {
    await resetDb();
    await pool.end();
  });

  it("区域解锁、探索生成、答题战斗与防重复发奖", async () => {
    const map = await getMapState();
    expect(map.regions.find((r) => r.region.key === "beach")?.unlocked).toBe(true);
    expect(map.regions.find((r) => r.region.key === "forest")?.unlocked).toBe(false);
    expect(map.regions.find((r) => r.region.key === "harbor")?.unlockText).toContain("远航小船");
    expect(map.quests.every((q) => !q.unlocked)).toBe(true);

    const run = await startExploration("beach", false);
    expect(run.totalEvents).toBe(6);
    expect(run.events[run.totalEvents - 1].kind).toBe("boss");
    expect(run.hearts).toBe(3);
    await expect(startExploration("beach", false)).rejects.toThrow("正在进行");

    // 读取服务端答案
    const rows = await db.select().from(explorationEvents).where(eq(explorationEvents.explorationId, run.id));
    const byKey = new Map(rows.map((r) => [r.eventKey, r]));
    const events = [...run.events].sort((a, b) => a.order - b.order);

    let coins = 0;
    for (const ev of events) {
      const row = byKey.get(ev.eventKey)!;
      const payload = row.payload as EventPayload;
      for (let i = 0; i < payload.questions.length; i++) {
        const q = payload.questions[i];
        const wrong = i === 0 && ev.kind === "monster";
        const answer = wrong ? `__wrong__${i}` : q.correct;
        const res = await resolveEvent({ eventKey: ev.eventKey, questionIndex: i, answer, responseMs: 1200 });
        expect(res.eventKey).toBe(ev.eventKey);
        expect(res.correct).toBe(!wrong);
        expect(res.attack.label).toBeTruthy();
        coins += res.reward.coins + res.streakBonus + (res.eventReward?.coins ?? 0);
        if (wrong) {
          expect(res.statusAfter).not.toBe("new");
        }
      }
    }

    const after = await getMapState();
    expect(after.player.coins).toBeGreaterThan(4000);
    const finishedRun = await finishExploration(run.id);
    expect(finishedRun.answered).toBeGreaterThan(0);
    expect(finishedRun.wrongWords.length).toBeGreaterThanOrEqual(1);
    expect(finishedRun.report.length).toBeGreaterThan(0);
    // 再次结算不重复发奖
    const coinsAfterFinish = (await getMapState()).player.coins;
    await finishExploration(run.id);
    expect((await getMapState()).player.coins).toBe(coinsAfterFinish);

    // 错词可以在词库错词筛选中找到
    const wrongList = await getWords({ deckId: null, wrongOnly: true });
    expect(wrongList.items.some((w) => w.wrongCount > 0)).toBe(true);

    // 词汇花园记录了答对的单词
    const garden = await getGarden();
    expect(garden.total).toBeGreaterThan(0);
    expect(garden.plants.every((p) => p.correctCount >= 1)).toBe(true);
    expect(["seed", "sprout", "sapling", "tree", "bloom"]).toContain(garden.plants[0].stage);
  });

  it("重复提交同一题不重复发奖", async () => {
    const [row] = await db.select().from(explorationEvents).orderBy(explorationEvents.id).limit(1);
    const payload = row.payload as EventPayload;
    const before = (await getMapState()).player.coins;
    const res = await resolveEvent({ eventKey: row.eventKey, questionIndex: 0, answer: payload.questions[0].correct, responseMs: 500 });
    expect(res.alreadyAnswered).toBe(true);
    expect(res.reward.coins).toBe(0);
    expect((await getMapState()).player.coins).toBe(before);
  });

  it("NPC 任务解锁、进度与一次性领取", async () => {
    const quests = await getQuestViews();
    const unlocked = quests.filter((q) => q.unlocked);
    expect(unlocked.length).toBeGreaterThan(0);
    const claimable = quests.find((q) => q.claimable);
    expect(claimable).toBeTruthy();
    const before = (await getMapState()).player.coins;
    const res = await claimQuest(claimable!.key);
    expect(res.coins).toBeGreaterThan(0);
    expect((await getMapState()).player.coins).toBe(before + res.coins);
    await expect(claimQuest(claimable!.key)).rejects.toThrow("已经领取");
    await expect(claimQuest("q_master")).rejects.toThrow();
  });

  it("商店购买、道具效果与重复购买限制", async () => {
    const shop = await getShopState();
    expect(shop.items.length).toBeGreaterThan(5);
    const boat = shop.items.find((i) => i.key === "sailboat")!;
    expect(boat.locked).toBe(false);
    const before = shop.coins;
    const bought = await buyItem("sailboat");
    expect(bought.coins).toBe(before - boat.price);
    await expect(buyItem("sailboat")).rejects.toThrow("已经拥有");

    // 买船后港口解锁
    const map = await getMapState();
    expect(map.regions.find((r) => r.region.key === "harbor")?.unlocked).toBe(true);
    expect(map.ownedItems.some((i) => i.key === "sailboat")).toBe(true);

    // 消耗品可重复购买，能量茶可让探索体力 +1
    await buyItem("energy_tea");
    const [tea] = await db.select().from(inventory).where(eq(inventory.itemKey, "energy_tea"));
    expect(tea.qty).toBe(1);
    const run = await startExploration("harbor", true);
    expect(run.maxHearts).toBe(4);
    expect(run.regionKey).toBe("harbor");
    const [teaAfter] = await db.select().from(inventory).where(eq(inventory.itemKey, "energy_tea"));
    expect(teaAfter.qty).toBe(0);
    await finishExploration(run.id);

    // 未解锁商品拒绝购买
    await expect(buyItem("wind_bell")).rejects.toThrow("Lv.");
  });

  it("探索答题会写入间隔复习记录", async () => {
    const [p] = await db.select().from(wordProgress).limit(1);
    expect(p).toBeTruthy();
    expect(p.nextReviewAt).toBeTruthy();
    expect(["new", "learning", "review", "mastered"]).toContain(p.status);
    const [w] = await db.select().from(words).where(eq(words.id, p.wordId));
    expect(w.word.length).toBeGreaterThan(0);
  });
});
