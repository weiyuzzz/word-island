"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowUpRight, Brain, ChevronDown, NotebookPen, Sparkles, Trash2 } from "lucide-react";
import { Button, Card, EmptyState, Pill, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { NOTE_TYPE_LABEL, type NoteType } from "@/lib/reading/text";
import { deleteNoteAction, noteFamiliarityAction } from "@/server/actions";
import type { NotesLibrary } from "@/server/reading";

/** 拾贝笔记 · 知识库整理视图：熟悉度驱动排序 + 复现归并 + 出处回链 */

const FAM_TABS = [
  { key: "all", label: "全部" },
  { key: "forgotten", label: "遗忘" },
  { key: "unmarked", label: "未标记" },
  { key: "ok", label: "一般" },
  { key: "familiar", label: "熟悉" },
] as const;

const TYPE_TABS = ["all", ...Object.keys(NOTE_TYPE_LABEL)] as const;

const FAM_TONE: Record<string, "coral" | "slate" | "sun" | "leaf"> = {
  forgotten: "coral",
  unmarked: "slate",
  ok: "sun",
  familiar: "leaf",
};

const FAM_LABEL: Record<string, string> = { forgotten: "遗忘", unmarked: "未标记", ok: "一般", familiar: "熟悉" };

export function NotesView({ initial }: { initial: NotesLibrary }) {
  const router = useRouter();
  const toast = useToast();
  const [groups, setGroups] = useState(initial.groups);
  const [fam, setFam] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [expanded, setExpanded] = useState<number[]>([]);

  const filtered = useMemo(
    () => groups.filter((g) => (fam === "all" || g.familiarity === fam) && (type === "all" || g.noteType === type)),
    [groups, fam, type],
  );
  // 「熟悉」组默认折叠区（列表沉底）
  const active = filtered.filter((g) => g.familiarity !== "familiar");
  const mastered = filtered.filter((g) => g.familiarity === "familiar");

  const mark = async (g: (typeof groups)[number], familiarity: "familiar" | "ok" | "forgotten" | "unmarked") => {
    const res = await noteFamiliarityAction(g.ids, familiarity);
    if (!res.ok) {
      toast({ kind: "error", title: "标记失败", description: res.error });
      return;
    }
    setGroups((prev) => prev.map((x) => (x.key === g.key ? { ...x, familiarity } : x)));
    router.refresh();
  };

  const remove = async (g: (typeof groups)[number]) => {
    let ok = true;
    for (const id of g.ids) {
      const res = await deleteNoteAction(id);
      if (!res.ok) ok = false;
    }
    if (ok) {
      setGroups((prev) => prev.filter((x) => x.key !== g.key));
      toast({ kind: "success", title: `已删除${g.occurrences.length > 1 ? `（含 ${g.occurrences.length} 处）` : ""}` });
      router.refresh();
    }
  };

  if (initial.stats.total === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold tracking-tight">拾贝笔记</h1>
        <EmptyState
          icon={<NotebookPen className="h-6 w-6" />}
          title="还没有笔记"
          description="去书屿读一篇文章，划词即可记录表达、词组、语法和长难句"
          action={
            <Link href="/reading">
              <Button>去阅读</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">拾贝笔记</h1>
          <p className="mt-1 text-sm text-slate-500">阅读中划下的表达、词组、语法与长难句都在这里，标记熟悉度即可沉淀。</p>
        </div>
        <Link href="/reading" className="text-sm font-medium text-ocean-600 hover:underline">
          ← 回书屿
        </Link>
      </header>

      {/* 统计条 */}
      <div className="flex flex-wrap gap-2">
        <Pill tone="ocean">共 {initial.stats.total} 条</Pill>
        {(Object.keys(NOTE_TYPE_LABEL) as NoteType[]).map((t) =>
          initial.stats.byType[t] ? (
            <Pill key={t} tone="slate">
              {NOTE_TYPE_LABEL[t]} {initial.stats.byType[t]}
            </Pill>
          ) : null,
        )}
        {initial.stats.byFamiliarity.forgotten > 0 && <Pill tone="coral">遗忘 {initial.stats.byFamiliarity.forgotten}</Pill>}
      </div>

      {/* 筛选 */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {FAM_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setFam(t.key)}
              className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition", fam === t.key ? "bg-ink text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TYPE_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition", type === t ? "bg-ocean-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}
            >
              {t === "all" ? "全部类型" : NOTE_TYPE_LABEL[t as NoteType]}
            </button>
          ))}
        </div>
      </div>

      {/* 笔记组列表 */}
      {active.length === 0 && mastered.length === 0 ? (
        <EmptyState icon={<NotebookPen className="h-6 w-6" />} title="这个筛选下没有笔记" />
      ) : (
        <div className="space-y-2.5">
          {active.map((g) => {
            const open = expanded.includes(g.ids[0]);
            return (
              <Card key={g.key} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill tone="ocean">{NOTE_TYPE_LABEL[g.noteType]}</Pill>
                      <Pill tone={FAM_TONE[g.familiarity]}>{FAM_LABEL[g.familiarity]}</Pill>
                      {g.occurrences.length > 1 && <Pill tone="sun">复现 ×{g.occurrences.length}</Pill>}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-medium leading-relaxed">{g.occurrences[0].quote}</p>
                    {g.content && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{g.content}</p>}
                    <button
                      onClick={() => setExpanded((prev) => (open ? prev.filter((x) => x !== g.ids[0]) : [...prev, g.ids[0]]))}
                      className="mt-2 inline-flex items-center gap-0.5 text-xs text-slate-400 hover:text-ocean-600"
                    >
                      <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
                      {open ? "收起" : `展开 ${g.occurrences.length > 1 ? `${g.occurrences.length} 处出处` : "详情"}`}
                    </button>
                    {open && (
                      <div className="mt-2 space-y-2">
                        {g.occurrences.map((o, i) => (
                          <Link
                            key={i}
                            href={`/reading/${o.articleId}#p${o.paragraphIndex}`}
                            className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 transition hover:bg-ocean-50"
                          >
                            <span className="min-w-0 truncate">《{o.articleTitle}》 {o.createdAt.slice(0, 10)}</span>
                            <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                          </Link>
                        ))}
                        {g.aiAnalysis && (
                          <div className="whitespace-pre-wrap rounded-xl bg-ocean-50/60 px-3 py-2.5 text-xs leading-relaxed text-ink">
                            <span className="mb-1 flex items-center gap-1 font-semibold text-ocean-600">
                              <Sparkles className="h-3 w-3" /> AI 解析
                            </span>
                            {g.aiAnalysis}
                          </div>
                        )}
                        {g.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {g.tags.map((t) => (
                              <Pill key={t} tone="slate">{t}</Pill>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <div className="flex gap-1">
                      {(["familiar", "ok", "forgotten"] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => void mark(g, f)}
                          title={`标记为${FAM_LABEL[f]}`}
                          className={cn(
                            "rounded-full px-2 py-1 text-[11px] font-medium transition",
                            g.familiarity === f ? "bg-ink text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                          )}
                        >
                          {FAM_LABEL[f]}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => void remove(g)} className="grid h-7 w-7 place-items-center rounded-full text-slate-300 transition hover:bg-coral-50 hover:text-coral-500" title="删除">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}

          {mastered.length > 0 && (
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl bg-leaf-50 px-4 py-3 text-sm font-medium text-leaf-700">
                <Brain className="h-4 w-4" />
                已熟悉 {mastered.length} 条（点击展开）
                <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
              </summary>
              <div className="mt-2 space-y-2">
                {mastered.map((g) => (
                  <div key={g.key} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm shadow-soft">
                    <span className="min-w-0 truncate text-slate-500">{g.occurrences[0].quote}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <Pill tone="slate">{NOTE_TYPE_LABEL[g.noteType]}</Pill>
                      <button onClick={() => void mark(g, "ok")} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-200">
                        撤回
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
