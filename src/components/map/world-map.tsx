"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { BookOpen, Check, Compass, Fish, Heart, Lock, MapPin, Scroll, Ship, ShoppingBag, Store, Swords, Trees, Zap } from "lucide-react";
import type { MapState, QuestView, RegionState } from "@/lib/game/model";
import type { ExpeditionView } from "@/lib/game/model";
import { EVENT_META, NPCS, type NpcConfig } from "@/data/world";
import { cn, formatNumber } from "@/lib/utils";
import { claimQuestAction, getMapStateAction, startExplorationAction } from "@/server/game-actions";
import { Button, Card, CoinIcon, Modal, Pill, ProgressBar, useToast } from "../ui";
import { MonsterArt } from "./monster-art";
import { ExpeditionRun } from "./expedition";

const NPC_ICONS: Record<NpcConfig["icon"], typeof Fish> = { fish: Fish, store: Store, compass: Compass, book: BookOpen, ship: Ship };

interface RegionShape {
  key: string;
  d: string;
  cx: number;
  cy: number;
}

const SHAPES: Record<string, RegionShape> = {
  forest: { key: "forest", d: "M250 300 C260 240, 340 210, 430 232 C500 250, 520 320, 470 372 C410 428, 280 412, 250 362 Z", cx: 372, cy: 312 },
  ruins: { key: "ruins", d: "M520 300 C580 272, 690 282, 726 336 C754 380, 716 436, 640 448 C560 458, 508 410, 512 358 Z", cx: 620, cy: 362 },
  mountain: { key: "mountain", d: "M704 232 C768 194, 884 216, 922 268 C954 316, 902 358, 828 358 C758 358, 696 318, 698 268 Z", cx: 812, cy: 272 },
  beach: { key: "beach", d: "M322 500 C424 570, 566 608, 702 596 C806 586, 878 548, 908 498 C918 558, 866 614, 782 642 C690 674, 512 668, 408 612 C356 584, 322 548, 322 500 Z", cx: 612, cy: 588 },
  harbor: { key: "harbor", d: "M896 352 C956 340, 1004 376, 1000 428 C996 482, 940 508, 890 484 C852 464, 850 398, 896 352 Z", cx: 936, cy: 420 },
  voyage: { key: "voyage", d: "M120 648 C156 604, 250 596, 306 632 C356 664, 336 726, 268 744 C196 762, 112 716, 120 648 Z", cx: 218, cy: 668 },
};

function LockBadge({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-ink/80 px-2.5 py-1 text-[11px] text-white">
      <Lock className="h-3 w-3" />
      {text}
    </div>
  );
}

