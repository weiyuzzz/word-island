import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginPanel } from "@/components/auth/login-panel";
import { getSessionUser } from "@/server/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "登录" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  return <LoginPanel />;
}
