"use client";

import { useState, useTransition } from "react";
import { BookOpenText, Download, FilePlus2, Globe } from "lucide-react";
import { Button, Card, useToast } from "@/components/ui";
import { ingestArticlesAction, manualImportArticleAction } from "@/server/actions";

/** 书屿 · 文章池管理（仅管理员）：源抓取 + 手动导入 */

export function ReadingAdminCard({ pool }: { pool: { source: string; count: number }[] }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [busySource, setBusySource] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", topic: "", url: "", author: "", text: "" });
  const [importing, setImporting] = useState(false);

  const ingest = (source: "conversation" | "guardian" | "bbc" | "news", label: string) => {
    setBusySource(source);
    startTransition(async () => {
      const res = await ingestArticlesAction(source);
      setBusySource(null);
      if (res.ok) {
        toast({
          kind: "success",
          title: `${label}完成`,
          description: `抓取 ${res.data.fetched} 篇，新入库 ${res.data.inserted} 篇${res.data.errors.length ? `，${res.data.errors.length} 条问题` : ""}`,
        });
      } else {
        toast({ kind: "error", title: `${label}失败`, description: res.error });
      }
    });
  };

  const importManual = () => {
    setImporting(true);
    startTransition(async () => {
      const res = await manualImportArticleAction({ title: form.title, topic: form.topic || undefined, url: form.url || undefined, author: form.author || undefined, text: form.text });
      setImporting(false);
      if (res.ok) {
        toast({ kind: "success", title: `已导入「${form.title.trim()}」` });
        setForm({ title: "", topic: "", url: "", author: "", text: "" });
      } else {
        toast({ kind: "error", title: "导入失败", description: res.error });
      }
    });
  };

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">书屿 · 文章池</div>
          <p className="mt-1 text-xs text-slate-500">
            文章池：{pool.length > 0 ? pool.map((p) => `${p.source} ${p.count} 篇`).join(" · ") : "空"}。抓取源均为可合规转载的公开内容（The Conversation 为 CC 许可）。
          </p>
        </div>
        <BookOpenText className="h-5 w-5 text-ocean-500" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="soft" icon={<Download className="h-4 w-4" />} loading={busySource === "conversation"} disabled={pending} onClick={() => ingest("conversation", "抓取 The Conversation")}>
          抓 The Conversation
        </Button>
        <Button size="sm" variant="soft" icon={<Globe className="h-4 w-4" />} loading={busySource === "news"} disabled={pending} onClick={() => ingest("news", "抓取今日热点")}>
          抓今日热点（Guardian/BBC）
        </Button>
      </div>
      <details className="rounded-2xl bg-slate-50 p-3.5">
        <summary className="cursor-pointer text-sm font-medium text-slate-600">
          <FilePlus2 className="mr-1.5 inline h-4 w-4" />
          手动导入文章（雅思真题 / 自备素材）
        </summary>
        <div className="mt-3 space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="标题（必填）" className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-ocean-400" />
            <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="主题，如 education / science" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-ocean-400 sm:w-56" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="作者（选填）" className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-ocean-400" />
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="原文链接（选填）" className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-ocean-400" />
          </div>
          <textarea
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
            placeholder="正文全文（段落之间用空行分隔，至少 150 词）"
            rows={5}
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-ocean-400"
          />
          <Button size="sm" loading={importing} disabled={!form.title.trim() || form.text.trim().length < 100} onClick={importManual}>
            导入文章池
          </Button>
        </div>
      </details>
    </Card>
  );
}
