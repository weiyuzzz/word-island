import type { Metadata } from "next";
import { IslandView } from "@/components/island/island-view";
import { ItemShop } from "@/components/shop/item-shop";
import { getIsland } from "@/server/island";
import { getShopState } from "@/server/quests";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "我的岛屿" };

export default async function IslandPage() {
  const [island, shop] = await Promise.all([getIsland(), getShopState()]);
  return (
    <div className="space-y-8">
      <IslandView initial={island} />
      <ItemShop initial={shop} />
    </div>
  );
}
