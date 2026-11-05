"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Upload } from "lucide-react";
import type { DeckSummary, ImportResult } from "@/lib/types";
import { CSV_TEMPLATE, detectFormat, parseImport, type ImportFormat } from "@/lib/vocab/parse";
import { cn } from "@/lib/utils";
import { importWordsAction } from "@/server/actions";
import { Button, Modal, useToast } from "../ui";

interface Props {
  open: boolean;
  onClose: () => void;
  decks: DeckSummary[];
  defaultDeckId: number | null;
  onDone: (result: ImportResult) => void;
}

export function ImportDialog({ open, onClose, decks, defaultDeckId, onDone }: Props) {
  const toast = useToast();
  const customDecks = decks.filter((d) => d.kind === "custom");
  const [target, setTarget] = useState<string>(defaultDeckId && customDecks.some((d) => d.id === defaultDeckId) ? String(defaultDeckId) : "new");
  const [newName, setNewName] = useState("");
  const [text, setText] = useState("");
  const [format, setFormat] = useState<ImportFormat>("csv");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => (text.trim() ? parseImport(text, format) : null), [text, format]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast({ kind: "error", title: "文件过大（限制 5MB）" });
    const content = await file.text();
    setFileName(file.name);
    setFormat(detectFormat(content, file.name));
    setText(content);
    setResult(null);
  };

  const submit = () => {
    if (!preview || preview.items.length === 0) return toast({ kind: "error", title: "没有可导入的有效单词" });
    const deckId = target === "new" ? null : Number(target);
    if (!deckId && !newName.trim()) return toast({ kind: "error", title: "请输入新词库名称" });
    startTransition(async () => {
      const res = await importWordsAction({ deckId, newDeckName: target === "new" ? newName.trim() : null, text, format });
      if (!res.ok) return toast({ kind: "error", title: res.error });
      setResult(res.data);
      onDone(res.data);
      toast({ kind: "success", title: `成功导入 ${res.data.imported} 个单词`, description: res.data.duplicates ? `跳过 ${res.data.duplicates} 个已存在的单词` : undefined });
    });
  };

  const reset = () => {
    setText("");
    setFileName(null);
    setResult(null);
    setNewName("");
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="导入单词"
      size="lg"
      footer={
        result ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={reset}>
              继续导入
            </Button>
            <Button
              onClick={() => {
                reset();
                onClose();
              }}
            >
              完成
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">{preview ? `识别到 ${preview.items.length} 个有效单词` : "支持 CSV / JSON"}</span>
            <Button icon={<Upload className="h-4 w-4" />} loading={pending} disabled={!preview || preview.items.length === 0} onClick={submit}>
              导入
            </Button>
          </div>
        )
      }
    >
      {result ? (
        <div className="space-y-3 py-2">
          <div className="flex items-center gap-3 rounded-2xl bg-leaf-50 p-4">
            <CheckCircle2 className="h-8 w-8 text-leaf-500" />
            <div>
              <div className="font-semibold text-leaf-700">导入完成 → {result.deckName}</div>
              <div className="text-sm text-slate-600">
                新增 {result.imported} 个 · 已存在跳过 {result.duplicates} 个 · 文件内重复 {result.duplicatesInFile} 个 · 错误 {result.errors.length} 条
              </div>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-2xl border border-sun-100 bg-sun-100/40 p-3 text-sm">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-sun-600">
                <AlertTriangle className="h-4 w-4" /> 以下数据未导入
              </div>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto text-slate-600">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    第 {e.line} 行：{e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-slate-400">已存在的单词会保留原有学习记录，不会被覆盖。</p>
        </div>
      ) : (
        <div className="space-y-4 py-1">
          <div>
            <label className="mb-1.5 block text-sm font-medium">导入到</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-3 text-sm">
                <option value="new">＋ 新建词库</option>
                {customDecks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}（{d.total} 词）
                  </option>
                ))}
              </select>
              {target === "new" && <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="新词库名称，如：我的生词本" className="h-11 flex-1 rounded-2xl border border-slate-200 px-3 text-sm outline-none focus:border-ocean-400" />}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium">文件或文本</label>
              <div className="inline-flex rounded-xl bg-slate-100 p-0.5 text-xs">
                {(["csv", "json"] as ImportFormat[]).map((f) => (
                  <button key={f} type="button" onClick={() => setFormat(f)} className={cn("rounded-lg px-2.5 py-1 font-medium uppercase", format === f ? "bg-white shadow-sm" : "text-slate-500")}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onFile(e.dataTransfer.files?.[0]);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 transition hover:border-ocean-300 hover:bg-ocean-50"
            >
              <FileUp className="h-5 w-5" />
              {fileName ? `已选择：${fileName}` : "点击选择或拖入 .csv / .json 文件"}
            </button>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setFileName(null);
              }}
              rows={6}
              placeholder={format === "csv" ? CSV_TEMPLATE : '[{"word":"serendipity","phonetic":"/ˌserənˈdɪpəti/","pos":"n.","meaning":"意外发现美好事物的运气","example":"...","translation":"...","difficulty":4}]'}
              className="mt-2 w-full rounded-2xl border border-slate-200 p-3 font-mono text-xs outline-none focus:border-ocean-400"
            />
            <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
              <span>CSV 字段：word, phonetic, pos, meaning, example, translation, difficulty（word 与 meaning 必填）</span>
              <button type="button" className="font-semibold text-ocean-600" onClick={() => { setFormat("csv"); setText(CSV_TEMPLATE); }}>
                填入示例
              </button>
            </div>
          </div>

          {preview && (
            <div className="rounded-2xl border border-slate-100 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-leaf-600">有效 {preview.items.length}</span>
                <span className="text-slate-500">文件内重复 {preview.duplicatesInFile}</span>
                <span className={cn(preview.issues.length ? "text-coral-500" : "text-slate-500")}>错误 {preview.issues.length}</span>
              </div>
              {preview.items.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {preview.items.slice(0, 12).map((it) => (
                    <span key={it.word} className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs">
                      {it.word} <span className="text-slate-400">{it.meaning.slice(0, 10)}</span>
                    </span>
                  ))}
                  {preview.items.length > 12 && <span className="text-xs text-slate-400">… 共 {preview.items.length} 个</span>}
                </div>
              )}
              {preview.issues.length > 0 && (
                <ul className="mt-2 max-h-28 space-y-0.5 overflow-y-auto text-xs text-coral-600">
                  {preview.issues.slice(0, 20).map((e, i) => (
                    <li key={i}>
                      第 {e.line} 行：{e.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
