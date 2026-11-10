"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BookOpenText, Clock3, Flame, Newspaper, RefreshCw, Sparkles, CheckCircle2 } from "lucide-react";
import { Button, Card, EmptyState, Pill, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { replaceDeliveryAction } from "@/server/actions";
import type { ReadingToday } from "@/server/reading";

/** 书屿 · 今日三槽位推送视图 */

const SLOT_ICON = { deep: Sparkles, broad: BookOpenText, news: Newspaper } as const;
const SLOT_DESC: Record<string, string> = {
  deep: "与你正在学的单词高度相关",
  broad: "难度匹配你的阅读水平",
  news: "今日热点，不参考学习进度",
};

const STATUS_LABEL: Record<string, string> = { unread: "未读", reading: "在读", finished: "已读完", empty: "暂无" };

function levelStars(level: number) {
  return "●".repeat(level) + "○".repeat(Math.max(0, 5 - level));
}

export function ReadingTodayView({ initial }: { initial: ReadingToday }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [replacing, setReplacing] = useState<string | null>(null);

  const replace = (slot: "deep" | "broad" | "news") => {
    setReplacing(slot);
    startTransition(async () => {
      const res = await replaceDeliveryAction(slot);
      setReplacing(null);
      if (res.ok) {
        toast({ kind: "success", title: "已换一篇" });
        router.refresh();
      } else {
        toast({ kind: "error", title: "换一篇失败", description: res.error });
      }
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">书屿 · 每日三读</h1>
          <p className="mt-1 text-sm text-slate-500">精读巩固学习词，泛读拓宽视野，热读追今日新闻。读完拿 {150} 金币。</p>
        </div>
        <Link href="/notes" className="text-sm font-medium text-ocean-600 hover:underline">
          拾贝笔记 →
        </Link>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {initial.today.map((d) => {
          const Icon = SLOT_ICON[d.slot as keyof typeof SLOT_ICON];
          const empty = d.status === "empty";
          return (
            <Card key={d.slot} className={cn("flex flex-col p-5", empty && "items-center justify-center border-dashed")}>
              {empty ? (
                <>
                  <Icon className="h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm text-slate-400">文章池空了</p>
                  <p className="mt-1 text-xs text-slate-400">请管理员在后台抓取或导入文章</p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ocean-600">
                      <Icon className="h-4 w-4" />
                      {SLOT_DESC[d.slot] ? "" : ""}
                      {d.slot === "deep" ? "精读 · 学以致用" : d.slot === "broad" ? "泛读 · 拓展视野" : "热读 · 今日热点"}
                    </span>
                    <Pill tone={d.status === "finished" ? "leaf" : d.status === "reading" ? "sun" : "slate"}>{STATUS_LABEL[d.status]}</Pill>
                  </div>
                  <Link href={`/reading/${d.article.id}`} className="mt-3 line-clamp-3 text-base font-semibold leading-snug hover:text-ocean-600">
                    {d.article.title}
                  </Link>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <Pill tone="slate">{d.article.source === "conversation" ? "The Conversation" : d.article.source === "guardian" ? "The Guardian" : d.article.source === "bbc" ? "BBC" : "导入"}</Pill>
                    <Pill tone="ocean">{d.article.topic}</Pill>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {Math.max(1, Math.round(d.article.wordCount / 220))} 分钟
                    </span>
                    <span title={`难度 ${d.article.level}/5`} className="font-mono text-[10px] tracking-tighter text-sun-500">
                      {levelStars(d.article.level)}
                    </span>
                  </div>
                  {d.reason && (
                    <p className="mt-2.5 line-clamp-2 rounded-xl bg-ocean-50/60 px-2.5 py-1.5 text-xs text-ocean-700">💡 {d.reason}</p>
                  )}
                  <div className="mt-auto flex items-center gap-2 pt-4">
                    <Link href={`/reading/${d.article.id}`} className="flex-1">
                      <Button size="sm" variant={d.status === "finished" ? "secondary" : "primary"} className="w-full">
                        {d.status === "finished" ? "再读一遍" : d.status === "reading" ? "继续阅读" : "开始阅读"}
                      </Button>
                    </Link>
                    {d.status !== "finished" && (
                      <Button size="sm" variant="ghost" loading={replacing === d.slot} onClick={() => replace(d.slot as "deep" | "broad" | "news")}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          <Flame className="h-4 w-4 text-coral-500" />
          往期阅读
        </h2>
        {initial.history.length === 0 ? (
          <EmptyState icon={<BookOpenText className="h-6 w-6" />} title="还没有历史阅读" description="今天读完第一篇后，这里会记录你的阅读足迹" />
        ) : (
          <Card className="divide-y divide-slate-100">
            {initial.history.map((h) => (
              <Link key={h.id} href={`/reading/${h.article.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50">
                {h.status === "finished" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-leaf-500" /> : <div className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-200" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{h.article.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                    <span>{h.deliverDate}</span>
                    <span>·</span>
                    <span>{h.slot === "deep" ? "精读" : h.slot === "broad" ? "泛读" : "热读"}</span>
                    <span>·</span>
                    <span>{h.article.wordCount} 词</span>
                  </div>
                </div>
                {h.status === "reading" && <Pill tone="sun">在读</Pill>}
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
