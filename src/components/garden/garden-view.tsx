"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { BookOpen, Search, Sprout, TreeDeciduous, Trees, Flower2, Filter } from "lucide-react";
import type { GardenPlant, GardenStage } from "@/lib/game/model";
import { STAGE_META } from "@/lib/game/garden-meta";
import { STATUS_META, proficiencyLabel } from "@/lib/game/srs";
import { cn, formatRelativeTime } from "@/lib/utils";
import { getGardenAction } from "@/server/game-actions";
import { Button, Card, EmptyState, Modal, Pill, ProgressBar, SpeakButton, STATUS_TONE, useToast } from "../ui";

const STAGES: (GardenStage | "all")[] = ["all", "seed", "sprout", "sapling", "tree", "bloom"];

const STAGE_STYLE: Record<GardenStage, { color: string; label: string }> = {
  seed: { color: "bg-sand-300", label: "bg-sand-100 text-sand-500" },
  sprout: { color: "bg-leaf-200", label: "bg-leaf-50 text-leaf-600" },
  sapling: { color: "bg-leaf-400", label: "bg-leaf-100 text-leaf-700" },
  tree: { color: "bg-leaf-500", label: "bg-leaf-100 text-leaf-700" },
  bloom: { color: "bg-coral-400", label: "bg-coral-100 text-coral-600" },
};

function Plant({ plant, onClick }: { plant: GardenPlant; onClick: () => void }) {
  const stage = plant.stage;
  return (
    <button type="button" onClick={onClick} className="group relative rounded-2xl border border-slate-100 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-soft">
      <div className="flex h-16 items-end justify-center">
        <svg viewBox="0 0 80 80" className="h-16 w-16">
          <ellipse cx="40" cy="70" rx="22" ry="6" fill="#e8dcc2" />
          {stage === "seed" && (
            <g>
              <ellipse cx="40" cy="66" rx="8" ry="5" fill="#c98a4b" />
              <path d="M40 62 q2 -6 8 -8" stroke="#84d393" strokeWidth="3" fill="none" strokeLinecap="round" />
            </g>
          )}
          {stage === "sprout" && (
            <g>
              <path d="M40 68 V50" stroke="#3f9a52" strokeWidth="4" strokeLinecap="round" />
              <ellipse cx="32" cy="52" rx="10" ry="5" fill="#84d393" transform="rotate(-25 32 52)" />
              <ellipse cx="48" cy="48" rx="10" ry="5" fill="#6cc07a" transform="rotate(25 48 48)" />
            </g>
          )}
          {stage === "sapling" && (
            <g>
              <path d="M40 70 V34" stroke="#9c6236" strokeWidth="5" strokeLinecap="round" />
              <circle cx="40" cy="30" r="14" fill="#6cc07a" />
              <circle cx="30" cy="38" r="9" fill="#84d393" />
              <circle cx="51" cy="37" r="9" fill="#55bb6a" />
            </g>
          )}
          {stage === "tree" && (
            <g>
              <path d="M40 72 V40" stroke="#9c6236" strokeWidth="7" strokeLinecap="round" />
              <circle cx="40" cy="28" r="18" fill="#3f9a52" />
              <circle cx="26" cy="38" r="11" fill="#55bb6a" />
              <circle cx="55" cy="36" r="11" fill="#6cc07a" />
              <circle cx="40" cy="18" r="11" fill="#84d393" />
            </g>
          )}
          {stage === "bloom" && (
            <g>
              <path d="M40 72 V40" stroke="#9c6236" strokeWidth="7" strokeLinecap="round" />
              <circle cx="40" cy="28" r="18" fill="#3f9a52" />
              <circle cx="26" cy="38" r="11" fill="#55bb6a" />
              <circle cx="55" cy="36" r="11" fill="#6cc07a" />
              {[
                [40, 16],
                [27, 27],
                [53, 25],
                [34, 38],
                [50, 42],
              ].map(([x, y], i) => (
                <g key={i}>
                  {[0, 72, 144, 216, 288].map((a) => (
                    <circle key={a} cx={x + 3.6 * Math.cos((a * Math.PI) / 180)} cy={y + 3.6 * Math.sin((a * Math.PI) / 180)} r={3.2} fill={i % 2 ? "#f98b73" : "#f7c948"} />
                  ))}
                  <circle cx={x} cy={y} r={2} fill="#fff" />
                </g>
              ))}
            </g>
          )}
        </svg>
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{plant.word}</div>
      <div className="truncate text-xs text-slate-400">{plant.meaning}</div>
      <div className="mt-1.5">
        <ProgressBar value={plant.proficiency} max={100} height="h-1.5" barClassName={plant.stage === "bloom" ? "bg-coral-400" : "bg-leaf-400"} />
      </div>
      <span className={cn("absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium", STAGE_STYLE[stage].label)}>{STAGE_META[stage].label}</span>
    </button>
  );
}

