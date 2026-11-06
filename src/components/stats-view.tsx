"use client";

import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Brain, CalendarDays, CheckCircle2, Flame, Target, TrendingUp } from "lucide-react";
import type { DailyStatPoint, StatsData, WeakWord } from "@/lib/types";
import { STATUS_META } from "@/lib/game/srs";
import { cn, percent } from "@/lib/utils";
import { Card, ProgressBar, Ring, SectionTitle } from "./ui";
import { ExportProgressButton } from "./export-progress-button";

const STATUS_COLORS: Record<string, string> = { new: "#cbd5e1", learning: "#f7c948", review: "#4ea8e6", mastered: "#55bb6a" };

function Delta({ now, before, suffix = "" }: { now: number; before: number; suffix?: string }) {
  const diff = now - before;
  if (diff === 0) return <span className="text-xs text-slate-400">与上周持平</span>;
  const up = diff > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-leaf-600" : "text-coral-500")}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {up ? "+" : ""}
      {diff}
      {suffix} vs 上周
    </span>
  );
}

const HEAT_LEVEL_BG = ["bg-slate-100", "bg-leaf-100", "bg-leaf-300", "bg-leaf-500"];

function heatLevel(total: number): number {
  if (total <= 0) return 0;
  if (total < 10) return 1;
  if (total < 30) return 2;
  return 3;
}

