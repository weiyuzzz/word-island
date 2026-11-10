"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { AlertCircle, BookOpen, Download, FolderPlus, Loader2, Pencil, Play, Plus, RotateCcw, Search, Share2, Trash2, Upload, X } from "lucide-react";
import type { DeckSummary, ImportResult, WordStatus, WordView } from "@/lib/types";
import { STATUS_META, proficiencyLabel } from "@/lib/game/srs";
import { BUILTIN_DECKS } from "@/data/vocabulary";
import type { ImportFormat, WordInput } from "@/lib/vocab/parse";
import { cn, formatRelativeTime, percent } from "@/lib/utils";
import { addWordAction, createDeckAction, deleteDeckAction, deleteWordAction, exportDeckAction, getWordsAction, listDecksAction, restoreBuiltinDeckAction, shareDeckAction, updateWordAction } from "@/server/actions";
import { Button, Card, EmptyState, Modal, Pill, ProgressBar, STATUS_TONE, SpeakButton, useToast } from "../ui";
import { ConfirmDialog, useConfirm } from "../confirm-dialog";
import { ImportDialog } from "./import-dialog";

const STATUS_FILTERS: { key: WordStatus | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "new", label: "未学习" },
  { key: "learning", label: "学习中" },
  { key: "review", label: "复习中" },
  { key: "mastered", label: "已掌握" },
];

