import { db } from "@/db";
import { wordProgress, words } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { GardenPlant, GardenStage } from "@/lib/game/model";
import { STAGE_META, stageOf } from "@/lib/game/garden-meta";
import { ensureSeeded } from "./player";

export { STAGE_META, stageOf };

export async function getGarden(filter: GardenStage | "all" = "all") {
  await ensureSeeded();
  const rows = await db
    .select({ w: words, p: wordProgress })
    .from(wordProgress)
    .innerJoin(words, eq(words.id, wordProgress.wordId))
    .where(and(gte(wordProgress.correctCount, 1), filter === "all" ? undefined : sql`${wordProgress.status} = ${filter === "bloom" ? "mastered" : wordProgress.status}`))
    .orderBy(desc(wordProgress.proficiency), desc(wordProgress.correctCount))
    .limit(300);

  const plants: GardenPlant[] = rows.map(({ w, p }) => ({
    id: w.id,
    word: w.word,
    meaning: w.meaning,
    phonetic: w.phonetic,
    pos: w.pos,
    example: w.example,
    translation: w.translation,
    stage: stageOf(p),
    proficiency: p.proficiency,
    streak: p.streak,
    correctCount: p.correctCount,
    wrongCount: p.wrongCount,
    status: p.status as GardenPlant["status"],
    nextReviewAt: p.nextReviewAt?.toISOString() ?? null,
    lastReviewedAt: p.lastReviewedAt?.toISOString() ?? null,
  }));

  const counts: Record<GardenStage, number> = { seed: 0, sprout: 0, sapling: 0, tree: 0, bloom: 0 };
  for (const p of plants) counts[p.stage] += 1;

  return {
    plants: filter === "all" ? plants : plants.filter((p) => p.stage === filter),
    counts,
    total: plants.length,
  };
}
