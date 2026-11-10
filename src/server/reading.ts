import { db } from "@/db";
import { articleDeliveries, articleHighlights, articleNotes, articles, decks, players, words, wordProgress } from "@/db/schema";
import { and, desc, eq, gte, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { levelFromXp } from "@/lib/game/economy";
import { BUILTIN_DECKS } from "@/data/vocabulary";
import { lemmatize, noteKeyFor, type NoteType } from "@/lib/reading/text";
import { dateKey, normalizeWord, shiftDateKey, shuffle } from "@/lib/utils";
import { prefetchAudioInBackground } from "./audio";
import { analyzeSentence } from "./ai";
import { bumpDaily, ensureSeeded, lockPlayer, snapshot } from "./player";
import { currentUserId } from "./session";

/**
 * 书屿 · 每日推送引擎与阅读数据层
 * 三槽位：deep 精读（关联学习词）/ broad 泛读（难度匹配）/ news 热读（今日热点）
 */

export type ReadingSlot = "deep" | "broad" | "news";
const SLOTS: ReadingSlot[] = ["deep", "broad", "news"];

export const SLOT_LABEL: Record<ReadingSlot, string> = {
  deep: "精读 · 学以致用",
  broad: "泛读 · 拓展视野",
  news: "热读 · 今日热点",
};

export const TOPIC_LABEL: Record<string, string> = {
  general: "综合",
  science: "科学",
  "science-and-technology": "科技",
  environment: "环境",
  education: "教育",
  health: "健康",
  business: "商业",
  world: "国际",
  news: "新闻",
  opinion: "观点",
  culture: "文化",
  technology: "科技",
  politics: "政治",
  society: "社会",
  lifestyle: "生活",
  money: "财经",
  "uk-news": "英国",
};

export function topicLabel(topic: string): string {
  return TOPIC_LABEL[topic] ?? topic;
}

export const SOURCE_LABEL: Record<string, string> = {
  conversation: "The Conversation",
  guardian: "The Guardian",
  bbc: "BBC News",
  manual: "手动导入",
};

export const READING_REWARD = { coins: 150, xp: 50 } as const;

// ---------- 推送 ----------

export interface ArticleBrief {
  id: number;
  title: string;
  author: string;
  source: string;
  topic: string;
  wordCount: number;
  level: number;
}

export interface DeliveryView {
  id: number;
  slot: ReadingSlot;
  reason: string;
  status: string;
  progressParagraph: number;
  readSeconds: number;
  article: ArticleBrief;
}

function toBrief(a: typeof articles.$inferSelect): ArticleBrief {
  return { id: a.id, title: a.title, author: a.author, source: a.source, topic: a.topic, wordCount: a.wordCount, level: a.level };
}

/** 近 N 天已推送过的文章（避免重复阅读） */
async function recentDeliveredIds(uid: number, today: string, days: number): Promise<number[]> {
  const since = shiftDateKey(today, -days);
  const rows = await db
    .select({ articleId: articleDeliveries.articleId })
    .from(articleDeliveries)
    .where(and(eq(articleDeliveries.userId, uid), gte(articleDeliveries.deliverDate, since)));
  return [...new Set(rows.map((r) => r.articleId))];
}

/** 用户阅读水平（1-5）：取最近完成的 5 篇非新闻文章的平均难度，默认 3 */
async function userReadingLevel(uid: number): Promise<number> {
  const rows = await db
    .select({ level: articles.level })
    .from(articleDeliveries)
    .innerJoin(articles, eq(articles.id, articleDeliveries.articleId))
    .where(and(eq(articleDeliveries.userId, uid), eq(articleDeliveries.status, "finished"), sql`${articleDeliveries.slot} <> 'news'`))
    .orderBy(desc(articleDeliveries.finishedAt))
    .limit(5);
  if (rows.length === 0) return 3;
  return Math.round(rows.reduce((n, r) => n + r.level, 0) / rows.length);
}

interface CandidateRow {
  id: number;
  title: string;
  author: string;
  source: string;
  topic: string;
  wordCount: number;
  level: number;
  vocabIndex: Record<string, number>;
}

async function loadCandidates(excludeIds: number[], onlyNews: boolean): Promise<CandidateRow[]> {
  const notExpired = or(isNull(articles.expiresAt), sql`${articles.expiresAt} > now()`);
  const conds = [notExpired!];
  if (onlyNews) conds.push(inArray(articles.source, ["guardian", "bbc"]));
  if (excludeIds.length > 0) conds.push(notInArray(articles.id, excludeIds));
  return db
    .select({
      id: articles.id,
      title: articles.title,
      author: articles.author,
      source: articles.source,
      topic: articles.topic,
      wordCount: articles.wordCount,
      level: articles.level,
      vocabIndex: articles.vocabIndex,
    })
    .from(articles)
    .where(and(...conds));
}

async function insertDelivery(uid: number, article: CandidateRow, slot: ReadingSlot, today: string, reason: string): Promise<DeliveryView> {
  const [row] = await db
    .insert(articleDeliveries)
    .values({ userId: uid, articleId: article.id, slot, deliverDate: today, reason })
    .onConflictDoUpdate({
      target: [articleDeliveries.userId, articleDeliveries.slot, articleDeliveries.deliverDate],
      set: { articleId: article.id, reason },
    })
    .returning();
  return { id: row.id, slot, reason: row.reason, status: row.status, progressParagraph: 0, readSeconds: 0, article: article as unknown as ArticleBrief };
}

/** 精读：与学习词的覆盖度打分 */
async function generateDeep(uid: number, today: string, extraExclude: number[] = []): Promise<DeliveryView | null> {
  const excludeIds = [...new Set([...(await recentDeliveredIds(uid, today, 14)), ...extraExclude])];
  const candidates = await loadCandidates(excludeIds, false);
  if (candidates.length === 0) return null;

  const learning = await db
    .select({ key: words.wordKey, first: wordProgress.firstLearnedAt })
    .from(words)
    .innerJoin(wordProgress, eq(wordProgress.wordId, words.id))
    .where(and(eq(words.userId, uid), inArray(wordProgress.status, ["learning", "review"])));
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;

  // 遗忘笔记的主题 → 优先在相关主题的文章里复现
  const forgottenTopics = new Set(
    (
      await db
        .select({ topic: articles.topic })
        .from(articleNotes)
        .innerJoin(articles, eq(articles.id, articleNotes.articleId))
        .where(and(eq(articleNotes.userId, uid), eq(articleNotes.familiarity, "forgotten")))
    ).map((r) => r.topic),
  );

  let best: CandidateRow | null = null;
  let bestScore = 0;
  let bestMatched = 0;
  for (const c of candidates) {
    let matched = 0;
    let recent = 0;
    for (const w of learning) {
      if (c.vocabIndex[w.key] || c.vocabIndex[lemmatize(w.key)]) {
        matched++;
        if (w.first && w.first.getTime() > sevenDaysAgo) recent++;
      }
    }
    if (matched === 0) continue;
    const score = matched * 3 + recent * 5 + (forgottenTopics.has(c.topic) ? 4 : 0) - Math.abs(c.level - 3);
    if (!best || score > bestScore) {
      best = c;
      bestScore = score;
      bestMatched = matched;
    }
  }
  if (!best) {
    // 没有命中学习词的文章：挑一篇难度适中的作为精读
    const pool = shuffle(candidates.filter((c) => c.level >= 2 && c.level <= 4));
    if (pool.length === 0) return null;
    return insertDelivery(uid, pool[0], "deep", today, "文章池暂无高重合度文章，先读一篇难度适中的");
  }
  return insertDelivery(uid, best, "deep", today, `命中你正在学的 ${bestMatched} 个词`);
}

/** 泛读：难度匹配 + 主题去重 */
async function generateBroad(uid: number, today: string, extraExclude: number[] = []): Promise<DeliveryView | null> {
  const excludeIds = [...new Set([...(await recentDeliveredIds(uid, today, 14)), ...extraExclude])];
  const candidates = (await loadCandidates(excludeIds, false)).filter((c) => c.source !== "guardian" && c.source !== "bbc");
  if (candidates.length === 0) return null;
  const target = await userReadingLevel(uid);
  const levelBand = candidates.filter((c) => Math.abs(c.level - target) <= 1);
  const pool = levelBand.length > 0 ? levelBand : candidates;

  // 最近 3 天读过的主题靠后
  const recentTopics = new Set(
    (
      await db
        .select({ topic: articles.topic })
        .from(articleDeliveries)
        .innerJoin(articles, eq(articles.id, articleDeliveries.articleId))
        .where(and(eq(articleDeliveries.userId, uid), gte(articleDeliveries.deliverDate, shiftDateKey(today, -3))))
    ).map((r) => r.topic),
  );
  const fresh = pool.filter((c) => !recentTopics.has(c.topic));
  const finalPool = fresh.length > 0 ? fresh : pool;
  const pick = shuffle(finalPool)[0];
  return insertDelivery(uid, pick, "broad", today, `难度匹配 · ${topicLabel(pick.topic)}`);
}

/** 热读：今日新闻（Guardian/BBC），30 天保质期；无新闻时降级为最新文章 */
async function generateNews(uid: number, today: string, extraExclude: number[] = []): Promise<DeliveryView | null> {
  const excludeIds = [...new Set([...(await recentDeliveredIds(uid, today, 5)), ...extraExclude])];
  let candidates = await loadCandidates(excludeIds, true);
  let degraded = false;
  if (candidates.length === 0) {
    degraded = true;
    candidates = (await loadCandidates(excludeIds, false))
      .filter((c) => c.source === "conversation")
      .sort((a, b) => b.id - a.id);
    if (candidates.length === 0) return null;
  }
  candidates.sort((a, b) => b.id - a.id);
  return insertDelivery(uid, candidates[0], "news", today, degraded ? "热点源暂缺，为你挑了最新文章" : "今日热点新闻");
}

async function ensureSlot(uid: number, slot: ReadingSlot, today: string, extraExclude: number[] = []): Promise<DeliveryView | null> {
  const [existing] = await db
    .select({ d: articleDeliveries, a: articles })
    .from(articleDeliveries)
    .innerJoin(articles, eq(articles.id, articleDeliveries.articleId))
    .where(and(eq(articleDeliveries.userId, uid), eq(articleDeliveries.slot, slot), eq(articleDeliveries.deliverDate, today)));
  if (existing) {
    return {
      id: existing.d.id,
      slot,
      reason: existing.d.reason,
      status: existing.d.status,
      progressParagraph: existing.d.progressParagraph,
      readSeconds: existing.d.readSeconds,
      article: toBrief(existing.a),
    };
  }
  try {
    if (slot === "deep") return await generateDeep(uid, today, extraExclude);
    if (slot === "broad") return await generateBroad(uid, today, extraExclude);
    return await generateNews(uid, today, extraExclude);
  } catch (e) {
    console.error(`[reading] 生成 ${slot} 推送失败`, e);
    return null;
  }
}

export interface ReadingToday {
  today: DeliveryView[];
  history: (DeliveryView & { deliverDate: string })[];
}

export async function getReadingToday(): Promise<ReadingToday> {
  await ensureSeeded();
  const uid = await currentUserId();
  const today = dateKey();
  const todayViews: DeliveryView[] = [];
  for (const slot of SLOTS) {
    const view = await ensureSlot(uid, slot, today);
    todayViews.push(view ?? emptySlot(slot));
  }
  const historyRows = await db
    .select({ d: articleDeliveries, a: articles })
    .from(articleDeliveries)
    .innerJoin(articles, eq(articles.id, articleDeliveries.articleId))
    .where(and(eq(articleDeliveries.userId, uid), sql`${articleDeliveries.deliverDate} < ${today}`))
    .orderBy(desc(articleDeliveries.id))
    .limit(20);
  return {
    today: todayViews,
    history: historyRows.map(({ d, a }) => ({
      id: d.id,
      slot: d.slot as ReadingSlot,
      reason: d.reason,
      status: d.status,
      progressParagraph: d.progressParagraph,
      readSeconds: d.readSeconds,
      deliverDate: d.deliverDate,
      article: toBrief(a),
    })),
  };
}

function emptySlot(slot: ReadingSlot): DeliveryView {
  return { id: 0, slot, reason: "", status: "empty", progressParagraph: 0, readSeconds: 0, article: { id: 0, title: "", author: "", source: "", topic: "", wordCount: 0, level: 0 } };
}

/** 换一篇：丢弃当前投递（未完成的），重新生成 */
export async function replaceDelivery(slot: ReadingSlot): Promise<DeliveryView> {
  const uid = await currentUserId();
  const today = dateKey();
  const [existing] = await db
    .select()
    .from(articleDeliveries)
    .where(and(eq(articleDeliveries.userId, uid), eq(articleDeliveries.slot, slot), eq(articleDeliveries.deliverDate, today)));
  if (existing?.status === "finished") throw new Error("已读完的文章不需要换");
  if (existing) await db.delete(articleDeliveries).where(eq(articleDeliveries.id, existing.id));
  // 把刚换掉的文章临时排除，避免又抽到同一篇
  const view = await ensureSlot(uid, slot, today, existing ? [existing.articleId] : []);
  if (!view) throw new Error("文章池没有更多合适的文章了，请先在后台抓取或导入");
  return view;
}

// ---------- 阅读器 ----------

export interface ArticleView {
  article: {
    id: number;
    title: string;
    author: string;
    source: string;
    topic: string;
    paragraphs: string[];
    wordCount: number;
    level: number;
    url: string | null;
  };
  deliveryId: number | null;
  deliveryStatus: string;
  progressParagraph: number;
  highlights: { id: number; paragraphIndex: number; startOffset: number; endOffset: number; text: string; color: string }[];
  notes: {
    id: number;
    paragraphIndex: number;
    startOffset: number;
    endOffset: number;
    quote: string;
    noteType: NoteType;
    content: string;
    tags: string[];
    familiarity: string;
    aiAnalysis: string | null;
  }[];
  /** 用户已学词表：wordKey → status（阅读时给已学词着色） */
  known: Record<string, string>;
}

export async function getArticleView(articleId: number): Promise<ArticleView | null> {
  const uid = await currentUserId();
  const [article] = await db.select().from(articles).where(eq(articles.id, articleId));
  if (!article) return null;
  const [hl, notes, deliveries, knownRows] = await Promise.all([
    db
      .select()
      .from(articleHighlights)
      .where(and(eq(articleHighlights.userId, uid), eq(articleHighlights.articleId, articleId)))
      .orderBy(articleHighlights.id),
    db
      .select()
      .from(articleNotes)
      .where(and(eq(articleNotes.userId, uid), eq(articleNotes.articleId, articleId)))
      .orderBy(articleNotes.id),
    db
      .select()
      .from(articleDeliveries)
      .where(and(eq(articleDeliveries.userId, uid), eq(articleDeliveries.articleId, articleId)))
      .orderBy(desc(articleDeliveries.id))
      .limit(1),
    db
      .select({ key: words.wordKey, status: wordProgress.status })
      .from(words)
      .innerJoin(wordProgress, eq(wordProgress.wordId, words.id))
      .where(and(eq(words.userId, uid), sql`${wordProgress.status} <> 'new'`)),
  ]);
  const known: Record<string, string> = {};
  for (const r of knownRows) known[r.key] = r.status;
  const delivery = deliveries[0];
  return {
    article: {
      id: article.id,
      title: article.title,
      author: article.author,
      source: article.source,
      topic: article.topic,
      paragraphs: article.paragraphs,
      wordCount: article.wordCount,
      level: article.level,
      url: article.url,
    },
    deliveryId: delivery?.id ?? null,
    deliveryStatus: delivery?.status ?? "unread",
    progressParagraph: delivery?.progressParagraph ?? 0,
    highlights: hl.map((h) => ({ id: h.id, paragraphIndex: h.paragraphIndex, startOffset: h.startOffset, endOffset: h.endOffset, text: h.text, color: h.color })),
    notes: notes.map((n) => ({
      id: n.id,
      paragraphIndex: n.paragraphIndex,
      startOffset: n.startOffset,
      endOffset: n.endOffset,
      quote: n.quote,
      noteType: n.noteType as NoteType,
      content: n.content,
      tags: n.tags,
      familiarity: n.familiarity,
      aiAnalysis: n.aiAnalysis,
    })),
    known,
  };
}

/** 记录阅读进度（前端每 ~10s 调一次） */
export async function saveProgress(deliveryId: number, paragraphIndex: number, addSeconds: number): Promise<void> {
  const uid = await currentUserId();
  await db
    .update(articleDeliveries)
    .set({
      status: sql`case when ${articleDeliveries.status} = 'unread' then 'reading' else ${articleDeliveries.status} end`,
      progressParagraph: sql`greatest(${articleDeliveries.progressParagraph}, ${Math.max(0, Math.round(paragraphIndex))})`,
      readSeconds: sql`least(${articleDeliveries.readSeconds} + ${Math.max(0, Math.min(30, Math.round(addSeconds)))}, 43200)`,
    })
    .where(and(eq(articleDeliveries.id, deliveryId), eq(articleDeliveries.userId, uid)));
}

export interface FinishResult {
  coins: number;
  xp: number;
  leveledUp: boolean;
  level: number;
}

export async function finishArticle(deliveryId: number): Promise<FinishResult> {
  const uid = await currentUserId();
  const today = dateKey();
  return db.transaction(async (tx) => {
    const player = await lockPlayer(tx, uid);
    const [row] = await tx
      .select({ d: articleDeliveries, wordCount: articles.wordCount })
      .from(articleDeliveries)
      .innerJoin(articles, eq(articles.id, articleDeliveries.articleId))
      .where(and(eq(articleDeliveries.id, deliveryId), eq(articleDeliveries.userId, uid)));
    if (!row) throw new Error("阅读记录不存在");
    if (row.d.status === "finished") throw new Error("这篇文章已经完成了");
    // 防刷：阅读时长至少 = 词数 × 0.15s（约 400 词/分钟），且不少于 30 秒
    const minSeconds = Math.max(30, Math.round(row.wordCount * 0.15));
    if (row.d.readSeconds < minSeconds) throw new Error("阅读时长有点短，再读一会儿吧（正在读才可以完成）");
    const [updated] = await tx
      .update(articleDeliveries)
      .set({ status: "finished", finishedAt: new Date(), readSeconds: row.d.readSeconds })
      .where(eq(articleDeliveries.id, deliveryId))
      .returning();
    await tx
      .update(players)
      .set({ coins: player.coins + READING_REWARD.coins, xp: player.xp + READING_REWARD.xp })
      .where(eq(players.id, player.id));
    await bumpDaily(tx, uid, today, {
      coinsEarned: READING_REWARD.coins,
      xpEarned: READING_REWARD.xp,
      articlesRead: 1,
      readingSeconds: updated.readSeconds,
    });
    return {
      coins: READING_REWARD.coins,
      xp: READING_REWARD.xp,
      leveledUp: levelFromXp(player.xp + READING_REWARD.xp).level > levelFromXp(player.xp).level,
      level: levelFromXp(player.xp + READING_REWARD.xp).level,
    };
  });
}

// ---------- 高亮 ----------

export async function saveHighlight(input: {
  articleId: number;
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
  color: string;
}): Promise<{ id: number }> {
  const uid = await currentUserId();
  const [article] = await db.select({ paragraphs: articles.paragraphs }).from(articles).where(eq(articles.id, input.articleId));
  if (!article) throw new Error("文章不存在");
  const text = article.paragraphs[input.paragraphIndex]?.slice(input.startOffset, input.endOffset);
  if (!text || text.trim().length === 0 || text.length > 400) throw new Error("选区无效");
  const [existing] = await db
    .select()
    .from(articleHighlights)
    .where(
      and(
        eq(articleHighlights.userId, uid),
        eq(articleHighlights.articleId, input.articleId),
        eq(articleHighlights.paragraphIndex, input.paragraphIndex),
        eq(articleHighlights.startOffset, input.startOffset),
        eq(articleHighlights.endOffset, input.endOffset),
      ),
    );
  if (existing) {
    const [updated] = await db
      .update(articleHighlights)
      .set({ color: input.color })
      .where(eq(articleHighlights.id, existing.id))
      .returning({ id: articleHighlights.id });
    return { id: updated.id };
  }
  const [row] = await db
    .insert(articleHighlights)
    .values({ userId: uid, articleId: input.articleId, paragraphIndex: input.paragraphIndex, startOffset: input.startOffset, endOffset: input.endOffset, text, color: input.color })
    .returning({ id: articleHighlights.id });
  return { id: row.id };
}

export async function removeHighlight(id: number): Promise<void> {
  const uid = await currentUserId();
  await db.delete(articleHighlights).where(and(eq(articleHighlights.id, id), eq(articleHighlights.userId, uid)));
}

// ---------- 笔记 ----------

export async function saveNote(input: {
  articleId: number;
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
  quote: string;
  noteType: NoteType;
  content: string;
  tags: string[];
  aiAnalysis?: string | null;
}): Promise<{ id: number }> {
  const uid = await currentUserId();
  const [article] = await db.select({ paragraphs: articles.paragraphs }).from(articles).where(eq(articles.id, input.articleId));
  if (!article) throw new Error("文章不存在");
  const paragraph = article.paragraphs[input.paragraphIndex] ?? "";
  const storedQuote = input.quote.trim();
  if (!storedQuote || storedQuote.length > 600) throw new Error("摘录无效");
  if (paragraph && !paragraph.includes(storedQuote.slice(0, 40)) && input.startOffset > 0) {
    // 选区必须真的来自文章（允许纯手输摘录：无选区时 startOffset=0）
    throw new Error("摘录与文章内容不一致");
  }
  const [row] = await db
    .insert(articleNotes)
    .values({
      userId: uid,
      articleId: input.articleId,
      paragraphIndex: input.paragraphIndex,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      quote: storedQuote,
      noteKey: noteKeyFor(storedQuote),
      noteType: input.noteType,
      content: input.content.trim().slice(0, 2000),
      tags: input.tags.slice(0, 6).map((t) => t.trim().slice(0, 24)).filter(Boolean),
      aiAnalysis: input.aiAnalysis?.slice(0, 4000) ?? null,
    })
    .returning({ id: articleNotes.id });
  return { id: row.id };
}

export async function setNoteFamiliarity(ids: number[], familiarity: string): Promise<void> {
  const uid = await currentUserId();
  if (!["unmarked", "familiar", "ok", "forgotten"].includes(familiarity)) throw new Error("无效的熟悉度");
  if (ids.length === 0) return;
  await db
    .update(articleNotes)
    .set({ familiarity, markedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(articleNotes.userId, uid), inArray(articleNotes.id, ids)));
}

export async function deleteNote(id: number): Promise<void> {
  const uid = await currentUserId();
  await db.delete(articleNotes).where(and(eq(articleNotes.id, id), eq(articleNotes.userId, uid)));
}

// ---------- 拾贝知识库 ----------

export interface NoteGroupView {
  key: string;
  noteType: NoteType;
  ids: number[];
  occurrences: { quote: string; articleId: number; articleTitle: string; paragraphIndex: number; createdAt: string }[];
  content: string;
  tags: string[];
  familiarity: string;
  aiAnalysis: string | null;
  latestAt: string;
}

export interface NotesLibrary {
  groups: NoteGroupView[];
  stats: { total: number; byType: Record<string, number>; byFamiliarity: Record<string, number> };
}

/** 复现归并：noteKey 相同的笔记合并为一组；熟悉度取组内「最不利」状态 */
export async function getNotesLibrary(): Promise<NotesLibrary> {
  const uid = await currentUserId();
  const rows = await db
    .select({ n: articleNotes, articleTitle: articles.title })
    .from(articleNotes)
    .innerJoin(articles, eq(articles.id, articleNotes.articleId))
    .where(eq(articleNotes.userId, uid))
    .orderBy(desc(articleNotes.id));
  const FAMILIARITY_ORDER = ["forgotten", "unmarked", "ok", "familiar"];
  const map = new Map<string, NoteGroupView>();
  for (const { n, articleTitle } of rows) {
    const key = `${n.noteType}:${n.noteKey}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        noteType: n.noteType as NoteType,
        ids: [],
        occurrences: [],
        content: "",
        tags: [],
        familiarity: "unmarked",
        aiAnalysis: null,
        latestAt: n.createdAt.toISOString(),
      };
      map.set(key, group);
    }
    group.ids.push(n.id);
    group.occurrences.push({ quote: n.quote, articleId: n.articleId, articleTitle, paragraphIndex: n.paragraphIndex, createdAt: n.createdAt.toISOString() });
    if (!group.content && n.content) group.content = n.content;
    if (!group.aiAnalysis && n.aiAnalysis) group.aiAnalysis = n.aiAnalysis;
    for (const t of n.tags) if (!group.tags.includes(t)) group.tags.push(t);
    if (n.createdAt.toISOString() > group.latestAt) group.latestAt = n.createdAt.toISOString();
  }
  const groups = [...map.values()];
  for (const g of groups) {
    const fams = rows.filter(({ n }) => g.ids.includes(n.id)).map(({ n }) => n.familiarity);
    g.familiarity = FAMILIARITY_ORDER.find((f) => fams.includes(f)) ?? "unmarked";
  }
  // 排序：遗忘 > 未标记 > 一般 > 熟悉；同组内复现次数多在前、新在前
  const famRank: Record<string, number> = { forgotten: 0, unmarked: 1, ok: 2, familiar: 3 };
  groups.sort((a, b) => famRank[a.familiarity] - famRank[b.familiarity] || b.occurrences.length - a.occurrences.length || b.latestAt.localeCompare(a.latestAt));
  const stats = {
    total: groups.reduce((n, g) => n + g.occurrences.length, 0),
    byType: {} as Record<string, number>,
    byFamiliarity: {} as Record<string, number>,
  };
  for (const g of groups) {
    stats.byType[g.noteType] = (stats.byType[g.noteType] ?? 0) + g.occurrences.length;
    stats.byFamiliarity[g.familiarity] = (stats.byFamiliarity[g.familiarity] ?? 0) + g.occurrences.length;
  }
  return { groups, stats };
}

// ---------- 词典与拾词 ----------

export interface LookupResult {
  word: string;
  phonetic: string;
  pos: string;
  meaning: string;
  meaningLang: "zh" | "en";
  inVocab: boolean;
  status?: string;
}

async function lookupInUserVocab(uid: number, key: string, lemma: string) {
  const [row] = await db
    .select({ id: words.id, word: words.word, phonetic: words.phonetic, pos: words.pos, meaning: words.meaning, status: wordProgress.status })
    .from(words)
    .leftJoin(wordProgress, eq(wordProgress.wordId, words.id))
    .where(and(eq(words.userId, uid), or(eq(words.wordKey, key), eq(words.wordKey, lemma))!))
    .limit(1);
  return row;
}

function lookupInBuiltin(key: string, lemma: string) {
  for (const deck of BUILTIN_DECKS) {
    for (const r of deck.words) {
      const k = normalizeWord(r[0]);
      if (k === key || k === lemma) return { word: r[0], phonetic: r[1], pos: r[2], meaning: r[3], meaningLang: "zh" as const };
    }
  }
  return null;
}

async function lookupInDictionaryApi(word: string): Promise<{ phonetic: string; pos: string; meaning: string } | null> {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) return null;
    const entries = await res.json();
    const first = Array.isArray(entries) ? entries[0] : null;
    if (!first) return null;
    const phonetic: string = first.phonetic ?? first.phonetics?.find((p: { text?: string }) => p.text)?.text ?? "";
    const meaning0 = first.meanings?.[0];
    return {
      phonetic,
      pos: meaning0?.partOfSpeech ?? "",
      meaning: meaning0?.definitions?.[0]?.definition ?? "",
    };
  } catch {
    return null;
  }
}

/** 词卡查询：用户词库 → 内置词库 → 免费词典 API（英英） */
export async function lookupWord(word: string): Promise<LookupResult | null> {
  const uid = await currentUserId();
  const key = normalizeWord(word);
  if (!key || key.length > 48) return null;
  const lemma = lemmatize(word);
  const mine = await lookupInUserVocab(uid, key, lemma);
  if (mine) {
    return { word: mine.word, phonetic: mine.phonetic, pos: mine.pos, meaning: mine.meaning, meaningLang: "zh", inVocab: true, status: mine.status ?? "new" };
  }
  const builtin = lookupInBuiltin(key, lemma);
  if (builtin) return { ...builtin, inVocab: false };
  const dict = await lookupInDictionaryApi(key);
  if (dict) return { word: key, phonetic: dict.phonetic, pos: dict.pos, meaning: dict.meaning, meaningLang: "en", inVocab: false };
  return null;
}

/** 阅读拾词：收进专属词库「拾词」（difficulty 3，直接进 SRS 队列） */
export async function addToReadingVocab(input: {
  word: string;
  meaning: string;
  phonetic?: string;
  pos?: string;
  example?: string;
  translation?: string;
}): Promise<{ wordId: number; deckId: number }> {
  const uid = await currentUserId();
  await ensureSeeded();
  const word = input.word.trim();
  const meaning = input.meaning.trim();
  if (!word || word.length > 64) throw new Error("请输入单词");
  if (!meaning) throw new Error("请先填写释义（词卡里查不到的词需要手动补一下）");
  let [deck] = await db.select().from(decks).where(and(eq(decks.userId, uid), eq(decks.slug, "reading-picks")));
  if (!deck) {
    [deck] = await db
      .insert(decks)
      .values({ userId: uid, slug: "reading-picks", name: "拾词", description: "书屿阅读中划词收藏的生词", kind: "custom", color: "sand" })
      .returning();
  }
  const [existing] = await db
    .select({ id: words.id })
    .from(words)
    .where(and(eq(words.deckId, deck.id), eq(words.wordKey, normalizeWord(word))));
  if (existing) return { wordId: existing.id, deckId: deck.id };
  const [row] = await db
    .insert(words)
    .values({
      userId: uid,
      deckId: deck.id,
      word: word,
      wordKey: normalizeWord(word),
      phonetic: input.phonetic?.trim().slice(0, 128) ?? "",
      pos: input.pos?.trim().slice(0, 32) ?? "",
      meaning: meaning.slice(0, 256),
      example: input.example?.trim().slice(0, 512) ?? "",
      translation: input.translation?.trim().slice(0, 512) ?? "",
      difficulty: 3,
    })
    .returning({ id: words.id });
  prefetchAudioInBackground([word]);
  return { wordId: row.id, deckId: deck.id };
}

// ---------- AI 句子解析 ----------

export async function analyzeSentenceAction(quote: string): Promise<string> {
  const clean = quote.trim();
  if (!clean || clean.length > 600) throw new Error("请先选中一个句子");
  return analyzeSentence(clean);
}
