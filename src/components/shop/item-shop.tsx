"use client";

import { useEffect, useState, useTransition } from "react";
import { Backpack, Check, Coffee, Gift, Lock, Ship, Shirt, ShoppingBag, Telescope, Wind, Sparkles } from "lucide-react";
import type { ShopItemView } from "@/lib/game/model";
import { KIND_LABEL, RARITY_META, type ItemDef } from "@/data/items";
import { cn } from "@/lib/utils";
import { buyItemAction, getShopStateAction } from "@/server/game-actions";
import { Button, Card, CoinIcon, EmptyState, Pill, SectionTitle, useToast } from "../ui";

const ICONS: Record<ItemDef["kind"], typeof Ship> = {
  boat: Ship,
  outfit: Shirt,
  tool: Telescope,
  consumable: Coffee,
  decor: Wind,
};

interface ShopState {
  items: ShopItemView[];
  coins: number;
  level: number;
  owned: { key: string; qty: number; name: string; description: string; effect: string; kind: string }[];
  purchases: { id: number; name: string; price: number; createdAt: string }[];
}

export function ItemShop({ initial }: { initial?: ShopState }) {
  const toast = useToast();
  const [state, setState] = useState<ShopState | null>(initial ?? null);
  const [tab, setTab] = useState<"shop" | "bag">("shop");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (initial) return;
    startTransition(async () => {
      const res = await getShopStateAction();
      if (res.ok) setState(res.data);
    });
  }, [initial]);

  const buy = (key: string) => {
    startTransition(async () => {
      const res = await buyItemAction(key);
      if (!res.ok) return toast({ kind: "error", title: res.error });
      const fresh = await getShopStateAction();
      if (fresh.ok) setState(fresh.data);
      toast({ kind: "reward", title: "购买成功", description: `花费 ${res.data.item.price} 金币，获得「${res.data.item.name}」` });
    });
  };

  if (!state) {
    return (
      <Card className="p-6 text-slate-400">
        <SectionTitle>岛屿商店 · 道具与服装</SectionTitle>
        <div className="py-8 text-center">商店加载中…</div>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <SectionTitle
        action={
          <div className="inline-flex rounded-2xl bg-white p-1 shadow-soft">
            <button type="button" onClick={() => setTab("shop")} className={cn("inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-sm font-medium", tab === "shop" ? "bg-ocean-500 text-white" : "text-slate-500")}>
              <ShoppingBag className="h-4 w-4" /> 商品
            </button>
            <button type="button" onClick={() => setTab("bag")} className={cn("inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-sm font-medium", tab === "bag" ? "bg-ocean-500 text-white" : "text-slate-500")}>
              <Backpack className="h-4 w-4" /> 我的道具（{state.owned.length}）
            </button>
          </div>
        }
      >
        岛屿商店 · 道具与服装
      </SectionTitle>

      {tab === "shop" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {state.items.map((item) => {
            const Icon = ICONS[item.kind];
            const rarity = RARITY_META[item.rarity];
            return (
              <Card key={item.key} className={cn("flex flex-col p-4", item.locked && "opacity-70")}>
                <div className="flex items-start gap-3">
                  <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", rarity.className)}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{item.name}</span>
                      {item.unique && item.owned > 0 && (
                        <Pill tone="leaf">
                          <Check className="h-3 w-3" /> 已拥有
                        </Pill>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Pill tone={item.rarity === "legend" ? "sun" : item.rarity === "epic" ? "leaf" : item.rarity === "rare" ? "ocean" : "slate"}>{rarity.label}</Pill>
                      <span className="text-[11px] text-slate-400">{KIND_LABEL[item.kind]}</span>
                    </div>
                  </div>
                </div>
                <p className="mt-2 flex-1 text-sm text-slate-500">{item.description}</p>
                <div className="mt-1.5 flex items-center gap-1.5 rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                  <Sparkles className="h-3.5 w-3.5 text-sun-500" />
                  {item.effect}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className={cn("inline-flex items-center gap-1 text-sm font-bold", item.affordable ? "text-ink" : "text-coral-500")}>
                    <CoinIcon className="h-4 w-4" /> {item.price}
                  </span>
                  {item.locked ? (
                    <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs text-slate-500">
                      <Lock className="h-3.5 w-3.5" /> Lv.{item.unlockLevel}
                    </span>
                  ) : item.unique && item.owned > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-xl bg-leaf-50 px-3 py-1.5 text-xs text-leaf-700">
                      <Check className="h-3.5 w-3.5" /> 已拥有
                    </span>
                  ) : (
                    <Button size="sm" loading={pending} disabled={!item.affordable} onClick={() => buy(item.key)}>
                      购买
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : state.owned.length === 0 ? (
        <EmptyState icon={<Backpack className="h-7 w-7" />} title="背包是空的" description="在商店购买道具后会出现在这里，道具会持续生效。" action={<Button onClick={() => setTab("shop")}>去商店看看</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {state.owned.map((item) => {
            const Icon = ICONS[item.kind as ItemDef["kind"]] ?? Gift;
            return (
              <Card key={item.key} className="flex items-start gap-3 p-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-leaf-50 text-leaf-600">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{item.name}</span>
                    {item.qty > 1 && <Pill tone="slate">×{item.qty}</Pill>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{item.effect}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{item.description}</div>
                </div>
              </Card>
            );
          })}
          {state.purchases.length > 0 && (
            <Card className="p-4 sm:col-span-2 xl:col-span-3">
              <div className="text-sm font-semibold">购买记录</div>
              <ul className="mt-2 space-y-1 text-xs text-slate-500">
                {state.purchases.map((p) => (
                  <li key={p.id} className="flex items-center justify-between">
                    <span>
                      {p.name} · {new Date(p.createdAt).toLocaleString("zh-CN")}
                    </span>
                    <span className="font-medium text-slate-600">-{p.price} 金币</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
