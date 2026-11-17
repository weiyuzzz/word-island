"use client";

import { useSyncExternalStore } from "react";
import type { AnswerResult, ClientSession, SessionSummary } from "@/lib/types";

/**
 * 学习会话断点记忆。
 *
 * 学习答题的会话与进度原本只存在于组件 state，用户切到其它页面（岛屿、词库……）再返回
 * /study 时组件被卸载，进度随之丢失。这里把「当前会话 + 答题进度」整体快照写入
 * sessionStorage：同一标签页内的页面导航都能恢复到离开时的那一题；关闭标签页后快照失效；
 * 学习结束（结算）后快照被标记不可恢复，下次进入回到选择页。
 */

const STORAGE_KEY = "word-island:study-resume";
const RESUME_EVENT = "word-island:study-resume-change";

export interface StudyProgress {
  index: number;
  phase: "answering" | "feedback" | "summary";
  chosen: string | null;
  typed: string;
  usedHint: boolean;
  result: AnswerResult | null;
  summary: SessionSummary | null;
  earned: { coins: number; xp: number; correct: number; answered: number };
  sessionStreak: number;
  dictTyped: string;
  dictAttempt: number;
  dictLocalWrong: boolean;
  dictIndex: number;
  assessedIndex: number | null;
}

export interface StudyResumeSnapshot {
  session: ClientSession;
  progress: StudyProgress;
  savedAt: number;
}

/** 生成空进度（新会话起始状态） */
export function initialStudyProgress(): StudyProgress {
  return {
    index: 0,
    phase: "answering",
    chosen: null,
    typed: "",
    usedHint: false,
    result: null,
    summary: null,
    earned: { coins: 0, xp: 0, correct: 0, answered: 0 },
    sessionStreak: 0,
    dictTyped: "",
    dictAttempt: 1,
    dictLocalWrong: false,
    dictIndex: 0,
    assessedIndex: null,
  };
}

/** 快照是否处于「可继续」状态（未完成、未结算） */
export function isResumable(snap: StudyResumeSnapshot | null): snap is StudyResumeSnapshot {
  if (!snap) return false;
  if (!snap.session || typeof snap.session.id !== "number") return false;
  if (!Array.isArray(snap.session.questions) || snap.session.questions.length === 0) return false;
  if (!snap.progress || typeof snap.progress.index !== "number") return false;
  if (snap.progress.phase === "summary" || snap.progress.summary) return false;
  if (snap.progress.index < 0 || snap.progress.index >= snap.session.total) return false;
  return true;
}

function notify(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RESUME_EVENT));
}

export function saveStudyResume(snap: StudyResumeSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch {
    // 隐私模式 / 配额不足时静默降级：功能退化为原来的「不记忆」
  }
  notify();
}

export function clearStudyResume(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同上，静默降级
  }
  notify();
}

// ---------- 订阅式读取 ----------
// useSyncExternalStore 要求 getSnapshot 返回稳定引用：用模块级缓存按原始字符串比对，
// 仅当内容真正变化时才重建对象，避免无限重渲染。SSR 快照固定为 null。

let cacheRaw: string | null = null;
let cacheSnap: StudyResumeSnapshot | null = null;

function readCached(): StudyResumeSnapshot | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    if (!raw) cacheSnap = null;
    else {
      try {
        cacheSnap = JSON.parse(raw) as StudyResumeSnapshot;
      } catch {
        cacheSnap = null;
      }
    }
  }
  return cacheSnap;
}

function subscribeResume(onChange: () => void): () => void {
  window.addEventListener(RESUME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(RESUME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** 订阅式读取学习断点快照：SSR 返回 null，客户端挂载后拿到真实值，无 hydration 不一致 */
export function useStudyResumeSnapshot(): StudyResumeSnapshot | null {
  return useSyncExternalStore(subscribeResume, readCached, () => null);
}
