import type { Metadata } from "next";
import { WorldMap } from "@/components/map/world-map";
import { getMapState } from "@/server/exploration";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "群岛地图" };

export default async function MapPage() {
  const state = await getMapState();
  return <WorldMap initial={state} />;
}
