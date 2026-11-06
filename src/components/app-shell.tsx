"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { BookOpen, ChartColumn, Compass, GraduationCap, House, LogOut, ShieldCheck, Sprout, TreePalm, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions";
import { ImmersiveCtx, ToastProvider } from "./ui";

const NAV = [
  { href: "/", label: "首页", icon: House },
  { href: "/map", label: "探索", icon: Compass },
  { href: "/study", label: "学习", icon: GraduationCap },
  { href: "/island", label: "岛屿", icon: TreePalm },
  { href: "/garden", label: "花园", icon: Sprout },
  { href: "/vocab", label: "词库", icon: BookOpen },
  { href: "/stats", label: "统计", icon: ChartColumn },
  { href: "/achievements", label: "成就", icon: Trophy },
];

interface ShellUser {
  username: string;
  role: string;
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-ocean-400 to-leaf-400 text-white shadow-soft">
        <TreePalm className="h-5 w-5" />
      </span>
      <span className="leading-tight">
        <span className="block text-base font-bold tracking-tight">Word Island</span>
        <span className="block text-[11px] text-slate-500">单词岛屿</span>
      </span>
    </Link>
  );
}

export function AppShell({ children, user }: { children: ReactNode; user: ShellUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [immersive, setImmersive] = useState(false);
  const [pending, startTransition] = useTransition();
  const ctx = useMemo(() => ({ immersive, setImmersive }), [immersive]);

  const logout = () => {
    startTransition(async () => {
      await logoutAction();
      router.replace("/login");
      router.refresh();
    });
  };

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Unregister any stale service workers and clear old caches that could block navigation
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.update().catch(() => {})))
        .catch(() => {});
      if ("caches" in window) {
        caches
          .keys()
          .then((keys) => keys.filter((k) => k === "word-island-v1").forEach((k) => caches.delete(k)))
          .catch(() => {});
      }
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      }
    }
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <ToastProvider>
      <ImmersiveCtx.Provider value={ctx}>
        <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
          {/* Desktop sidebar */}
          <aside className="hidden md:flex md:flex-col md:sticky md:top-0 md:h-dvh border-r border-slate-200/70 bg-white/70 px-4 py-6 backdrop-blur">
            <Logo />
            <nav className="mt-8 flex flex-col gap-1">
              {NAV.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition",
                      active ? "bg-ocean-500 text-white shadow-[0_8px_20px_-8px_rgba(43,138,214,0.7)]" : "text-slate-600 hover:bg-slate-100",
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
              {user?.role === "admin" && (
                <Link
                  href="/admin"
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition",
                    isActive("/admin") ? "bg-ocean-500 text-white shadow-[0_8px_20px_-8px_rgba(43,138,214,0.7)]" : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  <ShieldCheck className="h-5 w-5" />
                  后台管理
                </Link>
              )}
            </nav>
            <div className="mt-auto space-y-3">
              {user && (
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-2.5">
                  <span className="min-w-0 truncate text-xs font-semibold text-slate-600">{user.username}</span>
                  <button
                    type="button"
                    onClick={logout}
                    disabled={pending}
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100"
                  >
                    <LogOut className="h-3.5 w-3.5" /> 退出
                  </button>
                </div>
              )}
              <div className="rounded-2xl bg-sand-50 p-4 text-xs leading-relaxed text-slate-500">
                <p className="font-semibold text-slate-700">学习 → 奖励 → 建设</p>
                <p className="mt-1">每天学一点，你的小岛就会一天天长大。</p>
              </div>
            </div>
          </aside>

          <div className="flex min-h-dvh flex-col">
            {/* Mobile header */}
            {!immersive && (
              <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur md:hidden">
                <Logo />
                {user && (
                  <button
                    type="button"
                    onClick={logout}
                    disabled={pending}
                    className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs text-slate-500 transition hover:bg-slate-100"
                  >
                    <LogOut className="h-3.5 w-3.5" /> 退出
                  </button>
                )}
              </header>
            )}
            <main className={cn("mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-8 md:py-8", !immersive && "pb-28 md:pb-10")}>{children}</main>
          </div>
        </div>

        {/* Mobile bottom nav */}
        {!immersive && (
          <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white/90 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <ul className="grid grid-cols-8">
              {NAV.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link href={item.href} className={cn("flex min-h-[60px] flex-col items-center justify-center gap-1 text-[10px] font-medium", active ? "text-ocean-600" : "text-slate-500")}>
                      <span className={cn("grid h-7 w-9 place-items-center rounded-xl transition", active && "bg-ocean-50")}>
                        <item.icon className="h-5 w-5" />
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </ImmersiveCtx.Provider>
    </ToastProvider>
  );
}
