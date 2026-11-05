import type { Metadata } from "next";
import { VocabManager } from "@/components/vocab/vocab-manager";
import { listDecks } from "@/server/vocab";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "词库管理" };

export default async function VocabPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const decks = await listDecks();
  const deckParam = typeof params.deck === "string" ? Number(params.deck) : NaN;
  const initialDeckId = Number.isFinite(deckParam) && decks.some((d) => d.id === deckParam) ? deckParam : null;
  return <VocabManager initialDecks={decks} initialDeckId={initialDeckId} />;
}
