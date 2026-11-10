"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUpCircle, Box, Check, Hammer, LayoutGrid, Lock, Move, PackageOpen, Store, Trash2, X, Zap, Sparkles, GraduationCap } from "lucide-react";
import { BUILDING_CATALOG, ISLAND_SLOTS, canPlaceOnSlot, getBuildingDef, maxLevel, upgradeCost, type BuildingDef, type IslandSlot } from "@/lib/game/buildings";
import type { BuildingView, IslandState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { buildAction, moveBuildingAction, placeFromInventoryAction, removeBuildingAction, upgradeAction } from "@/server/actions";
import { Button, Card, CoinIcon, Pill, ProgressBar, useToast } from "../ui";
import { ConfirmDialog, useConfirm } from "../confirm-dialog";
import { BuildingArt, BuildingPreview } from "./building-art";
import { Island3D } from "./island-3d";
import { useSceneMode } from "../world/use-scene-mode";

// ---------------- Scene ----------------
function wavePath(y: number): string {
  let d = `M-300 ${y}`;
  for (let x = -300; x < 1400; x += 70) d += ` q 17.5 -8 35 0 t 35 0`;
  return d;
}

function Cloud({ x, y, s, delay }: { x: number; y: number; s: number; delay: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} className="animate-drift" style={{ animationDelay: delay }} opacity={0.9}>
      <ellipse cx={0} cy={0} rx={38} ry={16} fill="#fff" />
      <circle cx={-14} cy={-8} r={16} fill="#fff" />
      <circle cx={10} cy={-12} r={20} fill="#fff" />
      <circle cx={28} cy={-4} r={14} fill="#fff" />
    </g>
  );
}

interface SceneProps {
  buildings: BuildingView[];
  selectedId: number | null;
  pendingType: string | null;
  popId: number | null;
  onSlotClick: (slot: IslandSlot) => void;
  onBuildingClick: (b: BuildingView) => void;
}