const EMPTY_FORM: WordInput = { word: "", phonetic: "", pos: "", meaning: "", example: "", translation: "", difficulty: 2 };

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function VocabManager({ initialDecks, initialDeckId }: { initialDecks: DeckSummary[]; initialDeckId: number | null }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [decks, setDecks] = useState(initialDecks);
  const [deckId, setDeckId] = useState<number | null>(initialDeckId ?? initialDecks[0]?.id ?? null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState<WordStatus | "all">("all");
  const [wrongOnly, setWrongOnly] = useState(false);
  const [data, setData] = useState<{ items: WordView[]; total: number }>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE = 48;

  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [share, setShare] = useState<{ name: string; content: string } | null>(null);
  const [detail, setDetail] = useState<WordView | null>(null);
  const [editing, setEditing] = useState<{ id: number | null; form: WordInput } | null>(null);
  const [pending, startTransition] = useTransition();

  const deck = decks.find((d) => d.id === deckId) ?? null;
  const isCustom = deck?.kind === "custom";

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // 筛选条件变化时把分页重置到第一页：用 React 推荐的「渲染期调整派生状态」写法，
  // 避免在 effect 里同步 setState 造成额外的整页渲染。
  const filterKey = `${deckId}|${debouncedQ}|${status}|${wrongOnly}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setPage(0);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getWordsAction({ deckId, q: debouncedQ, status, wrongOnly, limit: PAGE, offset: page * PAGE });
    setLoading(false);
    if (!res.ok) return toast({ kind: "error", title: res.error });
    setData(res.data);
  }, [deckId, debouncedQ, status, wrongOnly, page, toast]);

  useEffect(() => {
    // 词库数据来自服务端（外部系统），依赖变化时必须重新拉取；
    // load 会立即把 loading 置为 true 以显示骨架屏，这是刻意的同步副作用。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const refreshDecks = useCallback(async () => {
    const res = await listDecksAction();
    if (res.ok) setDecks(res.data);
  }, []);

  const onImported = (result: ImportResult) => {
    void refreshDecks();
    if (result.deckId) setDeckId(result.deckId);
    void load();
  };

  const createDeck = () => {
    startTransition(async () => {
      const res = await createDeckAction(newDeckName, "");
      if (!res.ok) return toast({ kind: "error", title: res.error });
      setCreateOpen(false);
      setNewDeckName("");
      await refreshDecks();
      setDeckId(res.data.id);
      toast({ kind: "success", title: `已创建词库「${res.data.name}」` });
    });
  };

  const removeDeck = () => {
    if (!deck) return;
    const isBuiltin = deck.kind === "builtin";
    const isleNote = isBuiltin ? "注意：群岛的邻岛解锁进度基于内置词书的已学词数，删除后对应邻岛会回落到锁定状态（重新学满后可再次解锁）。" : "";
    confirm.confirm({
      title: `删除词书「${deck.name}」`,
      description: `将永久删除词书里的 ${deck.total} 个单词，以及它们的学习进度、间隔复习计划和答题记录，且无法恢复。历史学习场次会保留（只显示词书名）。${isleNote}删除后可用「恢复内置词书」按官方词表重新导入（进度从零开始）。`,
      confirmLabel: "删除",
      variant: "danger",
      onConfirm: () => {
        startTransition(async () => {
          const res = await deleteDeckAction(deck.id);
          if (!res.ok) return toast({ kind: "error", title: res.error });
          await refreshDecks();
          setDeckId(decks.find((d) => d.id !== deck.id)?.id ?? null);
          toast({ kind: "info", title: "词书已删除" });
        });
      },
    });
  };

  const restoreDeck = (slug: string, name: string) => {
    startTransition(async () => {
      const res = await restoreBuiltinDeckAction(slug);
      if (!res.ok) return toast({ kind: "error", title: res.error });
      await refreshDecks();
      setDeckId(res.data.deckId);
      toast({ kind: "success", title: `已恢复「${name}」`, description: `重新导入 ${res.data.wordCount} 个单词，学习进度从零开始` });
    });
  };

  const exportDeck = (format: ImportFormat) => {
    if (!deck) return;
    startTransition(async () => {
      const res = await exportDeckAction(deck.id, format);
      if (!res.ok) return toast({ kind: "error", title: res.error });
      download(res.data.filename, res.data.content, res.data.mime);
      toast({ kind: "success", title: `已导出 ${res.data.filename}` });
    });
  };

  const shareCustomDeck = () => {
    if (!deck) return;
    startTransition(async () => {
      const res = await shareDeckAction(deck.id);
      if (!res.ok) return toast({ kind: "error", title: res.error });
      setShare({ name: res.data.name, content: res.data.content });
    });
  };

  const copyShare = () => {
    if (!share) return;
    navigator.clipboard
      .writeText(share.content)
      .then(() => toast({ kind: "success", title: "已复制到剪贴板" }))
      .catch(() => toast({ kind: "error", title: "复制失败，请手动选择文本复制" }));
  };

  const saveWord = () => {
    if (!editing) return;
    startTransition(async () => {
      const res = editing.id ? await updateWordAction(editing.id, editing.form) : deckId ? await addWordAction(deckId, editing.form) : null;
      if (!res) return;
      if (!res.ok) return toast({ kind: "error", title: res.error });
      toast({ kind: "success", title: editing.id ? "单词已更新" : `已添加「${editing.form.word}」` });
      setEditing(null);
      setDetail(null);
      await load();
      void refreshDecks();
    });
  };

  const removeWord = (w: WordView) => {
    confirm.confirm({
      title: `删除单词「${w.word}」`,
      description: `确定删除单词「${w.word}」吗？`,
      confirmLabel: "删除",
      variant: "danger",
      onConfirm: () => {
        startTransition(async () => {
          const res = await deleteWordAction(w.id);
          if (!res.ok) return toast({ kind: "error", title: res.error });
          setDetail(null);
          await load();
          void refreshDecks();
          toast({ kind: "info", title: "单词已删除" });
        });
      },
    });
  };

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE));
  const builtin = useMemo(() => decks.filter((d) => d.kind === "builtin"), [decks]);
  const custom = useMemo(() => decks.filter((d) => d.kind === "custom"), [decks]);

  const DeckItem = ({ d }: { d: DeckSummary }) => (
    <button type="button" onClick={() => setDeckId(d.id)} className={cn("w-full rounded-2xl border p-3 text-left transition", deckId === d.id ? "border-ocean-400 bg-ocean-50" : "border-slate-100 bg-white hover:border-ocean-200")}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{d.name}</span>
        {d.due > 0 && <Pill tone="coral">{d.due} 待复习</Pill>}
      </div>
      <ProgressBar value={d.learned} max={d.total} className="mt-2" height="h-1.5" barClassName="bg-leaf-400" />
      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
        <span>
          已学 {d.learned}/{d.total}
        </span>
        <span>掌握 {d.mastered}</span>
      </div>
    </button>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      {/* Deck list */}
      <aside className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">词库</h1>
          <div className="flex gap-1.5">
            <Button size="sm" variant="secondary" icon={<FolderPlus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              新建
            </Button>
            <Button size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
              导入
            </Button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar lg:block lg:space-y-2 lg:overflow-visible">
          <div className="hidden text-xs font-semibold uppercase tracking-wider text-slate-400 lg:block">内置词库</div>
          {builtin.map((d) => (
            <div key={d.id} className="w-56 shrink-0 lg:w-auto">
              <DeckItem d={d} />
            </div>
          ))}
          {BUILTIN_DECKS.filter((def) => !decks.some((d) => d.slug === def.slug)).map((def) => (
            <div key={def.slug} className="w-56 shrink-0 lg:w-auto">
              <button
                type="button"
                onClick={() => restoreDeck(def.slug, def.name)}
                className="w-full rounded-2xl border border-dashed border-slate-200 p-3 text-left transition hover:border-ocean-300"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-400">{def.name}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-ocean-600">
                    <RotateCcw className="h-3 w-3" /> 恢复
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">已删除 · 点击按官方词表重新导入（进度从零开始）</div>
              </button>
            </div>
          ))}
          <div className="hidden pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400 lg:block">自定义词库</div>
          {custom.map((d) => (
            <div key={d.id} className="w-56 shrink-0 lg:w-auto">
              <DeckItem d={d} />
            </div>
          ))}
          {custom.length === 0 && (
            <button type="button" onClick={() => setImportOpen(true)} className="w-56 shrink-0 rounded-2xl border border-dashed border-slate-200 p-3 text-left text-xs text-slate-400 hover:border-ocean-300 lg:w-auto">
              还没有自定义词库，点击导入 CSV / JSON 或新建一个。
            </button>
          )}
        </div>
      </aside>

      {/* Words */}
      <section className="min-w-0 space-y-3">
        {deck ? (
          <>
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-bold">{deck.name}</h2>
                    <Pill tone={isCustom ? "leaf" : "ocean"}>{isCustom ? "自定义" : "内置"}</Pill>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">{deck.description || `${deck.total} 个单词`}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>共 {deck.total} 词</span>
                    <span>已学 {percent(deck.learned, deck.total)}%</span>
                    <span>掌握 {deck.mastered}</span>
                    <span className={cn(deck.wrong > 0 && "text-coral-500")}>错过 {deck.wrong}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Link href={`/study?deck=${deck.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-ocean-500 px-3 text-sm font-medium text-white hover:bg-ocean-600">
                    <Play className="h-4 w-4" /> 学习
                  </Link>
                  <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ id: null, form: EMPTY_FORM })}>
                    添加
                  </Button>
                  <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => exportDeck("csv")} disabled={pending}>
                    CSV
                  </Button>
                  <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => exportDeck("json")} disabled={pending}>
                    JSON
                  </Button>
                  {isCustom && <Button size="sm" variant="secondary" icon={<Share2 className="h-4 w-4" />} onClick={shareCustomDeck} disabled={pending}>分享</Button>}
                  <Button size="sm" variant="ghost" aria-label={isCustom ? "删除词库" : "删除词书"} title={isCustom ? "删除词库" : "删除词书（含进度，详见删除确认说明）"} icon={<Trash2 className="h-4 w-4 text-coral-500" />} onClick={removeDeck} />
                </div>
              </div>
            </Card>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索单词或释义" className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-9 text-sm outline-none focus:border-ocean-400" />
                {q && (
                  <button onClick={() => setQ("")} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100" aria-label="清除">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {STATUS_FILTERS.map((f) => (
                  <button key={f.key} type="button" onClick={() => setStatus(f.key)} className={cn("h-9 shrink-0 rounded-xl px-3 text-xs font-medium transition", status === f.key ? "bg-ink text-white" : "bg-white text-slate-500 hover:bg-slate-100")}>
                    {f.label}
                  </button>
                ))}
                <button type="button" onClick={() => setWrongOnly((v) => !v)} className={cn("inline-flex h-9 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-medium transition", wrongOnly ? "bg-coral-500 text-white" : "bg-white text-slate-500 hover:bg-slate-100")}>
                  <AlertCircle className="h-3.5 w-3.5" /> 错词
                </button>
              </div>
            </div>

            {loading && data.items.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : data.items.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="h-7 w-7" />}
                title={deck.total === 0 ? "这个词库还是空的" : "没有符合条件的单词"}
                description={deck.total === 0 ? "添加单词或导入 CSV / JSON 文件开始学习。" : "试试调整搜索或筛选条件。"}
                action={
                  deck.total === 0 ? (
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => setEditing({ id: null, form: EMPTY_FORM })}>
                        手动添加
                      </Button>
                      <Button onClick={() => setImportOpen(true)}>导入文件</Button>
                    </div>
                  ) : undefined
                }
              />
            ) : (
              <>
                <div className={cn("grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3", loading && "opacity-60")}>
                  {data.items.map((w) => (
                    <Card key={w.id} onClick={() => setDetail(w)} className="p-4 transition hover:shadow-lift">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-base font-bold">{w.word}</span>
                            {w.pos && <span className="shrink-0 text-xs text-slate-400">{w.pos}</span>}
                          </div>
                          {w.phonetic && <div className="font-mono text-xs text-slate-400">{w.phonetic}</div>}
                        </div>
                        <SpeakButton text={w.word} size="sm" />
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{w.meaning}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <Pill tone={STATUS_TONE[w.status]}>{STATUS_META[w.status].label}</Pill>
                        <ProgressBar value={w.proficiency} max={100} height="h-1.5" className="flex-1" barClassName={w.status === "mastered" ? "bg-leaf-500" : "bg-ocean-400"} />
                        {w.wrongCount > 0 && <span className="text-[11px] text-coral-500">错 {w.wrongCount}</span>}
                      </div>
                    </Card>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3 pt-2 text-sm">
                    <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                      上一页
                    </Button>
                    <span className="text-slate-500">
                      {page + 1} / {totalPages} · 共 {data.total} 词
                    </span>
                    <Button size="sm" variant="secondary" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      下一页
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <EmptyState icon={<BookOpen className="h-7 w-7" />} title="选择或创建一个词库" />
        )}
      </section>

      {/* Detail modal */}
      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="单词详情">
        {detail && (
          <div className="space-y-4 py-1">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold">{detail.word}</span>
                  <SpeakButton text={detail.word} />
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                  {detail.phonetic && <span className="font-mono">{detail.phonetic}</span>}
                  {detail.pos && <Pill tone="slate">{detail.pos}</Pill>}
                  <Pill tone="sand">难度 {detail.difficulty}</Pill>
                </div>
              </div>
              <Pill tone={STATUS_TONE[detail.status]}>{STATUS_META[detail.status].label}</Pill>
            </div>
            <p className="text-lg font-medium">{detail.meaning}</p>
            {detail.example && (
              <div className="rounded-2xl bg-slate-50 p-3 text-sm leading-relaxed">
                <p className="text-slate-700">{detail.example}</p>
                {detail.translation && <p className="mt-1 text-slate-500">{detail.translation}</p>}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="text-lg font-bold">{detail.proficiency}%</div>
                <div className="text-xs text-slate-400">{proficiencyLabel(detail.proficiency)}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="text-lg font-bold">
                  <span className="text-leaf-600">{detail.correctCount}</span> / <span className="text-coral-500">{detail.wrongCount}</span>
                </div>
                <div className="text-xs text-slate-400">答对 / 答错</div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <div className="text-lg font-bold">{detail.status === "new" ? "—" : formatRelativeTime(detail.nextReviewAt)}</div>
                <div className="text-xs text-slate-400">下次复习</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing({ id: detail.id, form: { word: detail.word, phonetic: detail.phonetic, pos: detail.pos, meaning: detail.meaning, example: detail.example, translation: detail.translation, difficulty: detail.difficulty } })}>
                编辑
              </Button>
              {isCustom && (
                <Button variant="ghost" icon={<Trash2 className="h-4 w-4 text-coral-500" />} onClick={() => removeWord(detail)}>
                  删除
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Add / edit modal */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? "编辑单词" : `添加单词到「${deck?.name ?? ""}」`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button loading={pending} onClick={saveWord} disabled={!editing?.form.word.trim() || !editing?.form.meaning.trim()}>
              保存
            </Button>
          </div>
        }
      >
        {editing && (
          <form
            className="grid gap-3 py-1 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveWord();
            }}
          >
            {(
              [
                ["word", "单词 *", "e.g. serendipity"],
                ["phonetic", "音标", "/ˌserənˈdɪpəti/"],
                ["pos", "词性", "n. / v. / adj."],
                ["difficulty", "难度 (1-5)", "2"],
                ["meaning", "中文释义 *", "意外发现美好事物的运气"],
                ["example", "英文例句", "Finding this café was pure serendipity."],
                ["translation", "例句翻译", "发现这家咖啡馆纯属意外之喜。"],
              ] as [keyof WordInput, string, string][]
            ).map(([key, label, placeholder]) => (
              <label key={key} className={cn("block", (key === "meaning" || key === "example" || key === "translation") && "sm:col-span-2")}>
                <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
                <input
                  type={key === "difficulty" ? "number" : "text"}
                  min={1}
                  max={5}
                  value={editing.form[key]}
                  onChange={(e) => setEditing({ ...editing, form: { ...editing.form, [key]: key === "difficulty" ? Number(e.target.value) : e.target.value } })}
                  placeholder={placeholder}
                  className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm outline-none focus:border-ocean-400"
                />
              </label>
            ))}
          </form>
        )}
      </Modal>

      {/* Create deck modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建词库"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button loading={pending} disabled={!newDeckName.trim()} onClick={createDeck}>
              创建
            </Button>
          </div>
        }
      >
        <div className="py-1">
          <input autoFocus value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && newDeckName.trim() && createDeck()} placeholder="词库名称，如：托福核心词 / 我的生词本" className="h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm outline-none focus:border-ocean-400" />
          <p className="mt-2 text-xs text-slate-400">创建后可以手动添加单词，或通过 CSV / JSON 批量导入。</p>
        </div>
      </Modal>

      <ImportDialog key={String(deckId)} open={importOpen} onClose={() => setImportOpen(false)} decks={decks} defaultDeckId={isCustom ? deckId : null} onDone={onImported} />
      <Modal
        open={Boolean(share)}
        onClose={() => setShare(null)}
        title={`分享词库「${share?.name ?? ""}」`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShare(null)}>
              关闭
            </Button>
            <Button onClick={copyShare}>复制内容</Button>
          </div>
        }
      >
        {share && (
          <div className="space-y-3 py-1">
            <p className="text-sm text-slate-500">把下面的内容复制给朋友，对方在「词库 → 导入」时粘贴即可导入这份词库（{share.name}）。</p>
            <textarea readOnly value={share.content} className="h-64 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs outline-none focus:border-ocean-400" />
          </div>
        )}
      </Modal>
      <ConfirmDialog state={confirm.state} onClose={confirm.close} />
    </div>
  );
}
