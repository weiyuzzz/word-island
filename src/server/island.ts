import { db } from "@/db";
import { buildings, dailyStats, decks, inventory, islandRaids, players, taskClaims, wordProgress, words } from "@/db/schema";
import { and, asc, eq, like, sql } from "drizzle-orm";
import { BUILTIN_DECKS } from "@/data/vocabulary";
import {
  BUILDING_CATALOG,
  ISLAND_THEMES,
  canPlaceOnSlot,
  getBuildingDef,
  getSlot,
  isSlotUnlocked,
  maxLevel,
  refundFor,
  slotUnlockLabel,
  upgradeCost,
} from "@/lib/game/buildings";
import { levelFromXp } from "@/lib/game/economy";
import { dateKey, clamp } from "@/lib/utils";
import type { AchievementView, ArchipelagoIsle, BuildingView, IslandProgress, IslandResident, IslandState } from "@/lib/types";
import { bumpDaily, ensureSeeded, lockPlayer, snapshot, type DbExecutor, type PlayerRow } from "./player";
import { currentUserId } from "./session";
import { checkAchievements } from "./tasks";
import { ensureTodayRaid } from "./island-raid";

// ---------- 岛屿居民与主题 ----------

const RESIDENT_POOL: Omit<IslandResident, never>[] = [
  { name: "老船长贝贝", quote: "风向正好，是出海探索的好日子！", color: "#4f8fc4" },
  { name: "小芽", quote: "我给每棵果树都浇过水啦～", color: "#62bd72" },
  { name: "墨墨", quote: "昨天又学会一个新词，记在小本本上了。", color: "#8b7fd0" },
  { name: "泡泡", quote: "海边的浪花会拼单词，你听——wave！", color: "#e877a5" },
  { name: "书虫", quote: "图书馆越来越满，全是你学回来的词。", color: "#c98a3d" },
  { name: "灯灯", quote: "入夜我会点亮灯塔，给晚归的船引路。", color: "#ef8a73" },
  { name: "风铃", quote: "风车转得越快，说明你复习得越勤。", color: "#57b8b0" },
  { name: "石头", quote: "新地块已经平整好，随时能盖新房子。", color: "#8a94a6" },
  { name: "星星", quote: "掌握的词越多，夜晚的星星就越亮。", color: "#d9a441" },
];

/** 居民入住规则：1 位原住民 + 每 40 个掌握词 +1 + 每 3 座建筑 +1，上限 9 位 */
export function residentCountFor(mastered: number, buildings: number): number {
  return Math.min(RESIDENT_POOL.length, 1 + Math.floor(mastered / 40) + Math.floor(buildings / 3));
}

function residentsFor(mastered: number, buildings: number): IslandResident[] {
  return RESIDENT_POOL.slice(0, residentCountFor(mastered, buildings));
}

// ---------- 岛屿主题（定义在 lib/game/buildings.ts，服务端只做拥有权与购买） ----------

// ---------- 群岛 ----------

const ISLE_UNLOCK_NEED = 40;
const ISLE_REWARD = { coins: 100 } as const;

async function buildArchipelago(executor: DbExecutor, uid: number): Promise<ArchipelagoIsle[]> {
  const claims = await executor
    .select({ taskKey: taskClaims.taskKey })
    .from(taskClaims)
    .where(and(eq(taskClaims.userId, uid), like(taskClaims.taskKey, "isle:%")));
  const claimedKeys = new Set(claims.map((c) => c.taskKey));
  const rows = await executor
    .select({ slug: decks.slug, total: sql<number>`count(${words.id})::int`, learned: sql<number>`count(${wordProgress.id}) filter (where ${wordProgress.status} <> 'new')::int` })
    .from(decks)
    .leftJoin(words, eq(words.deckId, decks.id))
    .leftJoin(wordProgress, eq(wordProgress.wordId, words.id))
    .where(eq(decks.userId, uid))
    .groupBy(decks.slug);
  const bySlug = new Map(rows.filter((r) => r.slug).map((r) => [r.slug as string, r]));
  return BUILTIN_DECKS.map((d) => {
    const r = bySlug.get(d.slug);
    const total = r?.total ?? 0;
    const learned = r?.learned ?? 0;
    return {
      slug: d.slug,
      name: d.name,
      total,
      learned,
      unlockNeed: ISLE_UNLOCK_NEED,
      unlocked: learned >= ISLE_UNLOCK_NEED,
      claimed: claimedKeys.has(`isle:${d.slug}`),
    };
  });
}

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

