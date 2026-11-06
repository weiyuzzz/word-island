import { db } from "@/db";
import {
  explorationEvents,
  explorations,
  inventory,
  playerQuests,
  players,
  purchases,
  regionProgress,
  reviewLogs,
  wordProgress,
  words,
} from "@/db/schema";
import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { getItemDef, ITEMS } from "@/data/items";
import { MONSTERS, NPCS, REGIONS, getRegion, type RegionDef } from "@/data/world";
import { answerReward, levelFromXp } from "@/lib/game/economy";
import type { EventKind, EventPayload, EventResult, ClientEventView, ExpeditionSummary, ExpeditionView, MapState, QuestView, RunReportWord, RegionState } from "@/lib/game/model";
import { ATTACK, availableModes, buildChallenge, isCorrectAnswer, type WordLike } from "@/lib/game/questions";
import { applyReview, gradeAnswer, initialProgress, type ProgressState } from "@/lib/game/srs";
import type { ClientQuestion, QuizMode, WordDetail, WordStatus } from "@/lib/types";
import { pickRandom, shuffle } from "@/lib/utils";
import { getPlayer, lockPlayer, snapshot, type DbExecutor, type PlayerRow, type Tx } from "./player";
import { currentUserId } from "./session";
import { bumpQuest, getQuestViews, unlockQuestsForNpc } from "./quests";

type WordRow = typeof words.$inferSelect;
type ProgressRow = typeof wordProgress.$inferSelect;
type EventRow = typeof explorationEvents.$inferSelect;
type ExplorationRow = typeof explorations.$inferSelect;

const RARE_ITEM_POOL = ["lucky_charm", "explorer_kit", "guard_charm", "telescope", "wind_bell"];
const COMMON_ITEM_POOL = ["energy_tea", "energy_tea", "shell_chime", "sailor_hat"];

export interface PlayerEffects {
  luck: boolean;
  kit: boolean;
  guard: boolean;
  boat: boolean;
  telescope: boolean;
  windBell: boolean;
}

export async function getEffects(executor: DbExecutor = db): Promise<PlayerEffects> {
  const uid = await currentUserId();
  const rows = await executor.select({ key: inventory.itemKey }).from(inventory).where(eq(inventory.userId, uid));
  const owned = new Set(rows.map((r) => r.key));
  return {
    luck: owned.has("lucky_charm"),
    kit: owned.has("explorer_kit"),
    guard: owned.has("guard_charm"),
    boat: owned.has("sailboat"),
    telescope: owned.has("telescope"),
    windBell: owned.has("wind_bell"),
  };
}

function toState(p: ProgressRow | undefined): ProgressState {
  if (!p) return initialProgress();
  return {
    status: p.status as WordStatus,
    proficiency: p.proficiency,
    streak: p.streak,
    correctCount: p.correctCount,
    wrongCount: p.wrongCount,
    lapses: p.lapses,
    intervalMinutes: p.intervalMinutes,
    nextReviewAt: p.nextReviewAt,
    lastReviewedAt: p.lastReviewedAt,
  };
}

function toDetail(w: WordRow): WordDetail {
  return {
    id: w.id,
    deckId: w.deckId,
    word: w.word,
    phonetic: w.phonetic,
    pos: w.pos,
    meaning: w.meaning,
    example: w.example,
    translation: w.translation,
    difficulty: w.difficulty,
  };
}

function toClientQuestion(q: { wordId: number; mode: QuizMode; options: string[]; prompt: string | null; isNew: boolean }, w: WordRow, index: number): ClientQuestion {
  const base: ClientQuestion = { index, wordId: q.wordId, mode: q.mode, isNew: q.isNew };
  switch (q.mode) {
    case "en2zh":
      return { ...base, word: w.word, phonetic: w.phonetic, pos: w.pos, options: q.options };
    case "listen":
      return { ...base, word: w.word, phonetic: w.phonetic, pos: w.pos, options: q.options };
    case "zh2en":
      return { ...base, meaning: w.meaning, pos: w.pos, options: q.options };
    case "context":
      return { ...base, prompt: q.prompt, meaning: w.meaning, pos: w.pos, options: q.options };
    case "sentence":
      return { ...base, prompt: q.prompt, meaning: w.meaning, pos: w.pos, options: q.options };
    case "synonym":
    case "antonym":
      return { ...base, word: w.word, phonetic: w.phonetic, pos: w.pos, options: q.options };
    case "spelling":
    default:
      return { ...base, meaning: w.meaning, pos: w.pos, prompt: q.prompt, length: w.word.length, firstLetter: w.word[0] };
  }
}

