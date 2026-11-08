import type { NextRequest } from "next/server";
import { db } from "@/db";
import { wordAudio } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { normalizeWord } from "@/lib/utils";
import { fetchAndStoreAudio } from "@/server/audio";

export const dynamic = "force-dynamic";

/**
 * 单词发音：优先返回数据库里预取的音频（导入时/后台补齐时存储，离线可用）；
 * 未命中时向上游（有道）拉取并回存，上游失败返回 502（客户端回退系统 TTS）。
 */
export async function GET(req: NextRequest) {
  const word = (req.nextUrl.searchParams.get("word") ?? "").trim().slice(0, 64);
  const accent = req.nextUrl.searchParams.get("accent") === "uk" ? "uk" : "us";
  const key = normalizeWord(word);
  if (!key) return new Response("missing word", { status: 400 });

  // 1) 本地缓存
  const [cached] = await db
    .select({ audio: wordAudio.audio, contentType: wordAudio.contentType })
    .from(wordAudio)
    .where(and(eq(wordAudio.wordKey, key), eq(wordAudio.accent, accent)))
    .limit(1);
  if (cached) {
    return new Response(new Uint8Array(cached.audio), {
      status: 200,
      headers: { "Content-Type": cached.contentType, "Cache-Control": "public, max-age=86400" },
    });
  }

  // 2) 回源并回存（并发请求只会有一个真正写成功，onConflictDoNothing 兜底）
  const ok = await fetchAndStoreAudio(key, accent);
  if (ok) {
    const [row] = await db
      .select({ audio: wordAudio.audio, contentType: wordAudio.contentType })
      .from(wordAudio)
      .where(and(eq(wordAudio.wordKey, key), eq(wordAudio.accent, accent)))
      .limit(1);
    if (row) {
      return new Response(new Uint8Array(row.audio), {
        status: 200,
        headers: { "Content-Type": row.contentType, "Cache-Control": "public, max-age=86400" },
      });
    }
  }

  return new Response("tts upstream unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
}