/** 环带扩建槽位需要等级 + 累计已学词数 */
async function assertSlotUnlocked(executor: DbExecutor, uid: number, slot: NonNullable<ReturnType<typeof getSlot>>, level: number): Promise<void> {
  if (isSlotUnlocked(slot, level, 0)) return;
  const [row] = await executor
    .select({ learned: sql<number>`count(*) filter (where ${wordProgress.status} <> 'new')::int` })
    .from(wordProgress)
    .where(eq(wordProgress.userId, uid));
  const learned = row?.learned ?? 0;
  if (!isSlotUnlocked(slot, level, learned)) {
    throw new Error(`这块地还没开垦：${slotUnlockLabel(slot)}`);
  }
}

async function loadState(executor: DbExecutor, player: PlayerRow): Promise<IslandState> {
  const uid = player.userId!;
  const rows = await executor.select().from(buildings).where(eq(buildings.userId, uid)).orderBy(asc(buildings.slot));
  const list: BuildingView[] = rows.map((r) => ({ id: r.id, type: r.type, level: r.level, slot: r.slot }));
  const [backpack, counts, themeClaims, raid, archipelago] = await Promise.all([
    executor.select({ itemKey: inventory.itemKey, qty: inventory.qty }).from(inventory).where(and(eq(inventory.userId, uid), like(inventory.itemKey, "bld:%"))),
    executor
      .select({
        learned: sql<number>`count(*) filter (where ${wordProgress.status} <> 'new')::int`,
        mastered: sql<number>`count(*) filter (where ${wordProgress.status} = 'mastered')::int`,
      })
      .from(wordProgress)
      .where(eq(wordProgress.userId, uid)),
    executor.select({ taskKey: taskClaims.taskKey }).from(taskClaims).where(and(eq(taskClaims.userId, uid), like(taskClaims.taskKey, "theme:%"))),
    executor
      .select()
      .from(islandRaids)
      .where(and(eq(islandRaids.userId, uid), eq(islandRaids.day, dateKey())))
      .orderBy(sql`${islandRaids.id} desc`)
      .limit(1),
    buildArchipelago(executor, uid),
  ]);
  const snap = snapshot(player);
  const mastered = counts[0]?.mastered ?? 0;
  const learned = counts[0]?.learned ?? 0;
  return {
    buildings: list,
    player: snap,
    progress: islandProgress(list, snap.level),
    backpack,
    learnedWords: learned,
    masteredWords: mastered,
    residents: residentsFor(mastered, list.length),
    archipelago,
    themes: [...new Set(["tropical", ...themeClaims.map((t) => t.taskKey.replace("theme:", ""))])],
    raid: raid[0]
      ? { id: raid[0].id, status: raid[0].status as "active" | "won" | "lost", wavesTotal: raid[0].wavesTotal, wavesResolved: raid[0].wavesResolved, hearts: raid[0].hearts, maxHearts: raid[0].maxHearts }
      : null,
  };
}

