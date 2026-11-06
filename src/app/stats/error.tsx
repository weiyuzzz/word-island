"use client";

import RouteError from "@/components/route-error";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} title="统计数据加载失败" description="可能是统计数据加载出错，请稍后重试。" />;
}
