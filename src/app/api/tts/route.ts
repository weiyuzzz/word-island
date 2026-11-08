import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 单词发音代理：服务端转发有道词典的高品质发音，客户端同源播放。
 * 免费无需 key；浏览器可按 Cache-Control 缓存同一单词的音频。
 */
export async function GET(req: NextRequest) {
  const word = (req.nextUrl.searchParams.get("word") ?? "").trim().slice(0, 64);
  const accent = req.nextUrl.searchParams.get("accent") === "uk" ? 2 : 1;
  if (!word) return new Response("missing word", { status: 400 });

  try {
    const upstream = await fetch(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${accent}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok || !upstream.body) {
      return new Response("tts upstream unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("tts upstream error", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
