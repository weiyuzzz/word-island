import { db } from "@/db";
import { buildings, inventory, players } from "@/db/schema";
import { and, asc, eq, like, sql } from "drizzle-orm";
import { BUILDING_CATALOG, canPlaceOnSlot, getBuildingDef, getSlot, maxLevel, refundFor, upgradeCost } from "@/lib/game/buildings";
import { levelFromXp } from "@/lib/game/economy";
import type { AchievementView, BuildingView, IslandProgress, IslandState } from "@/lib/types";
import { ensureSeeded, lockPlayer, snapshot, type DbExecutor, type PlayerRow } from "./player";
import { currentUserId } from "./session";
import { checkAchievements } from "./tasks";

export function islandProgress(list: BuildingView[], level: number): IslandProgress {
  const owned = new Set(list.map((b) => b.type));
  const next = BUILDING_CATALOG.filter((b) => b.unlockLevel > level).sort((a, b) => a.unlockLevel - b.unlockLevel)[0];
  return {
    ownedTypes: owned.size,
    totalTypes: BUILDING_CATALOG.length,
    totalBuildings: list.length,
    totalLevels: list.reduce((n, b) => n + b.level, 0),
    nextUnlock: next ? { type: next.type, name: next.name, level: next.unlockLevel } : null,
  };
}

/** 背包里建筑 itemKey 的编码：bld:<type>:L<level>（拆下来时保留等级） */
export function buildingItemKey(type: string, level: number): string {
  return `bld:${type}:L${level}`;
}

export function parseBuildingItemKey(itemKey: string): { type: string; level: number } | null {
  const m = /^bld:([a-z_]+):L(\d+)$/.exec(itemKey);
  if (!m) return null;
  return { type: m[1], level: Number(m[2]) };
}

async function loadState(executor: DbExecutor, player: PlayerRow): Promise<IslandState> {
  const rows = await executor.select().from(buildings).where(eq(buildings.userId, player.userId!)).orderBy(asc(buildings.slot));
  const list: BuildingView[] = rows.map((r) => ({ id: r.id, type: r.type, level: r.level, slot: r.slot }));
  const backpack = await executor
    .select({ itemKey: inventory.itemKey, qty: inventory.qty })
    .from(inventory)
    .where(and(eq(inventory.userId, player.userId!), like(inventory.itemKey, "bld:%")));
  const snap = snapshot(player);
  return { buildings: list, player: snap, progress: islandProgress(list, snap.level), backpack };
}

export async function getIsland(): Promise<IslandState> {
  await ensureSeeded();
  const uid = await currentUserId();
  const player = await getPlayerForIsland(uid);
  return loadState(db, player);
}

async function getPlayerForIsland(uid: number): Promise<PlayerRow> {
  const [player] = await db.select().from(players).where(eq(players.userId, uid)).limit(1);
  if (!player) throw new Error("玩家档案初始化失败，请重新登录");
  return player;
}

export async function buildAt(type: string, slotId: number): Promise<{ island: IslandState; achievements: AchievementView[] }> {
  const def = getBuildingDef(type);
  if (!def) throw new Error("未知的建筑类型");
  const slot = getSlot(slotId);
  if (!slot) throw new Error("无效的建造位置");
  if (!canPlaceOnSlot(def, slot)) {
    throw new Error(def.terrain === "beach" ? `${def.name}只能建在沙滩上` : `${def.name}只能建在草地上`);
  }
  const uid = await currentUserId();
  return db.transaction(async (tx) => {
    const player = await lockPlayer(tx, uid);
    const level = levelFromXp(player.xp).level;
    if (level < def.unlockLevel) throw new Error(`${def.name}需要达到 ${def.unlockLevel} 级才能解锁`);
    const existing = await tx.select().from(buildings).where(eq(buildings.userId, uid));
    if (existing.some((b) => b.slot === slotId)) throw new Error("这个位置已经有建筑了");
    if (def.unique && existing.some((b) => b.type === type)) throw new Error(`${def.name}只能建造一座`);
    if (player.coins < def.buildCost) throw new Error(`金币不足，还差 ${def.buildCost - player.coins} 金币`);

    await tx.insert(buildings).values({ userId: uid, type, level: 1, slot: slotId });
    const [updated] = await tx
      .update(players)
      .set({ coins: player.coins - def.buildCost })
      .where(eq(players.id, player.id))
      .returning();
    const achievements = await checkAchievements(tx, uid, {});
    const [finalPlayer] = achievements.length ? await tx.select().from(players).where(eq(players.id, player.id)) : [updated];
    return { island: await loadState(tx, finalPlayer), achievements };
  });
}

