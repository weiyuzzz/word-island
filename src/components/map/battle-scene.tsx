"use client";

import type { CSSProperties, ReactNode, RefObject } from "react";
import { ArrowRight, Check, Heart, Lightbulb, Sparkles, X, Zap } from "lucide-react";
import type { ClientEventView, EventResult, ExpeditionView } from "@/lib/game/model";
import type { ClientQuestion } from "@/lib/types";
import { MODE_META } from "@/lib/game/srs";
import { cn } from "@/lib/utils";
import { Button, CoinIcon, SpeakButton, speak } from "../ui";
import { MonsterArt } from "./monster-art";
import { BattleCanvas, type FxKind } from "./scene-canvas";

export type RunPhase = "question" | "feedback" | "reward" | "summary";

interface BattleSceneProps {
  view: ExpeditionView;
  event: ClientEventView;
  question: ClientQuestion | null;
  phase: RunPhase;
  /** canvas = P1 Canvas 2D 场景；svg = P0 DOM 词贝（无障碍 / 降级） */
  renderMode: "canvas" | "svg";
  chosen: string | null;
  result: EventResult | null;
  pending: boolean;
  typed: string;
  onTyped: (value: string) => void;
  onSubmit: (answer: string) => void;
  onNext: () => void;
  onAdvance: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

type Decor = "trees" | "palms" | "rocks" | "pillars" | "waves";

interface Scenery {
  sky: [string, string];
  far: string;
  near: string;
  ground: string;
  decor: Decor;
}

const SCENERY: Record<string, Scenery> = {
  forest: { sky: ["#d7effb", "#f2fbe8"], far: "#a8d6a0", near: "#79bd7f", ground: "#5fa85f", decor: "trees" },
  ruins: { sky: ["#e8e6f5", "#fbf3e2"], far: "#c8c1ae", near: "#a89f8c", ground: "#c4b79b", decor: "pillars" },
  mountain: { sky: ["#dbe9f7", "#f5f0e8"], far: "#9fb0c2", near: "#8294a8", ground: "#a9a294", decor: "rocks" },
  beach: { sky: ["#cfeeff", "#fff5d9"], far: "#7fc2ee", near: "#e9d39c", ground: "#f1dfb3", decor: "palms" },
  harbor: { sky: ["#cbe9fb", "#fff2dc"], far: "#8fb9d6", near: "#c0a277", ground: "#d9c39c", decor: "waves" },
  voyage: { sky: ["#c6e6fa", "#fdf0d5"], far: "#79b8dd", near: "#a7cfdf", ground: "#e4cfa4", decor: "waves" },
};

function Cloud({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="animate-drift" opacity="0.85">
      <ellipse cx="0" cy="0" rx="40" ry="15" fill="#fff" />
      <circle cx="-16" cy="-8" r="16" fill="#fff" />
      <circle cx="10" cy="-12" r="20" fill="#fff" />
      <circle cx="30" cy="-4" r="13" fill="#fff" />
    </g>
  );
}

function DecorLayer({ kind, color }: { kind: Decor; color: string }) {
  if (kind === "trees") {
    return (
      <g opacity="0.85">
        {[
          [70, 300, 1],
          [145, 315, 0.75],
          [225, 292, 0.9],
          [790, 305, 0.85],
          [850, 320, 1.05],
        ].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <rect x="-5" y="0" width="10" height="56" fill="#8a5a3c" />
            <circle cx="0" cy="-14" r="28" fill={color} />
            <circle cx="-20" cy="0" r="19" fill={color} opacity="0.85" />
            <circle cx="20" cy="-2" r="20" fill={color} opacity="0.9" />
          </g>
        ))}
      </g>
    );
  }
  if (kind === "palms") {
    return (
      <g opacity="0.9">
        {[
          [80, 320, 1],
          [835, 315, 1.1],
        ].map(([x, y, s], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <path d="M0 46 Q10 10 26 -8" stroke="#9c6236" strokeWidth="9" fill="none" strokeLinecap="round" />
            {[-150, -60, 20, 90, 165].map((a) => (
              <ellipse key={a} cx="28" cy="-8" rx="30" ry="9" fill={color} transform={`rotate(${a} 28 -8)`} />
            ))}
          </g>
        ))}
      </g>
    );
  }
  if (kind === "rocks") {
    return (
      <g opacity="0.9">
        <path d="M0 330 L120 190 L215 330 Z" fill={color} />
        <path d="M120 190 L150 235 L120 250 L92 235 Z" fill="#f4f7fa" />
        <path d="M690 330 L785 205 L885 330 Z" fill={color} opacity="0.8" />
        <path d="M785 205 L812 245 L785 260 L758 245 Z" fill="#f4f7fa" />
      </g>
    );
  }
  if (kind === "pillars") {
    return (
      <g opacity="0.85">
        {[60, 130, 760, 830].map((x, i) => (
          <g key={x}>
            <rect x={x} y={i % 2 ? 220 : 240} width="26" height="100" fill={color} />
            <rect x={x - 6} y={i % 2 ? 214 : 234} width="38" height="12" fill={color} opacity="0.8" />
          </g>
        ))}
        <path d="M40 240 H180" stroke={color} strokeWidth="12" strokeLinecap="round" opacity="0.7" />
      </g>
    );
  }
  return (
    <g opacity="0.7">
      <path d="M0 300 Q60 288 120 300 T240 300 T360 300" stroke={color} strokeWidth="7" fill="none" />
      <path d="M560 312 Q620 300 680 312 T800 312 T920 312" stroke={color} strokeWidth="7" fill="none" />
    </g>
  );
}

