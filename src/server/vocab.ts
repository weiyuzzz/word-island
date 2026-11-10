import { db } from "@/db";
import { articleNotes, decks, wordProgress, words } from "@/db/schema";
import { and, asc, desc, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import { BUILTIN_DECKS, rowToWord } from "@/data/vocabulary";
import { parseImport, toCsv, toJson, type ImportFormat, type WordInput } from "@/lib/vocab/parse";
import type { DeckSummary, ImportResult, WordStatus, WordView } from "@/lib/types";
import { normalizeWord } from "@/lib/utils";
import { prefetchAudioInBackground } from "./audio";
import { ensureSeeded } from "./player";
import { currentUserId } from "./session";

export async function listDecks(): Promise<DeckSummary[]> {
  await ensureSeeded();
  const uid = await currentUserId();
  const rows = await db
    .select({
      id: decks.id,
      slug: decks.slug,
      name: decks.name,
      description: decks.description,
      kind: decks.kind,
      color: decks.color,
      createdAt: decks.createdAt,
      total: sql<number>`count(${words.id})::int`,
      learned: sql<number>`count(${wordProgress.id}) filter (where ${wordProgress.status} <> 'new')::int`,
      mastered: sql<number>`count(${wordProgress.id}) filter (where ${wordProgress.status} = 'mastered')::int`,
      due: sql<number>`count(${wordProgress.id}) filter (where ${wordProgress.status} <> 'new' and ${wordProgress.nextReviewAt} <= now())::int`,
      wrong: sql<number>`count(${wordProgress.id}) filter (where ${wordProgress.wrongCount} > 0)::int`,
    })
    .from(decks)
    .leftJoin(words, eq(words.deckId, decks.id))
    .leftJoin(wordProgress, eq(wordProgress.wordId, words.id))
    .where(eq(decks.userId, uid))
    .groupBy(decks.id)
    .orderBy(asc(decks.kind), asc(decks.id));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    kind: r.kind === "builtin" ? "builtin" : "custom",
    color: r.color,
    total: r.total,
    learned: r.learned,
    mastered: r.mastered,
    due: r.due,
    wrong: r.wrong,
  }));
}

export interface WordFilter {
  deckId: number | null;
  q?: string;
  status?: WordStatus | "all";
  wrongOnly?: boolean;
  limit?: number;
  offset?: number;
}

export async function getWords(filter: WordFilter): Promise<{ items: WordView[]; total: number }> {
  await ensureSeeded();
  const uid = await currentUserId();
  const limit = Math.min(200, Math.max(1, filter.limit ?? 60));
  const offset = Math.max(0, filter.offset ?? 0);
  const conditions = [eq(words.userId, uid)];
  if (filter.deckId) conditions.push(eq(words.deckId, filter.deckId));
  if (filter.q?.trim()) {
    const pattern = `%${filter.q.trim()}%`;
    conditions.push(or(ilike(words.word, pattern), ilike(words.meaning, pattern))!);
  }
  if (filter.status && filter.status !== "all") {
    if (filter.status === "new") {
      conditions.push(or(sql`${wordProgress.id} is null`, eq(wordProgress.status, "new"))!);
    } else {
      conditions.push(eq(wordProgress.status, filter.status));
    }
  }
  if (filter.wrongOnly) conditions.push(gt(wordProgress.wrongCount, 0));
  const where = and(...conditions);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(words)
    .leftJoin(wordProgress, eq(wordProgress.wordId, words.id))
    .where(where);

  const rows = await db
    .select({ w: words, p: wordProgress })
    .from(words)
    .leftJoin(wordProgress, eq(wordProgress.wordId, words.id))
    .where(where)
    .orderBy(filter.wrongOnly ? desc(wordProgress.wrongCount) : asc(words.id))
    .limit(limit)
    .offset(offset);

  return {
    total: countRow?.count ?? 0,
    items: rows.map(({ w, p }) => ({
      id: w.id,
      deckId: w.deckId,
      word: w.word,
      phonetic: w.phonetic,
      pos: w.pos,
      meaning: w.meaning,
      example: w.example,
      translation: w.translation,
      difficulty: w.difficulty,
      status: (p?.status as WordStatus) ?? "new",
      proficiency: p?.proficiency ?? 0,
      streak: p?.streak ?? 0,
      correctCount: p?.correctCount ?? 0,
      wrongCount: p?.wrongCount ?? 0,
      nextReviewAt: p?.nextReviewAt?.toISOString() ?? null,
      lastReviewedAt: p?.lastReviewedAt?.toISOString() ?? null,
    })),
  };
}

