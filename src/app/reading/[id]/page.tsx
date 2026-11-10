import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReaderView } from "@/components/reading/reader-view";
import { aiEnabled } from "@/server/ai";
import { getArticleView } from "@/server/reading";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "书屿 · 阅读" };

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const articleId = Number(id);
  if (!Number.isInteger(articleId) || articleId <= 0) notFound();
  const view = await getArticleView(articleId);
  if (!view) notFound();
  return <ReaderView initial={view} aiEnabled={aiEnabled()} />;
}
