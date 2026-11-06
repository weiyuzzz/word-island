import type { Metadata } from "next";
import { AchievementsView } from "@/components/achievements-view";
import { listAchievements } from "@/server/tasks";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "成就" };

export default async function AchievementsPage() {
  const achievements = await listAchievements();
  return <AchievementsView achievements={achievements} />;
}
