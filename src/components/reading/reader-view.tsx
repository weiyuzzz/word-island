"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Eraser, Highlighter, NotebookPen, Plus, Sparkles, Volume2, X } from "lucide-react";
import { Button, Modal, Pill, SpeakButton, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { NOTE_TYPE_LABEL, baseWord, looksLikeLongSentence, tokenizeParagraph, type NoteType } from "@/lib/reading/text";
import { addReadingWordAction, analyzeSentenceAIAction, deleteNoteAction, finishArticleAction, lookupWordAction, noteFamiliarityAction, removeHighlightAction, saveHighlightAction, saveNoteAction, saveReadingProgressAction } from "@/server/actions";
import type { ArticleView, FinishResult, LookupResult } from "@/server/reading";

/**
 * 书屿 · 阅读器
 * 逐词渲染 / 点词查卡 / 划词高亮 / 划词记笔记 / 长难句 AI 解析 / 阅读进度与完成奖励
 */

type Hl = ArticleView["highlights"][number];
type NoteItem = ArticleView["notes"][number];

const HL_BG: Record<string, string> = { sun: "bg-sun-100", leaf: "bg-leaf-100", ocean: "bg-ocean-100" };
const HL_DOT: Record<string, string> = { sun: "bg-sun-400", leaf: "bg-leaf-400", ocean: "bg-ocean-400" };

const SOURCE_NAME: Record<string, string> = { conversation: "The Conversation", guardian: "The Guardian", bbc: "BBC News", manual: "手动导入" };

export function ReaderView({ initial, aiEnabled }: { initial: ArticleView; aiEnabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { article } = initial;

  const [highlights, setHighlights] = useState<Hl[]>(initial.highlights);
  const [notes, setNotes] = useState<NoteItem[]>(initial.notes);
  const [status, setStatus] = useState(initial.deliveryStatus);
  const [reward, setReward] = useState<FinishResult | null>(null);
  const [showFinishCard, setShowFinishCard] = useState(false);
  const [readMinutes, setReadMinutes] = useState(0);

  // 选区 / 词卡 / 笔记编辑器
  const [selection, setSelection] = useState<{ p: number; start: number; end: number; text: string; x: number; y: number } | null>(null);
  const [wordPopover, setWordPopover] = useState<{ word: string; x: number; y: number; loading: boolean; data: LookupResult | null } | null>(null);
  const [noteEditor, setNoteEditor] = useState<{ p: number; start: number; end: number; quote: string; noteType: NoteType; content: string; tags: string; ai: string; aiLoading: boolean; saving: boolean } | null>(null);
  const [noteViewer, setNoteViewer] = useState<NoteItem | null>(null);

  // 进度
  const [currentParagraph, setCurrentParagraph] = useState(initial.progressParagraph);
  const currentRef = useRef(initial.progressParagraph);
  const paragraphRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const secondsRef = useRef(0);
  const unsentRef = useRef(0);
  const finishedRef = useRef(initial.deliveryStatus === "finished");
  const [busy, setBusy] = useState(false);

  const paragraphs = article.paragraphs;
  const tokens = useMemo(() => paragraphs.map((p) => tokenizeParagraph(p)), [paragraphs]);
  const known = initial.known;

  const setCurrent = useCallback((i: number) => {
    if (i > currentRef.current) {
      currentRef.current = i;
      setCurrentParagraph(i);
    }
  }, []);

  // 滚动进度：视口上 1/3 区域所在段落视为当前进度（只前进，重读不回退）
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setCurrent(Number((e.target as HTMLElement).dataset.pi));
        }
      },
      { rootMargin: "0px 0px -55% 0px", threshold: 0 },
    );
    paragraphRefs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [setCurrent, paragraphs.length]);

  // 阅读计时：页面可见时每秒 +1；滚动触底视为读到最后一段
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") {
        secondsRef.current += 1;
        unsentRef.current += 1;
      }
      if (typeof window !== "undefined" && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 120) {
        setCurrent(paragraphs.length - 1);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [setCurrent, paragraphs.length]);

  // 周期性保存进度（15s 一次）
  useEffect(() => {
    const flush = () => {
      if (!initial.deliveryId || finishedRef.current) return;
      const add = Math.min(30, unsentRef.current);
      if (add <= 0) return;
      unsentRef.current = 0;
      void saveReadingProgressAction({ deliveryId: initial.deliveryId, paragraphIndex: currentRef.current, addSeconds: add });
    };
    const t = setInterval(flush, 15000);
    const onHide = () => flush();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [initial.deliveryId]);

  // ---------- 选区 ----------

  const captureSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    // 选区必须完整落在同一段落里（段落用 data-pi 标记）
    const findParagraph = (node: Node | null): HTMLElement | null => {
      let cur: Node | null = node;
      while (cur && !(cur instanceof HTMLElement && cur.dataset.pi !== undefined)) cur = cur.parentNode;
      return cur as HTMLElement | null;
    };
    const pEl = findParagraph(range.startContainer);
    const endPEl = findParagraph(range.endContainer);
    if (!pEl || pEl !== endPEl) {
      setSelection(null);
      return;
    }
    const p = Number(pEl.dataset.pi);
    // 用「段落起点 → 边界」的 Range 长度折算字符偏移，兼容文本节点与元素节点边界
    const measure = (container: Node, offset: number) => {
      const r = document.createRange();
      r.setStart(pEl, 0);
      try {
        r.setEnd(container, offset);
      } catch {
        return -1;
      }
      return r.toString().length;
    };
    const a = measure(range.startContainer, range.startOffset);
    const b = measure(range.endContainer, range.endOffset);
    if (a < 0 || b < 0) {
      setSelection(null);
      return;
    }
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    const text = paragraphs[p]?.slice(start, end);
    if (!text || !text.trim()) {
      setSelection(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    setSelection({ p, start, end, text, x: rect.left + rect.width / 2, y: rect.top });
  }, [paragraphs]);

  const clearSel = () => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  // ---------- 高亮 ----------

  const applyHighlight = async (color: "sun" | "leaf" | "ocean") => {
    if (!selection) return;
    const { p, start, end } = selection;
    clearSel();
    const res = await saveHighlightAction({ articleId: article.id, paragraphIndex: p, startOffset: start, endOffset: end, color });
    if (!res.ok) {
      toast({ kind: "error", title: "高亮失败", description: res.error });
      return;
    }
    setHighlights((prev) => [
      ...prev.filter((h) => !(h.paragraphIndex === p && h.startOffset === start && h.endOffset === end)),
      { id: res.data.id, paragraphIndex: p, startOffset: start, endOffset: end, text: paragraphs[p].slice(start, end), color },
    ]);
  };

  const existingHighlight = useMemo(
    () =>
      selection
        ? highlights.find((h) => h.paragraphIndex === selection.p && h.startOffset === selection.start && h.endOffset === selection.end)
        : undefined,
    [selection, highlights],
  );

  const eraseHighlight = async () => {
    if (!existingHighlight) return;
    const id = existingHighlight.id;
    clearSel();
    const res = await removeHighlightAction(id);
    if (!res.ok) {
      toast({ kind: "error", title: "取消高亮失败", description: res.error });
      return;
    }
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  };

  // ---------- 词卡 ----------

  const openWord = async (word: string, x: number, y: number) => {
    setWordPopover({ word, x, y, loading: true, data: null });
    const res = await lookupWordAction(word);
    setWordPopover((cur) => (cur && cur.word === word ? { ...cur, loading: false, data: res.ok ? res.data : null } : cur));
  };

  const addWord = async (popover: NonNullable<typeof wordPopover>) => {
    const d = popover.data;
    if (!d) return;
    setWordPopover({ ...popover, loading: true });
    const res = await addReadingWordAction({ word: d.word || popover.word, meaning: d.meaning, phonetic: d.phonetic, pos: d.pos, example: selection?.text && !selection.text.includes(" ") ? `${selection.text}（《${article.title}》）` : "" });
    if (res.ok) {
      toast({ kind: "success", title: `已收进「拾词」`, description: "明天就会出现在学习队列里" });
      setWordPopover(null);
    } else {
      setWordPopover({ ...popover, loading: false });
      toast({ kind: "error", title: "加词失败", description: res.error });
    }
  };

  // ---------- 笔记 ----------

  const openNoteEditor = (defaultType?: NoteType) => {
    if (!selection) return;
    const quote = selection.text;
    const noteType = defaultType ?? (looksLikeLongSentence(quote) ? "long_sentence" : quote.trim().split(/\s+/).length > 1 ? "phrase" : "expression");
    setNoteEditor({ p: selection.p, start: selection.start, end: selection.end, quote, noteType, content: "", tags: "", ai: "", aiLoading: false, saving: false });
    clearSel();
  };

  const saveNote = async () => {
    if (!noteEditor) return;
    setNoteEditor({ ...noteEditor, saving: true });
    const res = await saveNoteAction({
      articleId: article.id,
      paragraphIndex: noteEditor.p,
      startOffset: noteEditor.start,
      endOffset: noteEditor.end,
      quote: noteEditor.quote,
      noteType: noteEditor.noteType,
      content: noteEditor.content,
      tags: noteEditor.tags.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean),
      aiAnalysis: noteEditor.ai || null,
    });
    if (!res.ok) {
      setNoteEditor((cur) => (cur ? { ...cur, saving: false } : cur));
      toast({ kind: "error", title: "保存失败", description: res.error });
      return;
    }
    setNotes((prev) => [
      ...prev,
      { id: res.data.id, paragraphIndex: noteEditor.p, startOffset: noteEditor.start, endOffset: noteEditor.end, quote: noteEditor.quote, noteType: noteEditor.noteType, content: noteEditor.content, tags: [], familiarity: "unmarked", aiAnalysis: noteEditor.ai || null },
    ]);
    setNoteEditor(null);
    toast({ kind: "success", title: "已记入拾贝笔记" });
  };

  const runAI = async () => {
    if (!noteEditor) return;
    setNoteEditor({ ...noteEditor, aiLoading: true });
    const res = await analyzeSentenceAIAction(noteEditor.quote);
    setNoteEditor((cur) => (cur ? { ...cur, aiLoading: false, ai: res.ok ? res.data : `解析失败：${res.error}` } : cur));
  };

  const removeNote = async (id: number) => {
    const res = await deleteNoteAction(id);
    if (res.ok) {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setNoteViewer(null);
    } else {
      toast({ kind: "error", title: "删除失败", description: res.error });
    }
  };

  // ---------- 完成 ----------

  const atEnd = currentParagraph >= paragraphs.length - 1;
  const finish = async () => {
    if (!initial.deliveryId) return;
    setBusy(true);
    const res = await finishArticleAction(initial.deliveryId);
    setBusy(false);
    if (!res.ok) {
      toast({ kind: "error", title: "还不能完成", description: res.error });
      return;
    }
    finishedRef.current = true;
    setStatus("finished");
    setReward(res.data);
    setReadMinutes(Math.max(1, Math.round(secondsRef.current / 60)));
    setShowFinishCard(true);
    router.refresh();
  };

  // ---------- 渲染段落 ----------

  const renderParagraph = (p: number) => {
    const text = paragraphs[p];
    const toks = tokens[p];
    const hls = highlights.filter((h) => h.paragraphIndex === p);
    const nts = notes.filter((n) => n.paragraphIndex === p && n.endOffset > n.startOffset);
    // 边界点集合：token 边界 + 高亮/笔记边界
    const bounds = new Set<number>([0, text.length]);
    for (const t of toks) {
      bounds.add(t.start);
      bounds.add(t.end);
    }
    for (const h of hls) {
      bounds.add(Math.max(0, Math.min(text.length, h.startOffset)));
      bounds.add(Math.max(0, Math.min(text.length, h.endOffset)));
    }
    for (const n of nts) {
      bounds.add(Math.max(0, Math.min(text.length, n.startOffset)));
      bounds.add(Math.max(0, Math.min(text.length, n.endOffset)));
    }
    const points = [...bounds].sort((a, b) => a - b);
    const nodes: React.ReactNode[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (b <= a) continue;
      const seg = text.slice(a, b);
      const tok = toks.find((t) => t.start <= a && b <= t.end);
      const hl = hls.find((h) => h.startOffset <= a && b <= h.endOffset);
      const note = nts.find((n) => n.startOffset <= a && b <= n.endOffset);
      const cls = cn(
        hl && HL_BG[hl.color],
        note && "underline decoration-coral-400 decoration-dotted decoration-2 underline-offset-4 cursor-pointer",
        tok && "cursor-pointer rounded-sm transition-colors hover:bg-slate-200/60",
        tok && !hl && knownStatusOf(known, tok.word) === "learning" && "bg-sun-50",
        tok && !hl && knownStatusOf(known, tok.word) === "review" && "bg-sun-50",
        tok && !hl && knownStatusOf(known, tok.word) === "mastered" && "bg-leaf-50",
      );
      nodes.push(
        <span
          key={a}
          data-p={p}
          data-s={tok ? tok.start : undefined}
          data-e={tok ? tok.end : undefined}
          className={cls || undefined}
          onClick={tok ? (e) => { setSelection(null); void openWord(tok.word, e.clientX, e.clientY); } : note ? () => setNoteViewer(note!) : undefined}
        >
          {seg}
        </span>,
      );
    }
    return nodes;
  };

  const pct = Math.round(((currentParagraph + 1) / paragraphs.length) * 100);

  return (
    <div className="mx-auto max-w-3xl" onMouseUp={captureSelection} onTouchEnd={captureSelection}>
      {/* 头部 */}
      <div className="mb-6">
        <Link href="/reading" className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-ocean-600">
          <ArrowLeft className="h-4 w-4" /> 书屿
        </Link>
        <h1 className="mt-3 text-2xl font-bold leading-snug tracking-tight">{article.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Pill tone="ocean">{SOURCE_NAME[article.source] ?? article.source}</Pill>
          <Pill tone="slate">{article.topic}</Pill>
          <span>{article.wordCount} 词 · 约 {Math.max(1, Math.round(article.wordCount / 220))} 分钟</span>
          {status === "finished" && <Pill tone="leaf"><CheckCircle2 className="h-3 w-3" /> 已读完</Pill>}
          {article.url && (
            <a href={article.url} target="_blank" rel="noreferrer" className="text-ocean-600 hover:underline">
              原文 ↗
            </a>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-slate-50 px-3 py-2 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sun-50 ring-1 ring-sun-200" />学习中/复习中</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-leaf-50 ring-1 ring-leaf-200" />已掌握</span>
          <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 bg-coral-400" />我的笔记</span>
          <span>点词查卡 · 划词高亮/记笔记</span>
        </div>
      </div>

      {/* 正文 */}
      <article className="space-y-5 text-[17px] leading-[1.95] text-ink">
        {paragraphs.map((_, i) => (
          <p
            key={i}
            id={`p${i}`}
            data-pi={i}
            ref={(el) => {
              paragraphRefs.current[i] = el;
            }}
            className="min-h-[1.2em]"
          >
            {renderParagraph(i)}
          </p>
        ))}
      </article>
      <div className="h-24" />

      {/* 底部进度条 */}
      <div className="fixed inset-x-0 bottom-[72px] z-30 flex justify-center px-4 md:bottom-6">
        <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-slate-100 bg-white/95 px-4 py-2.5 shadow-lift backdrop-blur">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-ocean-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs tabular-nums text-slate-400">{pct}%</span>
          {initial.deliveryId && status !== "finished" ? (
            <Button size="sm" disabled={!atEnd || busy} onClick={finish} title={!atEnd ? "读到最后一页才能完成" : undefined}>
              {busy ? "结算中…" : "读完领奖"}
            </Button>
          ) : null}
        </div>
      </div>

      {/* 划词工具条 */}
      {selection && (
        <>
          <div className="fixed inset-0 z-40" onClick={clearSel} />
          <div
            className="fixed z-50 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-2xl border border-slate-100 bg-white px-2 py-1.5 shadow-lift"
            style={{ left: Math.min(Math.max(selection.x, 130), (typeof window !== "undefined" ? window.innerWidth : 400) - 130), top: selection.y - 8 }}
          >
            {existingHighlight ? (
              <button onClick={eraseHighlight} className="flex h-8 items-center gap-1 rounded-xl px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100" title="取消高亮">
                <Eraser className="h-4 w-4" /> 取消
              </button>
            ) : (
              (["sun", "leaf", "ocean"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => void applyHighlight(c)}
                  aria-label={`${c} 高亮`}
                  className={cn("h-6 w-6 rounded-full ring-2 ring-white transition hover:scale-110", HL_DOT[c])}
                />
              ))
            )}
            <span className="mx-0.5 h-5 w-px bg-slate-100" />
            <button onClick={() => openNoteEditor()} className="flex h-8 items-center gap-1 rounded-xl px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
              <NotebookPen className="h-4 w-4" /> 笔记
            </button>
          </div>
        </>
      )}

      {/* 词卡弹层 */}
      {wordPopover && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setWordPopover(null)} />
          <div
            className="fixed z-50 w-72 -translate-x-1/2 -translate-y-full rounded-2xl border border-slate-100 bg-white p-4 shadow-lift"
            style={{ left: Math.min(Math.max(wordPopover.x, 150), (typeof window !== "undefined" ? window.innerWidth : 400) - 150), top: wordPopover.y - 10 }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-lg font-bold leading-tight">{wordPopover.word}</div>
                {wordPopover.data?.phonetic && <div className="text-xs text-slate-400">{wordPopover.data.phonetic}</div>}
              </div>
              <SpeakButton text={wordPopover.word} size="sm" />
            </div>
            <div className="mt-2 min-h-[40px] text-sm leading-relaxed">
              {wordPopover.loading ? (
                <span className="text-slate-400">查词中…</span>
              ) : wordPopover.data ? (
                <>
                  {wordPopover.data.pos && <span className="mr-1 text-xs italic text-slate-400">{wordPopover.data.pos}</span>}
                  {wordPopover.data.meaning || "（无释义）"}
                  {wordPopover.data.meaningLang === "en" && <span className="ml-1 text-[10px] text-slate-400">英英</span>}
                </>
              ) : (
                <span className="text-slate-400">词典里没查到，可以在下方手动录入</span>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between">
              {wordPopover.data?.inVocab ? (
                <Pill tone="leaf">已在词库 · {wordPopover.data.status === "mastered" ? "已掌握" : wordPopover.data.status === "new" ? "未学" : "学习中"}</Pill>
              ) : (
                <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} loading={wordPopover.loading && !wordPopover.data} onClick={() => void addWord(wordPopover)} disabled={!wordPopover.data}>
                  收进拾词
                </Button>
              )}
              <button onClick={() => setWordPopover(null)} className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* 笔记编辑器 */}
      <Modal open={!!noteEditor} onClose={() => setNoteEditor(null)} title="记入拾贝笔记">
        {noteEditor && (
          <div className="space-y-4">
            <blockquote className="rounded-2xl bg-slate-50 px-3.5 py-3 text-sm leading-relaxed text-slate-600">{noteEditor.quote}</blockquote>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(NOTE_TYPE_LABEL) as NoteType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setNoteEditor({ ...noteEditor, noteType: t })}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition",
                    noteEditor.noteType === t ? "bg-ocean-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  )}
                >
                  {NOTE_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            <textarea
              value={noteEditor.content}
              onChange={(e) => setNoteEditor({ ...noteEditor, content: e.target.value })}
              placeholder="我的理解 / 翻译 / 疑问…（可不填）"
              rows={3}
              className="w-full resize-none rounded-2xl border border-slate-200 px-3.5 py-3 text-sm outline-none transition focus:border-ocean-400"
            />
            <input
              value={noteEditor.tags}
              onChange={(e) => setNoteEditor({ ...noteEditor, tags: e.target.value })}
              placeholder="标签，逗号分隔（如：写作可用, 学术）"
              className="w-full rounded-2xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-ocean-400"
            />
            {aiEnabled && (noteEditor.noteType === "long_sentence" || noteEditor.noteType === "grammar") && (
              <div>
                {noteEditor.ai ? (
                  <div className="whitespace-pre-wrap rounded-2xl bg-ocean-50/60 px-3.5 py-3 text-sm leading-relaxed text-ink">{noteEditor.ai}</div>
                ) : (
                  <Button size="sm" variant="soft" icon={<Sparkles className="h-4 w-4" />} loading={noteEditor.aiLoading} onClick={() => void runAI()}>
                    AI 拆解长难句
                  </Button>
                )}
              </div>
            )}
            <Button className="w-full" loading={noteEditor.saving} onClick={() => void saveNote()}>
              保存笔记
            </Button>
          </div>
        )}
      </Modal>

      {/* 笔记查看 */}
      <Modal open={!!noteViewer} onClose={() => setNoteViewer(null)} title={noteViewer ? `${NOTE_TYPE_LABEL[noteViewer.noteType]}笔记` : ""}>
        {noteViewer && (
          <div className="space-y-3">
            <blockquote className="rounded-2xl bg-slate-50 px-3.5 py-3 text-sm leading-relaxed text-slate-600">{noteViewer.quote}</blockquote>
            {noteViewer.content && <p className="text-sm leading-relaxed">{noteViewer.content}</p>}
            {noteViewer.aiAnalysis && <div className="whitespace-pre-wrap rounded-2xl bg-ocean-50/60 px-3.5 py-3 text-sm leading-relaxed">{noteViewer.aiAnalysis}</div>}
            {noteViewer.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {noteViewer.tags.map((t) => (
                  <Pill key={t} tone="slate">{t}</Pill>
                ))}
              </div>
            )}
            <div className="flex justify-between pt-1">
              <Button size="sm" variant="danger" onClick={() => void removeNote(noteViewer.id)}>
                删除
              </Button>
              <div className="flex gap-1.5">
                {(["familiar", "ok", "forgotten"] as const).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={noteViewer.familiarity === f ? "primary" : "secondary"}
                    onClick={async () => {
                      const res = await noteFamiliarityAction([noteViewer.id], f);
                      if (res.ok) {
                        setNotes((prev) => prev.map((n) => (n.id === noteViewer.id ? { ...n, familiarity: f } : n)));
                        setNoteViewer({ ...noteViewer, familiarity: f });
                      }
                    }}
                  >
                    {f === "familiar" ? "熟悉" : f === "ok" ? "一般" : "遗忘"}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 完成结算卡 */}
      <Modal open={showFinishCard} onClose={() => setShowFinishCard(false)} title="读完了，干得漂亮">
        <div className="space-y-4 text-center">
          <div className="text-5xl">🏝️</div>
          {reward && (
            <p className="text-sm text-slate-600">
              奖励 <span className="font-bold text-sun-600">+{reward.coins} 金币</span> · <span className="font-bold text-ocean-600">+{reward.xp} XP</span>
              {reward.leveledUp && <span className="ml-1 font-bold text-coral-500">升级到 Lv.{reward.level}！</span>}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-2xl bg-sun-50 py-3">
              <div className="text-lg font-bold text-sun-600">{highlights.length}</div>
              <div className="text-xs text-slate-500">高亮</div>
            </div>
            <div className="rounded-2xl bg-ocean-50 py-3">
              <div className="text-lg font-bold text-ocean-600">{notes.length}</div>
              <div className="text-xs text-slate-500">笔记</div>
            </div>
            <div className="rounded-2xl bg-leaf-50 py-3">
              <div className="text-lg font-bold text-leaf-600">{readMinutes}</div>
              <div className="text-xs text-slate-500">分钟</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/notes" className="flex-1">
              <Button variant="secondary" className="w-full">看拾贝笔记</Button>
            </Link>
            <Link href="/reading" className="flex-1">
              <Button className="w-full">回书屿</Button>
            </Link>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function knownStatusOf(known: Record<string, string>, word: string): string | undefined {
  const base = baseWord(word);
  return known[base] ?? known[base.replace(/e$/, "")];
}
