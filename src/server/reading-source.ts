import { db } from "@/db";
import { articles } from "@/db/schema";
import { buildVocabIndex, estimateLevel } from "@/lib/reading/text";
import { sql } from "drizzle-orm";

/**
 * 书屿 · 文章抓取与正文清洗
 * - conversation: The Conversation（CC BY-ND 许可，Atom 全文）
 * - guardian: The Guardian Open Platform（需 GUARDIAN_API_KEY，most-viewed 热点）
 * - bbc: BBC News RSS + 正文抓取（热点备用源）
 */

const UA = "WordIsland/1.0 (personal reading practice; contact: admin@localhost)";

async function httpGet(url: string, timeoutMs = 20000): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${url}`);
  return res.text();
}

// ---------- HTML / XML 清洗 ----------

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–",
  hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", eacute: "é", pound: "£", euro: "€",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** 从 HTML 正文提取段落（<p> 文本），并过滤分享按钮 / 许可声明等样板 */
export function htmlToParagraphs(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = stripTags(m[1]);
    if (!isBoilerplate(text)) out.push(text);
  }
  return out;
}

const BOILERPLATE_RE =
  /^(republish|creative commons|creative commons license|share|read more|subscribe|donate|click here|photo:|image:|get the news|follow us|all rights reserved|this article is republished)/i;

function isBoilerplate(text: string): boolean {
  if (!text || text.length < 3) return true;
  if (BOILERPLATE_RE.test(text)) return true;
  // 纯链接/作者署名行
  if (/^[A-Z][a-z]+( [A-Z][a-z]+)*,? (University|College|Institute|School)\b.*$/.test(text) && text.length < 120) return true;
  return false;
}

// ---------- The Conversation ----------

const CONVERSATION_SECTIONS = ["technology", "environment", "education", "health", "business"] as const;

interface RawArticle {
  source: string;
  title: string;
  author: string;
  url: string;
  topic: string;
  paragraphs: string[];
  publishedAt: Date | null;
  isNews: boolean;
}

function pickAtomField(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? stripTags(m[1]) : "";
}

export async function fetchConversation(limitPerSection = 3): Promise<RawArticle[]> {
  const out: RawArticle[] = [];
  for (const section of CONVERSATION_SECTIONS) {
    try {
      const xml = await httpGet(`https://theconversation.com/us/${section}/articles.atom`);
      const entries = xml.split(/<entry[\s>]/i).slice(1);
      let taken = 0;
      for (const entry of entries) {
        if (taken >= limitPerSection) break;
        const title = pickAtomField(entry, "title");
        const linkM = entry.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i) ?? entry.match(/<link[^>]*href="([^"]+)"/i);
        const url = linkM?.[1]?.trim();
        const contentM = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/i);
        if (!title || !url || !contentM) continue;
        const paragraphs = htmlToParagraphs(decodeEntities(contentM[1]));
        const wordCount = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
        if (wordCount < 450 || wordCount > 1300) continue;
        const published = pickAtomField(entry, "published");
        out.push({
          source: "conversation",
          title,
          author: pickAtomField(entry, "name"),
          url,
          topic: section === "technology" ? "science" : section,
          paragraphs,
          publishedAt: published ? new Date(published) : null,
          isNews: false,
        });
        taken++;
      }
    } catch (e) {
      console.error(`[ingest] conversation/${section} 抓取失败`, e);
    }
  }
  return out;
}

// ---------- The Guardian（热点） ----------

export async function fetchGuardian(limit = 4): Promise<RawArticle[]> {
  const key = process.env.GUARDIAN_API_KEY;
  if (!key) throw new Error("未配置 GUARDIAN_API_KEY，无法抓取 Guardian 热点");
  const listRaw = await httpGet(`https://content.guardianapis.com/most-viewed?api-key=${key}`);
  const ids: string[] = JSON.parse(listRaw)?.response?.results?.map((r: { id: string }) => r.id) ?? [];
  const out: RawArticle[] = [];
  for (const id of ids.slice(0, limit)) {
    try {
      const raw = await httpGet(
        `https://content.guardianapis.com/${id}?api-key=${key}&show-fields=bodyText,byline,firstPublicationDate,sectionName`,
      );
      const content = JSON.parse(raw)?.response?.content;
      const body: string | undefined = content?.fields?.bodyText;
      if (!body) continue;
      const paragraphs = body.split(/\n+/).map((s: string) => s.trim()).filter(Boolean);
      const wordCount = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
      if (wordCount < 350 || wordCount > 1500) continue;
      out.push({
        source: "guardian",
        title: content.webTitle ?? id,
        author: content.fields?.byline ?? "",
        url: content.webUrl ?? "",
        topic: (content.sectionName ?? "news").toLowerCase().replace(/\s+/g, "-"),
        paragraphs,
        publishedAt: content.fields?.firstPublicationDate ? new Date(content.fields.firstPublicationDate) : null,
        isNews: true,
      });
    } catch (e) {
      console.error(`[ingest] guardian ${id} 抓取失败`, e);
    }
  }
  return out;
}

// ---------- BBC（热点备用，无 key） ----------

const BBC_FEEDS = ["http://feeds.bbci.co.uk/news/world/rss.xml", "http://feeds.bbci.co.uk/news/science_and_environment/rss.xml"];