// ---------- 事件生成 ----------

function pickMode(region: RegionDef, word: WordLike, prefer: QuizMode[] = []): QuizMode {
  const allowed = availableModes(word, true).filter((m) => region.modes.includes(m));
  const fromPrefer = prefer.filter((m) => allowed.includes(m));
  const choices = fromPrefer.length ? fromPrefer : allowed;
  if (choices.length === 0) return "en2zh";
  return choices[Math.floor(Math.random() * choices.length)];
}

async function loadPool(region: RegionDef, userId: number): Promise<WordRow[]> {
  const deckRows = await db.select({ id: sql<number>`decks.id` }).from(sql`decks`).where(sql`user_id = ${userId} and slug in (${sql.join(region.deckSlugs.map((s) => sql`${s}`), sql`, `)})`);
  const deckIds = deckRows.map((d) => d.id);
  if (deckIds.length === 0) return [];
  return db
    .select()
    .from(words)
    .where(and(eq(words.userId, userId), inArray(words.deckId, deckIds), gte(words.difficulty, region.difficulty[0]), lte(words.difficulty, region.difficulty[1])))
    .orderBy(asc(words.id));
}

function buildEvent(kind: EventKind, region: RegionDef, wordsForEvent: WordRow[], pool: WordRow[], statuses: Map<number, WordStatus>, useAdvanced: boolean): EventPayload {
  const make = (word: WordRow, prefer: QuizMode[] = []) => {
    const mode = pickMode(region, word, prefer);
    return buildChallenge(mode, word, pool, statuses.get(word.id) ?? "review");
  };
  const status = (w: WordRow) => statuses.get(w.id) ?? "review";

  if (kind === "monster" || kind === "boss") {
    const monsterKey = kind === "boss" ? region.boss : pickRandom(region.monsters, 1)[0];
    const config = MONSTERS[monsterKey];
    return {
      title: kind === "boss" ? `首领战 · ${config.name}` : `遭遇 · ${config.name}`,
      description: config.flavor,
      monster: { key: config.key, name: config.name, hp: config.hp, maxHp: config.hp, art: config.art, flavor: config.flavor },
      questions: wordsForEvent.map((w) => make(w)),
      coinsReward: kind === "boss" ? 55 : 28,
      xpReward: kind === "boss" ? 35 : 18,
      itemReward: kind === "boss" ? pickRandom([...RARE_ITEM_POOL, "energy_tea"], 1)[0] : null,
    };
  }

  const npcKey = region.npcs[Math.floor(Math.random() * region.npcs.length)];
  const npc = NPCS[npcKey];
  const flavor = npc.lines[Math.floor(Math.random() * npc.lines.length)];

  switch (kind) {
    case "npc":
      return {
        title: `${npc.name} · ${npc.role}`,
        description: flavor,
        npc: { key: npc.key, name: npc.name, role: npc.role, line: npc.greeting },
        questions: wordsForEvent.map((w) => make(w, ["en2zh", "zh2en", "context"])),
        coinsReward: 18,
        xpReward: 12,
        itemReward: null,
      };
    case "treasure":
      return {
        title: "发现宝箱",
        description: "宝箱上刻着一个英文单词，拼写正确才能打开它。",
        questions: wordsForEvent.map((w) => make(w, ["spelling"])),
        coinsReward: 38,
        xpReward: 15,
        itemReward: Math.random() < 0.35 ? pickRandom(COMMON_ITEM_POOL, 1)[0] : null,
      };
    case "bottle":
      return {
        title: "漂流瓶",
        description: "瓶中的纸条写着一条英文线索，读懂它。",
        questions: wordsForEvent.map((w) => make(w, ["listen", "synonym", "en2zh"])),
        coinsReward: 26,
        xpReward: 14,
        itemReward: Math.random() < 0.2 ? pickRandom(COMMON_ITEM_POOL, 1)[0] : null,
      };
    case "stone":
      return {
        title: "神秘石碑",
        description: "石碑上刻着近义与相反的词，辨析它们以获得祝福。",
        questions: wordsForEvent.map((w) => make(w, useAdvanced ? ["synonym", "antonym"] : ["context"])),
        coinsReward: 32,
        xpReward: 18,
        itemReward: null,
      };
    case "cave":
      return {
        title: "隐藏洞穴",
        description: "洞口的谜题需要用语境填空来解开。",
        questions: wordsForEvent.map((w) => make(w, ["context", "sentence"])),
        coinsReward: 30,
        xpReward: 16,
        itemReward: Math.random() < 0.25 ? pickRandom(COMMON_ITEM_POOL, 1)[0] : null,
      };
    case "rest":
    default:
      return {
        title: "营地休息",
        description: "回忆一个已经学过的单词，就能恢复 1 点体力。",
        questions: wordsForEvent.map((w) => make(w, ["en2zh", "listen"])),
        coinsReward: 10,
        xpReward: 8,
        itemReward: null,
      };
  }
}

