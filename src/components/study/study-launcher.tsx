"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BookOpen, Brain, Check, Play, Shuffle, Sparkles } from "lucide-react";
import type { ClientSession, DeckSummary, SessionKind } from "@/lib/types";
import { SESSION_SIZES } from "@/lib/game/economy";
import { MODE_META } from "@/lib/game/srs";
import { cn } from "@/lib/utils";
import { startSessionAction } from "@/server/actions";
import { Button, Card, Pill, useToast } from "../ui";
import { QuizSession } from "./quiz-session";

interface Props {
  decks: DeckSummary[];
  initialDeckId: number | null;
  initialKind: SessionKind;
  totals: { due: number; fresh: number };
}

const KINDS: { key: SessionKind; title: string; desc: string; icon: typeof Shuffle }[] = [
  { key: "mixed", title: "混合练习", desc: "待复习 + 新词，智能搭配（推荐）", icon: Shuffle },
  { key: "review", title: "只复习", desc: "巩固到期的单词", icon: Brain },
  { key: "new", title: "只学新词", desc: "认识新的单词", icon: Sparkles },
];

export function StudyLauncher({ decks, initialDeckId, initialKind, totals }: Props) {
  const toast = useToast();
  const [deckId, setDeckId] = useState<number | null>(initialDeckId);
  const [kind, setKind] = useState<SessionKind>(initialKind);
  const [size, setSize] = useState<number>(10);
  const [session, setSession] = useState<ClientSession | null>(null);
  const [pending, startTransition] = useTransition();

  const currentDeck = decks.find((d) => d.id === deckId) ?? null;
  const due = currentDeck ? currentDeck.due : totals.due;
  const fresh = currentDeck ? currentDeck.total - currentDeck.learned : totals.fresh;
  const totalWords = decks.reduce((n, d) => n + d.total, 0);

  const start = () => {
    startTransition(async () => {
      const res = await startSessionAction({ deckId, kind, size });
      if (!res.ok) return toast({ kind: "error", title: res.error });
      setSession(res.data);
      window.scrollTo({ top: 0 });
    });
  };

  if (session) {
    return <QuizSession key={session.id} session={session} onExit={() => setSession(null)} onRestart={() => { setSession(null); start(); }} />;
  }

  if (totalWords === 0) {
    return (
      <Card className="p-10 text-center">
        <BookOpen className="mx-auto h-10 w-10 text-ocean-400" />
        <h2 className="mt-3 text-lg font-semibold">词库里还没有单词</h2>
        <p className="mt-1 text-sm text-slate-500">先去词库导入一些单词，再回来学习吧。</p>
        <Link href="/vocab" className="mt-4 inline-flex h-11 items-center rounded-2xl bg-ocean-500 px-5 text-sm font-medium text-white">
          前往词库
        </Link>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">开始学习</h1>
        <p className="mt-1 text-sm text-slate-500">
          当前 <span className="font-semibold text-coral-500">{totals.due}</span> 个单词待复习 · <span className="font-semibold text-ocean-600">{totals.fresh}</span> 个新词可学
        </p>
      </div>

      <section>
        <div className="mb-2 text-sm font-semibold text-slate-600">学习方式</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {KINDS.map((k) => {
            const active = kind === k.key;
            const count = k.key === "review" ? due : k.key === "new" ? fresh : null;
            const disabled = (k.key === "review" && due === 0) || (k.key === "new" && fresh === 0);
            return (
              <button key={k.key} type="button" disabled={disabled} onClick={() => setKind(k.key)} className={cn("relative rounded-2xl border-2 p-4 text-left transition disabled:opacity-50", active ? "border-ocean-500 bg-ocean-50" : "border-slate-200 bg-white hover:border-ocean-200")}>
                <div className="flex items-center justify-between">
                  <k.icon className={cn("h-5 w-5", active ? "text-ocean-600" : "text-slate-400")} />
                  {count !== null && <Pill tone={active ? "ocean" : "slate"}>{count}</Pill>}
                </div>
                <div className="mt-2 text-sm font-semibold">{k.title}</div>
                <div className="text-xs text-slate-500">{k.desc}</div>
                {active && (
                  <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-ocean-500 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 text-sm font-semibold text-slate-600">选择词库</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setDeckId(null)} className={cn("rounded-2xl border px-3.5 py-2 text-sm font-medium transition", deckId === null ? "border-ocean-500 bg-ocean-500 text-white" : "border-slate-200 bg-white hover:border-ocean-300")}>
            全部词库
          </button>
          {decks
            .filter((d) => d.total > 0)
            .map((d) => {
              const active = deckId === d.id;
              return (
                <button key={d.id} type="button" onClick={() => setDeckId(d.id)} className={cn("inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-medium transition", active ? "border-ocean-500 bg-ocean-500 text-white" : "border-slate-200 bg-white hover:border-ocean-300")}>
                  {d.name}
                  <span className={cn("text-xs", active ? "text-white/80" : "text-slate-400")}>
                    {d.learned}/{d.total}
                  </span>
                  {d.due > 0 && <span className={cn("rounded-full px-1.5 text-[10px] font-bold", active ? "bg-white/20" : "bg-coral-100 text-coral-600")}>{d.due}</span>}
                </button>
              );
            })}
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-4">
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-600">每组题数</div>
          <div className="inline-flex rounded-2xl bg-white p-1 shadow-soft">
            {SESSION_SIZES.map((s) => (
              <button key={s} type="button" onClick={() => setSize(s)} className={cn("h-9 rounded-xl px-4 text-sm font-medium transition", size === s ? "bg-ocean-500 text-white" : "text-slate-500 hover:bg-slate-100")}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto">
          <Button size="lg" icon={<Play className="h-5 w-5" />} loading={pending} onClick={start} className="w-full sm:w-auto">
            开始学习
          </Button>
        </div>
      </section>

      <Card className="p-5">
        <div className="text-sm font-semibold">题型说明</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(Object.keys(MODE_META) as (keyof typeof MODE_META)[]).map((m) => (
            <div key={m} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3">
              <Pill tone="ocean" className="mt-0.5 shrink-0">
                {MODE_META[m].short}
              </Pill>
              <div>
                <div className="text-sm font-medium">{MODE_META[m].label}</div>
                <div className="text-xs text-slate-500">{MODE_META[m].description}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">题型会根据每个单词的掌握程度自动安排：新词先从英译中开始，越熟悉越偏向中译英、语境与拼写。答对得金币与经验，连续答对 5 题有额外奖励；答题太慢或使用提示会降低收益。</p>
      </Card>
    </div>
  );
}