export async function upgradeBuilding(id: number): Promise<IslandState> {
  const uid = await currentUserId();
  return db.transaction(async (tx) => {
    const player = await lockPlayer(tx, uid);
    const [b] = await tx.select().from(buildings).where(and(eq(buildings.id, id), eq(buildings.userId, uid))).for("update");
    if (!b) throw new Error("建筑不存在");
    const def = getBuildingDef(b.type);
    if (!def) throw new Error("未知的建筑类型");
    const cost = upgradeCost(def, b.level);
    if (cost === null) throw new Error(`${def.name}已经是最高等级（Lv.${maxLevel(def)}）`);
    if (player.coins < cost) throw new Error(`金币不足，还差 ${cost - player.coins} 金币`);
    await tx.update(buildings).set({ level: b.level + 1, upgradedAt: new Date() }).where(eq(buildings.id, id));
    const [updated] = await tx
      .update(players)
      .set({ coins: player.coins - cost })
      .where(eq(players.id, player.id))
      .returning();
    return loadState(tx, updated);
  });
}

/** 移动建筑到另一个空位（免费，需地形匹配） */
export async function moveBuilding(id: number, targetSlotId: number): Promise<IslandState> {
  const uid = await currentUserId();
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(buildings).where(and(eq(buildings.id, id), eq(buildings.userId, uid))).for("update");
    if (!b) throw new Error("建筑不存在");
    if (b.slot === targetSlotId) throw new Error("建筑已经在这个位置上了");
    const slot = getSlot(targetSlotId);
    if (!slot) throw new Error("无效的建造位置");
    const def = getBuildingDef(b.type);
    if (def && !canPlaceOnSlot(def, slot)) {
      throw new Error(def.terrain === "beach" ? `${def.name}只能放在沙滩上` : `${def.name}只能放在草地上`);
    }
    const [occupied] = await tx.select({ id: buildings.id }).from(buildings).where(and(eq(buildings.userId, uid), eq(buildings.slot, targetSlotId)));
    if (occupied) throw new Error("目标位置已有建筑");
    await tx.update(buildings).set({ slot: targetSlotId }).where(eq(buildings.id, id));
    const player = await lockPlayer(tx, uid);
    return loadState(tx, player);
  });
}

/** 拆除建筑收进背包（保留等级，不返还金币；重新放置免费） */
export async function removeBuilding(id: number): Promise<{ island: IslandState }> {
  const uid = await currentUserId();
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(buildings).where(and(eq(buildings.id, id), eq(buildings.userId, uid))).for("update");
    if (!b) throw new Error("建筑不存在");
    if (b.type === "cabin") throw new Error("小木屋是岛主的家，不能拆除");
    await tx.delete(buildings).where(eq(buildings.id, id));
    await tx
      .insert(inventory)
      .values({ userId: uid, itemKey: buildingItemKey(b.type, b.level), qty: 1 })
      .onConflictDoUpdate({
        target: [inventory.userId, inventory.itemKey],
        set: { qty: sql`${inventory.qty} + 1` },
      });
    const player = await lockPlayer(tx, uid);
    return { island: await loadState(tx, player) };
  });
}

/** 从背包放置建筑（免金币，保留拆除前的等级） */
export async function placeFromInventory(itemKey: string, slotId: number): Promise<{ island: IslandState; achievements: AchievementView[] }> {
  const parsed = parseBuildingItemKey(itemKey);
  if (!parsed) throw new Error("背包里没有这个建筑");
  const def = getBuildingDef(parsed.type);
  if (!def) throw new Error("未知的建筑类型");
  const slot = getSlot(slotId);
  if (!slot) throw new Error("无效的建造位置");
  if (!canPlaceOnSlot(def, slot)) {
    throw new Error(def.terrain === "beach" ? `${def.name}只能放在沙滩上` : `${def.name}只能放在草地上`);
  }
  const uid = await currentUserId();
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(inventory)
      .where(and(eq(inventory.userId, uid), eq(inventory.itemKey, itemKey)))
      .for("update");
    if (!item || item.qty <= 0) throw new Error("背包里没有这个建筑");
    const existing = await tx.select().from(buildings).where(eq(buildings.userId, uid));
    if (existing.some((b) => b.slot === slotId)) throw new Error("这个位置已经有建筑了");
    if (def.unique && existing.some((b) => b.type === parsed.type)) throw new Error(`${def.name}只能拥有一座`);
    await tx
      .update(inventory)
      .set({ qty: item.qty - 1 })
      .where(eq(inventory.id, item.id));
    if (item.qty - 1 <= 0) await tx.delete(inventory).where(eq(inventory.id, item.id));
    await tx.insert(buildings).values({ userId: uid, type: parsed.type, level: Math.min(parsed.level, maxLevel(def)), slot: slotId, upgradedAt: parsed.level > 1 ? new Date() : null });
    const player = await lockPlayer(tx, uid);
    const achievements = await checkAchievements(tx, uid, {});
    const [finalPlayer] = achievements.length ? await tx.select().from(players).where(eq(players.id, player.id)) : [player];
    return { island: await loadState(tx, finalPlayer), achievements };
  });
}