async function generateEvents(region: RegionDef, userId: number, kit: boolean, effects: PlayerEffects): Promise<EventPayload[]> {
  const pool = await loadPool(region, userId);
  if (pool.length < 4) throw new Error("该区域的词库单词不足，先去导入或学习更多单词吧");

  const progressRows = await db.select().from(wordProgress).where(eq(wordProgress.userId, userId));
  const statuses = new Map<number, WordStatus>(progressRows.map((p) => [p.wordId, p.status as WordStatus]));
  const learned = pool.filter((w) => statuses.has(w.id) && statuses.get(w.id) !== "new");
  const fresh = pool.filter((w) => !statuses.has(w.id) || statuses.get(w.id) === "new");

  const plan = [...pickRandom(region.plans, 1)[0]];
  if (kit) plan.splice(plan.length - 1, 0, pickRandom(["treasure", "cave", "stone", "bottle"] as EventKind[], 1)[0]);

  const used = new Set<number>();
  const takeWords = (n: number, prefer: WordRow[]) => {
    const source = shuffle(prefer.length >= n ? prefer : [...prefer, ...pool.filter((w) => !prefer.includes(w))]);
    const out: WordRow[] = [];
    for (const w of source) {
      if (used.has(w.id)) continue;
      used.add(w.id);
      out.push(w);
      if (out.length >= n) break;
    }
    for (const w of shuffle(pool)) {
      if (out.length >= n) break;
      if (!out.includes(w)) out.push(w);
    }
    return out;
  };

  return plan.map((kind) => {
    const isBoss = kind === "boss";
    const count = isBoss ? 3 : 1;
    const source = isBoss || kind === "rest" ? learned : Math.random() < 0.5 ? [...learned, ...fresh] : [...fresh, ...learned];
    const picked = takeWords(count, source.length ? source : pool);
    return buildEvent(kind, region, picked, pool, statuses, true);
  });
}

// ---------- 视图构建 ----------

function eventView(row: EventRow, wordMap: Map<number, WordRow>, damage = 0): ClientEventView {
  const payload = row.payload;
  const nextIndex = payload.questions.findIndex((q) => !q.answered);
  const q = nextIndex >= 0 ? payload.questions[nextIndex] : null;
  const answeredCount = payload.questions.filter((x) => x.answered).length;
  return {
    eventKey: row.eventKey,
    kind: row.kind as EventKind,
    order: row.position,
    status: row.status as "pending" | "resolved",
    title: payload.title,
    description: payload.description,
    monster: payload.monster
      ? { ...payload.monster, damage }
      : undefined,
    npc: payload.npc,
    coinsReward: payload.coinsReward,
    xpReward: payload.xpReward,
    itemReward: payload.itemReward,
    question: q && wordMap.has(q.wordId) ? toClientQuestion(q, wordMap.get(q.wordId)!, payload.questions.indexOf(q)) : null,
    questionIndex: nextIndex >= 0 ? nextIndex : payload.questions.length,
    questionCount: payload.questions.length,
    answeredCount,
  };
}

