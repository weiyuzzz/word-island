"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart, Shield, Sparkles } from "lucide-react";
import { Button, Modal, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getRaidDetailAction, resolveRaidWaveAction } from "@/server/actions";
import type { RaidSummary, RaidWave } from "@/lib/types";

/**
 * 岛屿保卫战：怪物潮一波波来袭，答对词题击退怪物，答错扣心。
 * 心扣光 = 失守；全部击退 = 守住岛屿，拿额外奖励。
 */

interface RaidDetail {
  id: number;
  status: "active" | "won" | "lost";
  wavesTotal: number;
  wavesResolved: number;
  hearts: number;
  maxHearts: number;
  waves: RaidWave[];
}

const WIN_BONUS_TEXT = { coins: 60, xp: 40 };

export function RaidModal({ summary, open, onClose }: { summary: RaidSummary | null; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [detail, setDetail] = useState<RaidDetail | null>(null);
  const [answerState, setAnswerState] = useState<{ index: number; hit: boolean } | null>(null);
  const [settled, setSettled] = useState<{ won: boolean; coins: number; xp: number } | null>(null);
  const [pending, startTransition] = useTransitionState();
  const loading = open && !!summary && detail?.id !== summary?.id;

  useEffect(() => {
    if (!open || !summary || detail?.id === summary.id) return;
    let cancelled = false;
    getRaidDetailAction(summary.id).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setDetail(res.data);
        setAnswerState(null);
        setSettled(null);
      } else {
        toast({ kind: "error", title: res.error });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, summary?.id, detail?.id]);

  const wave = detail && detail.status === "active" ? detail.waves[detail.wavesResolved] : null;

  const answer = (index: number) => {
    if (!detail || !wave || answerState || pending) return;
    startTransition(async () => {
      const res = await resolveRaidWaveAction({ raidId: detail.id, waveIndex: detail.wavesResolved, answerIndex: index });
      if (!res.ok) return toast({ kind: "error", title: res.error });
      const { hit, raid, settled: result } = res.data;
      setAnswerState({ index, hit });
      setTimeout(() => {
        setAnswerState(null);
        setDetail((cur) => (cur ? { ...cur, status: raid.status, hearts: raid.hearts, wavesResolved: raid.wavesResolved } : cur));
        if (result) {
          setSettled(result);
          router.refresh();
        }
      }, 900);
    });
  };

  const hearts = detail?.hearts ?? summary?.hearts ?? 3;
  const maxHearts = detail?.maxHearts ?? summary?.maxHearts ?? 3;
  const resolved = detail?.wavesResolved ?? summary?.wavesResolved ?? 0;
  const total = detail?.wavesTotal ?? summary?.wavesTotal ?? 6;

  return (
    <Modal open={open} onClose={onClose} title="岛屿保卫战" size="md">
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">怪物正在靠近…</div>
      ) : !detail ? (
        <div className="py-12 text-center text-sm text-slate-400">今天没有怪物潮</div>
      ) : settled ? (
        <div className="space-y-4 py-4 text-center">
          <div className="text-6xl">{settled.won ? "🏰" : "🌊"}</div>
          <div className="text-lg font-bold">{settled.won ? "守住岛屿啦！" : "岛屿失守了…"}</div>
          <p className="text-sm text-slate-500">
            {settled.won ? `击退了全部 ${total} 波怪物` : "别灰心，复习一下再来保卫"} · 明天怪物还会再来
          </p>
          <div className="rounded-2xl bg-sun-50 px-4 py-3 text-sm font-semibold text-sun-600">
            <Sparkles className="mr-1 inline h-4 w-4" />
            获得 +{settled.coins} 金币{settled.xp > 0 ? ` · +${settled.xp} XP` : ""}
          </div>
          <Button className="w-full" onClick={onClose}>
            返回岛屿
          </Button>
        </div>
      ) : detail.status !== "active" ? (
        <div className="space-y-4 py-4 text-center">
          <div className="text-6xl">{detail.status === "won" ? "🏰" : "🌊"}</div>
          <div className="text-lg font-bold">{detail.status === "won" ? "今天已经守住岛屿" : "今天岛屿失守了"}</div>
          <p className="text-sm text-slate-500">每天第一次上岛时怪物潮会出现，明天再来保卫。</p>
          <Button className="w-full" onClick={onClose}>返回岛屿</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 战况 HUD */}
          <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2.5">
            <span className="inline-flex items-center gap-1 text-sm font-semibold">
              <Shield className="h-4 w-4 text-ocean-500" />
              第 {resolved + 1} / {total} 波
            </span>
            <span className="inline-flex items-center gap-0.5">
              {Array.from({ length: maxHearts }).map((_, i) => (
                <Heart key={i} className={cn("h-4 w-4", i < hearts ? "fill-coral-500 text-coral-500" : "text-slate-200")} />
              ))}
            </span>
          </div>

          {wave && (
            <>
              {/* 怪物 */}
              <div className={cn("text-center text-6xl transition-transform", answerState?.hit && "animate-pop opacity-40", answerState && !answerState.hit && "scale-110")}>
                {wave.monster}
              </div>

              {/* 题目 */}
              <div className="text-center">
                {wave.mode === "en2zh" ? (
                  <>
                    <div className="text-2xl font-bold tracking-tight">{wave.word}</div>
                    <div className="mt-1 text-xs text-slate-400">选择正确的中文释义击退它</div>
                  </>
                ) : (
                  <>
                    <div className="text-xl font-semibold">{wave.meaning}</div>
                    <div className="mt-1 text-xs text-slate-400">选择对应的英文单词击退它</div>
                  </>
                )}
              </div>

              {/* 选项 */}
              <div className="grid grid-cols-2 gap-2">
                {wave.options.map((opt, i) => {
                  const revealed = answerState;
                  const isCorrect = i === wave.correctIndex;
                  const chosen = revealed?.index === i;
                  return (
                    <button
                      key={i}
                      disabled={!!answerState || pending}
                      onClick={() => answer(i)}
                      className={cn(
                        "rounded-2xl border px-3 py-3 text-sm font-medium transition-all",
                        !revealed && "border-slate-200 bg-white hover:border-ocean-300 hover:bg-ocean-50",
                        revealed && isCorrect && "border-leaf-400 bg-leaf-50 text-leaf-700",
                        revealed && chosen && !isCorrect && "border-coral-400 bg-coral-50 text-coral-600",
                        revealed && !isCorrect && !chosen && "border-slate-100 bg-white opacity-50",
                      )}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              <div className="text-center text-xs text-slate-400">
                答对 +15 金币（结算发放）· 全部击退再得 {WIN_BONUS_TEXT.coins} 金币 + {WIN_BONUS_TEXT.xp} XP
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

// useTransition 的本地包装：避免与页面级 pending 冲突
function useTransitionState() {
  const [pending, startTransition] = useTransition();
  return [pending, startTransition] as const;
}
