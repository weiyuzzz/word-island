import { db } from "@/db";
import { islandRaids, players, wordProgress, words } from "@/db/schema";
import { dateKey, shuffle } from "@/lib/utils";
import { and, asc, eq, sql } from "drizzle-orm";
import type { RaidSummary, RaidWave } from "@/lib/types";
import { bumpDaily, ensureSeeded, lockPlayer } from "./player";
import { currentUserId } from "./session";

/**
 * 岛屿保卫战：每天第一次上岛时惰性刷出一波怪物潮（6 波），
 * 用词题击退怪物——答对怪物后退，答错扣一颗心； hearts 用完则岛屿失守。
 */

const WAVES = 6;
const WAVE_COINS = 15;
const WIN_BONUS = { coins: 60, xp: 40 } as const;
const MONSTERS = ["👾", "👹", "👻", "🐙", "🦑", "🦇"];

async function buildWaves(uid: number): Promise<RaidWave[]> {
  // 优先学习中的词（复习怪物潮最有效），不足时用全部词补
  const learning = await db
    .select({ id: words.id, word: words.word, meaning: words.meaning })
    .from(words)
    .innerJoin(wordProgress, eq(wordProgress.wordId, words.id))
    .where(and(eq(words.userId, uid), sql`${wordProgress.status} in ('learning','review')`))
    .orderBy(asc(wordProgress.nextReviewAt))
    .limit(30);
  let pool = learning;
  if (pool.length < 8) {
    const all = await db
      .select({ id: words.id, word: words.word, meaning: words.meaning })
      .from(words)
      .where(eq(words.userId, uid))
      .orderBy(sql`random()`)
      .limit(30);
    const seen = new Set(pool.map((p) => p.id));
    pool = [...pool, ...all.filter((a) => !seen.has(a.id))];
  }
  if (pool.length === 0) throw new Error("词库还是空的，先去学习或导入一些单词再来保卫岛屿");
  const picked = shuffle(pool).slice(0, Math.min(WAVES, pool.length));
  const usedOptions = new Set<string>();
  const waves: RaidWave[] = picked.map((w, i) => {
    const mode: RaidWave["mode"] = i % 2 === 0 ? "en2zh" : "zh2en";
    const correct = mode === "en2zh" ? w.meaning : w.word;
    // 干扰项从词库其他条目取，保证互不重复
    const distractors: string[] = [];
    for (const cand of shuffle(pool)) {
      const val = mode === "en2zh" ? cand.meaning : cand.word;
      if (cand.id === w.id || val === correct || usedOptions.has(val) || distractors.includes(val)) continue;
      distractors.push(val);
      if (distractors.length >= 3) break;
    }
    while (distractors.length < 3) distractors.push(mode === "en2zh" ? `其他释义 ${distractors.length + 1}` : `word${distractors.length + 1}`);
    const options = shuffle([correct, ...distractors]);
    for (const o of options) usedOptions.add(o);
    return {
      wordId: w.id,
      word: w.word,
      meaning: w.meaning,
      mode,
      options,
      correctIndex: options.indexOf(correct),
      monster: MONSTERS[i % MONSTERS.length],
    };
  });
  return waves;
}

/** 上岛时惰性确保今日怪物潮存在（胜利/失败后当天不再刷） */
export async function ensureTodayRaid(uid: number): Promise<RaidSummary | null> {
  await ensureSeeded();
  const day = dateKey();
  const [existing] = await db
    .select()
    .from(islandRaids)
    .where(and(eq(islandRaids.userId, uid), eq(islandRaids.day, day)))
    .orderBy(sql`${islandRaids.id} desc`)
    .limit(1);
  if (existing) return toSummary(existing);
  try {
    const waves = await buildWaves(uid);
    const [row] = await db
      .insert(islandRaids)
      .values({ userId: uid, day, waves, wavesTotal: waves.length, hearts: 3 })
      .returning();
    return toSummary(row);
  } catch (e) {
    console.error("[raid] 生成怪物潮失败", e);
    return null;
  }
}

