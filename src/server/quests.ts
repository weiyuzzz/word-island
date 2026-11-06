import { db } from "@/db";
import { inventory, playerQuests, players, purchases, reviewLogs, wordProgress, words } from "@/db/schema";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { getItemDef, ITEMS } from "@/data/items";
import { QUESTS, getQuest, type QuestMetric } from "@/data/world";
import { levelFromXp } from "@/lib/game/economy";
import type { QuestView, ShopItemView } from "@/lib/game/model";
import { dateKey } from "@/lib/utils";
import { bumpDaily, getPlayer, lockPlayer, snapshot, type DbExecutor, type Tx } from "./player";
import { currentUserId } from "./session";

export async function unlockQuestsForNpc(tx: DbExecutor, userId: number, npcKey: string, seed: Partial<Record<QuestMetric, number>> = {}): Promise<void> {
  const defs = QUESTS.filter((q) => q.npcKey === npcKey);
  if (defs.length === 0) return;
  await tx
    .insert(playerQuests)
    .values(defs.map((d) => ({ userId, questKey: d.key, npcKey: d.npcKey, target: d.target, progress: Math.min(d.target, seed[d.metric] ?? 0) })))
    .onConflictDoNothing();
}

export async function bumpQuest(tx: DbExecutor, userId: number, metric: QuestMetric, amount: number): Promise<void> {
  const keys = QUESTS.filter((q) => q.metric === metric).map((q) => q.key);
  if (keys.length === 0) return;
  await tx
    .update(playerQuests)
    .set({ progress: sql`${playerQuests.progress} + ${amount}`, updatedAt: new Date() })
    .where(and(eq(playerQuests.userId, userId), inArray(playerQuests.questKey, keys), isNull(playerQuests.claimedAt)));
}

async function liveProgress(executor: DbExecutor, userId: number, metric: QuestMetric): Promise<number> {
  if (metric === "review") {
    const [row] = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(reviewLogs)
      .innerJoin(wordProgress, eq(wordProgress.wordId, reviewLogs.wordId))
      .where(and(eq(reviewLogs.userId, userId), eq(reviewLogs.correct, true), ne(wordProgress.status, "new")));
    return row?.count ?? 0;
  }
  if (metric === "mastered") {
    const [row] = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(wordProgress)
      .where(and(eq(wordProgress.userId, userId), eq(wordProgress.status, "mastered")));
    return row?.count ?? 0;
  }
  return -1;
}

export async function getQuestViews(executor: DbExecutor = db, userId?: number): Promise<QuestView[]> {
  const uid = userId ?? (await currentUserId());
  const rows = await executor.select().from(playerQuests).where(eq(playerQuests.userId, uid));
  const map = new Map(rows.map((r) => [r.questKey, r]));
  const liveCache = new Map<QuestMetric, number>();

  const views: QuestView[] = [];
  for (const def of QUESTS) {
    const row = map.get(def.key);
    let progress = row?.progress ?? 0;
    if (def.metric === "review" || def.metric === "mastered") {
      if (!liveCache.has(def.metric)) liveCache.set(def.metric, await liveProgress(executor, uid, def.metric));
      progress = Math.min(def.target, liveCache.get(def.metric) ?? 0);
    }
    const claimed = Boolean(row?.claimedAt);
    views.push({
      key: def.key,
      npcKey: def.npcKey,
      npcName: "",
      title: def.title,
      description: def.description,
      metric: def.metric,
      target: def.target,
      progress: Math.min(def.target, progress),
      reward: def.reward,
      itemReward: def.itemReward ?? null,
      unlocked: Boolean(row),
      claimed,
      claimable: Boolean(row) && !claimed && progress >= def.target,
    });
  }
  return views;
}