function RegionArtwork({ regionKey, locked }: { regionKey: string; locked: boolean }) {
  const dim = locked ? 0.35 : 1;
  switch (regionKey) {
    case "forest":
      return (
        <g opacity={dim}>
          {[
            [300, 300, 1],
            [336, 262, 0.8],
            [386, 296, 1.1],
            [430, 258, 0.85],
            [286, 348, 0.9],
            [372, 356, 0.95],
            [438, 336, 0.8],
          ].map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
              <rect x="-3" y="0" width="6" height="14" fill="#8a5a3c" />
              <circle cx="0" cy="-8" r="14" fill="#3f9a52" />
              <circle cx="-9" cy="-1" r="10" fill="#55bb6a" />
              <circle cx="9" cy="-2" r="10" fill="#6cc07a" />
            </g>
          ))}
        </g>
      );
    case "mountain":
      return (
        <g opacity={dim}>
          <path d="M712 342 L792 212 L872 342 Z" fill="#8b98a8" />
          <path d="M792 212 L824 262 L792 278 L762 262 Z" fill="#f2f5f8" />
          <path d="M774 342 L846 250 L918 342 Z" fill="#a3b0bf" />
          <path d="M846 250 L870 286 L846 298 L824 286 Z" fill="#f2f5f8" />
          <path d="M682 342 L738 264 L794 342 Z" fill="#7d8b9c" />
          <path d="M738 264 L758 294 L738 306 L718 294 Z" fill="#f2f5f8" />
        </g>
      );
    case "ruins":
      return (
        <g opacity={dim}>
          <rect x="560" y="330" width="18" height="86" fill="#d8d1c2" />
          <rect x="596" y="318" width="18" height="98" fill="#e2dbcc" />
          <rect x="632" y="330" width="18" height="86" fill="#d8d1c2" />
          <rect x="548" y="318" width="118" height="12" fill="#c8c0af" />
          <path d="M690 352 a26 26 0 0 1 52 0 v64 h-52 z" fill="#cdc5b4" />
          <circle cx="716" cy="352" r="26" fill="none" stroke="#b8af9c" strokeWidth="6" />
          <rect x="556" y="422" width="120" height="10" fill="#c8c0af" />
          <path d="M604 300 l10 -22 l10 22 z" fill="#b8af9c" />
        </g>
      );
    case "beach":
      return (
        <g opacity={dim}>
          <path d="M360 560 q30 -18 60 0" stroke="#e0c184" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M470 596 q34 -20 68 0" stroke="#e0c184" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M620 612 q34 -20 68 0" stroke="#e0c184" strokeWidth="5" fill="none" strokeLinecap="round" />
          <g transform="translate(760 540) scale(0.9)">
            <path d="M0 44 Q8 22 22 8" stroke="#9c6236" strokeWidth="7" fill="none" strokeLinecap="round" />
            <ellipse cx="24" cy="6" rx="20" ry="7" fill="#3f9a52" transform="rotate(-150 24 6)" />
            <ellipse cx="38" cy="2" rx="20" ry="7" fill="#6cc07a" transform="rotate(-60 38 2)" />
            <ellipse cx="48" cy="12" rx="20" ry="7" fill="#3f9a52" transform="rotate(20 48 12)" />
          </g>
          <circle cx="430" cy="586" r="8" fill="#f2e3bd" stroke="#dfc793" strokeWidth="3" />
          <circle cx="596" cy="632" r="7" fill="#f2e3bd" stroke="#dfc793" strokeWidth="3" />
        </g>
      );
    case "harbor":
      return (
        <g opacity={dim}>
          <rect x="930" y="428" width="120" height="12" fill="#b48a5c" />
          <rect x="952" y="440" width="10" height="42" fill="#9c6236" />
          <rect x="1006" y="440" width="10" height="42" fill="#9c6236" />
          <g transform="translate(902 336)">
            <rect x="0" y="24" width="26" height="60" fill="#fff" />
            <rect x="0" y="38" width="26" height="12" fill="#e8735a" />
            <rect x="0" y="60" width="26" height="12" fill="#e8735a" />
            <rect x="2" y="8" width="22" height="18" fill="#ffe9a8" stroke="#c85b48" strokeWidth="3" />
            <path d="M0 8 L13 -8 L26 8 Z" fill="#c85b48" />
          </g>
          <g transform="translate(972 500)">
            <path d="M-26 22 Q0 34 26 22 L18 12 H-18 Z" fill="#c98a4b" />
            <rect x="-1" y="-22" width="3" height="34" fill="#9c6236" />
            <path d="M2 -20 L22 6 L2 6 Z" fill="#fff" stroke="#d8cfc0" strokeWidth="2" />
          </g>
        </g>
      );
    case "voyage":
    default:
      return (
        <g opacity={dim}>
          <g transform="translate(150 622) scale(0.8)">
            <path d="M0 44 Q8 22 22 8" stroke="#9c6236" strokeWidth="7" fill="none" strokeLinecap="round" />
            <ellipse cx="24" cy="6" rx="20" ry="7" fill="#3f9a52" transform="rotate(-150 24 6)" />
            <ellipse cx="38" cy="2" rx="20" ry="7" fill="#6cc07a" transform="rotate(-60 38 2)" />
          </g>
          <rect x="204" y="662" width="14" height="34" fill="#d8d1c2" />
          <rect x="232" y="656" width="14" height="40" fill="#e2dbcc" />
          <path d="M198 656 l22 -18 l22 18 z" fill="#c8c0af" />
          <path d="M226 650 l22 -16 l22 16 z" fill="#c8c0af" />
          <circle cx="292" cy="682" r="9" fill="#6cc07a" />
          <circle cx="278" cy="694" r="7" fill="#55bb6a" />
        </g>
      );
  }
}