async function loadWordMap(eventRows: EventRow[]): Promise<Map<number, WordRow>> {
  const ids = [...new Set(eventRows.flatMap((e) => e.payload.questions.map((q) => q.wordId)))];
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(words).where(inArray(words.id, ids));
  return new Map(rows.map((w) => [w.id, w]));
}

async function expeditionView(executor: DbExecutor, run: ExplorationRow, events: EventRow[], wordMap: Map<number, WordRow>, region: RegionDef, player: PlayerRow): Promise<ExpeditionView> {
  return {
    id: run.id,
    regionKey: run.regionKey,
    regionName: region.name,
    hearts: run.hearts,
    maxHearts: run.maxHearts,
    totalEvents: run.totalEvents,
    resolvedEvents: run.resolvedEvents,
    coinsEarned: run.coinsEarned,
    xpEarned: run.xpEarned,
    currentStreak: run.currentStreak,
    bestStreak: run.bestStreak,
    events: events.sort((a, b) => a.position - b.position).map((e) => eventView(e, wordMap)),
  };
}

// ---------- 对外接口 ----------

export async function getMapState(): Promise<MapState> {
  const uid = await currentUserId();
  const player = await getPlayer(db, uid);
  const effects = await getEffects();
  const [learnedRow] = await db.select({ count: sql<number>`count(*)::int` }).from(wordProgress).where(and(eq(wordProgress.userId, uid), ne(wordProgress.status, "new")));
  const learned = learnedRow?.count ?? 0;
  const level = levelFromXp(player.xp).level;
  const owned = new Set((await db.select().from(inventory).where(eq(inventory.userId, uid))).map((r) => r.itemKey));
  const progressRows = await db.select().from(regionProgress).where(eq(regionProgress.userId, uid));
  const progressMap = new Map(progressRows.map((p) => [p.regionKey, p]));

  const regions: RegionState[] = REGIONS.map((region) => {
    const u = region.unlock;
    let unlockText = "";
    if (u.level && level < u.level) unlockText = `达到 Lv.${u.level} 解锁（当前 Lv.${level}）`;
    else if (u.learned && learned < u.learned) unlockText = `学习 ${u.learned} 个单词解锁（当前 ${learned}）`;
    else if (u.item && !owned.has(u.item)) unlockText = `需要道具「${getItemDef(u.item)?.name ?? u.item}」`;
    const p = progressMap.get(region.key);
    return {
      region,
      unlocked: !unlockText,
      unlockText,
      runs: p?.runs ?? 0,
      eventsResolved: p?.eventsResolved ?? 0,
      monstersDefeated: p?.monstersDefeated ?? 0,
      chestsFound: p?.chestsFound ?? 0,
    };
  });

  const active = await getActiveExpedition();

  return {
    regions,
    player: snapshot(player),
    active,
    ownedItems: [...owned].map((key) => ({ key, qty: 0 })),
    learnedCount: learned,
    quests: await getQuestViews(db, uid),
  };
}

export async function getActiveExpedition(): Promise<ExpeditionView | null> {
  const uid = await currentUserId();
  const [run] = await db.select().from(explorations).where(and(eq(explorations.userId, uid), eq(explorations.status, "active"))).orderBy(asc(explorations.id)).limit(1);
  if (!run) return null;
  const region = getRegion(run.regionKey);
  if (!region) return null;
  const events = await db.select().from(explorationEvents).where(eq(explorationEvents.explorationId, run.id));
  const wordMap = await loadWordMap(events);
  const player = await getPlayer(db, uid);
  return expeditionView(db, run, events, wordMap, region, player);
}

