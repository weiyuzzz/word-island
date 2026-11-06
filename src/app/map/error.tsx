"use client";

import RouteError from "@/components/route-error";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} title="探索地图加载失败" description="可能是数据库连接出了问题，请稍后重试。" />;
}