export function WorldMap({ initial }: { initial: MapState }) {
  const toast = useToast();
  const [state, setState] = useState(initial);
  const [quests, setQuests] = useState<QuestView[]>(initial.quests);
  const [selected, setSelected] = useState<string>(initial.regions.find((r) => r.unlocked)?.region.key ?? "beach");
  const [starting, setStarting] = useState(false);
  const [useTea, setUseTea] = useState(false);
  const [expedition, setExpedition] = useState<ExpeditionView | null>(initial.active);
  const [pending, startTransition] = useTransition();

  const ownedItems = useMemo(() => new Map(initial.ownedItems.map((i) => [i.key, i.qty])), [initial.ownedItems]);
  const hasTea = ownedItems.has("energy_tea");
  const regionState = state.regions.find((r) => r.region.key === selected);
  const activeQuests = quests.filter((q) => q.unlocked);

  const start = () => {
    if (!regionState) return;
    startTransition(async () => {
      const res = await startExplorationAction(regionState.region.key, useTea && hasTea);
      if (!res.ok) return toast({ kind: "error", title: res.error });
      setStarting(false);
      setExpedition(res.data);
      window.scrollTo({ top: 0 });
    });
  };

  const claimQuest = (key: string) => {
    startTransition(async () => {
      const res = await claimQuestAction(key);
      if (!res.ok) return toast({ kind: "error", title: res.error });
      setQuests(res.data.quests);
      toast({ kind: "reward", title: `任务奖励 +${res.data.coins} 金币 +${res.data.xp} XP`, description: res.data.item ? "获得道具 ×1" : undefined });
      if (res.data.leveledUp) toast({ kind: "success", title: "升级啦！" });
    });
  };

  const handleExitExpedition = () => {
    setExpedition(null);
    startTransition(async () => {
      const res = await getMapStateAction();
      if (res.ok) {
        setState(res.data);
        setQuests(res.data.quests);
      }
    });
  };

  if (expedition) {
    return <ExpeditionRun initial={expedition} onExit={handleExitExpedition} />;
  }

  return (
    <div className="space-y-4">
      {/* HUD */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">群岛地图</h1>
          <p className="text-sm text-slate-500">选择区域开始探索：每次探索都会遇到怪物、NPC 与宝箱，答题即战斗</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2 shadow-soft">
            <CoinIcon />
            <span className="text-sm font-bold tabular-nums">{formatNumber(state.player.coins)}</span>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2 shadow-soft">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-ocean-500 text-[11px] font-bold text-white">{state.player.level}</span>
            <span className="text-xs text-slate-500">已学 {formatNumber(state.learnedCount)} 词</span>
          </div>
          <Link href="/island" className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-medium hover:bg-slate-50">
            <ShoppingBag className="h-4 w-4" /> 岛屿商店
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
        {/* 地图 */}
        <Card className="relative overflow-hidden rounded-4xl border-0 bg-gradient-to-b from-[#cfeafb] to-[#8fc9ee]">
          <div className="overflow-x-auto no-scrollbar">
            <svg viewBox="0 0 1120 800" className="block h-auto w-full min-w-[680px] select-none" role="img" aria-label="群岛探索地图">
              <defs>
                <linearGradient id="map-sea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#cfeafb" />
                  <stop offset="100%" stopColor="#7cc0ee" />
                </linearGradient>
                <linearGradient id="map-land" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#b6e3a2" />
                  <stop offset="100%" stopColor="#7cc46f" />
                </linearGradient>
              </defs>
              <rect width="1120" height="800" fill="url(#map-sea)" />
              {/* 航线 */}
              <path d="M312 690 C520 768, 826 730, 950 528" stroke="#fff" strokeWidth="4" strokeDasharray="12 10" fill="none" opacity="0.85" />
              <g transform="translate(566 712) rotate(-14)">
                <path d="M-22 18 Q0 28 22 18 L16 8 H-16 Z" fill="#c98a4b" />
                <rect x="-1" y="-18" width="3" height="28" fill="#9c6236" />
                <path d="M2 -16 L18 4 L2 4 Z" fill="#fff" stroke="#d8cfc0" strokeWidth="2" />
              </g>
              {/* 波纹 */}
              <g opacity="0.5" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round">
                <path d="M60 120 q18 -12 36 0 t36 0" />
                <path d="M980 700 q18 -12 36 0 t36 0" />
                <path d="M120 420 q18 -12 36 0 t36 0" />
                <path d="M900 120 q18 -12 36 0 t36 0" />
              </g>
              {/* 主岛 */}
              <path d="M180 430 C200 320, 330 244, 452 246 C560 190, 720 182, 838 250 C960 306, 1020 392, 992 486 C962 582, 838 640, 690 654 C552 668, 380 646, 282 592 C202 548, 164 494, 180 430 Z" fill="#f2e3bd" />
              <path d="M196 424 C216 328, 336 262, 452 264 C556 210, 714 202, 826 266 C938 322, 992 398, 968 480 C940 566, 828 618, 688 632 C556 644, 392 624, 296 574 C220 534, 182 486, 196 424 Z" fill="url(#map-land)" />
              <path d="M240 300 C330 240, 520 226, 640 250 C720 266, 800 300, 840 350" stroke="#a5d98f" strokeWidth="26" fill="none" opacity="0.5" strokeLinecap="round" />

              {Object.values(SHAPES).map((shape) => {
                const rs = state.regions.find((r) => r.region.key === shape.key);
                if (!rs) return null;
                const isSelected = selected === shape.key;
                return (
                  <g
                    key={shape.key}
                    className="cursor-pointer"
                    onClick={() => setSelected(shape.key)}
                    onMouseEnter={() => setSelected(shape.key)}
                    role="button"
                    aria-label={rs.region.name}
                  >
                    <path d={shape.d} fill={rs.region.tint} opacity={rs.unlocked ? (isSelected ? 0.95 : 0.75) : 0.35} stroke={isSelected ? "#1f6fb5" : "#ffffff"} strokeWidth={isSelected ? 3.5 : 2.5} strokeLinejoin="round" strokeDasharray={rs.unlocked ? "none" : "8 8"} className="transition-all duration-200" />
                    <RegionArtwork regionKey={shape.key} locked={!rs.unlocked} />
                    {isSelected && <path d={shape.d} fill="none" stroke="#ffffff" strokeWidth="2" opacity="0.65" strokeDasharray="3 7" className="animate-pulse" />}
                    <g transform={`translate(${shape.cx} ${shape.cy})`}>
                      <rect x={-58} y={-14} width={116} height={28} rx={14} fill={rs.unlocked ? "#1d2433" : "#64748b"} opacity={0.85} />
                      <text textAnchor="middle" y={5} fontSize={15} fontWeight={700} fill="#fff">
                        {rs.region.name}
                      </text>
                      {!rs.unlocked && (
                        <g transform="translate(-72 -2)">
                          <circle r={11} fill="#1d2433" opacity={0.85} />
                          <path d="M-4 -2 a4 4 0 0 1 8 0 v2 M-5 0 h10 v7 h-10 z" fill="#fff" transform="translate(0 -2) scale(0.9)" />
                        </g>
                      )}
                    </g>
                  </g>
                );
              })}
            </svg>
          </div>
        </Card>

        {/* 区域面板 + 任务 */}
        <div className="space-y-4">
          {regionState && (
            <Card className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">{regionState.region.name}</h2>
                    {regionState.unlocked ? <Pill tone="leaf">已解锁</Pill> : <Pill tone="slate">未解锁</Pill>}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">{regionState.region.subtitle}</p>
                </div>
                <MapPin className="h-5 w-5 text-ocean-500" />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{regionState.region.description}</p>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-slate-50 p-2.5">
                  <div className="text-base font-bold">{regionState.runs}</div>
                  <div className="text-[11px] text-slate-400">探索次数</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-2.5">
                  <div className="text-base font-bold">{regionState.monstersDefeated}</div>
                  <div className="text-[11px] text-slate-400">击败怪物</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-2.5">
                  <div className="text-base font-bold">{regionState.chestsFound}</div>
                  <div className="text-[11px] text-slate-400">宝箱</div>
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">可能遇到</div>
                <div className="flex flex-wrap gap-2">
                  {regionState.region.monsters.map((m) => (
                    <span key={m} className="inline-flex items-center gap-1.5 rounded-xl bg-coral-100/60 px-2.5 py-1 text-xs font-medium text-coral-600">
                      <Swords className="h-3.5 w-3.5" />
                      {m === "crab_king" ? "巨钳海蟹" : m === "moss_slime" ? "苔藓史莱姆" : m === "night_beast" ? "森林夜兽" : m === "stone_golem" ? "遗迹石像" : m === "sea_serpent" ? "港湾海蟒" : "山岭巨龙"}
                    </span>
                  ))}
                  {regionState.region.npcs.map((n) => {
                    const npc = NPCS[n];
                    const Icon = NPC_ICONS[npc.icon];
                    return (
                      <span key={n} className="inline-flex items-center gap-1.5 rounded-xl bg-ocean-50 px-2.5 py-1 text-xs font-medium text-ocean-700">
                        <Icon className="h-3.5 w-3.5" />
                        {npc.name} · {npc.role}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
                <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-600">
                  <Scroll className="h-3.5 w-3.5" /> 可能触发的事件
                </div>
                {[...new Set(regionState.region.plans.flat())].slice(0, 6).map((k) => (
                  <span key={k} className="mr-2 inline-block">
                    · {EVENT_META[k].label}
                  </span>
                ))}
              </div>

              {!regionState.unlocked ? (
                <div className="mt-4">
                  <LockBadge text={regionState.unlockText} />
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {hasTea && (
                    <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-sand-200 bg-sand-50 px-3 py-2 text-sm">
                      <input type="checkbox" checked={useTea} onChange={(e) => setUseTea(e.target.checked)} className="h-4 w-4 rounded accent-ocean-500" />
                      使用能量茶（本局体力上限 +1，消耗 1 个）
                    </label>
                  )}
                  <Button size="lg" className="w-full" loading={pending} onClick={() => setStarting(true)} icon={<Swords className="h-5 w-5" />}>
                    开始探索
                  </Button>
                  <p className="text-center text-xs text-slate-400">每次探索约 6–8 个事件，答对即攻击，答错不惩罚学习</p>
                </div>
              )}
            </Card>
          )}

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div className="font-semibold">NPC 任务</div>
              <span className="text-xs text-slate-400">{activeQuests.length} 个进行中</span>
            </div>
            {activeQuests.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">在探索中遇到 NPC 后，这里会出现他们的委托任务。</p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {quests
                  .filter((qq) => qq.unlocked)
                  .map((qq) => (
                    <div key={qq.key} className={cn("rounded-2xl border p-3", qq.claimed ? "border-slate-100 bg-slate-50" : qq.claimable ? "border-leaf-200 bg-leaf-50" : "border-slate-100 bg-white")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold">{qq.title}</span>
                            <span className="shrink-0 text-[11px] text-slate-400">{qq.npcKey && NPCS[qq.npcKey]?.name}</span>
                          </div>
                          <div className="text-xs text-slate-500">{qq.description}</div>
                        </div>
                        {qq.claimed ? (
                          <Pill tone="leaf">
                            <Check className="h-3 w-3" /> 已领取
                          </Pill>
                        ) : qq.claimable ? (
                          <Button size="sm" variant="sun" loading={pending} onClick={() => claimQuest(qq.key)}>
                            领取
                          </Button>
                        ) : (
                          <span className="shrink-0 text-xs text-slate-400">
                            {qq.progress}/{qq.target}
                          </span>
                        )}
                      </div>
                      {!qq.claimed && (
                        <div className="mt-2">
                          <ProgressBar value={qq.progress} max={qq.target} height="h-1.5" barClassName={qq.claimable ? "bg-leaf-500" : "bg-ocean-400"} />
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                            <CoinIcon className="h-3 w-3" /> +{qq.reward.coins}
                            <Zap className="ml-2 h-3 w-3 text-ocean-500" /> +{qq.reward.xp}
                            {qq.itemReward && <span className="ml-2 rounded bg-sun-100 px-1 text-sun-600">含稀有道具</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* 开始探索确认 */}
      <Modal
        open={starting}
        onClose={() => setStarting(false)}
        title={`进入${regionState?.region.name ?? ""}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStarting(false)}>
              取消
            </Button>
            <Button loading={pending} onClick={start} icon={<Swords className="h-4 w-4" />}>
              出发
            </Button>
          </div>
        }
      >
        <div className="space-y-3 py-1">
          <p className="text-sm text-slate-600">{regionState?.region.description}</p>
          <div className="rounded-2xl bg-ocean-50 p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-ocean-700">
              <Heart className="h-4 w-4" /> 本次探索规则
            </div>
            <ul className="mt-1.5 space-y-1 text-slate-600">
              <li>· 每次探索 {regionState?.region.plans[0].length ?? 6} 个事件：怪物、NPC、宝箱、首领</li>
              <li>· 答对题目造成伤害并获得金币与经验；答错会扣 1 点体力，但单词会排入复习</li>
              <li>· 体力耗尽会提前返回营地，已完成的奖励保留</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
            <Trees className="mr-1 inline h-3.5 w-3.5" />
            题型来自该区域词库，并按你的掌握程度动态调整难度。
          </div>
        </div>
      </Modal>
    </div>
  );
}