export async function fetchBbc(limit = 3): Promise<RawArticle[]> {
  const out: RawArticle[] = [];
  for (const feed of BBC_FEEDS) {
    try {
      const xml = await httpGet(feed);
      const items = xml.split(/<item[\s>]/i).slice(1);
      let taken = 0;
      for (const item of items) {
        if (taken >= limit) break;
        const title = pickAtomField(item, "title");
        const linkM = item.match(/<link>([^<]+)<\/link>/i);
        const url = linkM?.[1]?.trim();
        if (!title || !url || !/bbc\.(com|co\.uk)\/news/.test(url)) continue;
        try {
          const html = await httpGet(url);
          const paragraphs = [...html.matchAll(/<p[^>]*data-component="text-block"[^>]*>([\s\S]*?)<\/p>/gi)]
            .map((m) => stripTags(m[1]))
            .filter((t) => !isBoilerplate(t));
          const wordCount = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
          if (wordCount < 300 || wordCount > 1200) continue;
          const pubDate = pickAtomField(item, "pubDate");
          out.push({
            source: "bbc",
            title,
            author: "",
            url,
            topic: feed.includes("science") ? "science" : "world",
            paragraphs,
            publishedAt: pubDate ? new Date(pubDate) : null,
            isNews: true,
          });
          taken++;
        } catch (e) {
          console.error(`[ingest] bbc ${url} 正文抓取失败`, e);
        }
      }
    } catch (e) {
      console.error(`[ingest] bbc ${feed} 抓取失败`, e);
    }
  }
  return out;
}

// ---------- 入库 ----------

export interface IngestResult {
  fetched: number;
  inserted: number;
  errors: string[];
}

/** 文章入库（按 url 去重），返回新增数量 */
export async function storeArticles(items: RawArticle[]): Promise<IngestResult> {
  let inserted = 0;
  const errors: string[] = [];
  for (const item of items) {
    try {
      const wordCount = item.paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
      if (item.paragraphs.length === 0 || wordCount < 250) {
        errors.push(`正文过短，跳过：${item.title}`);
        continue;
      }
      const rows = await db
        .insert(articles)
        .values({
          source: item.source,
          title: item.title.slice(0, 300),
          author: item.author.slice(0, 200),
          url: item.url || null,
          topic: item.topic.slice(0, 40),
          paragraphs: item.paragraphs,
          wordCount,
          level: estimateLevel(item.paragraphs),
          vocabIndex: buildVocabIndex(item.paragraphs),
          expiresAt: item.isNews ? new Date(Date.now() + 30 * 24 * 3600 * 1000) : null,
          publishedAt: item.publishedAt,
        })
        .onConflictDoNothing({ target: articles.url })
        .returning({ id: articles.id });
      inserted += rows.length;
    } catch (e) {
      console.error("[ingest] 入库失败", item.title, e);
      errors.push(`入库失败：${item.title}`);
    }
  }
  return { fetched: items.length, inserted, errors };
}

export async function ingestSource(source: "conversation" | "guardian" | "bbc"): Promise<IngestResult> {
  if (source === "conversation") return storeArticles(await fetchConversation());
  if (source === "guardian") return storeArticles(await fetchGuardian());
  return storeArticles(await fetchBbc());
}

/** 热点抓取：Guardian 优先，失败或无 key 时回退 BBC；两者都空则返回 null 提示 */
export async function ingestNews(): Promise<IngestResult & { fallback: string | null }> {
  const errors: string[] = [];
  if (process.env.GUARDIAN_API_KEY) {
    try {
      const r = await storeArticles(await fetchGuardian());
      if (r.inserted > 0) return { ...r, fallback: null };
      errors.push(...r.errors);
    } catch (e) {
      errors.push(String(e));
    }
  }
  try {
    const r = await storeArticles(await fetchBbc());
    return { ...r, errors: [...errors, ...r.errors], fallback: process.env.GUARDIAN_API_KEY ? "guardian" : "bbc" };
  } catch (e) {
    return { fetched: 0, inserted: 0, errors: [...errors, String(e)], fallback: null };
  }
}

// ---------- 手动导入 ----------

export interface ManualArticleInput {
  title: string;
  author?: string;
  url?: string;
  topic?: string;
  text: string;
}

/** 手动导入：按空行分段 */
export async function importManualArticle(input: ManualArticleInput): Promise<{ id: number }> {
  const paragraphs = input.text
    .split(/\n\s*\n/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
  if (paragraphs.length === 0) throw new Error("正文为空，请粘贴文章内容（段落之间用空行分隔）");
  const wordCount = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  if (wordCount < 150) throw new Error("正文太短（至少 150 词）");
  const [row] = await db
    .insert(articles)
    .values({
      source: "manual",
      title: input.title.trim(),
      author: input.author?.trim() ?? "",
      url: input.url?.trim() || null,
      topic: input.topic?.trim() || "general",
      paragraphs,
      wordCount,
      level: estimateLevel(paragraphs),
      vocabIndex: buildVocabIndex(paragraphs),
    })
    .returning({ id: articles.id });
  return { id: row.id };
}

/** 文章池统计（后台展示用） */
export async function articlePoolStats() {
  const rows = await db
    .select({ source: articles.source, count: sql<number>`count(*)::int` })
    .from(articles)
    .groupBy(articles.source);
  return rows;
}