export async function getIsland(): Promise<IslandState> {
  await ensureSeeded();
  const uid = await currentUserId();
  const player = await getPlayerForIsland(uid);
  await ensureTodayRaid(uid);
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
    await assertSlotUnlocked(tx, uid, slot, level);
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
    const player = await lockPlayer(tx, uid);
    await assertSlotUnlocked(tx, uid, slot, levelFromXp(player.xp).level);
    await tx.update(buildings).set({ slot: targetSlotId }).where(eq(buildings.id, id));
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
    const player0 = await lockPlayer(tx, uid);
    await assertSlotUnlocked(tx, uid, slot, levelFromXp(player0.xp).level);
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

// ---------- 建筑功能化：灯塔打卡 / 风车能量 / 花园联动 ----------

const LIGHTHOUSE_REWARD = { coins: 25 } as const;

/** 灯塔每日点亮：+25 金币（每天一次，需已建造灯塔） */
export async function lighthouseCheckIn(): Promise<{ island: IslandState; coins: number }> {
  const uid = await currentUserId();
  const today = dateKey();
  return db.transaction(async (tx) => {
    const player = await lockPlayer(tx, uid);
    const owned = await tx.select({ id: buildings.id }).from(buildings).where(and(eq(buildings.userId, uid), eq(buildings.type, "lighthouse")));
    if (owned.length === 0) throw new Error("先建一座灯塔才能点亮它");
    const [existing] = await tx
      .select()
      .from(taskClaims)
      .where(and(eq(taskClaims.userId, uid), eq(taskClaims.date, today), eq(taskClaims.taskKey, "lighthouse-checkin")));
    if (existing) throw new Error("今天已经点亮过灯塔了，明天再来");
    await tx.insert(taskClaims).values({ userId: uid, date: today, taskKey: "lighthouse-checkin" });
    await tx.update(players).set({ coins: player.coins + LIGHTHOUSE_REWARD.coins }).where(eq(players.id, player.id));
    await bumpDaily(tx, uid, today, { coinsEarned: LIGHTHOUSE_REWARD.coins });
    return { island: await loadState(tx, player), coins: LIGHTHOUSE_REWARD.coins };
  });
}

/** 风车每日收能量：把今天的复习量换算成金币（2 金币/次复习，5-60） */
export async function windmillHarvest(): Promise<{ island: IslandState; coins: number; reviewed: number }> {
  const uid = await currentUserId();
  const today = dateKey();
  return db.transaction(async (tx) => {
    const player = await lockPlayer(tx, uid);
    const owned = await tx.select({ id: buildings.id }).from(buildings).where(and(eq(buildings.userId, uid), eq(buildings.type, "windmill")));
    if (owned.length === 0) throw new Error("先建一座风车才能收集能量");
    const [existing] = await tx
      .select()
      .from(taskClaims)
      .where(and(eq(taskClaims.userId, uid), eq(taskClaims.date, today), eq(taskClaims.taskKey, "windmill-harvest")));
    if (existing) throw new Error("今天的能量已经收过了");
    const [stats] = await tx.select({ reviewed: dailyStats.reviewed }).from(dailyStats).where(and(eq(dailyStats.userId, uid), eq(dailyStats.date, today)));
    const reviewed = stats?.reviewed ?? 0;
    if (reviewed === 0) throw new Error("今天还没复习过单词，风车没转起来——先去学习页复习一波");
    const coins = clamp(reviewed * 2, 5, 60);
    await tx.insert(taskClaims).values({ userId: uid, date: today, taskKey: "windmill-harvest" });
    await tx.update(players).set({ coins: player.coins + coins }).where(eq(players.id, player.id));
    await bumpDaily(tx, uid, today, { coinsEarned: coins });
    return { island: await loadState(tx, player), coins, reviewed };
  });
}

// ---------- 群岛奖励与主题购买 ----------

/** 领取邻岛解锁奖励（一次性 100 金币） */
export async function claimIsleReward(slug: string): Promise<{ island: IslandState; coins: number }> {
  const uid = await currentUserId();
  const today = dateKey();
  return db.transaction(async (tx) => {
    const player = await lockPlayer(tx, uid);
    const archipelago = await buildArchipelago(tx, uid);
    const isle = archipelago.find((i) => i.slug === slug);
    if (!isle) throw new Error("没有这座岛");
    if (!isle.unlocked) throw new Error(`「${isle.name}」还没有解锁（需要该词库学习 ${isle.unlockNeed} 词）`);
    if (isle.claimed) throw new Error("这座岛的奖励已经领过了");
    await tx.insert(taskClaims).values({ userId: uid, date: today, taskKey: `isle:${slug}` });
    await tx.update(players).set({ coins: player.coins + ISLE_REWARD.coins }).where(eq(players.id, player.id));
    await bumpDaily(tx, uid, today, { coinsEarned: ISLE_REWARD.coins });
    return { island: await loadState(tx, player), coins: ISLE_REWARD.coins };
  });
}

/** 购买岛屿主题（一次性，金币支付） */
export async function buyTheme(key: string): Promise<{ island: IslandState }> {
  const theme = ISLAND_THEMES.find((t) => t.key === key);
  if (!theme) throw new Error("未知主题");
  const uid = await currentUserId();
  const today = dateKey();
  return db.transaction(async (tx) => {
    const player = await lockPlayer(tx, uid);
    const [existing] = await tx.select().from(taskClaims).where(and(eq(taskClaims.userId, uid), eq(taskClaims.taskKey, `theme:${key}`)));
    if (existing) throw new Error("这个主题已经拥有过了");
    if (player.coins < theme.cost) throw new Error(`金币不足，还差 ${theme.cost - player.coins} 金币`);
    await tx.insert(taskClaims).values({ userId: uid, date: today, taskKey: `theme:${key}` });
    await tx.update(players).set({ coins: player.coins - theme.cost }).where(eq(players.id, player.id));
    const [updated] = await tx.select().from(players).where(eq(players.id, player.id));
    return { island: await loadState(tx, updated) };
  });
}
