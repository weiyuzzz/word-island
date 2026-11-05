import type { Metadata } from "next";
import { GardenView } from "@/components/garden/garden-view";
import { getGarden } from "@/server/garden";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "词汇花园" };

export default async function GardenPage() {
  const initial = await getGarden("all");
  return <GardenView initial={initial} />;
}