export interface GardenData {
  plants: GardenPlant[];
  counts: Record<GardenStage, number>;
  total: number;
}

export function GardenView({ initial }: { initial?: GardenData }) {
  const toast = useToast();
  const [plants, setPlants] = useState<GardenPlant[]>(initial?.plants ?? []);
  const [counts, setCounts] = useState<Record<GardenStage, number>>(
    initial?.counts ?? { seed: 0, sprout: 0, sapling: 0, tree: 0, bloom: 0 },
  );
  const [filter, setFilter] = useState<GardenStage | "all">("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<GardenPlant | null>(null);
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    if (initial) return;
    startTransition(async () => {
      const res = await getGardenAction("all");
      if (!res.ok) return toast({ kind: "error", title: res.error });
      setPlants(res.data.plants);
      setCounts(res.data.counts);
    });
  }, [initial, toast]);

  const visible = plants.filter((p) => (filter === "all" || p.stage === filter) && (!q.trim() || p.word.includes(q.trim().toLowerCase()) || p.meaning.includes(q.trim())));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">词汇花园</h1>
        <p className="mt-1 text-sm text-slate-500">每答对一次，单词就会种进花园；复习成功会发芽，长期掌握会开花。答错不会毁掉植物，只会安排重新复习。</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          {STAGES.map((s) => {
            const active = filter === s;
            const count = s === "all" ? plants.length : counts[s as GardenStage];
            return (
              <button key={s} type="button" onClick={() => setFilter(s)} className={cn("inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-medium transition", active ? "border-leaf-400 bg-leaf-50 text-leaf-700" : "border-slate-200 bg-white text-slate-500 hover:border-leaf-200")}>
                {s === "all" ? <Sprout className="h-4 w-4" /> : s === "seed" ? <Sprout className="h-4 w-4" /> : s === "sprout" ? <Sprout className="h-4 w-4" /> : s === "sapling" ? <TreeDeciduous className="h-4 w-4" /> : s === "tree" ? <Trees className="h-4 w-4" /> : <Flower2 className="h-4 w-4" />}
                {s === "all" ? "全部" : STAGE_META[s].label}
                <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">{count}</span>
              </button>
            );
          })}
          <div className="relative ml-auto w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索单词" className="h-10 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-leaf-400" />
          </div>
        </div>
      </Card>

      {loading && plants.length === 0 ? (
        <div className="py-20 text-center text-slate-400">花园加载中…</div>
      ) : plants.length === 0 ? (
        <EmptyState
          icon={<Sprout className="h-7 w-7" />}
          title="花园还是空的"
          description="去学习或探索，第一次答对单词后，种子就会出现在这里。"
          action={
            <Link href="/study" className="inline-flex h-11 items-center gap-2 rounded-2xl bg-ocean-500 px-5 text-sm font-medium text-white shadow-soft hover:bg-ocean-600">
              <BookOpen className="h-4 w-4" /> 开始学习
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={<Filter className="h-7 w-7" />} title="没有符合条件的植物" description="换一个筛选条件试试。" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {visible.map((p) => (
            <Plant key={p.id} plant={p} onClick={() => setDetail(p)} />
          ))}
        </div>
      )}

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="单词植物详情">
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
                </div>
              </div>
              <div className="text-right">
                <Pill tone={detail.stage === "bloom" ? "coral" : detail.stage === "seed" ? "sand" : "leaf"}>{STAGE_META[detail.stage].label}</Pill>
                <div className="mt-1 text-xs text-slate-400">{STAGE_META[detail.stage].note}</div>
              </div>
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
                <div className="text-lg font-bold">{formatRelativeTime(detail.nextReviewAt)}</div>
                <div className="text-xs text-slate-400">下次复习</div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-500">掌握状态</span>
              <Pill tone={STATUS_TONE[detail.status]}>{STATUS_META[detail.status].label}</Pill>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
