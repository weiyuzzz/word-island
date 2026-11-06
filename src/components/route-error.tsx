"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";

export default function RouteError({
  error,
  reset,
  title = "页面加载遇到了一点波浪",
  description = "请点击下方按钮重新加载页面，或返回首页继续冒险。",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
}) {
  useEffect(() => {
    console.error("[Route Error]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-12">
      <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-soft">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ocean-50 text-ocean-600">
          <RotateCcw className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
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
            返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