export async function startExploration(regionKey: string, useTea = false): Promise<ExpeditionView> {
  const uid = await currentUserId();
  const region = getRegion(regionKey);
  if (!region) throw new Error("区域不存在");
  const player = await getPlayer(db, uid);
  const state = await getMapState();
  const regionState = state.regions.find((r) => r.region.key === regionKey);
  if (!regionState?.unlocked) throw new Error(regionState?.unlockText || "该区域尚未解锁");
  const [active] = await db.select({ id: explorations.id }).from(explorations).where(and(eq(explorations.userId, uid), eq(explorations.status, "active")));
  if (active) throw new Error("还有一场探索正在进行，请先完成或撤退");

  let maxHearts = 3;
  if (useTea) {
    const updated = await db
      .update(inventory)
      .set({ qty: sql`${inventory.qty} - 1` })
      .where(and(eq(inventory.userId, uid), eq(inventory.itemKey, "energy_tea"), sql`${inventory.qty} > 0`))
      .returning({ id: inventory.id });
    if (updated.length === 0) throw new Error("还没有能量茶，可在商店购买");
    maxHearts = 4;
  }

  const effects = await getEffects();
  const payloads = await generateEvents(region, uid, effects.kit, effects);

  const [run] = await db
    .insert(explorations)
    .values({ userId: uid, regionKey, totalEvents: payloads.length, hearts: maxHearts, maxHearts })
    .returning();

  const rows = payloads.map((payload, i) => ({
    explorationId: run.id,
    eventKey: `${regionKey}-${run.id}-${i}-${Math.random().toString(36).slice(2, 8)}`,
    kind: i === payloads.length - 1 && payload.monster ? "boss" : inferKind(payload, i, payloads.length),
    position: i,
    payload,
  }));
  await db.insert(explorationEvents).values(rows);

  const events = await db.select().from(explorationEvents).where(eq(explorationEvents.explorationId, run.id));
  const wordMap = await loadWordMap(events);
  const fresh = await getPlayer(db, uid);
  return expeditionView(db, run, events, wordMap, region, fresh);
}

function inferKind(payload: EventPayload, index: number, total: number): EventKind {
  if (payload.npc) return "npc";
  if (payload.monster) return index === total - 1 ? "boss" : "monster";
  if (payload.title.includes("宝箱")) return "treasure";
  if (payload.title.includes("漂流瓶")) return "bottle";
  if (payload.title.includes("石碑")) return "stone";
  if (payload.title.includes("洞穴")) return "cave";
  return "rest";
}

export interface ResolveInput {
  eventKey: string;
  questionIndex: number;
  answer: string;
  responseMs: number;
}

