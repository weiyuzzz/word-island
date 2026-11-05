"use client";

import { useEffect } from "react";
import Link from "next/link";
import { House, RotateCcw, TreePalm } from "lucide-react";
import { Button, Card } from "@/components/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Word Island Route Error]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-12">
      <Card className="p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ocean-50 text-ocean-600">
          <TreePalm className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-xl font-bold">页面加载遇到了一点波浪</h2>
        <p className="mt-2 text-sm text-slate-500">
          请点击下方按钮重新加载页面，或返回岛屿首页继续冒险。
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={() => reset()} icon={<RotateCcw className="h-4 w-4" />}>
            重新加载
          </Button>
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-ink hover:bg-slate-50"
          >
            <House className="h-4 w-4" /> 返回首页
          </Link>
        </div>
      </Card>
    </div>
  );
}