function Backdrop({ scenery }: { scenery: Scenery }) {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 900 470" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="battle-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={scenery.sky[0]} />
          <stop offset="100%" stopColor={scenery.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="900" height="470" fill="url(#battle-sky)" />
      <circle cx="742" cy="74" r="34" fill="#fff3c4" opacity="0.8" />
      <circle cx="742" cy="74" r="52" fill="#fff3c4" opacity="0.2" />
      <Cloud x={150} y={82} scale={1} />
      <Cloud x={470} y={58} scale={0.7} />
      <Cloud x={690} y={128} scale={0.5} />
      <path d="M0 330 Q120 240 250 300 Q360 240 470 292 Q600 225 720 292 Q820 240 900 300 L900 470 L0 470 Z" fill={scenery.far} />
      <path d="M0 352 Q140 300 280 340 Q430 292 560 340 Q720 296 900 344 L900 470 L0 470 Z" fill={scenery.near} opacity="0.75" />
      <DecorLayer kind={scenery.decor} color={scenery.far} />
      <path d="M0 360 Q220 336 450 356 Q680 336 900 360 L900 470 L0 470 Z" fill={scenery.ground} />
      <ellipse cx="160" cy="410" rx="66" ry="13" fill="#1d2433" opacity="0.09" />
      <ellipse cx="720" cy="404" rx="94" ry="16" fill="#1d2433" opacity="0.09" />
      <g stroke="#fff" strokeWidth="2" opacity="0.35" fill="none">
        <path d="M30 392 q12 -7 24 0" />
        <path d="M820 386 q12 -7 24 0" />
        <path d="M450 430 q12 -7 24 0" />
      </g>
    </svg>
  );
}

function HeroArt({ casting, guarding }: { casting: boolean; guarding: boolean }) {
  return (
    <svg viewBox="0 0 140 170" className="h-full w-full" aria-hidden>
      <ellipse cx="70" cy="160" rx="40" ry="8" fill="#1d2433" opacity="0.13" />
      <g className={cn(guarding ? "hero-guard" : casting ? "hero-cast" : "hero-idle")}>
        <path d="M42 152 Q30 108 46 78 Q70 66 94 78 Q110 108 98 152 Z" fill="#2b8ad6" />
        <path d="M46 78 Q70 92 94 78 L98 100 Q70 112 42 100 Z" fill="#1f6fb5" opacity="0.55" />
        <rect x="58" y="112" width="10" height="38" rx="4" fill="#f1dfb3" />
        <rect x="76" y="112" width="10" height="38" rx="4" fill="#f1dfb3" />
        <circle cx="70" cy="62" r="20" fill="#f6d7b4" />
        <path d="M48 56 Q70 26 92 56 Z" fill="#e8b86a" />
        <path d="M44 56 Q70 46 96 56 L96 62 Q70 54 44 62 Z" fill="#c89a45" />
        <circle cx="63" cy="62" r="2.4" fill="#3b2a26" />
        <circle cx="78" cy="62" r="2.4" fill="#3b2a26" />
        <path d="M66 71 q4 3 8 0" stroke="#3b2a26" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M104 142 L116 62" stroke="#8a5a3c" strokeWidth="6" strokeLinecap="round" />
        <circle cx="117" cy="56" r="10" fill="#fff3c4" stroke="#f7c948" strokeWidth="3" />
        <circle cx="117" cy="56" r="4" fill="#fff" />
      </g>
      {guarding && <circle cx="70" cy="100" r="58" fill="none" stroke="#86c5f0" strokeWidth="6" opacity="0.75" className="battle-shield" />}
    </svg>
  );
}

