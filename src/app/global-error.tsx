"use client";

import { useEffect } from "react";
import Link from "next/link";
import { House, RotateCcw, TreePalm } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Word Island Global Error]", error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <div className="mx-auto max-w-lg py-16 px-4">
          <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-soft">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-coral-100 text-coral-600">
              <TreePalm className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-xl font-bold">小岛遇到了风暴</h2>
            <p className="mt-2 text-sm text-slate-500">
              应用出现了严重错误，请尝试重新加载。如果问题持续，可以返回首页继续。
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={() => reset()}
                className="inline-flex h-11 items-center gap-2 rounded-2xl bg-ocean-500 px-4 text-sm font-medium text-white hover:bg-ocean-600"
              >
                <RotateCcw className="h-4 w-4" /> 重新加载
              </button>
              <Link
                href="/"
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-ink hover:bg-slate-50"
              >
                <House className="h-4 w-4" /> 返回首页
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
