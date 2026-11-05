import { db } from "@/db";
import { buildings, players } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { BUILDING_CATALOG, canPlaceOnSlot, getBuildingDef, getSlot, maxLevel, refundFor, upgradeCost } from "@/lib/game/buildings";
import { levelFromXp } from "@/lib/game/economy";
import type { AchievementView, BuildingView, IslandProgress, IslandState } from "@/lib/types";
import { ensureSeeded, lockPlayer, snapshot, type DbExecutor, type PlayerRow } from "./player";
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

async function loadState(executor: DbExecutor, player: PlayerRow): Promise<IslandState> {
  const rows = await executor.select().from(buildings).orderBy(asc(buildings.slot));
  const list: BuildingView[] = rows.map((r) => ({ id: r.id, type: r.type, level: r.level, slot: r.slot }));
  const snap = snapshot(player);
  return { buildings: list, player: snap, progress: islandProgress(list, snap.level) };
}

export async function getIsland(): Promise<IslandState> {
  await ensureSeeded();
  const [player] = await db.select().from(players).orderBy(players.id).limit(1);
  return loadState(db, player);
}

export async function buildAt(type: string, slotId: number): Promise<{ island: IslandState; achievements: AchievementView[] }> {
  const def = getBuildingDef(type);
  if (!def) throw new Error("未知的建筑类型");
  const slot = getSlot(slotId);
  if (!slot) throw new Error("无效的建造位置");
  if (!canPlaceOnSlot(def, slot)) {
    throw new Error(def.terrain === "beach" ? `${def.name}只能建在沙滩上` : `${def.name}只能建在草地上`);
  }
  return db.transaction(async (tx) => {
    const player = await lockPlayer(tx);
    const level = levelFromXp(player.xp).level;
    if (level < def.unlockLevel) throw new Error(`${def.name}需要达到 ${def.unlockLevel} 级才能解锁`);
    const existing = await tx.select().from(buildings);
    if (existing.some((b) => b.slot === slotId)) throw new Error("这个位置已经有建筑了");
    if (def.unique && existing.some((b) => b.type === type)) throw new Error(`${def.name}只能建造一座`);
    if (player.coins < def.buildCost) throw new Error(`金币不足，还差 ${def.buildCost - player.coins} 金币`);

    await tx.insert(buildings).values({ type, level: 1, slot: slotId });
    const [updated] = await tx
      .update(players)
      .set({ coins: player.coins - def.buildCost })
      .where(eq(players.id, player.id))
      .returning();
    const achievements = await checkAchievements(tx, {});
    const [finalPlayer] = achievements.length ? await tx.select().from(players).where(eq(players.id, player.id)) : [updated];
    return { island: await loadState(tx, finalPlayer), achievements };
  });
}

export async function upgradeBuilding(id: number): Promise<IslandState> {
  return db.transaction(async (tx) => {
    const player = await lockPlayer(tx);
    const [b] = await tx.select().from(buildings).where(eq(buildings.id, id)).for("update");
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

export async function removeBuilding(id: number): Promise<{ island: IslandState; refund: number }> {
  return db.transaction(async (tx) => {
    const player = await lockPlayer(tx);
    const [b] = await tx.select().from(buildings).where(eq(buildings.id, id)).for("update");
    if (!b) throw new Error("建筑不存在");
    if (b.type === "cabin") throw new Error("小木屋是岛主的家，不能拆除");
    const def = getBuildingDef(b.type);
    const refund = def ? refundFor(def, b.level) : 0;
    await tx.delete(buildings).where(eq(buildings.id, id));
    const [updated] = await tx
      .update(players)
      .set({ coins: player.coins + refund })
      .where(eq(players.id, player.id))
      .returning();
    return { island: await loadState(tx, updated), refund };
  });
}