export async function resolveEvent(input: ResolveInput): Promise<EventResult> {
  const uid = await currentUserId();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(explorationEvents).where(eq(explorationEvents.eventKey, input.eventKey)).for("update");
    if (!row) throw new Error("事件不存在");
    const [run] = await tx.select().from(explorations).where(and(eq(explorations.id, row.explorationId), eq(explorations.userId, uid))).for("update");
    if (!run) throw new Error("探索不存在");
    const region = getRegion(run.regionKey);
    if (!region) throw new Error("区域配置缺失");

    const payload = row.payload;
    const q = payload.questions[input.questionIndex];
    if (!q) throw new Error("题目不存在");
    const [word] = await tx.select().from(words).where(eq(words.id, q.wordId));
    if (!word) throw new Error("单词已被删除");

    const [existing] = await tx.select().from(wordProgress).where(eq(wordProgress.wordId, q.wordId));
    const prev = toState(existing);
    const player = await lockPlayer(tx, uid);

    if (q.answered) {
      return buildResult({
        row, run, region, payload, q, word, prev, player,
        correct: Boolean(q.wasCorrect), alreadyAnswered: true, rewardCoins: 0, rewardXp: 0, streakBonus: 0,
        quality: q.wasCorrect ? 2 : 0, next: prev, eventReward: null, quests: await getQuestViews(tx, uid),
        leveledUp: false, wordMap: await loadWordMap([row]),
      });
    }

    const correct = isCorrectAnswer(q.mode, q.correct, input.answer);
    const responseMs = Math.max(0, Math.min(10 * 60_000, Math.round(input.responseMs || 0)));
    const quality = gradeAnswer(correct, q.mode, responseMs, false);
    const now = new Date();
    const next = applyReview(prev, q.mode, quality, now);

    await tx
      .insert(wordProgress)
      .values({
        userId: uid,
        wordId: q.wordId,
        status: next.status,
        proficiency: next.proficiency,
        streak: next.streak,
        correctCount: next.correctCount,
        wrongCount: next.wrongCount,
        lapses: next.lapses,
        intervalMinutes: next.intervalMinutes,
        lastReviewedAt: now,
        nextReviewAt: next.nextReviewAt,
        firstLearnedAt: now,
        masteredAt: next.status === "mastered" ? now : null,
      })
      .onConflictDoUpdate({
        target: wordProgress.wordId,
        set: {
          status: next.status,
          proficiency: next.proficiency,
          streak: next.streak,
          correctCount: next.correctCount,
          wrongCount: next.wrongCount,
          lapses: next.lapses,
          intervalMinutes: next.intervalMinutes,
          lastReviewedAt: now,
          nextReviewAt: next.nextReviewAt,
          firstLearnedAt: sql`coalesce(${wordProgress.firstLearnedAt}, ${now.toISOString()}::timestamptz)`,
          masteredAt: next.status === "mastered" ? sql`coalesce(${wordProgress.masteredAt}, ${now.toISOString()}::timestamptz)` : null,
        },
      });
    await tx.insert(reviewLogs).values({ userId: uid, wordId: q.wordId, sessionId: null, mode: q.mode, correct, quality, responseMs });

    const isReview = prev.status !== "new";
    const reward = answerReward({ quality, isNew: q.isNew, isReview, streakAfter: run.currentStreak + (correct ? 1 : 0) });
    const effects = await getEffects(tx);
    const coinMultiplier = (effects.luck ? 1.15 : 1) * (effects.windBell ? 1.05 : 1);
    const coins = Math.round(reward.coins * coinMultiplier) + reward.streakBonus;

    // 状态与奖励
    q.answered = true;
    q.wasCorrect = correct;
    const attack = ATTACK[q.mode];
    const damage = correct ? attack.damage : 0;
    let hearts = run.hearts;
    let guardUsed = payload.guardUsed ?? false;
    if (!correct) {
      if (effects.guard && !guardUsed && (payload.monster || row.kind === "boss")) {
        guardUsed = true;
      } else {
        hearts = Math.max(0, run.hearts - 1);
      }
    } else if (row.kind === "rest") {
      hearts = Math.min(run.maxHearts, run.hearts + 1);
    }
    payload.guardUsed = guardUsed;

    if (payload.monster && damage > 0) {
      payload.monster.hp = Math.max(0, payload.monster.hp - damage);
    }

    const answeredAll = payload.questions.every((x) => x.answered);
    const monsterDead = payload.monster ? payload.monster.hp <= 0 : false;
    const resolved = answeredAll || monsterDead;
    if (resolved) payload.questions.forEach((x) => (x.answered = true));

    const currentStreak = correct ? run.currentStreak + 1 : 0;
    const eventReward = resolved ? { coins: Math.round(payload.coinsReward * coinMultiplier), xp: payload.xpReward, item: payload.itemReward } : null;

    const reportEntry: RunReportWord = {
      id: word.id,
      word: word.word,
      meaning: word.meaning,
      correct,
      mode: q.mode,
      nextReviewAt: next.nextReviewAt?.toISOString() ?? null,
      status: next.status,
    };

    await tx
      .update(explorationEvents)
      .set({
        payload,
        status: resolved ? "resolved" : row.status,
        resolvedAt: resolved ? now : row.resolvedAt,
        coinsEarned: row.coinsEarned + coins + (eventReward?.coins ?? 0),
        xpEarned: row.xpEarned + reward.xp + (eventReward?.xp ?? 0),
      })
      .where(eq(explorationEvents.id, row.id));

    await tx
      .update(explorations)
      .set({
        answered: run.answered + 1,
        correct: run.correct + (correct ? 1 : 0),
        currentStreak,
        bestStreak: Math.max(run.bestStreak, currentStreak),
        hearts,
        coinsEarned: run.coinsEarned + coins + (eventReward?.coins ?? 0),
        xpEarned: run.xpEarned + reward.xp + (eventReward?.xp ?? 0),
        resolvedEvents: run.resolvedEvents + (resolved && row.status === "pending" ? 1 : 0),
        monstersDefeated: run.monstersDefeated + (resolved && row.status === "pending" && payload.monster && monsterDead ? 1 : 0),
        chestsFound: run.chestsFound + (resolved && row.status === "pending" && (row.kind === "treasure" || row.kind === "cave") ? 1 : 0),
        itemsFound: eventReward?.item ? [...run.itemsFound, eventReward.item] : run.itemsFound,
        report: [...run.report, reportEntry],
        status: hearts <= 0 ? "retreated" : run.status,
        finishedAt: hearts <= 0 ? now : run.finishedAt,
      })
      .where(eq(explorations.id, run.id));

    const levelBefore = levelFromXp(player.xp).level;
    await tx
      .update(players)
      .set({
        coins: player.coins + coins + (eventReward?.coins ?? 0),
        xp: player.xp + reward.xp + (eventReward?.xp ?? 0),
        totalAnswered: player.totalAnswered + 1,
        totalCorrect: player.totalCorrect + (correct ? 1 : 0),
      })
      .where(eq(players.id, player.id));

    // 任务进度
    if (correct) {
      await bumpQuest(tx, uid, "correct", 1);
      if (q.mode === "spelling") await bumpQuest(tx, uid, "spelling", 1);
    }
    if (resolved && row.status === "pending" && payload.monster && monsterDead) await bumpQuest(tx, uid, "monsters", 1);
    const foundChest = resolved && row.status === "pending" && (row.kind === "treasure" || row.kind === "cave");
    if (foundChest) await bumpQuest(tx, uid, "treasures", 1);
    if (payload.npc) {
      await unlockQuestsForNpc(tx, uid, payload.npc.key, {
        correct: run.correct + (correct ? 1 : 0),
        spelling: 0,
        monsters: run.monstersDefeated + (resolved && row.status === "pending" && payload.monster && monsterDead ? 1 : 0),
        treasures: run.chestsFound + (foundChest ? 1 : 0),
      });
    }

    const [updatedPlayer] = await tx.select().from(players).where(eq(players.id, player.id));
    const [updatedRow] = await tx.select().from(explorationEvents).where(eq(explorationEvents.id, row.id));
    const [updatedRun] = await tx.select().from(explorations).where(eq(explorations.id, run.id));
    const wordMap = await loadWordMap([updatedRow]);

    return buildResult({
      row: updatedRow, run: updatedRun, region, payload, q, word, prev, player: updatedPlayer,
      correct, alreadyAnswered: false, rewardCoins: Math.round(reward.coins * coinMultiplier), rewardXp: reward.xp,
      streakBonus: reward.streakBonus, quality, next, eventReward,
      quests: await getQuestViews(tx, uid),
      leveledUp: levelFromXp(updatedPlayer.xp).level > levelBefore,
      wordMap,
    });
  });
}

