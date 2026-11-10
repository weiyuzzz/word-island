import type { Metadata } from "next";
import { NotesView } from "@/components/reading/notes-view";
import { getNotesLibrary } from "@/server/reading";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "拾贝笔记" };

export default async function NotesPage() {
  const initial = await getNotesLibrary();
  return <NotesView initial={initial} />;
}