export async function createDeck(name: string, description = ""): Promise<{ id: number; name: string }> {
  const uid = await currentUserId();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("请输入词库名称");
  if (trimmed.length > 40) throw new Error("词库名称请控制在 40 字以内");
  const [deck] = await db.insert(decks).values({ userId: uid, name: trimmed, description: description.trim(), kind: "custom", color: "leaf" }).returning();
  return { id: deck.id, name: deck.name };
}

/**
 * 删除词书（含内置词库）。
 * 联动影响：
 * - words 按 FK 级联删除 → wordProgress（学习进度/间隔计划）级联消失 → reviewLogs 级联消失
 * - studySessions 只保留 deckId 数字（无外键），deckName 文本保留，历史场次仍可读
 * - 群岛的解锁进度基于内置词库的已学词数，删除内置词书会导致对应邻岛回落锁定（重新学习后可再解锁）
 * - articleNotes.wordId 是无外键的软引用，删除词书后置空避免悬垂
 */
export async function deleteDeck(id: number): Promise<void> {
  const uid = await currentUserId();
  await db.transaction(async (tx) => {
    const [deck] = await tx.select().from(decks).where(and(eq(decks.id, id), eq(decks.userId, uid)));
    if (!deck) throw new Error("词库不存在");
    // 该词书下笔记的 wordId 软引用置空（笔记本身保留，只是断开与单词的关联）
    const wordIds = await tx.select({ id: words.id }).from(words).where(eq(words.deckId, id));
    if (wordIds.length > 0) {
      await tx
        .update(articleNotes)
        .set({ wordId: null })
        .where(and(eq(articleNotes.userId, uid), inArray(articleNotes.wordId, wordIds.map((w) => w.id))));
    }
    await tx.delete(decks).where(eq(decks.id, id));
  });
}

/** 恢复内置词书：按官方词表重新播种（学习进度从零开始） */
export async function restoreBuiltinDeck(slug: string): Promise<{ deckId: number; wordCount: number }> {
  const uid = await currentUserId();
  const def = BUILTIN_DECKS.find((d) => d.slug === slug);
  if (!def) throw new Error("没有这个内置词书");
  const [existing] = await db.select({ id: decks.id }).from(decks).where(and(eq(decks.userId, uid), eq(decks.slug, slug)));
  if (existing) throw new Error(`「${def.name}」已经存在，无需恢复`);
  const deckWords = def.words.map(rowToWord);
  const deckId = await db.transaction(async (tx) => {
    const [deck] = await tx
      .insert(decks)
      .values({ userId: uid, slug: def.slug, name: def.name, description: def.description, kind: "builtin", color: def.color })
      .returning();
    for (let i = 0; i < deckWords.length; i += 200) {
      await tx
        .insert(words)
        .values(deckWords.slice(i, i + 200).map((w) => ({ userId: uid, deckId: deck.id, wordKey: normalizeWord(w.word), ...w })))
        .onConflictDoNothing();
    }
    return deck.id;
  });
  prefetchAudioInBackground(deckWords.map((w) => w.word));
  return { deckId, wordCount: deckWords.length };
}

function validateInput(input: WordInput): WordInput {
  const word = input.word.trim();
  const meaning = input.meaning.trim();
  if (!word) throw new Error("请输入单词");
  if (!meaning) throw new Error("请输入中文释义");
  return {
    word,
    meaning,
    phonetic: input.phonetic?.trim() ?? "",
    pos: input.pos?.trim() ?? "",
    example: input.example?.trim() ?? "",
    translation: input.translation?.trim() ?? "",
    difficulty: Math.min(5, Math.max(1, Math.round(Number(input.difficulty) || 2))),
  };
}

/** 校验词库归属，返回词库行 */
async function ownedDeck(deckId: number, uid: number) {
  const [deck] = await db.select().from(decks).where(and(eq(decks.id, deckId), eq(decks.userId, uid)));
  if (!deck) throw new Error("词库不存在");
  return deck;
}

export async function addWord(deckId: number, input: WordInput): Promise<number> {
  const uid = await currentUserId();
  await ownedDeck(deckId, uid);
  const clean = validateInput(input);
  const inserted = await db
    .insert(words)
    .values({ userId: uid, ...clean, deckId, wordKey: normalizeWord(clean.word) })
    .onConflictDoNothing()
    .returning({ id: words.id });
  if (inserted.length === 0) throw new Error(`「${clean.word}」已经在这个词库中了`);
  prefetchAudioInBackground([clean.word]);
  return inserted[0].id;
}