interface BuildResultInput {
  row: EventRow;
  run: ExplorationRow;
  region: RegionDef;
  payload: EventPayload;
  q: { wordId: number; mode: QuizMode; correct: string; options: string[]; prompt: string | null; isNew: boolean; answered: boolean; wasCorrect: boolean | null };
  word: WordRow;
  prev: ProgressState;
  player: PlayerRow;
  correct: boolean;
  alreadyAnswered: boolean;
  rewardCoins: number;
  rewardXp: number;
  streakBonus: number;
  quality: 0 | 1 | 2;
  next: ProgressState;
  eventReward: { coins: number; xp: number; item: string | null } | null;
  quests: QuestView[];
  leveledUp: boolean;
  wordMap: Map<number, WordRow>;
}

function buildResult(input: BuildResultInput): EventResult {
  const { row, run, payload, q, word, prev, next } = input;
  const wordMap = input.wordMap;
  const attack = ATTACK[q.mode];
  return {
    eventKey: row.eventKey,
    questionIndex: payload.questions.indexOf(q),
    correct: input.correct,
    correctAnswer: q.correct,
    word: toDetail(word),
    mode: q.mode,
    attack: { label: attack.label, damage: input.correct ? attack.damage : 0 },
    quality: input.quality,
    monsterHp: payload.monster?.hp ?? 0,
    monsterMaxHp: payload.monster?.maxHp ?? 0,
    hearts: run.hearts,
    reward: { coins: input.rewardCoins, xp: input.rewardXp },
    streakBonus: input.streakBonus,
    statusBefore: prev.status,
    statusAfter: next.status,
    proficiency: next.proficiency,
    nextReviewAt: next.nextReviewAt?.toISOString() ?? null,
    alreadyAnswered: input.alreadyAnswered,
    eventStatus: row.status as "pending" | "resolved",
    eventReward: input.eventReward,
    questProgress: input.quests,
    event: eventView(row, wordMap, input.correct ? attack.damage : 0),
    player: snapshot(input.player),
    leveledUp: input.leveledUp,
    expeditionOver: run.hearts <= 0 || run.status !== "active",
  };
}

