"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Droplets, LayoutGrid } from "lucide-react";
import type { GardenPlant } from "@/lib/game/model";
import { GARDEN_CAMERA, GRASS_GROUND, WorldCanvas } from "@/components/world/world-canvas";
import { buildGardenFrame, clampToPlot, layoutPlant } from "./garden-world";
import { clearPlantPositions, setPlantPosition, usePlantPositions } from "./plant-positions";

interface Props {
  plants: GardenPlant[];
  selectedId: number | null;
  onSelect: (plant: GardenPlant) => void;
}

/** P2：可旋转的低多边形花圃；植株按熟练度长成 seed → bloom。 */
export function Garden3D({ plants, selectedId, onSelect }: Props) {
  const positions = usePlantPositions();
  const [wateringId, setWateringId] = useState<number | null>(null);

  useEffect(() => {
    if (wateringId === null) return;
    const timer = window.setTimeout(() => setWateringId(null), 1800);
    return () => window.clearTimeout(timer);
  }, [wateringId]);

  const build = useCallback(
    (time: number) => buildGardenFrame({ plants, positions, selectedId, wateringId, time }),
    [plants, positions, selectedId, wateringId],
  );

  const onPick = useCallback(
    (id: string) => {
      const plant = plants.find((p) => `p:${p.id}` === id);
      if (plant) onSelect(plant);
    },
    [plants, onSelect],
  );

  const onMove = useCallback(
    (id: string, dx: number, dz: number) => {
      const plantId = Number(id.slice(2));
      const index = plants.findIndex((p) => p.id === plantId);
      if (index < 0) return;
      const cur = positions[plantId] ?? layoutPlant(index, plants.length);
      setPlantPosition(plantId, clampToPlot({ x: cur.x + dx, z: cur.z + dz }));
    },
    [plants, positions],
  );

  const a11yItems = useMemo(
    () => plants.map((p) => ({ id: `p:${p.id}`, label: `${p.word} ${p.meaning}，查看单词详情` })),
    [plants],
  );

  return (
    <div className="space-y-2">
      <WorldCanvas
        build={build}
        onPick={onPick}
        onMove={onMove}
        selectedId={selectedId === null ? null : `p:${selectedId}`}
        a11yItems={a11yItems}
        groundColors={GRASS_GROUND}
        camera={GARDEN_CAMERA}
        hint="拖拽旋转视角 · 拖动植株挪位 · 点击植株查看单词"
      />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          disabled={plants.length === 0}
          onClick={() => setWateringId(selectedId ?? plants[0]?.id ?? null)}
          className="inline-flex items-center gap-1.5 rounded-full bg-ocean-50 px-3 py-1.5 font-medium text-ocean-700 hover:bg-ocean-100 disabled:opacity-50"
          title="浇水只是场景演示；真正让植株生长的是答题正确率"
        >
          <Droplets className="h-3.5 w-3.5" /> 浇水演示
        </button>
        <Link href="/study" className="inline-flex items-center gap-1.5 rounded-full bg-leaf-50 px-3 py-1.5 font-medium text-leaf-700 hover:bg-leaf-100">
          <BookOpen className="h-3.5 w-3.5" /> 去复习，答对才会生长
        </Link>
        <button type="button" onClick={clearPlantPositions} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-200">
          <LayoutGrid className="h-3.5 w-3.5" /> 恢复默认摆放
        </button>
        <span className="text-slate-400">位置仅保存在本机浏览器，不影响学习数据</span>
      </div>
    </div>
  );
}
