"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { ArrowRight, Check, Flame, Lightbulb, RotateCcw, Sparkles, TreePalm, Trophy, X, Zap, House, CalendarCheck } from "lucide-react";
import type { AnswerResult, ClientQuestion, ClientSession, SessionSummary } from "@/lib/types";
import { MODE_META, STATUS_META } from "@/lib/game/srs";
import { cn, findWordInSentence, formatRelativeTime } from "@/lib/utils";
import { answerAction, finishSessionAction, selfAssessAction } from "@/server/actions";
import { Button, Card, CoinIcon, Pill, ProgressBar, Ring, STATUS_TONE, SpeakButton, speak, useImmersive, useToast } from "../ui";
import { ConfirmDialog, useConfirm } from "../confirm-dialog";

interface Props {
  session: ClientSession;
  onExit: () => void;
  onRestart: () => void;
}

// ---------- 主观反馈（熟悉/一般/遗忘） ----------

const ASSESS_PREF_KEY = "word-island:self-assess-off";

function getAssessPref(): boolean {
  try {
    return localStorage.getItem(ASSESS_PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeAssessPref(onChange: () => void): () => void {
  window.addEventListener("wi-assess-pref", onChange);
  return () => window.removeEventListener("wi-assess-pref", onChange);
}

function setAssessPref(off: boolean) {
  try {
    localStorage.setItem(ASSESS_PREF_KEY, off ? "1" : "0");
  } catch {}
  window.dispatchEvent(new Event("wi-assess-pref"));
}

const ASSESS_OPTIONS: { grade: "familiar" | "ok" | "forgotten"; label: string; cls: string }[] = [
  { grade: "familiar", label: "熟悉", cls: "border-leaf-300 text-leaf-700 hover:bg-leaf-50" },
  { grade: "ok", label: "一般", cls: "border-slate-200 text-slate-600 hover:bg-slate-50" },
  { grade: "forgotten", label: "遗忘", cls: "border-coral-300 text-coral-600 hover:bg-coral-50" },
];

/** 答题后的主观反馈行：影响后续复习计划；不评价则保持原计划 */
function SelfAssessRow({ wordId, onDone, onNext }: { wordId: number; onDone: () => void; onNext?: () => void }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const send = (grade: "familiar" | "ok" | "forgotten", label: string) => {
    startTransition(async () => {
      const res = await selfAssessAction({ wordId, grade });
      if (res.ok && grade !== "ok") {
        toast({ kind: "success", title: `已标记「${label}」`, description: res.data ? `下次复习 ${formatRelativeTime(res.data.nextReviewAt)}` : undefined });
      }
      onDone();
      onNext?.();
    });
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3.5 py-2.5">
      <span className="text-xs text-slate-500">这个单词你觉得？<span className="hidden sm:inline">（影响下次复习时间，可跳过）</span></span>
      <span className="flex items-center gap-1.5">
        {ASSESS_OPTIONS.map((o) => (
          <button
            key={o.grade}
            type="button"
            disabled={pending}
            onClick={() => send(o.grade, o.label)}
            className={cn("rounded-full border-2 px-3 py-1 text-xs font-semibold transition disabled:opacity-50", o.cls)}
          >
            {o.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setAssessPref(true);
            toast({ kind: "info", title: "已关闭主观反馈", description: "答题后将按原计划自动推进；可在学习页重新开启" });
            onDone();
            onNext?.();
          }}
          className="ml-1 rounded-full px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          不再提示
        </button>
      </span>
    </div>
  );
}

function HighlightedExample({ word, example }: { word: string; example: string }) {
  const hit = findWordInSentence(word, example);
  if (!hit) return <>{example}</>;
  return (
    <>
      {example.slice(0, hit.start)}
      <mark className="rounded bg-sun-100 px-0.5 font-semibold text-ink">{hit.matched}</mark>
      {example.slice(hit.end)}
    </>
  );
}

function Prompt({ q }: { q: ClientQuestion }) {
  if (q.mode === "dictation") {
    return (
      <div className="text-center">
        <p className="text-sm font-medium text-slate-500">听发音，拼出这个单词</p>
        <p className="mt-1 text-xs text-slate-400">听不清可以点击喇叭重听</p>
      </div>
    );
  }
  if (q.mode === "en2zh") {
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
        <p className="mt-5 text-sm text-slate-400">选择正确的中文释义</p>
      </div>
    );
  }
  if (q.mode === "zh2en") {
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
  if (q.mode === "context") {
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
        <p className="mt-2 text-sm text-slate-400">根据上下文选择正确的单词</p>
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
      <p className="mt-4 text-sm text-slate-400">请拼写出这个英文单词</p>
    </div>
  );
}

/**
 * 纯拼写（听写）视图，循环流程：
 * 1) blind  盲拼：只听发音，界面只有一条输入线
 * 2) checked 判错：连续字母逐位标色（对=绿 / 错=红），展示释义与发音
 * 3) shadow 跟拼：显示单词阴影，输入部分变亮，跟着模仿
 * 4) 回到 blind…… 直到拼对，展示完整单词详情
 */
function DictationView({ target, typed, onType, attempt, stage, locked, pending, meaning, phonetic, onRetry, onCheck }: {
  target: string;
  typed: string;
  onType: (v: string) => void;
  attempt: number;
  stage: "blind" | "shadow" | "checked" | "correct";
  locked: boolean;
  pending: boolean;
  meaning?: string;
  phonetic?: string;
  onRetry: () => void;
  onCheck: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [wrongPing, setWrongPing] = useState(0);

  useEffect(() => {
    if (stage === "blind" || stage === "shadow") {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [stage, attempt]);

  // 跟拼阶段：只接受正确的字母，输错不前进（退格可用）
  const handleType = (next: string) => {
    if (stage !== "shadow") {
      onType(next);
      return;
    }
    if (next.length < typed.length) {
      onType(next);
      return;
    }
    let accepted = typed;
    let rejected = false;
    for (let i = typed.length; i < next.length; i += 1) {
      const expected = target[accepted.length];
      if (expected != null && next[i].toLowerCase() === expected.toLowerCase()) {
        accepted += expected;
      } else {
        rejected = true;
        break;
      }
    }
    onType(accepted);
    if (rejected) setWrongPing((n) => n + 1);
  };

  const maxLen = Math.max(target.length, typed.length);
  const wordRowClass = "flex items-baseline justify-center gap-0 pb-2 font-mono text-3xl leading-none tracking-[0.25em] sm:text-4xl";

  return (
    <div className="mt-6">
      {stage === "blind" && (
        <div className="mx-auto max-w-md">
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => onType(e.target.value)}
            disabled={locked}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label={`默写听到的单词（第 ${attempt} 遍）`}
            className="h-12 w-full border-b-2 border-slate-300 bg-transparent text-center font-mono text-2xl tracking-[0.35em] outline-none transition focus:border-ocean-400 disabled:opacity-60"
          />
        </div>
      )}

      {stage === "shadow" && (
        <div className="relative mx-auto max-w-2xl">
          <div aria-hidden className={cn(wordRowClass, "border-b-2 border-slate-200")}>
            {target.split("").map((c, i) => (
              <span key={i} className={cn(i < typed.length ? "text-ocean-600" : "text-slate-300", i === typed.length && "border-b-2 border-ocean-400")}>{c}</span>
            ))}
          </div>
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => handleType(e.target.value)}
            disabled={locked}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="跟着阴影输入单词"
            className="absolute inset-0 h-full w-full cursor-text bg-transparent text-center font-mono text-3xl tracking-[0.25em] text-transparent caret-transparent outline-none sm:text-4xl"
          />
        </div>
      )}
      {stage === "shadow" && wrongPing > 0 && (
        <p key={wrongPing} className="mt-2 animate-shake text-center text-xs font-medium text-coral-500">
          字母不对，看阴影再试
        </p>
      )}

      {stage === "checked" && (
        <div>
          <div aria-hidden className={cn(wordRowClass, "border-b-2 border-coral-400")}>
            {Array.from({ length: maxLen }).map((_, i) => {
              const ch = i < typed.length ? typed[i] : target[i];
              const ok = typed[i] != null && target[i] != null && typed[i].toLowerCase() === target[i].toLowerCase();
              return (
                <span key={i} className={ok ? "text-leaf-600" : "text-coral-500"}>{ch}</span>
              );
            })}
          </div>
          <div className="mx-auto mt-4 max-w-md rounded-2xl border border-dashed border-slate-300 p-4 text-center">
            {phonetic && <div className="font-mono text-sm text-slate-400">{phonetic}</div>}
            <div className="mt-1 inline-flex items-center gap-2">
              <span className="text-base font-medium">{meaning}</span>
              <SpeakButton text={target} size="sm" />
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">红色是拼错或漏掉的字母 · 按下面的按钮或 Enter 跟着阴影再拼一遍</p>
        </div>
      )}

      {stage === "correct" && (
        <div aria-hidden className={cn(wordRowClass, "border-b-2 border-leaf-400 text-leaf-600")}>
          {target.split("").map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </div>
      )}

      {(stage === "blind" || stage === "shadow") && (
        <div className="mt-5 flex items-center justify-center gap-2">
          <SpeakButton text={target} />
          <Button size="sm" onClick={onCheck} loading={pending} disabled={locked || !typed.trim()}>
            检查<span className="ml-1 hidden text-xs font-normal opacity-70 sm:inline">（Enter）</span>
          </Button>
          <span className="text-xs text-slate-400">
            第 {attempt} 遍 · {stage === "shadow" ? "跟着阴影拼" : "直接默写"}
          </span>
        </div>
      )}
      {stage === "checked" && (
        <div className="mt-4 flex justify-center">
          <Button size="sm" onClick={onRetry} icon={<ArrowRight className="h-4 w-4" />}>
            模仿拼写<span className="ml-1 hidden text-xs font-normal opacity-70 sm:inline">（Enter）</span>
          </Button>
        </div>
      )}
    </div>
  );
}

export function QuizSession({ session, onExit, onRestart }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  useImmersive(true);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"answering" | "feedback" | "summary">("answering");
  const [chosen, setChosen] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [usedHint, setUsedHint] = useState(false);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [earned, setEarned] = useState({ coins: 0, xp: 0, correct: 0, answered: 0 });
  const [sessionStreak, setSessionStreak] = useState(0);
  const [pending, startTransition] = useTransition();
  // 纯拼写（听写）多轮尝试：第 1 遍盲拼 → 判错 → 第 2 遍阴影跟拼 → 第 3 遍再盲拼……直到拼对
  const [dictTyped, setDictTyped] = useState("");
  const [dictAttempt, setDictAttempt] = useState(1);
  const [dictLocalWrong, setDictLocalWrong] = useState(false);
  const [dictIndex, setDictIndex] = useState(index);
  /** 主观反馈：本题已评过（每题只评一次） */
  const [assessedIndex, setAssessedIndex] = useState<number | null>(null);
  const startRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  /** 「不再提示」偏好（localStorage 持久化） */
  const assessOff = useSyncExternalStore(subscribeAssessPref, getAssessPref, () => false);

  const q = session.questions[index];
  const total = session.total;

  // 换题时重置听写尝试状态（渲染期调整，避免 effect 里 setState）
  if (dictIndex !== index) {
    setDictIndex(index);
    setDictTyped("");
    setDictAttempt(1);
    setDictLocalWrong(false);
  }

  useEffect(() => {
    startRef.current = Date.now();
    if (q?.mode === "spelling") setTimeout(() => inputRef.current?.focus(), 50);
    if (q?.mode === "dictation") {
      const t = setTimeout(() => speak(q.word ?? ""), 250);
      return () => clearTimeout(t);
    }
  }, [index, q?.mode, q?.word]);

  const submit = useCallback(
    (answer: string) => {
      if (phase !== "answering" || pending || !q) return;
      const responseMs = Date.now() - startRef.current;
      setChosen(answer);
      startTransition(async () => {
        const res = await answerAction({ sessionId: session.id, index: q.index, answer, responseMs, usedHint });
        if (!res.ok) {
          setChosen(null);
          return toast({ kind: "error", title: res.error });
        }
        const r = res.data;
        setResult(r);
        setPhase("feedback");
        setSessionStreak(r.sessionStreak);
        if (!r.alreadyAnswered) {
          setEarned((e) => ({ coins: e.coins + r.reward.coins + r.reward.streakBonus, xp: e.xp + r.reward.xp, correct: e.correct + (r.correct ? 1 : 0), answered: e.answered + 1 }));
        }
        if (r.correct) speak(r.word.word);
        if (r.leveledUp) toast({ kind: "success", title: `升级啦！现在是 Lv.${r.player.level}`, description: "去岛屿看看有什么新建筑解锁了" });
      });
    },
    [phase, pending, q, session.id, usedHint, toast],
  );

  const finish = useCallback(() => {
    startTransition(async () => {
      const res = await finishSessionAction(session.id);
      if (!res.ok) return toast({ kind: "error", title: res.error });
      setSummary(res.data);
      setPhase("summary");
    });
  }, [session.id, toast]);

  const nextLockRef = useRef(false);
  const next = useCallback(() => {
    if (phase !== "feedback" || nextLockRef.current) return;
    nextLockRef.current = true;
    if (index + 1 >= total) return finish();
    // 进入下一题时显式复位答题态（原先只在 effect 里清空答案，phase 一直停在 feedback）
    setChosen(null);
    setTyped("");
    setUsedHint(false);
    setResult(null);
    setPhase("answering");
    setIndex((i) => i + 1);
    setTimeout(() => {
      nextLockRef.current = false;
    }, 100);
  }, [phase, index, total, finish]);

  // 答对（或重复作答）后短暂展示反馈即自动进入下一题，不再手动点「继续」；
  // 纯拼写（听写）例外：拼完后显示完整单词详情，按键或点「继续」再进入下一题；
  // 其他模式答错也保留完整反馈供复习；
  // 主观反馈开启且本题未评价时暂停自动前进，等用户选择（或点「不再提示」）
  const showAssess = !assessOff && result != null && !result.alreadyAnswered && assessedIndex !== index && phase === "feedback";
  useEffect(() => {
    if (phase !== "feedback" || !result || q?.mode === "dictation") return;
    if (!result.correct && !result.alreadyAnswered) return;
    if (showAssess) return;
    const t = setTimeout(next, 1100);
    return () => clearTimeout(t);
  }, [phase, result, next, q?.mode, showAssess]);

  // 纯拼写：提交当前输入。第 1 遍交给服务端判定并记入 SRS；之后的尝试先在
  // 本地比对，只有拼对才提交（服务端判重不重复发奖，但会按实际作答返回 correct）
  const checkDictation = useCallback(() => {
    if (phase !== "answering" || pending || !q || q.mode !== "dictation" || dictLocalWrong) return;
    const answer = dictTyped.trim();
    if (!answer) return;
    if (dictAttempt === 1) return submit(answer);
    if (answer.toLowerCase() === (q.word ?? "").toLowerCase()) return submit(answer);
    setDictLocalWrong(true);
  }, [phase, pending, q, dictTyped, dictAttempt, dictLocalWrong, submit]);

  // 纯拼写：判错后留在当前单词，进入下一遍（盲拼/阴影跟拼交替）
  const retryDictation = useCallback(() => {
    setDictLocalWrong(false);
    setDictTyped("");
    setDictAttempt((a) => a + 1);
    setResult(null);
    setChosen(null);
    setUsedHint(false);
    setPhase("answering");
    startRef.current = Date.now();
  }, []);

  const exit = () => {
    if (earned.answered === 0) return onExit();
    confirm.confirm({
      title: "提前结束学习？",
      description: "已答题目的奖励会保留，但不会获得完成奖励。",
      confirmLabel: "结束",
      variant: "primary",
      onConfirm: finish,
    });
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === "feedback" && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        // 纯拼写判错后 Enter 是「再来一遍」，拼对后才是下一题
        if (q?.mode === "dictation" && result && !result.correct) retryDictation();
        else next();
        return;
      }
      if (phase === "answering" && q?.mode === "dictation" && e.key === "Enter") {
        e.preventDefault();
        if (dictLocalWrong) retryDictation();
        else checkDictation();
        return;
      }
      if (phase === "answering" && q?.options && /^[1-4]$/.test(e.key)) {
        const opt = q.options[Number(e.key) - 1];
        if (opt) submit(opt);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, q, next, submit, result, dictLocalWrong, checkDictation, retryDictation]);

  const hintText = useMemo(() => {
    if (!q || q.mode !== "spelling" || !usedHint) return null;
    return `${q.firstLetter ?? ""}${"_ ".repeat(Math.max(0, (q.length ?? 1) - 1))}`.trim();
  }, [q, usedHint]);

  // ---------- Summary ----------
  if (phase === "summary" && summary) {
    const pct = Math.round(summary.accuracy * 100);
    return (
      <div className="mx-auto max-w-2xl space-y-4 animate-fade-up">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-ocean-500 to-leaf-400 p-6 text-center text-white">
            <div className="mx-auto inline-flex">
              <Ring value={summary.correct} max={Math.max(1, summary.answered)} size={120} stroke={11} color="#fff">
                <div className="leading-none">
                  <div className="text-3xl font-bold">{pct}%</div>
                  <div className="mt-1 text-[11px] text-white/80">正确率</div>
                </div>
              </Ring>
            </div>
            <h2 className="mt-4 text-2xl font-bold">{summary.completed ? (pct === 100 ? "完美！全部答对 🎉" : pct >= 80 ? "太棒了，继续保持！" : "完成啦，再接再厉！") : "本组学习已结束"}</h2>
            <p className="mt-1 text-sm text-white/80">
              {session.deckName} · 答对 {summary.correct}/{summary.answered} 题
            </p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
            <div className="p-4 text-center">
              <div className="inline-flex items-center gap-1.5 text-2xl font-bold">
                <CoinIcon className="h-6 w-6" /> +{summary.coinsEarned}
              </div>
              <div className="text-xs text-slate-400">获得金币</div>
            </div>
            <div className="p-4 text-center">
              <div className="inline-flex items-center gap-1.5 text-2xl font-bold">
                <Zap className="h-6 w-6 text-ocean-500" /> +{summary.xpEarned}
              </div>
              <div className="text-xs text-slate-400">获得经验</div>
            </div>
          </div>
          <div className="space-y-3 p-5">
            {summary.bonusReasons.length > 0 && (
              <div className="rounded-2xl bg-sun-100/60 p-3 text-sm">
                <div className="mb-1 flex items-center gap-1.5 font-semibold text-sun-600">
                  <Sparkles className="h-4 w-4" /> 完成奖励
                </div>
                <ul className="space-y-0.5 text-slate-600">
                  {summary.bonusReasons.map((r) => (
                    <li key={r}>· {r}</li>
                  ))}
                </ul>
              </div>
            )}
            {summary.leveledUp && (
              <div className="flex items-center gap-3 rounded-2xl bg-ocean-50 p-3 text-sm animate-pop">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-ocean-500 text-base font-bold text-white">{summary.player.level}</span>
                <div>
                  <div className="font-semibold text-ocean-700">升级到 Lv.{summary.player.level}！</div>
                  <div className="text-xs text-ocean-600/80">去岛屿看看解锁了哪些新建筑</div>
                </div>
              </div>
            )}
            {summary.newAchievements.map((a) => (
              <div key={a.key} className="flex items-center gap-3 rounded-2xl bg-sun-100 p-3 text-sm animate-pop">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-sun-400 text-white">
                  <Trophy className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-semibold">解锁成就「{a.title}」</div>
                  <div className="text-xs text-slate-500">
                    {a.description} · +{a.reward.coins} 金币 +{a.reward.xp} XP
                  </div>
                </div>
              </div>
            ))}
            {summary.claimableTasks.length > 0 && (
              <Link href="/" className="flex items-center gap-3 rounded-2xl border border-leaf-200 bg-leaf-50 p-3 text-sm transition hover:bg-leaf-100">
                <CalendarCheck className="h-5 w-5 text-leaf-600" />
                <div className="flex-1">
                  <div className="font-semibold text-leaf-700">{summary.claimableTasks.length} 个每日任务可以领取奖励</div>
                  <div className="text-xs text-leaf-600/80">{summary.claimableTasks.map((t) => t.title).join("、")}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-leaf-600" />
              </Link>
            )}
            {summary.wrongWords.length > 0 && (
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-600">需要加强的单词（10 分钟后会再次出现）</div>
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
          </div>
        </Card>
        <div className="grid gap-2 sm:grid-cols-3">
          <Button size="lg" icon={<RotateCcw className="h-5 w-5" />} onClick={onRestart}>
            再来一组
          </Button>
          <Link href="/island" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-leaf-500 px-6 text-base font-medium text-white transition hover:bg-leaf-600">
            <TreePalm className="h-5 w-5" /> 去建设岛屿
          </Link>
          <Link href="/" className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 text-base font-medium transition hover:bg-slate-50">
            <House className="h-5 w-5" /> 返回首页
          </Link>
        </div>
      </div>
    );
  }

  if (!q) return null;
  const modeMeta = MODE_META[q.mode];
  const correctAnswer = result?.correctAnswer;
  const dictWrong = q.mode === "dictation" && phase === "feedback" && Boolean(result) && !result!.correct;
  const dictStage: "blind" | "shadow" | "checked" | "correct" = q.mode === "dictation"
    ? phase === "feedback"
      ? dictWrong ? "checked" : "correct"
      : dictLocalWrong ? "checked" : dictAttempt % 2 === 0 ? "shadow" : "blind"
    : "blind";

  return (
    <div className="mx-auto max-w-2xl">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <button onClick={exit} aria-label="退出" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-slate-500 shadow-soft hover:bg-slate-50">
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <ProgressBar value={Math.min(total, index + 1)} max={total} height="h-3" barClassName="bg-leaf-500" />
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold", sessionStreak >= 3 ? "bg-coral-100 text-coral-600" : "bg-white text-slate-500 shadow-soft")}>
            <Flame className="h-4 w-4" /> {sessionStreak}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-semibold shadow-soft">
            <CoinIcon className="h-4 w-4" /> {earned.coins}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>
          {index + 1} / {total} · {session.deckName}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {q.isNew && <Pill tone="sun">新词</Pill>}
          <Pill tone="ocean">{modeMeta.label}</Pill>
        </span>
      </div>

      {/* Question */}
      <Card key={index} className="mt-3 p-6 md:p-8 animate-fade-up">
        <Prompt q={q} />

        {q.mode === "dictation" ? (
          <DictationView
            key={dictAttempt}
            target={q.word ?? ""}
            typed={dictTyped}
            onType={setDictTyped}
            attempt={dictAttempt}
            stage={dictStage}
            locked={phase !== "answering" || pending}
            pending={pending}
            meaning={q.meaning}
            phonetic={q.phonetic}
            onRetry={retryDictation}
            onCheck={checkDictation}
          />
        ) : q.options ? (
          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {q.options.map((opt, i) => {
              const isChosen = chosen === opt;
              const isCorrect = phase === "feedback" && correctAnswer === opt;
              const isWrong = phase === "feedback" && isChosen && !result?.correct;
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={phase !== "answering" || pending}
                  onClick={() => submit(opt)}
                  className={cn(
                    "flex min-h-[58px] items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-base font-medium transition-all",
                    phase === "answering" && "border-slate-200 bg-white hover:border-ocean-300 hover:bg-ocean-50 active:scale-[0.99]",
                    isCorrect && "border-leaf-500 bg-leaf-50 text-leaf-700",
                    isWrong && "border-coral-500 bg-coral-100/60 text-coral-600 animate-shake",
                    phase === "feedback" && !isCorrect && !isWrong && "border-slate-100 bg-slate-50 text-slate-400",
                    pending && isChosen && "border-ocean-400",
                  )}
                >
                  <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold", isCorrect ? "bg-leaf-500 text-white" : isWrong ? "bg-coral-500 text-white" : "bg-slate-100 text-slate-500")}>{isCorrect ? <Check className="h-4 w-4" /> : isWrong ? <X className="h-4 w-4" /> : i + 1}</span>
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
            <div className="relative">
              <input
                ref={inputRef}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={phase !== "answering" || pending}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={hintText ?? "输入英文单词"}
                className={cn(
                  "h-14 w-full rounded-2xl border-2 bg-white px-4 text-center text-xl font-semibold tracking-wide outline-none transition placeholder:font-mono placeholder:text-slate-300",
                  phase === "answering" && "border-slate-200 focus:border-ocean-400",
                  phase === "feedback" && result?.correct && "border-leaf-500 bg-leaf-50 text-leaf-700",
                  phase === "feedback" && !result?.correct && "border-coral-500 bg-coral-100/60 text-coral-600 animate-shake",
                )}
              />
            </div>
            {phase === "answering" && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <button type="button" onClick={() => setUsedHint(true)} disabled={usedHint} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                  <Lightbulb className="h-4 w-4" /> {usedHint ? `提示：${q.length} 个字母` : "看一下首字母（奖励减少）"}
                </button>
                <Button type="submit" loading={pending} disabled={!typed.trim()}>
                  确认
                </Button>
              </div>
            )}
          </form>
        )}
      </Card>

      {/* Feedback：其他模式答对只显示一行简要反馈并自动进入下一题；纯拼写答对显示完整详情卡，
          纯拼写的判错界面由 DictationView 呈现（留在当前单词循环练习） */}
      {phase === "feedback" && result && (result.correct || result.alreadyAnswered) && q.mode !== "dictation" && (
        <div className="mt-3 animate-fade-up">
          <Card className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-2 px-5 py-3", result.correct ? "border-leaf-200 bg-leaf-50/60" : "border-slate-100")}>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-leaf-700">
              {result.correct ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
              {result.alreadyAnswered ? "这道题已经作答过" : result.quality === 1 ? "答对了（稍有犹豫）" : "回答正确！"}
            </span>
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <span className="truncate font-semibold">{result.word.word}</span>
              <span className="hidden truncate text-slate-500 sm:inline">{result.word.meaning}</span>
              {!result.alreadyAnswered && (
                <>
                  {result.reward.coins + result.reward.streakBonus > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5">
                      <CoinIcon className="h-3.5 w-3.5" /> +{result.reward.coins + result.reward.streakBonus}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5">
                    <Zap className="h-3.5 w-3.5" /> +{result.reward.xp}
                  </span>
                  {result.reward.streakBonus > 0 && <span className="rounded-full bg-sun-400 px-2 py-0.5 text-xs text-ink">连击！</span>}
                </>
              )}
            </span>
          </Card>
          {showAssess ? (
            <div className="mt-2">
              <SelfAssessRow wordId={result.word.id} onDone={() => setAssessedIndex(index)} onNext={next} />
            </div>
          ) : (
            <p className="mt-2 text-center text-xs text-slate-400">正在进入下一题…</p>
          )}
        </div>
      )}
      {phase === "feedback" && result && ((!result.correct && !result.alreadyAnswered && q.mode !== "dictation") || (q.mode === "dictation" && result.correct)) && (
        <div className="mt-3 animate-fade-up">
          <Card className={cn("overflow-hidden border-2", result.correct ? "border-leaf-200" : "border-coral-100")}>
            <div className={cn("flex items-center justify-between px-5 py-3 text-sm font-semibold", result.correct ? "bg-leaf-50 text-leaf-700" : "bg-coral-100/60 text-coral-600")}>
              <span className="inline-flex items-center gap-2">
                {result.correct ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                {result.correct ? (result.quality === 1 ? "答对了（稍有犹豫）" : "回答正确！") : "这道题已经作答过"}
              </span>
              {!result.alreadyAnswered && (
                <span className="inline-flex items-center gap-2">
                  {result.reward.coins + result.reward.streakBonus > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5">
                      <CoinIcon className="h-3.5 w-3.5" /> +{result.reward.coins + result.reward.streakBonus}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5">
                    <Zap className="h-3.5 w-3.5" /> +{result.reward.xp}
                  </span>
                  {result.reward.streakBonus > 0 && <span className="rounded-full bg-sun-400 px-2 py-0.5 text-ink">连击奖励！</span>}
                </span>
              )}
            </div>
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
                    {result.statusAfter !== result.statusBefore && (
                      <>
                        <ArrowRight className="h-3 w-3 text-slate-400" />
                        <Pill tone={STATUS_TONE[result.statusAfter]}>{STATUS_META[result.statusAfter].label}</Pill>
                      </>
                    )}
                  </div>
                  <div className="mt-1 text-slate-400">熟练度 {result.proficiency}% · 下次复习 {formatRelativeTime(result.nextReviewAt)}</div>
                </div>
              </div>
              <p className="mt-3 text-base font-medium">{result.word.meaning}</p>
              {result.word.example && (
                <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm leading-relaxed">
                  <p className="text-slate-700">
                    <HighlightedExample word={result.word.word} example={result.word.example} />
                  </p>
                  {result.word.translation && <p className="mt-1 text-slate-500">{result.word.translation}</p>}
                </div>
              )}
            </div>
          </Card>
          {showAssess && (
            <div className="mt-3">
              <SelfAssessRow wordId={result.word.id} onDone={() => setAssessedIndex(index)} />
            </div>
          )}
          <Button size="lg" className="mt-3 w-full" loading={pending} onClick={next} icon={index + 1 >= total ? <Trophy className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}>
            {index + 1 >= total ? "查看成绩" : "继续"}
            <span className="ml-1 hidden text-xs font-normal opacity-70 sm:inline">（Enter）</span>
          </Button>
        </div>
      )}
      <ConfirmDialog state={confirm.state} onClose={confirm.close} />
    </div>
  );
}