export async function finishExploration(explorationId: number): Promise<ExpeditionSummary> {
  const uid = await currentUserId();
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(explorations).where(and(eq(explorations.id, explorationId), eq(explorations.userId, uid))).for("update");
    if (!run) throw new Error("探索不存在");
    const region = getRegion(run.regionKey);
    const completed = run.resolvedEvents >= run.totalEvents && run.status === "active";
    const bonusCoins = completed ? 25 : 8;
    const bonusXp = completed ? 20 : 5;
    const player = await lockPlayer(tx, uid);
    const levelBefore = levelFromXp(player.xp).level;

    if (!run.finishedAt) {
      await tx
        .update(explorations)
        .set({
          status: completed ? "finished" : "retreated",
          finishedAt: new Date(),
          bonusCoins,
          bonusXp,
          coinsEarned: run.coinsEarned + bonusCoins,
          xpEarned: run.xpEarned + bonusXp,
        })
        .where(and(eq(explorations.id, run.id), sql`${explorations.finishedAt} is null`));
      await tx
        .update(players)
        .set({ coins: player.coins + bonusCoins, xp: player.xp + bonusXp })
        .where(eq(players.id, player.id));
      await tx
        .insert(regionProgress)
        .values({
          userId: uid,
          regionKey: run.regionKey,
          runs: 1,
          eventsResolved: run.resolvedEvents,
          monstersDefeated: run.monstersDefeated,
          chestsFound: run.chestsFound,
          lastRunAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [regionProgress.userId, regionProgress.regionKey],
          set: {
            runs: sql`${regionProgress.runs} + 1`,
            eventsResolved: sql`${regionProgress.eventsResolved} + ${run.resolvedEvents}`,
            monstersDefeated: sql`${regionProgress.monstersDefeated} + ${run.monstersDefeated}`,
            chestsFound: sql`${regionProgress.chestsFound} + ${run.chestsFound}`,
            lastRunAt: new Date(),
          },
        });
    }

    const [finalRun] = await tx.select().from(explorations).where(eq(explorations.id, run.id));
    const [finalPlayer] = await tx.select().from(players).where(eq(players.id, player.id));
    const report = finalRun.report;
    return {
      id: finalRun.id,
      regionKey: finalRun.regionKey,
      regionName: region?.name ?? finalRun.regionKey,
      completed: finalRun.status === "finished",
      eventsResolved: finalRun.resolvedEvents,
      totalEvents: finalRun.totalEvents,
      answered: finalRun.answered,
      correct: finalRun.correct,
      accuracy: finalRun.answered ? finalRun.correct / finalRun.answered : 0,
      monstersDefeated: finalRun.monstersDefeated,
      chestsFound: finalRun.chestsFound,
      coinsEarned: finalRun.coinsEarned,
      xpEarned: finalRun.xpEarned,
      bonusCoins: finalRun.bonusCoins,
      bonusXp: finalRun.bonusXp,
      itemsFound: finalRun.itemsFound,
      report: report.slice(-20),
      wrongWords: report.filter((r) => !r.correct),
      player: snapshot(finalPlayer),
      leveledUp: levelFromXp(finalPlayer.xp).level > levelBefore,
      quests: await getQuestViews(tx, uid),
    };
  });
}

export async function abandonExploration(explorationId: number): Promise<void> {
  const uid = await currentUserId();
  const [run] = await db.select().from(explorations).where(and(eq(explorations.id, explorationId), eq(explorations.userId, uid)));
  if (!run) return;
  await finishExploration(explorationId);
}

export { ITEMS, purchases };
