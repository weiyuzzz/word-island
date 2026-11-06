"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, ChartColumn, Compass, GraduationCap, House, Sprout, TreePalm, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
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

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [immersive, setImmersive] = useState(false);
  const ctx = useMemo(() => ({ immersive, setImmersive }), [immersive]);

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
            </nav>
            <div className="mt-auto rounded-2xl bg-sand-50 p-4 text-xs leading-relaxed text-slate-500">
              <p className="font-semibold text-slate-700">学习 → 奖励 → 建设</p>
              <p className="mt-1">每天学一点，你的小岛就会一天天长大。</p>
            </div>
          </aside>

          <div className="flex min-h-dvh flex-col">
            {/* Mobile header */}
            {!immersive && (
              <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 py-3 backdrop-blur md:hidden">
                <Logo />
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
