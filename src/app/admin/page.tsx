import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminPanel } from "@/components/auth/admin-panel";
import { listUsersForAdmin } from "@/server/auth";
import { getSessionUser } from "@/server/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "后台管理" };

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) notFound();
  if (user.role !== "admin") notFound();
  const users = await listUsersForAdmin();
  return <AdminPanel currentUserId={user.id} initialUsers={users} />;
}
