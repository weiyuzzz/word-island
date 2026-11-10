import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPanel } from "@/components/auth/admin-panel";
import { audioStats } from "@/server/audio";
import { listUsersForAdmin } from "@/server/auth";
import { articlePoolStats } from "@/server/reading-source";
import { getSessionUser } from "@/server/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "后台管理" };

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) notFound();
  if (user.role !== "admin") notFound();
  const [users, pool, audio] = await Promise.all([listUsersForAdmin(), articlePoolStats(), audioStats()]);
  return <AdminPanel currentUserId={user.id} initialUsers={users} pool={pool} initialAudioStats={audio} />;
}