function Stem({ q }: { q: ClientQuestion }) {
  const modeLabel = MODE_META[q.mode].label;
  if (q.mode === "listen") {
    return (
      <div className="flex items-center justify-center gap-3">
        <SpeakButton text={q.word ?? ""} />
        <div className="text-left">
          <div className="text-sm font-semibold">听发音，选中飘起的正确词贝</div>
          <div className="text-xs text-slate-500">可以重复播放 · {modeLabel}</div>
        </div>
        <span className="sr-only">{q.word}</span>
      </div>
    );
  }
  if (q.mode === "en2zh" || q.mode === "synonym" || q.mode === "antonym") {
    return (
      <div>
        <div className="flex items-center justify-center gap-2">
          <span className="text-2xl font-bold tracking-tight md:text-3xl">{q.word}</span>
          <SpeakButton text={q.word ?? ""} size="sm" />
        </div>
        {q.phonetic && <div className="mt-0.5 font-mono text-[11px] text-slate-400">{q.phonetic}</div>}
        <div className="mt-0.5 text-[11px] text-slate-500">
          {modeLabel === "英译中" ? "选中正确的释义词贝" : modeLabel === "同义词辨析" ? "选出意思最接近的词贝" : "选出它的反义词贝"}
        </div>
      </div>
    );
  }
  if (q.mode === "zh2en" || q.mode === "spelling") {
    return (
      <div>
        <div className="text-xl font-bold md:text-2xl">{q.meaning}</div>
        <div className="mt-0.5 text-xs text-slate-500">
          {q.mode === "zh2en" ? "选中对应的英文词贝" : "把字母拼成符文，施放法术"} · {modeLabel}
        </div>
      </div>
    );
  }
  const parts = (q.prompt ?? "").split("______");
  return (
    <div>
      <p className="text-sm font-medium leading-relaxed md:text-base">
        {parts[0]}
        <span className="mx-1 inline-block min-w-[70px] border-b-2 border-dashed border-ocean-400 align-baseline">&nbsp;</span>
        {parts[1]}
      </p>
      <div className="mt-0.5 text-xs text-slate-500">提示：{q.meaning} · {modeLabel}</div>
    </div>
  );
}

