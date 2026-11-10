"use client";

import { useCallback, useMemo } from "react";
import { ISLAND_SLOTS, type IslandSlot } from "@/lib/game/buildings";
import type { BuildingView } from "@/lib/types";
import { ISLAND_CAMERA, SEA_GROUND, WorldCanvas } from "@/components/world/world-canvas";
import { buildIslandFrame, islandA11yItems } from "./island-world";

interface Props {
  buildings: BuildingView[];
  selectedId: number | null;
  pendingType: string | null;
  popId: number | null;
  onSlotClick: (slot: IslandSlot) => void;
  onBuildingClick: (b: BuildingView) => void;
  residentColors?: string[];
  lockedSlotIds?: number[];
}

/** P2：可旋转的低多边形岛屿。点击空位 / 建筑仍走原来的建造与详情逻辑。 */
export function Island3D({ buildings, selectedId, pendingType, popId, onSlotClick, onBuildingClick, residentColors, lockedSlotIds }: Props) {
  const build = useCallback(
    (time: number) => buildIslandFrame({ buildings, selectedId, pendingType, popId, time, residentColors, lockedSlotIds }),
    [buildings, selectedId, pendingType, popId, residentColors, lockedSlotIds],
  );

  const onPick = useCallback(
    (id: string) => {
      if (id.startsWith("b:")) {
        const b = buildings.find((item) => `b:${item.id}` === id);
        if (b) onBuildingClick(b);
        return;
      }
      const slot = ISLAND_SLOTS.find((s) => `s:${s.id}` === id);
      if (slot) onSlotClick(slot);
    },
    [buildings, onBuildingClick, onSlotClick],
  );

  const a11yItems = useMemo(() => islandA11yItems(buildings), [buildings]);

  return (
    <WorldCanvas
      build={build}
      onPick={onPick}
      selectedId={selectedId === null ? null : `b:${selectedId}`}
      a11yItems={a11yItems}
      groundColors={SEA_GROUND}
      camera={ISLAND_CAMERA}
      hint="拖拽旋转视角 · 滚轮缩放 · 点击空位建造 / 点击建筑查看详情"
    />
  );
}
