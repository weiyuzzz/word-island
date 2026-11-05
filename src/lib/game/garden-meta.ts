import type { GardenStage } from "@/lib/game/model";

/** 词汇花园：单词成长阶段（纯逻辑，可在客户端使用） */
export const STAGE_META: Record<GardenStage, { label: string; note: string }> = {
  seed: { label: "种子", note: "第一次答对后种下" },
  sprout: { label: "发芽", note: "复习成功，开始生长" },
  sapling: { label: "小树苗", note: "多次成功回忆" },
  tree: { label: "大树", note: "接近掌握" },
  bloom: { label: "开花", note: "长期稳定掌握" },
};

export const STAGE_ORDER: GardenStage[] = ["seed", "sprout", "sapling", "tree", "bloom"];

export function stageOf(p: { status: string; proficiency: number; streak: number; correctCount: number }): GardenStage {
  if (p.status === "mastered" && (p.streak >= 6 || p.proficiency >= 95)) return "bloom";
  if (p.status === "mastered" || p.proficiency >= 85) return "tree";
  if (p.proficiency >= 55) return "sapling";
  if (p.proficiency >= 25) return "sprout";
  return "seed";
}
