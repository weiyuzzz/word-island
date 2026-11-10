import type { Metadata } from "next";
import { ReadingTodayView } from "@/components/reading/reading-today";
import { getReadingToday } from "@/server/reading";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "书屿 · 每日阅读" };

export default async function ReadingPage() {
  const initial = await getReadingToday();
  return <ReadingTodayView initial={initial} />;
}
