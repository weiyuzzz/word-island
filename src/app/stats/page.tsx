import type { Metadata } from "next";
import { StatsView } from "@/components/stats-view";
import { getStats } from "@/server/dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "学习统计" };

export default async function StatsPage() {
  const data = await getStats();
  return <StatsView data={data} />;
}
