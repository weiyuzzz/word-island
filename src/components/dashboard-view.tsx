"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, BookOpen, Brain, CalendarCheck, Check, Crown, Flame, Gift, Hammer, Lock, Sailboat, Sprout, Star, Swords, Target, TreePalm, Trophy, Zap } from "lucide-react";
import type { DashboardData, DailyTaskView } from "@/lib/types";
import { DAILY_GOAL_OPTIONS } from "@/lib/game/economy";
import { cn, percent } from "@/lib/utils";
import { Button, Card, CoinIcon, Pill, ProgressBar, Ring, SectionTitle, useToast } from "./ui";
import { claimLoginRewardAction, claimTaskAction, updateDailyGoalAction } from "@/server/actions";

const ACH_ICONS: Record<string, typeof Star> = { sail: Sailboat, trophy: Trophy, book: BookOpen, star: Star, brain: Brain, flame: Flame, hammer: Hammer, crown: Crown };

export function DashboardView({ data }: { data: DashboardData }) {
  const router = useRouter();
  const toast = useToast();
  const [player, setPlayer] = useState(data.player);
  const [tasks, setTasks] = useState<DailyTaskView[]>(data.tasks);
  const [loginAvailable, setLoginAvailable] = useState(data.loginRewardAvailable);
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const todayPct = percent(data.today.total, player.dailyGoal);
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 6) return "夜深了";
    if (h < 11) return "早上好";
    if (h < 14) return "中午好";
    if (h < 18) return "下午好";
    return "晚上好";
  })();

  const claim = (key: string) => {
    setBusyKey(key);
    startTransition(async () => {
      const res = await claimTaskAction(key);
      setBusyKey(null);
      if (!res.ok) return toast({ kind: "error", title: res.error });
      setPlayer(res.data.player);
      setTasks(res.data.tasks);
      toast({ kind: "reward", title: `任务奖励 +${res.data.reward.coins} 金币 +${res.data.reward.xp} XP` });
      if (res.data.leveledUp) toast({ kind: "success", title: `升级啦！现在是 Lv.${res.data.player.level}` });
    });
  };

  const claimLogin = () => {
    setBusyKey("login");
    startTransition(async () => {
      const res = await claimLoginRewardAction();
      setBusyKey(null);
      if (!res.ok) return toast({ kind: "error", title: res.error });
      setPlayer(res.data.player);
      setLoginAvailable(false);
      toast({ kind: "reward", title: `每日登录奖励 +${res.data.reward.coins} 金币 +${res.data.reward.xp} XP` });
    });
  };

  const changeGoal = (goal: number) => {
    startTransition(async () => {
      const res = await updateDailyGoalAction(goal);
      if (!res.ok) return toast({ kind: "error", title: res.error });
      setPlayer((p) => ({ ...p, dailyGoal: res.data }));
      router.refresh();
    });
  };

  const unlockedCount = data.achievements.filter((a) => a.unlockedAt).length;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-ocean-500 via-ocean-400 to-leaf-400 p-6 text-white shadow-lift md:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 right-24 h-56 w-56 rounded-full bg-sun-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <Ring value={player.levelXp} max={player.levelNeed} size={92} stroke={9} color="#fff">
              <div className="text-center leading-none">
                <div className="text-[10px] uppercase tracking-wider text-white/80">Level</div>
                <div className="text-2xl font-bold">{player.level}</div>
              </div>
            </Ring>
            <div>
              <p className="text-sm text-white/80">{greeting}，岛主</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">今天也来给小岛添砖加瓦吧</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
                  <CoinIcon className="h-4 w-4" /> {player.coins} 金币
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
                  <Zap className="h-4 w-4" /> {player.levelXp}/{player.levelNeed} XP
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
                  <Flame className="h-4 w-4" /> 连续 {player.streak} 天
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
            <Link href={data.dueCount > 0 ? "/study?kind=mixed" : "/study"} className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-white px-6 text-base font-semibold text-ocean-600 shadow-lift transition hover:bg-ocean-50 active:scale-[0.98]">
              开始今日学习 <ArrowRight className="h-5 w-5" />
            </Link>
            <Link href="/map" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-white/15 px-6 text-base font-semibold text-white backdrop-blur transition hover:bg-white/25 active:scale-[0.98]">
              探索地图 <Swords className="h-5 w-5" />
            </Link>
            <Link href="/garden" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-white/15 px-6 text-base font-semibold text-white backdrop-blur transition hover:bg-white/25 active:scale-[0.98]">
              词汇花园 <Sprout className="h-5 w-5" />
            </Link>
            {loginAvailable && (
              <Button variant="sun" size="lg" icon={<Gift className="h-5 w-5" />} loading={pending && busyKey === "login"} onClick={claimLogin}>
                领取登录奖励
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Stats grid */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">今日学习</span>
            <Target className="h-4 w-4 text-ocean-500" />
          </div>
          <div className="mt-2 flex items-end gap-1">
            <span className="text-2xl font-bold">{data.today.total}</span>
            <span className="pb-1 text-xs text-slate-400">/ {player.dailyGoal} 题</span>
          </div>
          <ProgressBar value={data.today.total} max={player.dailyGoal} className="mt-3" />
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>{todayPct}%</span>
            <select value={player.dailyGoal} onChange={(e) => changeGoal(Number(e.target.value))} className="rounded-md bg-slate-50 px-1 py-0.5 text-[11px] text-slate-500" aria-label="设置每日目标">
              {DAILY_GOAL_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  目标 {g}
                </option>
              ))}
            </select>
          </div>
        </Card>
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">待复习</span>
            <Brain className="h-4 w-4 text-coral-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">{data.dueCount}</div>
          <p className="mt-1 text-xs text-slate-400">{data.dueCount > 0 ? "趁记忆还新鲜，去复习一下" : "暂时没有需要复习的单词"}</p>
          {data.dueCount > 0 && (
            <Link href="/study?kind=review" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-ocean-600">
              去复习 <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </Card>
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">连续学习</span>
            <Flame className="h-4 w-4 text-sun-500" />
          </div>
          <div className="mt-2 flex items-end gap-1">
            <span className="text-2xl font-bold">{player.streak}</span>
            <span className="pb-1 text-xs text-slate-400">天</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">{data.today.total > 0 ? "今天已打卡 ✓" : "今天还没学习哦"}</p>
        </Card>
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">岛屿建设</span>
            <TreePalm className="h-4 w-4 text-leaf-500" />
          </div>
          <div className="mt-2 flex items-end gap-1">
            <span className="text-2xl font-bold">{data.island.ownedTypes}</span>
            <span className="pb-1 text-xs text-slate-400">/ {data.island.totalTypes} 种建筑</span>
          </div>
          <ProgressBar value={data.island.ownedTypes} max={data.island.totalTypes} className="mt-3" barClassName="bg-leaf-500" />
          <p className="mt-2 text-[11px] text-slate-400">{data.island.nextUnlock ? `Lv.${data.island.nextUnlock.level} 解锁${data.island.nextUnlock.name}` : "全部建筑已解锁"}</p>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* Tasks */}
        <section>
          <SectionTitle action={<span className="text-xs text-slate-400">每天 0 点刷新</span>}>
            <span className="inline-flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-ocean-500" /> 每日任务
            </span>
          </SectionTitle>
          <Card className="divide-y divide-slate-100">
            {tasks.map((t) => {
              const done = t.progress >= t.target;
              return (
                <div key={t.key} className="flex items-center gap-4 p-4">
                  <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-2xl", t.claimed ? "bg-leaf-50 text-leaf-600" : done ? "bg-sun-100 text-sun-600" : "bg-slate-100 text-slate-400")}>
                    {t.claimed ? <Check className="h-5 w-5" /> : <Target className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("truncate text-sm font-semibold", t.claimed && "text-slate-400 line-through")}>{t.title}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <ProgressBar value={t.progress} max={t.target} className="max-w-[160px]" height="h-1.5" barClassName={t.claimed ? "bg-leaf-400" : "bg-ocean-500"} />
                      <span className="text-[11px] text-slate-400">
                        {t.progress}/{t.target}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {t.claimed ? (
                      <Pill tone="leaf">已领取</Pill>
                    ) : t.claimable ? (
                      <Button size="sm" variant="sun" loading={pending && busyKey === t.key} onClick={() => claim(t.key)}>
                        领取 +{t.reward.coins}
                      </Button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                        <CoinIcon className="h-3.5 w-3.5" /> {t.reward.coins}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </section>

        {/* Decks & achievements */}
        <section className="space-y-6">
          <div>
            <SectionTitle
              action={
                <Link href="/vocab" className="text-xs font-semibold text-ocean-600">
                  管理词库
                </Link>
              }
            >
              <span className="inline-flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-ocean-500" /> 词库进度
              </span>
            </SectionTitle>
            <Card className="divide-y divide-slate-100">
              {data.decks.slice(0, 5).map((d) => (
                <Link key={d.id} href={`/study?deck=${d.id}`} className="flex items-center gap-3 p-3.5 transition hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{d.name}</span>
                      {d.due > 0 && <Pill tone="coral">{d.due} 待复习</Pill>}
                    </div>
                    <ProgressBar value={d.learned} max={d.total} className="mt-1.5 max-w-[200px]" height="h-1.5" barClassName="bg-leaf-400" />
                  </div>
                  <span className="text-xs text-slate-400">
                    {d.learned}/{d.total}
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-300" />
                </Link>
              ))}
            </Card>
          </div>

          <div>
            <SectionTitle action={<span className="text-xs text-slate-400">{unlockedCount}/{data.achievements.length} 已解锁</span>}>
              <span className="inline-flex items-center gap-2">
                <Trophy className="h-4 w-4 text-sun-500" /> 成就
              </span>
            </SectionTitle>
            <div className="grid grid-cols-4 gap-2">
              {data.achievements.map((a) => {
                const Icon = ACH_ICONS[a.icon] ?? Star;
                const unlocked = Boolean(a.unlockedAt);
                return (
                  <div key={a.key} title={`${a.title}：${a.description}`} className={cn("flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center", unlocked ? "border-sun-100 bg-gradient-to-b from-sun-100/70 to-white" : "border-slate-100 bg-white")}>
                    <span className={cn("grid h-10 w-10 place-items-center rounded-full", unlocked ? "bg-sun-400 text-white shadow-soft" : "bg-slate-100 text-slate-300")}>{unlocked ? <Icon className="h-5 w-5" /> : <Lock className="h-4 w-4" />}</span>
                    <span className={cn("text-[11px] font-medium leading-tight", !unlocked && "text-slate-400")}>{a.title}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