export async function updateWord(id: number, input: WordInput): Promise<void> {
  const uid = await currentUserId();
  const [existing] = await db.select().from(words).where(and(eq(words.id, id), eq(words.userId, uid)));
  if (!existing) throw new Error("单词不存在");
  const clean = validateInput(input);
  const key = normalizeWord(clean.word);
  if (key !== existing.wordKey) {
    const [dup] = await db.select({ id: words.id }).from(words).where(and(eq(words.deckId, existing.deckId), eq(words.wordKey, key)));
    if (dup) throw new Error(`「${clean.word}」已经在这个词库中了`);
  }
  await db.update(words).set({ ...clean, wordKey: key }).where(eq(words.id, id));
}

export async function deleteWord(id: number): Promise<void> {
  const uid = await currentUserId();
  await db.delete(words).where(and(eq(words.id, id), eq(words.userId, uid)));
}

export interface ImportInput {
  deckId: number | null;
  newDeckName: string | null;
  text: string;
  format: ImportFormat;
}

/** 导入：跳过已存在的单词（保留其学习记录），分批写入 */
export async function importWords(input: ImportInput): Promise<ImportResult> {
  const uid = await currentUserId();
  const parsed = parseImport(input.text, input.format);
  if (parsed.items.length === 0 && parsed.issues.length > 0 && !input.deckId && !input.newDeckName) {
    return { deckId: 0, deckName: "", imported: 0, duplicates: 0, duplicatesInFile: parsed.duplicatesInFile, errors: parsed.issues };
  }
  return db.transaction(async (tx) => {
    let deckId = input.deckId;
    let deckName = "";
    if (!deckId) {
      const name = input.newDeckName?.trim();
      if (!name) throw new Error("请选择词库或输入新词库名称");
      const [deck] = await tx.insert(decks).values({ userId: uid, name, kind: "custom", color: "leaf" }).returning();
      deckId = deck.id;
      deckName = deck.name;
    } else {
      const [deck] = await tx.select().from(decks).where(and(eq(decks.id, deckId), eq(decks.userId, uid)));
      if (!deck) throw new Error("词库不存在");
      deckName = deck.name;
    }
    const existing = await tx.select({ key: words.wordKey }).from(words).where(eq(words.deckId, deckId));
    const existingKeys = new Set(existing.map((e) => e.key));
    let duplicates = 0;
    const toInsert = [];
    for (const item of parsed.items) {
      const key = normalizeWord(item.word);
      if (existingKeys.has(key)) {
        duplicates++;
        continue;
      }
      existingKeys.add(key);
      toInsert.push({ userId: uid, ...item, deckId, wordKey: key });
    }
    for (let i = 0; i < toInsert.length; i += 200) {
      await tx.insert(words).values(toInsert.slice(i, i + 200)).onConflictDoNothing();
    }
    // 后台预取本次导入单词的发音（不阻塞返回；漏拉的会在播放时按需补拉）
    prefetchAudioInBackground(toInsert.map((w) => w.word));
    return {
      deckId,
      deckName,
      imported: toInsert.length,
      duplicates,
      duplicatesInFile: parsed.duplicatesInFile,
      errors: parsed.issues.slice(0, 50),
    };
  });
}

export async function exportDeck(deckId: number, format: ImportFormat): Promise<{ filename: string; content: string; mime: string }> {
  const uid = await currentUserId();
  const deck = await ownedDeck(deckId, uid);
  const rows = await db.select().from(words).where(eq(words.deckId, deckId)).orderBy(asc(words.id));
  const items: WordInput[] = rows.map((r) => ({
    word: r.word,
    phonetic: r.phonetic,
    pos: r.pos,
    meaning: r.meaning,
    example: r.example,
    translation: r.translation,
    difficulty: r.difficulty,
  }));
  const safeName = deck.name.replace(/[\\/:*?"<>|]/g, "_");
  if (format === "json") {
    return { filename: `${safeName}.json`, content: toJson(items), mime: "application/json" };
  }
  return { filename: `${safeName}.csv`, content: `\uFEFF${toCsv(items)}`, mime: "text/csv" };
}

/** 生成可分享的词库内容：带名称与版本标记的 JSON，对方可在「导入」时粘贴 */
export async function shareDeck(deckId: number): Promise<{ name: string; content: string }> {
  const uid = await currentUserId();
  const deck = await ownedDeck(deckId, uid);
  const rows = await db.select().from(words).where(eq(words.deckId, deckId)).orderBy(asc(words.id));
  const items: WordInput[] = rows.map((r) => ({
    word: r.word,
    phonetic: r.phonetic,
    pos: r.pos,
    meaning: r.meaning,
    example: r.example,
    translation: r.translation,
    difficulty: r.difficulty,
  }));
  const payload = { name: deck.name, version: 1, words: items };
  return { name: deck.name, content: JSON.stringify(payload, null, 2) };
}