export function IslandScene({ buildings, selectedId, pendingType, popId, onSlotClick, onBuildingClick }: SceneProps) {
  const bySlot = useMemo(() => new Map(buildings.map((b) => [b.slot, b])), [buildings]);
  const pendingDef = pendingType ? getBuildingDef(pendingType) : null;
  const slotsSorted = [...ISLAND_SLOTS].sort((a, b) => a.y - b.y);

  return (
    <svg viewBox="0 0 1000 640" className="block h-auto w-full select-none" role="img" aria-label="我的岛屿">
      <defs>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9e9fb" />
          <stop offset="100%" stopColor="#7fc2ee" />
        </linearGradient>
        <radialGradient id="shallow" cx="50%" cy="55%" r="55%">
          <stop offset="60%" stopColor="#bfe6f7" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#bfe6f7" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a8dc92" />
          <stop offset="100%" stopColor="#7cc46f" />
        </linearGradient>
      </defs>

      {/* Sea */}
      <rect width="1000" height="640" fill="url(#sea)" />
      <circle cx="880" cy="80" r="34" fill="#ffe28a" />
      <circle cx="880" cy="80" r="52" fill="#ffe28a" opacity="0.25" />
      <Cloud x={160} y={90} s={1} delay="0s" />
      <Cloud x={620} y={60} s={0.8} delay="-6s" />
      <Cloud x={820} y={150} s={0.6} delay="-11s" />
      <path d="M700 110 q6 -6 12 0 q6 -6 12 0" stroke="#5b7f9e" strokeWidth="2" fill="none" opacity="0.6" />
      <path d="M735 95 q6 -6 12 0 q6 -6 12 0" stroke="#5b7f9e" strokeWidth="2" fill="none" opacity="0.6" />

      <ellipse cx="500" cy="372" rx="520" ry="260" fill="url(#shallow)" />
      <g className="animate-wave" opacity="0.5">
        <path d={wavePath(560)} stroke="#fff" strokeWidth="2.5" fill="none" />
        <path d={wavePath(600)} stroke="#fff" strokeWidth="2" fill="none" opacity="0.7" />
        <path d={wavePath(150)} stroke="#fff" strokeWidth="2" fill="none" opacity="0.6" />
      </g>
      <ellipse cx="120" cy="575" rx="26" ry="10" fill="#9aa3ad" />
      <ellipse cx="150" cy="585" rx="16" ry="7" fill="#b3bac2" />
      <ellipse cx="930" cy="230" rx="20" ry="8" fill="#9aa3ad" />

      {/* Island */}
      <ellipse cx="500" cy="372" rx="430" ry="208" fill="#e4cf9e" opacity="0.55" />
      <ellipse cx="500" cy="362" rx="420" ry="198" fill="#f1dfb3" />
      <ellipse cx="560" cy="385" rx="360" ry="172" fill="#f3e3bb" />
      <ellipse cx="500" cy="340" rx="360" ry="158" fill="url(#grass)" />
      <ellipse cx="470" cy="330" rx="300" ry="120" fill="#b7e4a0" opacity="0.45" />
      <ellipse cx="300" cy="300" rx="40" ry="16" fill="#6db862" opacity="0.35" />
      <ellipse cx="720" cy="400" rx="50" ry="18" fill="#6db862" opacity="0.35" />
      <ellipse cx="540" cy="470" rx="60" ry="14" fill="#6db862" opacity="0.3" />
      <path d="M500 300 C 540 360, 470 420, 505 500" stroke="#f1dfb3" strokeWidth="16" strokeLinecap="round" fill="none" opacity="0.8" />
      {/* static flora */}
      <g transform="translate(95 300) scale(0.55)">
        <BuildingArt type="palm" level={1} />
      </g>
      <g transform="translate(850 240) scale(0.5)">
        <BuildingArt type="palm" level={1} />
      </g>
      <g transform="translate(210 480) scale(0.5)">
        <BuildingArt type="flowers" level={1} />
      </g>
      <g transform="translate(760 500) scale(0.45)">
        <BuildingArt type="flowers" level={1} />
      </g>
      <ellipse cx="640" cy="520" rx="14" ry="6" fill="#9aa3ad" />
      <ellipse cx="660" cy="526" rx="9" ry="4" fill="#b3bac2" />

      {/* Slots & buildings */}
      {slotsSorted.map((slot) => {
        const b = bySlot.get(slot.id);
        const s = slot.scale;
        if (b) {
          const def = getBuildingDef(b.type);
          const selected = selectedId === b.id;
          return (
            <g key={slot.id} className="cursor-pointer" onClick={() => onBuildingClick(b)}>
              <title>{def ? `${def.name} Lv.${b.level}` : b.type}</title>
              {selected && <ellipse cx={slot.x} cy={slot.y} rx={44 * s} ry={14 * s} fill="none" stroke="#2b8ad6" strokeWidth={3} strokeDasharray="8 6" className="animate-pulse" />}
              <g transform={`translate(${slot.x - 60 * s} ${slot.y - 110 * s}) scale(${s})`}>
                <ellipse cx={60} cy={110} rx={34} ry={7} fill="#1d2433" opacity={0.12} />
                <g key={`${b.id}-${b.level}-${popId === b.id ? "pop" : "idle"}`} className={cn("origin-bottom-box transition-transform duration-200 hover:scale-[1.05]", popId === b.id && "animate-pop")}>
                  <BuildingArt type={b.type} level={b.level} />
                </g>
              </g>
              {selected && def && (
                <g transform={`translate(${slot.x} ${slot.y + 26 * s})`}>
                  <rect x={-(def.name.length * 7 + 30)} y={-14} width={def.name.length * 14 + 60} height={28} rx={14} fill="#1d2433" opacity={0.85} />
                  <text textAnchor="middle" y={5} fontSize={14} fontWeight={600} fill="#fff">
                    {def.name} Lv.{b.level}
                  </text>
                </g>
              )}
            </g>
          );
        }
        const valid = pendingDef ? canPlaceOnSlot(pendingDef, slot) : true;
        return (
          <g key={slot.id} className={cn(valid ? "cursor-pointer" : "cursor-not-allowed")} onClick={() => valid && onSlotClick(slot)}>
            <title>{slot.terrain === "beach" ? "沙滩空位" : "草地空位"}</title>
            <ellipse cx={slot.x} cy={slot.y} rx={40 * s} ry={13 * s} fill="#fff" opacity={pendingDef ? (valid ? 0.35 : 0.08) : 0.14} />
            <ellipse cx={slot.x} cy={slot.y} rx={40 * s} ry={13 * s} fill="none" stroke={pendingDef && valid ? "#2b8ad6" : "#ffffff"} strokeWidth={2} strokeDasharray="6 5" opacity={pendingDef ? (valid ? 1 : 0.2) : 0.5} />
            {pendingDef && valid && (
              <g>
                <ellipse cx={slot.x} cy={slot.y} rx={40 * s} ry={13 * s} fill="none" stroke="#2b8ad6" strokeWidth={2} className="animate-pulse-ring origin-center-box" />
                <circle cx={slot.x} cy={slot.y - 24 * s} r={14} fill="#2b8ad6" />
                <text x={slot.x} y={slot.y - 24 * s + 6} textAnchor="middle" fontSize={20} fontWeight={700} fill="#fff">
                  +
                </text>
              </g>
            )}
            {!pendingDef && (
              <text x={slot.x} y={slot.y + 5} textAnchor="middle" fontSize={16} fontWeight={700} fill="#fff" opacity={0.7}>
                +
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------- View ----------------

/** 解析背包建筑 itemKey：bld:<type>:L<level> */
function parseItemKey(itemKey: string): { type: string; level: number } | null {
  const m = /^bld:([a-z_]+):L(\d+)$/.exec(itemKey);
  return m ? { type: m[1], level: Number(m[2]) } : null;
}

type Panel = "overview" | "shop" | "building";

export function IslandView({ initial }: { initial: IslandState }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [island, setIsland] = useState<IslandState>(initial);
  const [panel, setPanel] = useState<Panel>("overview");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pendingType, setPendingType] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<number | null>(null);
  /** 移动模式：记录待移动的建筑 id */
  const [pendingMove, setPendingMove] = useState<number | null>(null);
  /** 背包放置模式：记录待放置的 itemKey */
  const [pendingBackpack, setPendingBackpack] = useState<string | null>(null);
  const [popId, setPopId] = useState<number | null>(null);
  const [coinDelta, setCoinDelta] = useState<{ v: number; k: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const [sceneMode, setSceneMode] = useSceneMode("word-island:island-mode");
  // k 只用来强制重播金币飘字动画，用自增序号即可，避免在渲染期读取 Date.now()
  const deltaSeq = useRef(0);

  const { player, buildings, progress } = island;
  const selected = buildings.find((b) => b.id === selectedId) ?? null;
  const selectedDef = selected ? getBuildingDef(selected.type) : null;
  const pendingBackpackDef = pendingBackpack ? getBuildingDef(parseItemKey(pendingBackpack)?.type ?? "") : null;

  useEffect(() => {
    if (!popId) return;
    const t = setTimeout(() => setPopId(null), 700);
    return () => clearTimeout(t);
  }, [popId]);

  const scrollPanel = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  };

  const showDelta = (before: number, after: number) => {
    if (after !== before) setCoinDelta({ v: after - before, k: ++deltaSeq.current });
  };

  const doBuild = (type: string, slot: number) => {
    const def = getBuildingDef(type);
    startTransition(async () => {
      const before = island.player.coins;
      const res = await buildAction(type, slot);
      if (!res.ok) return toast({ kind: "error", title: res.error });
      setIsland(res.data.island);
      showDelta(before, res.data.island.player.coins);
      const nb = res.data.island.buildings.find((b) => b.slot === slot);
      setPendingSlot(null);
      setPendingType(null);
      if (nb) {
        setPopId(nb.id);
        setSelectedId(nb.id);
        setPanel("building");
      }
      toast({ kind: "success", title: `${def?.name ?? "建筑"}建造完成`, description: def?.buildCost ? `花费 ${def.buildCost} 金币` : undefined });
      for (const a of res.data.achievements) toast({ kind: "reward", title: `解锁成就「${a.title}」`, description: `+${a.reward.coins} 金币 +${a.reward.xp} XP` });
    });
  };

  const onSlotClick = (slot: IslandSlot) => {
    if (pendingMove) return doMove(pendingMove, slot.id);
    if (pendingBackpack) return doPlaceBackpack(pendingBackpack, slot.id);
    if (pendingType) return doBuild(pendingType, slot.id);
    setPendingSlot(slot.id);
    setSelectedId(null);
    setPanel("shop");
    scrollPanel();
  };

  const onBuildingClick = (b: BuildingView) => {
    setSelectedId(b.id);
    setPendingType(null);
    setPendingSlot(null);
    setPendingMove(null);
    setPendingBackpack(null);
    setPanel("building");
    scrollPanel();
  };

  const doMove = (buildingId: number, slot: number) => {
    startTransition(async () => {
      const res = await moveBuildingAction(buildingId, slot);
      if (!res.ok) return toast({ kind: "error", title: res.error });
      setIsland(res.data);
      setPendingMove(null);
      setPopId(buildingId);
      toast({ kind: "success", title: "建筑已移动" });
    });
  };

  const onBackpackPick = (itemKey: string) => {
    if (pendingSlot) {
      const def = getBuildingDef(parseItemKey(itemKey)?.type ?? "");
      const slot = ISLAND_SLOTS.find((s) => s.id === pendingSlot)!;
      if (def && !canPlaceOnSlot(def, slot)) return toast({ kind: "error", title: def.terrain === "beach" ? `${def.name}只能放在沙滩上` : `${def.name}只能放在草地上` });
      return doPlaceBackpack(itemKey, pendingSlot);
    }
    setPendingBackpack(itemKey);
    toast({ kind: "info", title: `点击岛上闪烁的空位放置${getBuildingDef(parseItemKey(itemKey)?.type ?? "")?.name ?? "建筑"}` });
    if (typeof window !== "undefined" && window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const doPlaceBackpack = (itemKey: string, slot: number) => {
    const def = getBuildingDef(parseItemKey(itemKey)?.type ?? "");
    startTransition(async () => {
      const res = await placeFromInventoryAction(itemKey, slot);
      if (!res.ok) return toast({ kind: "error", title: res.error });
      setIsland(res.data.island);
      setPendingBackpack(null);
      const nb = res.data.island.buildings.find((b) => b.slot === slot);
      if (nb) {
        setPopId(nb.id);
        setSelectedId(nb.id);
        setPanel("building");
      }
      toast({ kind: "success", title: `${def?.name ?? "建筑"}已从背包放置`, description: "免费放置，等级保留" });
      for (const a of res.data.achievements) toast({ kind: "reward", title: `解锁成就「${a.title}」`, description: `+${a.reward.coins} 金币 +${a.reward.xp} XP` });
    });
  };

  const onShopPick = (def: BuildingDef) => {
    if (pendingSlot) {
      const slot = ISLAND_SLOTS.find((s) => s.id === pendingSlot)!;
      if (!canPlaceOnSlot(def, slot)) return toast({ kind: "error", title: def.terrain === "beach" ? `${def.name}只能建在沙滩上` : `${def.name}只能建在草地上` });
      return doBuild(def.type, pendingSlot);
    }
    setPendingBackpack(null);
    setPendingMove(null);
    setPendingType(def.type);
    toast({ kind: "info", title: `点击岛上闪烁的空位放置${def.name}` });
    if (typeof window !== "undefined" && window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const doUpgrade = () => {
    if (!selected) return;
    startTransition(async () => {
      const before = island.player.coins;
      const res = await upgradeAction(selected.id);
      if (!res.ok) return toast({ kind: "error", title: res.error });
      setIsland(res.data);
      showDelta(before, res.data.player.coins);
      setPopId(selected.id);
      const nb = res.data.buildings.find((b) => b.id === selected.id);
      toast({ kind: "success", title: `${selectedDef?.name}升级到 Lv.${nb?.level}` });
    });
  };

  const doRemove = () => {
    if (!selected || !selectedDef) return;
    confirm.confirm({
      title: `把${selectedDef.name}收进背包？`,
      description: "建筑会收进背包（保留当前等级），之后可以在商店的「背包」区免费重新放置。",
      confirmLabel: "收进背包",
      onConfirm: () => {
        startTransition(async () => {
          const res = await removeBuildingAction(selected.id);
          if (!res.ok) return toast({ kind: "error", title: res.error });
          setIsland(res.data.island);
          setSelectedId(null);
          setPanel("shop");
          scrollPanel();
          toast({ kind: "success", title: `${selectedDef.name}已收进背包` });
        });
      },
    });
  };

  const cancelPending = () => {
    setPendingType(null);
    setPendingSlot(null);
    setPendingMove(null);
    setPendingBackpack(null);
  };

  const ownedCount = (type: string) => buildings.filter((b) => b.type === type).length;
  const emptySlots = ISLAND_SLOTS.filter((s) => !buildings.some((b) => b.slot === s.id));
  const pendingDef = pendingType ? getBuildingDef(pendingType) : null;

  return (
    <div className="space-y-4">
      {/* HUD */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">我的岛屿</h1>
          <p className="text-sm text-slate-500">
            已建造 {progress.totalBuildings} 座建筑 · 解锁 {progress.ownedTypes}/{progress.totalTypes} 种
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2 shadow-soft">
            <CoinIcon />
            <span className="text-sm font-bold tabular-nums">{player.coins}</span>
            {coinDelta && (
              <span key={coinDelta.k} className={cn("absolute -top-3 right-2 text-sm font-bold animate-coin-up", coinDelta.v < 0 ? "text-coral-500" : "text-leaf-600")}>
                {coinDelta.v > 0 ? "+" : ""}
                {coinDelta.v}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2 shadow-soft">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-ocean-500 text-[11px] font-bold text-white">{player.level}</span>
            <div className="w-20">
              <ProgressBar value={player.levelXp} max={player.levelNeed} height="h-1.5" />
              <div className="mt-0.5 text-[10px] text-slate-400">
                {player.levelXp}/{player.levelNeed} XP
              </div>
            </div>
          </div>
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white p-0.5" role="group" aria-label="岛屿呈现方式">
            <button type="button" onClick={() => setSceneMode("3d")} aria-pressed={sceneMode === "3d"} title="P2 低多边形 3D 岛屿：可旋转、昼夜与天气" className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition", sceneMode === "3d" ? "bg-ocean-500 text-white shadow-sm" : "text-slate-500 hover:text-ocean-600")}>
              <Box className="h-3.5 w-3.5" /> 立体
            </button>
            <button type="button" onClick={() => setSceneMode("flat")} aria-pressed={sceneMode === "flat"} title="平面插画：原有 SVG 岛屿，兼容低性能设备" className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition", sceneMode === "flat" ? "bg-ocean-500 text-white shadow-sm" : "text-slate-500 hover:text-ocean-600")}>
              <LayoutGrid className="h-3.5 w-3.5" /> 平面
            </button>
          </span>
          <Button variant={panel === "shop" ? "primary" : "secondary"} icon={<Store className="h-4 w-4" />} onClick={() => { setPanel("shop"); setSelectedId(null); scrollPanel(); }}>
            商店
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Scene */}
        <Card className="relative overflow-hidden rounded-4xl border-0 bg-ocean-100">
          {(pendingDef || pendingSlot || pendingMove || pendingBackpackDef) && (
            <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2 rounded-2xl bg-ink/85 px-4 py-2.5 text-sm text-white backdrop-blur">
              <span className="inline-flex items-center gap-2">
                <Hammer className="h-4 w-4 text-sun-400" />
                {pendingMove
                  ? "点击空位移动选中的建筑（地形需匹配）"
                  : pendingBackpackDef
                    ? `点击闪烁的空位放置背包中的「${pendingBackpackDef.name}」（免费）`
                    : pendingDef
                      ? `点击闪烁的空位放置「${pendingDef.name}」`
                      : "在右侧商店选择要建造的内容"}
              </span>
              <button onClick={cancelPending} className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-xs hover:bg-white/25">
                <X className="h-3.5 w-3.5" /> 取消
              </button>
            </div>
          )}
          {sceneMode === "3d" ? (
            <div className="p-2">
              <Island3D buildings={buildings} selectedId={selectedId} pendingType={pendingBackpackDef?.type ?? pendingType} popId={popId} onSlotClick={onSlotClick} onBuildingClick={onBuildingClick} />
            </div>
          ) : (
            <div className="overflow-x-auto no-scrollbar">
              <div className="min-w-[640px]">
                <IslandScene buildings={buildings} selectedId={selectedId} pendingType={pendingBackpackDef?.type ?? pendingType} popId={popId} onSlotClick={onSlotClick} onBuildingClick={onBuildingClick} />
              </div>
            </div>
          )}
          {sceneMode === "flat" && (
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl bg-white/80 px-2.5 py-1 text-[11px] text-slate-500 backdrop-blur lg:hidden">左右滑动查看全岛 · 点击空位建造</div>
          )}
        </Card>

        {/* Panel */}
        <div ref={panelRef} className="scroll-mt-20">
          {panel === "building" && selected && selectedDef ? (
            <Card className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <BuildingPreview type={selected.type} level={selected.level} className="h-20 w-20 rounded-2xl bg-leaf-50" />
                  <div>
                    <div className="text-lg font-bold">{selectedDef.name}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Pill tone="ocean">Lv.{selected.level}</Pill>
                      <Pill tone={selectedDef.category === "building" ? "leaf" : "sand"}>{selectedDef.category === "building" ? "建筑" : "装饰"}</Pill>
                    </div>
                  </div>
                </div>
                <button onClick={() => { setSelectedId(null); setPanel("overview"); }} className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100" aria-label="关闭">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-4 text-sm text-slate-600">{selectedDef.description}</p>
              <div className="mt-4 space-y-1.5">
                {selectedDef.levelNotes.map((note, i) => {
                  const lv = i + 1;
                  const reached = selected.level >= lv;
                  return (
                    <div key={lv} className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-sm", reached ? "bg-leaf-50 text-leaf-700" : "bg-slate-50 text-slate-400")}>
                      {reached ? <Check className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}
                      <span className="font-medium">Lv.{lv}</span>
                      <span>{note}</span>
                      {!reached && selectedDef.upgradeCosts[lv - 2] !== undefined && (
                        <span className="ml-auto inline-flex items-center gap-1 text-xs">
                          <CoinIcon className="h-3.5 w-3.5" /> {selectedDef.upgradeCosts[lv - 2]}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex gap-2">
                {upgradeCost(selectedDef, selected.level) !== null ? (
                  <Button className="flex-1" icon={<ArrowUpCircle className="h-4 w-4" />} loading={pending} disabled={player.coins < (upgradeCost(selectedDef, selected.level) ?? 0)} onClick={doUpgrade}>
                    升级到 Lv.{selected.level + 1} · {upgradeCost(selectedDef, selected.level)} 金币
                  </Button>
                ) : (
                  <div className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-sun-100 px-4 py-2.5 text-sm font-semibold text-sun-600">
                    <Sparkles className="h-4 w-4" /> 已达最高等级 Lv.{maxLevel(selectedDef)}
                  </div>
                )}
                <Button
                  variant="secondary"
                  icon={<Move className="h-4 w-4" />}
                  loading={pending && pendingMove === selected.id}
                  onClick={() => {
                    setPendingMove(selected.id);
                    setPendingType(null);
                    setPendingBackpack(null);
                    toast({ kind: "info", title: `点击岛上要移到的空位` });
                    if (typeof window !== "undefined" && window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  移动
                </Button>
                {selected.type !== "cabin" && (
                  <Button variant="ghost" aria-label="收进背包" title="收进背包（保留等级，重新放置免费）" onClick={doRemove} disabled={pending} icon={<Trash2 className="h-4 w-4" />} />
                )}
              </div>
              {upgradeCost(selectedDef, selected.level) !== null && player.coins < (upgradeCost(selectedDef, selected.level) ?? 0) && (
                <p className="mt-2 text-center text-xs text-slate-400">
                  还差 {(upgradeCost(selectedDef, selected.level) ?? 0) - player.coins} 金币，
                  <Link href="/study" className="font-semibold text-ocean-600">
                    去学习赚金币
                  </Link>
                </p>
              )}
            </Card>
          ) : panel === "shop" ? (
            <Card className="flex max-h-[70vh] flex-col overflow-hidden lg:max-h-[calc(100dvh-200px)]">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                <div>
                  <div className="font-semibold">建筑商店</div>
                  <div className="text-xs text-slate-400">{pendingSlot ? `放置到 ${pendingSlot} 号空位` : `剩余 ${emptySlots.length} 个空位`}</div>
                </div>
                <button onClick={() => { setPanel("overview"); cancelPending(); }} className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100" aria-label="关闭">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-3">
                {island.backpack.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 px-2 pb-1.5 text-xs font-semibold uppercase tracking-wider text-sand-500">
                      <PackageOpen className="h-3.5 w-3.5" /> 背包（拆除的建筑 · 免费放置）
                    </div>
                    <div className="space-y-1.5">
                      {island.backpack.map((item) => {
                        const parsed = parseItemKey(item.itemKey);
                        const def = parsed ? getBuildingDef(parsed.type) : null;
                        if (!parsed || !def) return null;
                        const active = pendingBackpack === item.itemKey;
                        return (
                          <div key={item.itemKey} className={cn("flex items-center gap-3 rounded-2xl border p-2.5 transition", active ? "border-ocean-300 bg-ocean-50" : "border-slate-100 bg-white")}>
                            <BuildingPreview type={parsed.type} level={parsed.level} className="h-14 w-14 shrink-0 rounded-xl bg-leaf-50" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-semibold">{def.name}</span>
                                <Pill tone="ocean">Lv.{parsed.level}</Pill>
                                {item.qty > 1 && <Pill tone="slate">×{item.qty}</Pill>}
                              </div>
                              <div className="text-xs text-slate-400">免费放回岛上，等级保留</div>
                            </div>
                            <Button size="sm" variant={active ? "primary" : "soft"} disabled={emptySlots.length === 0 || pending} onClick={() => onBackpackPick(item.itemKey)}>
                              {active ? "放置中" : "放置"}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {(["building", "decoration"] as const).map((cat) => (
                  <div key={cat}>
                    <div className="px-2 pb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{cat === "building" ? "建筑" : "装饰"}</div>
                    <div className="space-y-1.5">
                      {BUILDING_CATALOG.filter((d) => d.category === cat && d.buildCost > 0).map((def) => {
                        const locked = player.level < def.unlockLevel;
                        const owned = ownedCount(def.type);
                        const soldOut = def.unique && owned > 0;
                        const affordable = player.coins >= def.buildCost;
                        const active = pendingType === def.type;
                        const disabled = locked || soldOut || !affordable || emptySlots.length === 0 || pending;
                        return (
                          <div key={def.type} className={cn("flex items-center gap-3 rounded-2xl border p-2.5 transition", active ? "border-ocean-300 bg-ocean-50" : "border-slate-100 bg-white", locked && "opacity-60")}>
                            <BuildingPreview type={def.type} level={1} className={cn("h-14 w-14 shrink-0 rounded-xl", locked ? "bg-slate-100 grayscale" : "bg-leaf-50")} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-semibold">{def.name}</span>
                                {owned > 0 && <Pill tone="leaf">已建 {owned}</Pill>}
                              </div>
                              <div className="truncate text-xs text-slate-400">{def.description}</div>
                              <div className="mt-1 flex items-center gap-2 text-xs">
                                <span className={cn("inline-flex items-center gap-1 font-semibold", affordable ? "text-ink" : "text-coral-500")}>
                                  <CoinIcon className="h-3.5 w-3.5" /> {def.buildCost}
                                </span>
                                {locked && (
                                  <span className="inline-flex items-center gap-0.5 text-slate-400">
                                    <Lock className="h-3 w-3" /> Lv.{def.unlockLevel}
                                  </span>
                                )}
                                {def.terrain === "beach" && <span className="text-sand-500">仅沙滩</span>}
                              </div>
                            </div>
                            <Button size="sm" variant={active ? "primary" : "soft"} disabled={disabled} onClick={() => onShopPick(def)}>
                              {soldOut ? "已拥有" : locked ? "未解锁" : active ? "放置中" : "建造"}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="p-5">
              <div className="font-semibold">岛屿概览</div>
              <div className="mt-4 space-y-3">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">建筑种类</span>
                    <span className="font-semibold">
                      {progress.ownedTypes}/{progress.totalTypes}
                    </span>
                  </div>
                  <ProgressBar value={progress.ownedTypes} max={progress.totalTypes} className="mt-1.5" barClassName="bg-leaf-500" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-xl font-bold">{progress.totalBuildings}</div>
                    <div className="text-xs text-slate-400">建筑数量</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <div className="text-xl font-bold">{progress.totalLevels}</div>
                    <div className="text-xs text-slate-400">总等级</div>
                  </div>
                </div>
                {progress.nextUnlock ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-ocean-50 p-3">
                    <BuildingPreview type={progress.nextUnlock.type} level={1} className="h-12 w-12 rounded-xl bg-white" />
                    <div className="text-sm">
                      <div className="font-semibold text-ocean-700">下一个解锁：{progress.nextUnlock.name}</div>
                      <div className="text-xs text-ocean-600/80">达到 Lv.{progress.nextUnlock.level} 即可建造（当前 Lv.{player.level}）</div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-sun-100 p-3 text-sm font-semibold text-sun-600">全部建筑已解锁！</div>
                )}
              </div>
              <div className="mt-4 space-y-2">
                <Button className="w-full" icon={<Store className="h-4 w-4" />} onClick={() => setPanel("shop")}>
                  打开商店
                </Button>
                <Link href="/study" className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-sun-400 text-sm font-medium text-ink transition hover:bg-sun-500">
                  <GraduationCap className="h-4 w-4" /> 学习赚金币
                </Link>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-slate-400">
                <Zap className="mr-1 inline h-3 w-3" />
                提示：点击岛上的建筑查看信息与升级；点击空位可以直接选择要建造的内容。
              </p>
            </Card>
          )}
        </div>
      </div>
      <ConfirmDialog state={confirm.state} onClose={confirm.close} />
    </div>
  );
}