/** GitHub 风格的活动热力图：按周（周日为首列）排列最近 30 天 */
function Heatmap({ points }: { points: DailyStatPoint[] }) {
  const cells: (DailyStatPoint | null)[] = [];
  if (points.length > 0) {
    const first = new Date(`${points[0].date}T00:00:00Z`);
    const lead = first.getUTCDay(); // 0=Sun
    for (let i = 0; i < lead; i++) cells.push(null);
  }
  cells.push(...points);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <div className="grid grid-flow-col grid-rows-7 gap-1.5">
          {cells.map((c, i) => (
            <div
              key={i}
              title={c ? `${c.date}：${c.total} 题` : undefined}
              className={cn("h-5 w-5 rounded-[5px]", c ? HEAT_LEVEL_BG[heatLevel(c.total)] : "bg-transparent")}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <span>少</span>
        {HEAT_LEVEL_BG.map((bg, i) => (
          <span key={i} className={cn("h-3 w-3 rounded-[4px]", bg)} />
        ))}
        <span>多</span>
        <span className="ml-auto">最近 30 天</span>
      </div>
    </div>
  );
}

function WeakWords({ words, totalWords }: { words: WeakWord[]; totalWords: number }) {
  if (words.length === 0) {
    return (
      <Card className="p-8 text-center">
        <CheckCircle2 className="mx-auto h-9 w-9 text-leaf-400" />
        <h3 className="mt-2 text-sm font-semibold">还没有薄弱词</h3>
        <p className="mt-1 text-xs text-slate-500">{totalWords > 0 ? "你目前掌握的单词都很稳，继续保持！" : "开始学习后，这里会列出最容易答错的单词。"}</p>
      </Card>
    );
  }
  return (
    <Card className="divide-y divide-slate-100 p-2">
      {words.map((w) => (
        <div key={w.id} className="flex items-center gap-3 px-2 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{w.word}</span>
              <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{STATUS_META[w.status].label}</span>
            </div>
            <p className="truncate text-xs text-slate-500">{w.meaning}</p>
          </div>
          <div className="flex w-28 shrink-0 items-center gap-2">
            <ProgressBar value={w.proficiency} max={100} height="h-1.5" className="flex-1" barClassName={w.status === "mastered" ? "bg-leaf-500" : "bg-ocean-400"} />
            <span className="w-9 text-right text-[11px] text-slate-400">{w.proficiency}%</span>
          </div>
          {w.wrongCount > 0 && (
            <span className="shrink-0 rounded-full bg-coral-50 px-2 py-0.5 text-[11px] font-medium text-coral-500">错 {w.wrongCount}</span>
          )}
        </div>
      ))}
    </Card>
  );
}

export function StatsView({ data }: { data: StatsData }) {
  const learned = data.statusCounts.learning + data.statusCounts.review + data.statusCounts.mastered;
  const overallAccuracy = data.totalAnswered ? Math.round((data.totalCorrect / data.totalAnswered) * 100) : null;
  const accuracySeries = data.series.filter((p) => p.accuracy !== null);
  const pieData = (Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((k) => ({ key: k, name: STATUS_META[k].label, value: data.statusCounts[k] }));
  const reviewTotal = data.review.reviewedToday + data.review.dueNow;
  const hasAny = data.totalAnswered > 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">学习统计</h1>
            <p className="mt-1 text-sm text-slate-500">
              累计学习 {data.activeDays} 天 · 答题 {data.totalAnswered} 次
            </p>
          </div>
          <ExportProgressButton />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between text-sm text-slate-500">
            已学单词 <Brain className="h-4 w-4 text-ocean-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">{learned}</div>
          <div className="text-xs text-slate-400">共 {data.totalWords} 词</div>
        </Card>
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between text-sm text-slate-500">
            已掌握 <CheckCircle2 className="h-4 w-4 text-leaf-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">{data.statusCounts.mastered}</div>
          <div className="text-xs text-slate-400">占已学 {percent(data.statusCounts.mastered, learned)}%</div>
        </Card>
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between text-sm text-slate-500">
            总正确率 <Target className="h-4 w-4 text-sun-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">{overallAccuracy === null ? "—" : `${overallAccuracy}%`}</div>
          <div className="text-xs text-slate-400">
            {data.totalCorrect}/{data.totalAnswered} 题
          </div>
        </Card>
        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between text-sm text-slate-500">
            连续学习 <Flame className="h-4 w-4 text-coral-500" />
          </div>
          <div className="mt-2 text-2xl font-bold">{data.player.streak} 天</div>
          <div className="text-xs text-slate-400">最长纪录 {data.bestStreak} 天</div>
        </Card>
      </section>

      {!hasAny && (
        <Card className="p-8 text-center">
          <TrendingUp className="mx-auto h-10 w-10 text-ocean-400" />
          <h2 className="mt-3 text-lg font-semibold">还没有学习数据</h2>
          <p className="mt-1 text-sm text-slate-500">完成第一组学习后，这里会展示你的学习趋势和复习情况。</p>
          <Link href="/study" className="mt-4 inline-flex h-11 items-center rounded-2xl bg-ocean-500 px-5 text-sm font-medium text-white">
            开始学习
          </Link>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <SectionTitle>学习活跃度</SectionTitle>
          <Card className="p-4">
            <Heatmap points={data.heatmap} />
          </Card>
        </section>

        <section>
          <SectionTitle>薄弱词清单</SectionTitle>
          <WeakWords words={data.weakWords} totalWords={data.totalWords} />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <SectionTitle action={<Delta now={data.thisWeek.total} before={data.lastWeek.total} suffix=" 题" />}>最近 14 天学习量</SectionTitle>
          <Card className="p-4">
            <div className="h-56 md:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke="#eef1f5" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: 16, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v, name) => [v, name === "newLearned" ? "新词" : "复习"]} labelFormatter={(l) => `${l}`} />
                  <Bar dataKey="newLearned" stackId="a" fill="#4ea8e6" radius={[0, 0, 4, 4]} />
                  <Bar dataKey="reviewed" stackId="a" fill="#84d393" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-ocean-400" /> 新词
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-leaf-300" /> 复习
              </span>
              <span className="ml-auto">
                本周 {data.thisWeek.total} 题（新词 {data.thisWeek.newLearned} / 复习 {data.thisWeek.reviewed}）
              </span>
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle>掌握分布</SectionTitle>
          <Card className="flex items-center gap-4 p-4">
            <div className="h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2} stroke="none">
                    {pieData.map((d) => (
                      <Cell key={d.key} fill={STATUS_COLORS[d.key]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 16, border: "1px solid #e2e8f0", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex-1 space-y-2 text-sm">
              {pieData.map((d) => (
                <li key={d.key} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[d.key] }} />
                  <span className="text-slate-600">{d.name}</span>
                  <span className="ml-auto font-semibold">{d.value}</span>
                  <span className="w-10 text-right text-xs text-slate-400">{percent(d.value, data.totalWords)}%</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <SectionTitle action={data.thisWeek.accuracy !== null && data.lastWeek.accuracy !== null ? <Delta now={Math.round(data.thisWeek.accuracy * 100)} before={Math.round(data.lastWeek.accuracy * 100)} suffix="%" /> : undefined}>正确率变化</SectionTitle>
          <Card className="p-4">
            {accuracySeries.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-slate-400">暂无数据</div>
            ) : (
              <div className="h-48 md:h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={accuracySeries} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="acc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2b8ad6" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#2b8ad6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#eef1f5" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 16, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v) => [`${v}%`, "正确率"]} />
                    <Area type="monotone" dataKey="accuracy" stroke="#2b8ad6" strokeWidth={2.5} fill="url(#acc)" dot={{ r: 3, fill: "#2b8ad6" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </section>

        <section>
          <SectionTitle>复习完成情况</SectionTitle>
          <Card className="p-5">
            <div className="flex items-center gap-5">
              <Ring value={data.review.reviewedToday} max={Math.max(1, reviewTotal)} size={104} stroke={10} color="#55bb6a">
                <div className="text-center leading-none">
                  <div className="text-xl font-bold">{percent(data.review.reviewedToday, reviewTotal)}%</div>
                  <div className="mt-1 text-[10px] text-slate-400">今日</div>
                </div>
              </Ring>
              <div className="flex-1 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">今日已复习</span>
                  <span className="font-semibold">{data.review.reviewedToday}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">当前待复习</span>
                  <span className={cn("font-semibold", data.review.dueNow > 0 && "text-coral-500")}>{data.review.dueNow}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">24 小时内到期</span>
                  <span className="font-semibold">{data.review.upcoming24h}</span>
                </div>
              </div>
            </div>
            {data.review.dueNow > 0 && (
              <Link href="/study?kind=review" className="mt-4 flex h-11 items-center justify-center rounded-2xl bg-coral-500 text-sm font-medium text-white hover:bg-coral-600">
                立即复习 {data.review.dueNow} 个单词
              </Link>
            )}
          </Card>

          <SectionTitle>
            <span className="mt-6 inline-flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-ocean-500" /> 连续学习记录
            </span>
          </SectionTitle>
          <Card className="p-4">
            <div className="grid grid-cols-7 gap-1.5">
              {data.series.map((p) => (
                <div key={p.date} className="text-center">
                  <div className={cn("mx-auto grid h-9 w-9 place-items-center rounded-xl text-xs font-semibold", p.total > 0 ? (p.total >= 30 ? "bg-leaf-500 text-white" : p.total >= 10 ? "bg-leaf-300 text-leaf-800" : "bg-leaf-100 text-leaf-700") : "bg-slate-100 text-slate-300")} title={`${p.date}：${p.total} 题`}>
                    {p.total > 0 ? p.total : "·"}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">{p.label}</div>
                </div>
              ))}
            </div>
            <ProgressBar value={data.player.streak} max={Math.max(7, data.bestStreak)} className="mt-4" barClassName="bg-coral-400" />
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>当前连续 {data.player.streak} 天</span>
              <span>目标 {Math.max(7, data.bestStreak)} 天</span>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
