import type { Metadata } from "next";
import { StudyLauncher } from "@/components/study/study-launcher";
import type { SessionKind } from "@/lib/types";
import { countDue } from "@/server/study";
import { listDecks } from "@/server/vocab";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "开始学习" };

export default async function StudyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const deckParam = typeof params.deck === "string" ? Number(params.deck) : NaN;
  const kindParam = typeof params.kind === "string" ? params.kind : "mixed";
  const kind: SessionKind = kindParam === "review" || kindParam === "new" ? kindParam : "mixed";

  const [decks, totals] = await Promise.all([listDecks(), countDue(null)]);
  const initialDeckId = Number.isFinite(deckParam) && decks.some((d) => d.id === deckParam) ? deckParam : null;
  const initialKind: SessionKind = kind === "review" && totals.due === 0 ? "mixed" : kind;

  return <StudyLauncher decks={decks} initialDeckId={initialDeckId} initialKind={initialKind} totals={totals} />;
}