function RewardChip({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", tone)}>{children}</span>;
}

export function BattleScene({ view, event, question, phase, renderMode, chosen, result, pending, typed, onTyped, onSubmit, onNext, onAdvance, inputRef }: BattleSceneProps) {
  const scenery = SCENERY[view.regionKey] ?? SCENERY.forest;
  const isFeedback = phase === "feedback" && !!result;
  const isCasting = phase === "question" && !!chosen && pending;
  const isCanvas = renderMode === "canvas";
  const opts = question?.options ?? [];
  const monster = event.monster;
  // 怪物事件沿用服务端 HP；非怪物事件把同一条横杠解释成「试炼进度」，避免出现 0/20 的空血条
  const total = Math.max(1, event.questionCount);
  const cleared = Math.min(total, event.answeredCount + (isFeedback ? 1 : 0));
  const maxHp = monster?.maxHp ?? total;
  const hp = monster ? (isFeedback && result ? result.monsterHp : monster.hp) : cleared;
  const hpPct = Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)));
  const defeated = !!monster && hp <= 0;
  const correctHit = isFeedback && !!result?.correct;
  const blocked = isFeedback && !result?.correct;

  // P1 精灵时间轴：把 React 的答题阶段翻译成 canvas 的特效事件
  const fxKind: FxKind =
    phase === "reward" ? "reward" : isFeedback ? (result?.correct ? "hit" : "miss") : isCasting ? "cast" : null;
  const fxKey = [event.eventKey, question?.index ?? -1, phase, chosen ?? "", pending ? "pending" : "idle"].join("|");
  const stageKey = result ? `${result.eventKey}-${result.questionIndex}-${phase}` : "idle";

  const TOKEN_TILT = ["-1.4deg", "1.1deg", "0.8deg", "-1deg"];
  const tokenStyle = (i: number): CSSProperties =>
    ({
      animationDelay: `${i * 110}ms`,
      "--rune-dx": `${180 + i * 14}px`,
      "--rune-dy": `${-70 - (i % 2) * 26}px`,
      "--rune-rot": TOKEN_TILT[i % TOKEN_TILT.length],
    }) as CSSProperties;

  return (
    <div className="relative mt-3 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-soft">
      <div className="relative w-full" style={{ aspectRatio: "900 / 470", minHeight: 400 }}>
        <Backdrop scenery={scenery} />

        {/* P1：Canvas 2D 渲染层（粒子 / 拖拽词贝 / 镜头推进 / 屏幕震动） */}
        {isCanvas && (
          <BattleCanvas
            regionKey={view.regionKey}
            phase={phase}
            options={opts}
            chosen={chosen}
            correctAnswer={isFeedback ? (result?.correctAnswer ?? null) : null}
            pending={pending}
            fxKey={fxKey}
            fxKind={fxKind}
            damage={result?.attack.damage ?? 0}
            onSubmit={onSubmit}
          />
        )}
        {isCanvas && opts.length > 0 && (
          <>
            {/* canvas 本身 aria-hidden，这里给键盘 / 读屏提供等价控件 */}
            <div className="sr-only" role="group" aria-label="答案词贝">
              {opts.map((opt, i) => (
                <button key={opt} type="button" disabled={phase !== "question" || pending} onClick={() => onSubmit(opt)}>
                  选项 {i + 1}：{opt}
                </button>
              ))}
            </div>
            {phase === "question" && !chosen && (
              <div className="pointer-events-none absolute left-1/2 top-[41%] z-[7] -translate-x-1/2 whitespace-nowrap rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-medium text-slate-600 shadow-sm sm:text-[11px]">
                拖动词贝到怪物法阵 · 或直接点击 / 按 1–4
              </div>
            )}
          </>
        )}

        {/* 场景内 HUD：怪物血条与连击 */}
        <div className="absolute right-[5%] top-[6%] z-10 w-[30%] min-w-[130px]">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold text-ink/75">
            <span className="truncate">{monster?.name ?? "词之试炼"}</span>
            <span className="tabular-nums">{monster ? `${hp}/${maxHp}` : `${cleared}/${total} 题`}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full border border-white/80 bg-white/65">
            <div className={cn("h-full rounded-full transition-[width] duration-500", monster ? "bg-coral-500" : "bg-leaf-500")} style={{ width: `${hpPct}%` }} />
          </div>
        </div>
        {view.currentStreak >= 3 && (
          <div className="absolute left-[3%] top-[14%] z-10 animate-pop rounded-full bg-sun-400 px-2.5 py-1 text-[11px] font-bold text-ink shadow-soft">连击 ×{view.currentStreak}</div>
        )}

        {/* 题干：悬在场景里的木牌，而不是独立卡片 */}
        {question && phase !== "reward" && (
          <div className="absolute left-1/2 top-[18%] z-10 w-[64%] min-w-[240px] -translate-x-1/2">
            {isFeedback && result ? (
              <div className={cn("animate-pop rounded-2xl border-2 px-4 py-3 text-center shadow-soft", result.correct ? "border-leaf-300 bg-leaf-50/95 text-leaf-700" : "border-coral-400 bg-coral-100/95 text-coral-600")}>
                <div className="text-lg font-bold">{result.correct ? `${result.attack.label}！命中` : "格挡住了"}</div>
                <div className="mt-0.5 text-[11px] opacity-80">{result.correct ? `造成 ${result.attack.damage} 点伤害 · ${result.word.word}` : `正确词贝：${result.correctAnswer}`}</div>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border-2 border-sand-300 bg-sand-50/95 px-4 py-2.5 text-center shadow-soft">
                  <Stem q={question} />
                </div>
                <div className="mx-auto h-3 w-[86%] rounded-b-xl border-x-2 border-b-2 border-sand-300 bg-sand-100/80" />
              </>
            )}
          </div>
        )}

        {/* 角色与怪物：命中/格挡时整层推进 + 震动 */}
        <div key={`hero-${stageKey}`} className={cn("pointer-events-none absolute bottom-[16%] left-[4%] z-[5] w-[17%] min-w-[86px]", correctHit && "stage-hit", blocked && "stage-miss")}>
          <HeroArt casting={isCasting} guarding={blocked} />
        </div>
        <div key={`monster-${stageKey}`} className={cn("pointer-events-none absolute bottom-[14%] right-[4%] z-[5] w-[28%] min-w-[130px] transition-opacity duration-500", correctHit && "stage-hit", blocked && "stage-miss", defeated && "opacity-35 grayscale")}>
          <MonsterArt art={monster?.art ?? "slime"} hit={correctHit} />
        </div>

        {/* P0 答案实体：DOM 词贝（简洁模式 / 降级路径） */}
        {!isCanvas && question?.options && question.options.length > 0 && phase !== "reward" && (
          <div className="absolute left-[26%] right-[26%] top-[46%] z-10 grid grid-cols-2 gap-2.5">
            {question.options.map((opt, i) => {
              const state = isFeedback
                ? opt === result?.correctAnswer
                  ? "rune-correct"
                  : opt === chosen && !result?.correct
                    ? "rune-wrong"
                    : "rune-dim"
                : chosen === opt
                  ? "rune-chosen"
                  : "rune-idle";
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={phase !== "question" || pending}
                  onClick={() => onSubmit(opt)}
                  style={tokenStyle(i)}
                  className={cn("rune-token flex min-h-[52px] items-center gap-2 rounded-2xl border-2 px-2.5 py-2 text-left text-xs font-semibold leading-snug shadow-soft sm:text-sm", state)}
                  aria-label={`选项 ${i + 1}：${opt}`}
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/70 text-[11px] font-bold text-sand-600">{i + 1}</span>
                  <span className="min-w-0 flex-1 break-words">{opt}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 拼写题：场景里的符文输入台 */}
        {question && !question.options && phase === "question" && (
          <form
            className="absolute left-[26%] right-[26%] top-[47%] z-10"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) onSubmit(typed.trim());
            }}
          >
            <input
              ref={inputRef}
              value={typed}
              onChange={(e) => onTyped(e.target.value)}
              disabled={pending}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="拼出符文…"
              className="h-12 w-full rounded-2xl border-2 border-sand-300 bg-sand-50/95 px-3 text-center text-base font-bold tracking-wide outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-ocean-400"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <button type="button" onClick={() => speak(question.word ?? "")} className="inline-flex items-center gap-1 rounded-xl bg-white/80 px-2 py-1.5 text-[11px] text-slate-600">
                <Lightbulb className="h-3.5 w-3.5" /> {question.firstLetter}
                {Array.from({ length: Math.max(0, (question.length ?? 1) - 1) }).map(() => "_").join("")}
              </button>
              <Button type="submit" size="sm" loading={pending} disabled={!typed.trim()}>
                施放！
              </Button>
            </div>
          </form>
        )}

        {/* 施法轨迹、命中爆点（P1 由 canvas 粒子承担，P0 保留 SVG） */}
        {!isCanvas && (
          <svg className="pointer-events-none absolute inset-0 z-[8] h-full w-full" viewBox="0 0 900 470" preserveAspectRatio="none" aria-hidden>
            {(isCasting || correctHit) && (
              <g key={`beam-${result?.questionIndex ?? "cast"}`} className="battle-beam">
                <path d="M180 300 Q450 215 735 290" fill="none" stroke="#fff3c4" strokeWidth="12" strokeLinecap="round" />
                <path d="M180 300 Q450 215 735 290" fill="none" stroke="#f7c948" strokeWidth="5" strokeLinecap="round" />
              </g>
            )}
            {correctHit && (
              <g key={`impact-${result?.questionIndex}`} transform="translate(735 290)">
                <g className="battle-impact">
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                    <path key={a} d="M18 0 L46 0" stroke="#fff3c4" strokeWidth="7" strokeLinecap="round" transform={`rotate(${a})`} />
                  ))}
                  <circle r="20" fill="#fff" opacity="0.85" />
                </g>
              </g>
            )}
          </svg>
        )}
        {correctHit && result && (
          <span key={`dmg-${result.questionIndex}`} className="damage-number absolute right-[15%] top-[34%] z-[9] text-3xl font-black text-coral-600">-{result.attack.damage}</span>
        )}
        {/* 战后词碑：浮在场景底部的石刻，留边让地面与角色仍然可见 */}
        {isFeedback && result && (
          <div className="battle-stele absolute inset-x-[3%] bottom-[3%] z-20 rounded-2xl border-2 border-sand-300 bg-sand-50/95 px-4 py-2.5 shadow-lift backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <span className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white", result.correct ? "bg-leaf-500" : "bg-coral-500")}>
                {result.correct ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-base font-bold">{result.word.word}</span>
                  {result.word.phonetic && <span className="font-mono text-[11px] text-slate-500">{result.word.phonetic}</span>}
                  <span className="text-sm">{result.word.meaning}</span>
                  <SpeakButton text={result.word.word} size="sm" />
                </div>
                {result.word.example && <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{result.word.example}</p>}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <RewardChip tone="bg-leaf-100 text-leaf-700">熟练度 {result.proficiency}%</RewardChip>
                  {result.reward.coins + result.streakBonus > 0 && (
                    <RewardChip tone="bg-sun-100 text-sun-600">
                      <CoinIcon className="h-3.5 w-3.5" /> +{result.reward.coins + result.streakBonus}
                    </RewardChip>
                  )}
                  <RewardChip tone="bg-ocean-50 text-ocean-700">
                    <Zap className="h-3.5 w-3.5" /> +{result.reward.xp}
                  </RewardChip>
                  {result.streakBonus > 0 && <RewardChip tone="bg-sun-400 text-ink">连击奖励</RewardChip>}
                </div>
              </div>
              <Button size="md" onClick={onNext} icon={<ArrowRight className="h-4 w-4" />} className="shrink-0">
                继续
              </Button>
            </div>
          </div>
        )}

        {/* 事件结算：宝箱在场景中央开启 */}
        {phase === "reward" && result?.eventReward && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-white/55 backdrop-blur-[2px]">
            <div className="animate-pop w-[min(88%,380px)] rounded-3xl border-2 border-sand-300 bg-sand-50 px-6 py-5 text-center shadow-lift">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sun-100 text-sun-600">
                <Sparkles className="h-8 w-8" />
              </div>
              <h3 className="mt-2 text-lg font-bold">事件完成！</h3>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm">
                <RewardChip tone="bg-sun-100 text-sun-600">
                  <CoinIcon className="h-4 w-4" /> +{result.eventReward.coins}
                </RewardChip>
                <RewardChip tone="bg-ocean-50 text-ocean-700">
                  <Zap className="h-4 w-4" /> +{result.eventReward.xp}
                </RewardChip>
                {result.eventReward.item && <RewardChip tone="bg-leaf-100 text-leaf-700">获得道具 ×1</RewardChip>}
              </div>
              <Button size="lg" className="mt-4" onClick={onAdvance} icon={<ArrowRight className="h-5 w-5" />}>
                继续探索
              </Button>
            </div>
          </div>
        )}

        {/* 事件已结束但还没推进 */}
        {!question && phase === "question" && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-white/55">
            <Button size="lg" onClick={onAdvance} icon={<ArrowRight className="h-5 w-5" />}>
              事件已完成，继续
            </Button>
          </div>
        )}

        {/* 场景内体力指示 */}
        <div className="absolute left-[3%] top-[5%] z-10 flex items-center gap-1 rounded-full bg-white/75 px-2 py-1">
          {Array.from({ length: view.maxHearts }, (_, i) => (
            <Heart key={i} className={cn("h-3.5 w-3.5", i < (result?.hearts ?? view.hearts) ? "fill-coral-500 text-coral-500" : "text-slate-300")} />
          ))}
        </div>
      </div>
    </div>
  );
}
