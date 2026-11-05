"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Check, Heart, Landmark, Lightbulb, MessageCircle, Mountain, Package, RotateCcw, Sparkles, Swords, TentTree, Trophy, Waves, X, Zap } from "lucide-react";
import type { ClientEventView, EventResult, ExpeditionSummary, ExpeditionView, QuestView } from "@/lib/game/model";
import type { ClientQuestion } from "@/lib/types";
import { getItemDef } from "@/data/items";
import { ATTACK } from "@/lib/game/questions";
import { MODE_META, STATUS_META } from "@/lib/game/srs";
import { cn, formatRelativeTime, findWordInSentence } from "@/lib/utils";
import { finishExplorationAction, resolveEventAction } from "@/server/game-actions";
import { Button, Card, CoinIcon, Pill, ProgressBar, Ring, STATUS_TONE, SpeakButton, speak, useImmersive, useToast } from "../ui";
import { MonsterArt } from "./monster-art";
import { BattleScene } from "./battle-scene";

interface Props {
  initial: ExpeditionView;
  onExit: () => void;
}

const MODE_KEY = "word-island:expedition-mode";
const MODE_EVENT = "word-island:mode-change";

function subscribeMode(onChange: () => void) {
  window.addEventListener(MODE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(MODE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getModeSnapshot() {
  try {
    return window.localStorage.getItem(MODE_KEY) === "classic" ? "classic" : "scene";
  } catch {
    return "scene";
  }
}

function getServerModeSnapshot() {
  return "scene";
}

function EventBanner({ event }: { event: ClientEventView }) {
  return (
    <div className="flex items-start gap-3">
      {event.monster ? (
        <div className="relative shrink-0">
          <MonsterArt art={event.monster.art} className="h-24 w-28" />
        </div>
      ) : (
        <div className={cn("grid h-16 w-16 shrink-0 place-items-center rounded-2xl", event.kind === "treasure" ? "bg-sun-100 text-sun-600" : event.kind === "bottle" ? "bg-ocean-50 text-ocean-600" : event.kind === "stone" ? "bg-slate-100 text-slate-500" : event.kind === "cave" ? "bg-leaf-50 text-leaf-600" : event.kind === "rest" ? "bg-leaf-100 text-leaf-700" : "bg-ocean-50 text-ocean-600")}>
          {event.kind === "treasure" ? (
            <Package className="h-8 w-8" />
          ) : event.kind === "bottle" ? (
            <Waves className="h-8 w-8" />
          ) : event.kind === "stone" ? (
            <Landmark className="h-8 w-8" />
          ) : event.kind === "cave" ? (
            <Mountain className="h-8 w-8" />
          ) : event.kind === "rest" ? (
            <TentTree className="h-8 w-8" />
          ) : (
            <MessageCircle className="h-8 w-8" />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold">{event.title}</span>
          {event.kind === "boss" && <Pill tone="coral">首领</Pill>}
          {event.monster && <Pill tone="slate">{event.questionCount} 回合</Pill>}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {event.npc ? `「${event.npc.line}」` : event.description}
        </p>
        {event.monster && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>HP</span>
              <span className="tabular-nums">
                {event.monster.hp}/{event.monster.maxHp}
              </span>
            </div>
            <ProgressBar value={event.monster.hp} max={event.monster.maxHp} height="h-2.5" barClassName="bg-coral-500" />
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionPrompt({ q }: { q: ClientQuestion }) {
  const mode = q.mode;
  if (mode === "listen") {
    return (
      <div className="text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-ocean-500 text-white shadow-lift">
          <SpeakButton text={q.word ?? ""} className="h-16 w-16 bg-transparent text-white" />
        </div>
        <p className="mt-3 text-sm text-slate-500">听发音，选择正确的中文释义（可以重复播放）</p>
        <span className="sr-only">{q.word}</span>
      </div>
    );
  }
  if (mode === "en2zh" || mode === "synonym" || mode === "antonym") {
    return (
      <div className="text-center">
        <div className="flex items-center justify-center gap-3">
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">{q.word}</h2>
          <SpeakButton text={q.word ?? ""} />
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-500">
          {q.phonetic && <span className="font-mono">{q.phonetic}</span>}
          {q.pos && <Pill tone="slate">{q.pos}</Pill>}
        </div>
        <p className="mt-5 text-sm text-slate-400">
          {mode === "en2zh" ? "选择正确的中文释义" : mode === "synonym" ? "选择意思最接近的表达（同义词）" : "选择它的反义词"}
        </p>
      </div>
    );
  }
  if (mode === "zh2en") {
    return (
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{q.meaning}</h2>
        {q.pos && (
          <div className="mt-2">
            <Pill tone="slate">{q.pos}</Pill>
          </div>
        )}
        <p className="mt-5 text-sm text-slate-400">选择对应的英文单词</p>
      </div>
    );
  }
  if (mode === "context" || mode === "sentence") {
    const parts = (q.prompt ?? "").split("______");
    return (
      <div className="text-center">
        <p className="text-xl leading-relaxed md:text-2xl">
          {parts[0]}
          <span className="mx-1 inline-block min-w-[90px] border-b-2 border-dashed border-ocean-400 align-baseline text-ocean-500">&nbsp;</span>
          {parts[1]}
        </p>
        <p className="mt-4 text-sm text-slate-500">
          提示：{q.meaning} {q.pos && <span className="text-slate-400">({q.pos})</span>}
        </p>
        <p className="mt-2 text-sm text-slate-400">{mode === "sentence" ? "选择在句中正确的单词形式" : "根据上下文选择正确的单词"}</p>
      </div>
    );
  }
  return (
    <div className="text-center">
      <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{q.meaning}</h2>
      {q.pos && (
        <div className="mt-2">
          <Pill tone="slate">{q.pos}</Pill>
        </div>
      )}
      {q.prompt && <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-600">{q.prompt}</p>}
      <p className="mt-4 text-sm text-slate-400">拼写出这个英文单词</p>
    </div>
  );
}

function WordExplanation({ result }: { result: EventResult }) {
  const hit = findWordInSentence(result.word.word, result.word.example);
  return (
    <div className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{result.word.word}</span>
            <SpeakButton text={result.word.word} size="sm" />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            {result.word.phonetic && <span className="font-mono">{result.word.phonetic}</span>}
            {result.word.pos && <Pill tone="slate">{result.word.pos}</Pill>}
          </div>
        </div>
        <div className="text-right text-xs">
          <div className="flex items-center justify-end gap-1">
            <Pill tone={STATUS_TONE[result.statusBefore]}>{STATUS_META[result.statusBefore].label}</Pill>
            <ArrowRight className="h-3 w-3 text-slate-400" />
            <Pill tone={STATUS_TONE[result.statusAfter]}>{STATUS_META[result.statusAfter].label}</Pill>
          </div>
          <div className="mt-1 text-slate-400">
            熟练度 {result.proficiency}% · 下次复习 {formatRelativeTime(result.nextReviewAt)}
          </div>
        </div>
      </div>
      <p className="mt-3 text-base font-medium">{result.word.meaning}</p>
      {result.word.example && (
        <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm leading-relaxed">
          <p className="text-slate-700">
            {hit ? (
              <>
                {result.word.example.slice(0, hit.start)}
                <mark className="rounded bg-sun-100 px-0.5 font-semibold text-ink">{hit.matched}</mark>
                {result.word.example.slice(hit.end)}
              </>
            ) : (
              result.word.example
            )}
          </p>
          {result.word.translation && <p className="mt-1 text-slate-500">{result.word.translation}</p>}
        </div>
      )}
      {!result.correct && (
        <p className="mt-3 rounded-2xl bg-coral-100/60 p-3 text-sm text-coral-600">
          这个单词已加入你的复习队列（10 分钟后再次出现），也可以在词库的「错词」筛选里找到它。
        </p>
      )}
    </div>
  );
}

export function ExpeditionRun({ initial, onExit }: Props) {
  const toast = useToast();
  const router = useRouter();
  useImmersive(true);
  const [view, setView] = useState<ExpeditionView>(initial);
  const [cursor, setCursor] = useState(() => {
    const firstPending = initial.events.findIndex((e) => e.status === "pending");
    return firstPending >= 0 ? firstPending : initial.events.length;
  });
  const [phase, setPhase] = useState<"question" | "feedback" | "reward" | "summary">("question");
  const [chosen, setChosen] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [lastQuestion, setLastQuestion] = useState<ClientQuestion | null>(null);
  const [result, setResult] = useState<EventResult | null>(null);
  const [summary, setSummary] = useState<ExpeditionSummary | null>(null);
  const [quests, setQuests] = useState<QuestView[]>([]);
  const [pending, startTransition] = useTransition();
  const mode = useSyncExternalStore(subscribeMode, getModeSnapshot, getServerModeSnapshot);
  const sceneMode = mode === "scene";
  const startRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const resetAnswer = useCallback(() => {
    setChosen(null);
    setTyped("");
    setLastQuestion(null);
  }, []);

  const toggleMode = useCallback(() => {
    try {
      window.localStorage.setItem(MODE_KEY, sceneMode ? "classic" : "scene");
    } catch {
      // 隐私模式下 localStorage 不可用，仅切换当前会话
    }
    window.dispatchEvent(new Event(MODE_EVENT));
  }, [sceneMode]);

  const event: ClientEventView | undefined = view.events[cursor];
  const q = event?.question ?? null;

  useEffect(() => {
    startRef.current = Date.now();
    if (q?.mode === "spelling") setTimeout(() => inputRef.current?.focus(), 50);
    if (q?.mode === "listen" && q.word) setTimeout(() => speak(q.word ?? ""), 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, q?.index]);

  const finish = useCallback(() => {
    startTransition(async () => {
      const res = await finishExplorationAction(initial.id);
      if (!res.ok) return toast({ kind: "error", title: res.error });
      setSummary(res.data);
      setQuests(res.data.quests);
      setPhase("summary");
    });
  }, [initial.id, toast]);

  const submit = useCallback(
    (answer: string) => {
      if (phase !== "question") return;
      if (!event || !q || pending) return;
      setChosen(answer);
      setLastQuestion(q);
      startTransition(async () => {
        const res = await resolveEventAction({ eventKey: event.eventKey, questionIndex: q.index, answer, responseMs: Date.now() - startRef.current });
        if (!res.ok) {
          setChosen(null);
          return toast({ kind: "error", title: res.error });
        }
        const r = res.data;
        setResult(r);
        setQuests(r.questProgress);
        setView((v) => ({ ...v, events: v.events.map((e) => (e.eventKey === r.event.eventKey ? r.event : e)) }));
        setPhase("feedback");
        if (r.correct) speak(r.word.word);
        if (r.leveledUp) toast({ kind: "success", title: `升级啦！现在是 Lv.${r.player.level}` });
        for (const quest of r.questProgress.filter((qq) => qq.claimable && !qq.claimed)) {
          toast({ kind: "reward", title: `任务「${quest.title}」完成，可领取奖励` });
        }
      });
    },
    [phase, event, q, pending, toast],
  );

  const next = useCallback(() => {
    if (phase !== "feedback" || !result) return;
    if (result.expeditionOver && result.hearts <= 0) {
      toast({ kind: "info", title: "体力耗尽，返回营地", description: "错词已记录，稍后会在复习中再次出现" });
      return finish();
    }
    if (result.eventStatus === "resolved" && result.eventReward) {
      setPhase("reward");
      return;
    }
    if (result.eventStatus === "resolved") {
      if (cursor + 1 >= view.events.length) return finish();
      setCursor((c) => c + 1);
      resetAnswer();
      setPhase("question");
      return;
    }
    resetAnswer();
    setPhase("question");
  }, [phase, result, cursor, view.events.length, finish, toast, resetAnswer]);

  const advance = useCallback(() => {
    if (cursor + 1 >= view.events.length) return finish();
    setCursor((c) => c + 1);
    resetAnswer();
    setPhase("question");
  }, [cursor, view.events.length, finish, resetAnswer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === "feedback" && e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (phase === "reward" && e.key === "Enter") {
        e.preventDefault();
        advance();
      } else if (phase === "question" && q?.options && /^[1-4]$/.test(e.key)) {
        const opt = q.options[Number(e.key) - 1];
        if (opt) submit(opt);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, q, next, advance, submit]);

  // ---------- 总结 ----------
  if (phase === "summary" && summary) {
    const pct = Math.round(summary.accuracy * 100);
    return (
      <div className="mx-auto max-w-2xl space-y-4 animate-fade-up">
        <Card className="overflow-hidden">
          <div className={cn("p-6 text-center text-white", summary.completed ? "bg-gradient-to-br from-leaf-500 to-ocean-400" : "bg-gradient-to-br from-slate-500 to-slate-600")}>
            <div className="mx-auto inline-flex">
              <Ring value={summary.correct} max={Math.max(1, summary.answered)} size={116} stroke={11} color="#fff">
                <div className="leading-none">
                  <div className="text-3xl font-bold">{pct}%</div>
                  <div className="mt-1 text-[11px] text-white/80">正确率</div>
                </div>
              </Ring>
            </div>
            <h2 className="mt-4 text-2xl font-bold">
              {summary.completed ? `完成${summary.regionName}探索！` : "探索结束，返回营地"}
            </h2>
            <p className="mt-1 text-sm text-white/85">
              答对 {summary.correct}/{summary.answered} 题 · 击败 {summary.monstersDefeated} 只怪物 · 找到 {summary.chestsFound} 个宝箱
            </p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
            <div className="p-4 text-center">
              <div className="inline-flex items-center gap-1.5 text-2xl font-bold">
                <CoinIcon className="h-6 w-6" /> +{summary.coinsEarned}
              </div>
              <div className="text-xs text-slate-400">金币</div>
            </div>
            <div className="p-4 text-center">
              <div className="inline-flex items-center gap-1.5 text-2xl font-bold">
                <Zap className="h-6 w-6 text-ocean-500" /> +{summary.xpEarned}
              </div>
              <div className="text-xs text-slate-400">经验</div>
            </div>
          </div>
          <div className="space-y-3 p-5">
            {summary.itemsFound.length > 0 && (
              <div className="rounded-2xl bg-sun-100/60 p-3 text-sm">
                <div className="mb-1 flex items-center gap-1.5 font-semibold text-sun-600">
                  <Sparkles className="h-4 w-4" /> 获得道具
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {summary.itemsFound.map((k, i) => (
                    <span key={`${k}-${i}`} className="rounded-lg bg-white/70 px-2 py-1 text-xs">
                      {getItemDef(k)?.name ?? k}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {summary.wrongWords.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-600">需要加强的单词（已排入复习队列）</div>
                <div className="flex flex-wrap gap-2">
                  {summary.wrongWords.map((w) => (
                    <span key={w.id} className="inline-flex items-center gap-1.5 rounded-xl bg-coral-100/70 px-3 py-1.5 text-sm">
                      <span className="font-semibold">{w.word}</span>
                      <span className="text-slate-500">{w.meaning}</span>
                      <SpeakButton text={w.word} size="sm" className="h-6 w-6 bg-white" />
                    </span>
                  ))}
                </div>
              </div>
            )}
            {summary.leveledUp && (
              <div className="flex items-center gap-3 rounded-2xl bg-ocean-50 p-3 text-sm animate-pop">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-ocean-500 text-base font-bold text-white">{summary.player.level}</span>
                <div>
                  <div className="font-semibold text-ocean-700">升级到 Lv.{summary.player.level}！</div>
                  <div className="text-xs text-ocean-600/80">新的区域或商店商品可能已解锁</div>
                </div>
              </div>
            )}
            <div className="rounded-2xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
              学习报告：本次共遇到 {summary.report.length} 个单词，所有答题记录已按间隔复习算法安排下次复习时间。掌握的单词会出现在词汇花园中。
            </div>
          </div>
        </Card>
        <div className="grid gap-2 sm:grid-cols-3">
          <Button size="lg" icon={<RotateCcw className="h-5 w-5" />} onClick={onExit}>
            返回地图
          </Button>
          <Button size="lg" variant="secondary" icon={<Trophy className="h-5 w-5" />} onClick={() => router.push("/map")}>
            查看任务奖励
          </Button>
          <Button size="lg" variant="secondary" icon={<Heart className="h-5 w-5" />} onClick={() => router.push("/garden")}>
            去词汇花园
          </Button>
        </div>
      </div>
    );
  }

  if (!event) return null;
  const attackLabel = q ? ATTACK[q.mode] : null;

  const hud = (
    <>
      {/* 状态栏 */}
      <div className="flex items-center gap-3">
        <button onClick={onExit} aria-label="退出探索" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-slate-500 shadow-soft hover:bg-slate-50">
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <ProgressBar value={view.resolvedEvents + (result?.eventStatus === "resolved" ? 1 : 0)} max={view.totalEvents} height="h-3" barClassName="bg-leaf-500" />
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-semibold shadow-soft">
            {Array.from({ length: view.maxHearts }, (_, i) => (
              <Heart key={i} className={cn("h-4 w-4", i < view.hearts ? "fill-coral-500 text-coral-500" : "text-slate-300")} />
            ))}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-semibold shadow-soft">
            <CoinIcon className="h-4 w-4" /> {view.coinsEarned}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          {view.regionName} · 事件 {Math.min(cursor + 1, view.totalEvents)}/{view.totalEvents}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {q && <Pill tone="ocean">{MODE_META[q.mode].label}</Pill>}
          {q?.isNew && <Pill tone="sun">新词</Pill>}
          {view.currentStreak >= 3 && <Pill tone="coral">连击 ×{view.currentStreak}</Pill>}
          <button
            type="button"
            onClick={toggleMode}
            title={sceneMode ? "切换到极速答题" : "切换到场景战斗"}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-500 transition hover:border-ocean-300 hover:text-ocean-600"
          >
            {sceneMode ? <BookOpen className="h-3 w-3" /> : <Swords className="h-3 w-3" />}
            {sceneMode ? "极速" : "场景"}
          </button>
        </span>
      </div>
    </>
  );

  // P0 场景战斗：同一套 server actions，只是把答案变成场景里的实体
  if (sceneMode) {
    return (
      <div className="mx-auto max-w-4xl">
        {hud}
        <BattleScene
          view={view}
          event={event}
          question={q ?? lastQuestion}
          phase={phase}
          chosen={chosen}
          result={result}
          pending={pending}
          typed={typed}
          onTyped={setTyped}
          onSubmit={submit}
          onNext={next}
          onAdvance={advance}
          inputRef={inputRef}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {hud}

      {/* 事件 */}
      <Card key={`${event.eventKey}-${cursor}`} className="mt-3 animate-fade-up">
        <div className="border-b border-slate-100 p-4">
          <EventBanner event={event} />
        </div>
        {phase === "reward" && result?.eventReward ? (
          <div className="p-8 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-sun-100 text-sun-600 animate-pop">
              <Trophy className="h-8 w-8" />
            </div>
            <h3 className="mt-3 text-lg font-bold">事件完成！</h3>
            <div className="mt-2 flex items-center justify-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-sun-100 px-3 py-1 font-semibold">
                <CoinIcon className="h-4 w-4" /> +{result.eventReward.coins}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-ocean-50 px-3 py-1 font-semibold text-ocean-700">
                <Zap className="h-4 w-4" /> +{result.eventReward.xp}
              </span>
              {result.eventReward.item && <span className="rounded-full bg-leaf-50 px-3 py-1 font-semibold text-leaf-700">获得道具 ×1</span>}
            </div>
            <Button size="lg" className="mt-5" onClick={advance} icon={<ArrowRight className="h-5 w-5" />}>
              继续探索
            </Button>
          </div>
        ) : q ? (
          <div className="p-5 md:p-6">
            <QuestionPrompt q={q} />

            {q.options && q.options.length > 0 ? (
              <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
                {q.options.map((opt, i) => {
                  const isChosen = chosen === opt;
                  const isCorrect = phase === "feedback" && result?.correctAnswer === opt;
                  const isWrong = phase === "feedback" && isChosen && !result?.correct;
                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={phase !== "question" || pending}
                      onClick={() => submit(opt)}
                      className={cn(
                        "flex min-h-[58px] items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-base font-medium transition-all",
                        phase === "question" && "border-slate-200 bg-white hover:border-ocean-300 hover:bg-ocean-50 active:scale-[0.99]",
                        isCorrect && "border-leaf-500 bg-leaf-50 text-leaf-700",
                        isWrong && "border-coral-500 bg-coral-100/60 text-coral-600 animate-shake",
                        phase === "feedback" && !isCorrect && !isWrong && "border-slate-100 bg-slate-50 text-slate-400",
                      )}
                    >
                      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold", isCorrect ? "bg-leaf-500 text-white" : isWrong ? "bg-coral-500 text-white" : "bg-slate-100 text-slate-500")}>
                        {isCorrect ? <Check className="h-4 w-4" /> : isWrong ? <X className="h-4 w-4" /> : i + 1}
                      </span>
                      <span className="flex-1">{opt}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <form
                className="mt-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (typed.trim()) submit(typed);
                }}
              >
                <input
                  ref={inputRef}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  disabled={phase !== "question" || pending}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="输入英文单词"
                  className={cn(
                    "h-14 w-full rounded-2xl border-2 bg-white px-4 text-center text-xl font-semibold tracking-wide outline-none transition placeholder:font-mono placeholder:text-slate-300",
                    phase === "question" && "border-slate-200 focus:border-ocean-400",
                    phase === "feedback" && result?.correct && "border-leaf-500 bg-leaf-50 text-leaf-700",
                    phase === "feedback" && !result?.correct && "border-coral-500 bg-coral-100/60 text-coral-600 animate-shake",
                  )}
                />
                {phase === "question" && (
                  <div className="mt-3 flex items-center justify-between">
                    <button type="button" onClick={() => speak(q.word ?? "")} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-100">
                      <Lightbulb className="h-4 w-4" /> 提示：{q.firstLetter}
                      {Array.from({ length: Math.max(0, (q.length ?? 1) - 1) })
                        .map(() => "_")
                        .join("")}{" "}
                      （{q.length} 个字母）
                    </button>
                    <Button type="submit" loading={pending} disabled={!typed.trim()}>
                      攻击！
                    </Button>
                  </div>
                )}
              </form>
            )}

            {attackLabel && phase === "question" && (
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400">
                <span className="rounded-full bg-slate-50 px-2.5 py-1">{attackLabel.label}</span>
                <span>伤害 {attackLabel.damage}</span>
                <span>·</span>
                <span>{MODE_META[q.mode].description}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400">事件已完成</div>
        )}
      </Card>

      {/* 反馈 */}
      {phase === "feedback" && result && (
        <div className="mt-3 animate-fade-up">
          <Card className={cn("overflow-hidden border-2", result.correct ? "border-leaf-200" : "border-coral-100")}>
            <div className={cn("flex items-center justify-between px-5 py-3 text-sm font-semibold", result.correct ? "bg-leaf-50 text-leaf-700" : "bg-coral-100/60 text-coral-600")}>
              <span className="inline-flex items-center gap-2">
                {result.correct ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                {result.correct ? `${result.attack.label}！` : "答错了，但怪物的攻势被挡住了"}
              </span>
              <span className="inline-flex items-center gap-2">
                {result.correct && (
                  <span className="rounded-full bg-white/80 px-2 py-0.5">
                    -{result.attack.damage} HP
                  </span>
                )}
                {result.reward.coins + result.streakBonus > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5">
                    <CoinIcon className="h-3.5 w-3.5" /> +{result.reward.coins + result.streakBonus}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5">
                  <Zap className="h-3.5 w-3.5" /> +{result.reward.xp}
                </span>
                {result.streakBonus > 0 && <span className="rounded-full bg-sun-400 px-2 py-0.5 text-ink">连击奖励！</span>}
              </span>
            </div>
            <WordExplanation result={result} />
          </Card>
          <Button size="lg" className="mt-3 w-full" loading={pending} onClick={next} icon={<ArrowRight className="h-5 w-5" />}>
            继续
            <span className="ml-1 text-xs font-normal opacity-70">（Enter）</span>
          </Button>
        </div>
      )}
    </div>
  );
}