function toSummary(r: typeof islandRaids.$inferSelect): RaidSummary {
  return { id: r.id, status: r.status as RaidSummary["status"], wavesTotal: r.wavesTotal, wavesResolved: r.wavesResolved, hearts: r.hearts, maxHearts: r.maxHearts };
}

export interface RaidDetail {
  id: number;
  status: "active" | "won" | "lost";
  wavesTotal: number;
  wavesResolved: number;
  hearts: number;
  maxHearts: number;
  waves: RaidWave[];
}

export async function getRaidDetail(raidId: number): Promise<RaidDetail> {
  const uid = await currentUserId();
  const [raid] = await db.select().from(islandRaids).where(and(eq(islandRaids.id, raidId), eq(islandRaids.userId, uid)));
  if (!raid) throw new Error("怪物潮记录不存在");
  return {
    id: raid.id,
    status: raid.status as RaidDetail["status"],
    wavesTotal: raid.wavesTotal,
    wavesResolved: raid.wavesResolved,
    hearts: raid.hearts,
    maxHearts: raid.maxHearts,
    waves: raid.waves,
  };
}

export interface RaidResolveResult {
  hit: boolean;
  raid: RaidSummary;
  settled: null | { won: boolean; coins: number; xp: number };
}

export async function resolveRaidWave(raidId: number, waveIndex: number, answerIndex: number): Promise<RaidResolveResult> {
  const uid = await currentUserId();
  const day = dateKey();
  return db.transaction(async (tx) => {
    const [raid] = await tx.select().from(islandRaids).where(and(eq(islandRaids.id, raidId), eq(islandRaids.userId, uid))).for("update");
    if (!raid) throw new Error("怪物潮记录不存在");
    if (raid.status !== "active") throw new Error("这场怪物潮已经结束了");
    if (waveIndex !== raid.wavesResolved) throw new Error("答题进度不同步，请刷新");
    const wave = raid.waves[waveIndex];
    if (!wave) throw new Error("波次数据异常");
    const hit = answerIndex === wave.correctIndex;
    const hearts = hit ? raid.hearts : raid.hearts - 1;
    const wavesResolved = raid.wavesResolved + 1;
    const coinsEarned = raid.coinsEarned + (hit ? WAVE_COINS : 0);
    let status: "active" | "won" | "lost" = "active";
    let settled: RaidResolveResult["settled"] = null;
    if (hearts <= 0) status = "lost";
    else if (wavesResolved >= raid.wavesTotal) status = "won";
    if (status !== "active") {
      // 结算：波次金币 + 胜利奖励一次性入账
      const totalCoins = coinsEarned + (status === "won" ? WIN_BONUS.coins : 0);
      const totalXp = status === "won" ? WIN_BONUS.xp : 0;
      const player = await lockPlayer(tx, uid);
      await tx.update(players).set({ coins: player.coins + totalCoins, xp: player.xp + totalXp }).where(eq(players.id, player.id));
      await bumpDaily(tx, uid, day, { coinsEarned: totalCoins, xpEarned: totalXp });
      settled = { won: status === "won", coins: totalCoins, xp: totalXp };
      await tx
        .update(islandRaids)
        .set({ status, hearts, wavesResolved, coinsEarned, finishedAt: new Date() })
        .where(eq(islandRaids.id, raidId));
      const [updated] = await tx.select().from(islandRaids).where(eq(islandRaids.id, raidId));
      return { hit, raid: toSummary(updated), settled };
    }
    await tx.update(islandRaids).set({ hearts, wavesResolved, coinsEarned }).where(eq(islandRaids.id, raidId));
    const [updated] = await tx.select().from(islandRaids).where(eq(islandRaids.id, raidId));
    return { hit, raid: toSummary(updated), settled };
  });
}
