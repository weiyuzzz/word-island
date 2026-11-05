"use client";

import { useCallback, useSyncExternalStore } from "react";

export type SceneMode = "3d" | "flat";

const EVENT = "word-island:scene-mode-change";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(key: string): SceneMode {
  try {
    return window.localStorage.getItem(key) === "flat" ? "flat" : "3d";
  } catch {
    return "3d";
  }
}

function getServerSnapshot(): SceneMode {
  return "3d";
}

/** 立体 / 平面两档切换；默认立体，选择记在 localStorage，SSR 快照固定。 */
export function useSceneMode(key: string): [SceneMode, (mode: SceneMode) => void] {
  const getSnapshot = useCallback(() => read(key), [key]);
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setMode = useCallback(
    (next: SceneMode) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // 隐私模式下只切换当前会话
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [mode, setMode];
}
