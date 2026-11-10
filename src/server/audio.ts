import { db } from "@/db";
import { wordAudio, words } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { normalizeWord } from "@/lib/utils";

export type Accent = "us" | "uk";

const CONCURRENCY = 6;
const UPSTREAM_TIMEOUT_MS = 8000;

/** 查询某单词是否已有本地发音缓存 */
export async function hasAudio(wordKey: string, accent: Accent = "us"): Promise<boolean> {
  const [row] = await db.select({ wordKey: wordAudio.wordKey }).from(wordAudio).where(sql`${wordAudio.wordKey} = ${wordKey} and ${wordAudio.accent} = ${accent}`).limit(1);
  return Boolean(row);
}

/** 从有道拉取单个单词发音并写入缓存；失败返回 null */
export async function fetchAndStoreAudio(wordKey: string, accent: Accent = "us"): Promise<boolean> {
  try {
    const res = await fetch(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(wordKey)}&type=${accent === "uk" ? 2 : 1}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok || !res.body) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 512) return false; // 明显不是有效音频
    await db
      .insert(wordAudio)
      .values({ wordKey, accent, audio: buf, contentType: res.headers.get("content-type") ?? "audio/mpeg" })
      .onConflictDoNothing();
    return true;
  } catch {
    return false;
  }
}

export interface PrefetchResult {
  total: number;
  cached: number;
  fetched: number;
  failed: string[];
}

/** 批量预取发音：跳过已有缓存，并发拉取缺失的单词 */
export async function prefetchAudio(rawWords: string[], accent: Accent = "us"): Promise<PrefetchResult> {
  const keys = [...new Set(rawWords.map((w) => normalizeWord(w)).filter(Boolean))];
  const missing: string[] = [];
  for (const key of keys) {
    if (!(await hasAudio(key, accent))) missing.push(key);
  }
  const failed: string[] = [];
  let fetched = 0;
  let index = 0;
  const worker = async () => {
    while (index < missing.length) {
      const key = missing[index++];
      const ok = await fetchAndStoreAudio(key, accent);
      if (ok) fetched += 1;
      else failed.push(key);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, missing.length) }, worker));
  return { total: keys.length, cached: keys.length - missing.length, fetched, failed };
}

/** 后台预取：不阻塞调用方，失败静默（播放时 /api/tts 会按需补拉） */
export function prefetchAudioInBackground(rawWords: string[], accent: Accent = "us"): void {
  void prefetchAudio(rawWords, accent).catch(() => {});
}

/** 后台补齐：把词库中所有单词的发音缓存补齐（管理员操作用） */
export async function backfillAllAudio(accent: Accent = "us"): Promise<PrefetchResult> {
  const rows = await db.select({ word: words.word }).from(words);
  return prefetchAudio(rows.map((r) => r.word), accent);
}

export interface AudioStats {
  /** 词库中不同单词总数 */
  total: number;
  /** 其中已有本地发音缓存的单词数（美音） */
  cached: number;
}

/** 发音缓存覆盖情况：词库单词数 vs 已缓存数 */
export async function audioStats(accent: Accent = "us"): Promise<AudioStats> {
  const [row] = await db
    .select({
      total: sql<number>`count(distinct ${words.wordKey})::int`,
      cached: sql<number>`count(distinct ${words.wordKey}) filter (where exists (select 1 from ${wordAudio} a where a.word_key = ${words.wordKey} and a.accent = ${accent}))::int`,
    })
    .from(words);
  return { total: row?.total ?? 0, cached: row?.cached ?? 0 };
}