export async function claimQuest(questKey: string): Promise<{ quests: QuestView[]; coins: number; xp: number; item: string | null; leveledUp: boolean }> {
  const def = getQuest(questKey);
  if (!def) throw new Error("任务不存在");
  const uid = await currentUserId();
  return db.transaction(async (tx) => {
    await unlockQuestsForNpc(tx, uid, def.npcKey);
    const views = await getQuestViews(tx, uid);
    const view = views.find((v) => v.key === questKey);
    if (!view?.unlocked) throw new Error("先在探索中遇到对应的 NPC 才能接取任务");
    if (view.claimed) throw new Error("该任务奖励已经领取过了");
    if (!view.claimable) throw new Error(`任务尚未完成（${view.progress}/${view.target}）`);

    const claimed = await tx
      .update(playerQuests)
      .set({ claimedAt: new Date() })
      .where(and(eq(playerQuests.userId, uid), eq(playerQuests.questKey, questKey), isNull(playerQuests.claimedAt)))
      .returning({ id: playerQuests.id });
    if (claimed.length === 0) throw new Error("该任务奖励已经领取过了");

    const player = await lockPlayer(tx, uid);
    const levelBefore = levelFromXp(player.xp).level;
    const [updated] = await tx
      .update(players)
      .set({ coins: player.coins + def.reward.coins, xp: player.xp + def.reward.xp })
      .where(eq(players.id, player.id))
      .returning();

    if (def.itemReward) {
      await tx
        .insert(inventory)
        .values({ userId: uid, itemKey: def.itemReward, qty: 1 })
        .onConflictDoUpdate({ target: [inventory.userId, inventory.itemKey], set: { qty: sql`${inventory.qty} + 1` } });
    }
    await bumpDaily(tx, uid, dateKey(), { coinsEarned: def.reward.coins, xpEarned: def.reward.xp });

    return {
      quests: await getQuestViews(tx, uid),
      coins: def.reward.coins,
      xp: def.reward.xp,
      item: def.itemReward ?? null,
      leveledUp: levelFromXp(updated.xp).level > levelBefore,
    };
  });
}

// ---------- 商店 / 道具 ----------

export async function getShopState(): Promise<{ items: ShopItemView[]; coins: number; level: number; owned: { key: string; qty: number; name: string; description: string; effect: string; kind: string }[]; purchases: { id: number; name: string; price: number; createdAt: string }[] }> {
  const uid = await currentUserId();
  const player = await getPlayer(db, uid);
  const level = levelFromXp(player.xp).level;
  const rows = await db.select().from(inventory).where(eq(inventory.userId, uid));
  const ownedMap = new Map(rows.map((r) => [r.itemKey, r.qty]));
  const purchaseRows = await db.execute(sql`select id, name, price, created_at from purchases where user_id = ${uid} order by id desc limit 12`);

  const items: ShopItemView[] = ITEMS.map((def) => ({
    key: def.key,
    name: def.name,
    description: def.description,
    kind: def.kind,
    rarity: def.rarity,
    price: def.price,
    unlockLevel: def.unlockLevel,
    unique: def.unique,
    effect: def.effect,
    owned: ownedMap.get(def.key) ?? 0,
    affordable: player.coins >= def.price,
    locked: level < def.unlockLevel,
  }));

  return {
    items,
    coins: player.coins,
    level,
    owned: rows.map((r) => {
      const def = getItemDef(r.itemKey);
      return {
        key: r.itemKey,
        qty: r.qty,
        name: def?.name ?? r.itemKey,
        description: def?.description ?? "",
        effect: def?.effect ?? "",
        kind: def?.kind ?? "tool",
      };
    }),
    purchases: (purchaseRows.rows as { id: number; name: string; price: number; created_at: Date | string }[]).map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      createdAt: new Date(p.created_at).toISOString(),
    })),
  };
}

export async function buyItem(itemKey: string): Promise<{ coins: number; qty: number; item: ShopItemView; owned: Awaited<ReturnType<typeof getShopState>>["owned"] }> {
  const def = getItemDef(itemKey);
  if (!def) throw new Error("商品不存在");
  const uid = await currentUserId();
  return db.transaction(async (tx) => {
    const player = await lockPlayer(tx, uid);
    const level = levelFromXp(player.xp).level;
    if (level < def.unlockLevel) throw new Error(`需要达到 Lv.${def.unlockLevel} 才能购买`);
    const [owned] = await tx.select().from(inventory).where(and(eq(inventory.userId, uid), eq(inventory.itemKey, itemKey))).for("update");
    if (def.unique && owned) throw new Error(`「${def.name}」已经拥有`);
    if (player.coins < def.price) throw new Error(`金币不足，还差 ${def.price - player.coins} 金币`);

    await tx
      .insert(inventory)
      .values({ userId: uid, itemKey, qty: 1 })
      .onConflictDoUpdate({ target: [inventory.userId, inventory.itemKey], set: { qty: sql`${inventory.qty} + 1` } });
    await tx.insert(purchases).values({ userId: uid, itemKey, name: def.name, kind: def.kind, price: def.price });

    const [updated] = await tx
      .update(players)
      .set({ coins: player.coins - def.price })
      .where(eq(players.id, player.id))
      .returning();

    const state = await getShopState();
    return {
      coins: updated.coins,
      qty: (await tx.select().from(inventory).where(and(eq(inventory.userId, uid), eq(inventory.itemKey, itemKey))))[0]?.qty ?? 1,
      item: state.items.find((i) => i.key === itemKey)!,
      owned: state.owned,
    };
  });
}
