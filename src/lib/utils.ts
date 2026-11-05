export const APP_TIMEZONE = "Asia/Shanghai";

/** 返回 YYYY-MM-DD（按应用时区） */
export function dateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function shortDateLabel(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${m}/${d}`;
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function shuffle<T>(arr: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickRandom<T>(arr: readonly T[], n: number, rng: () => number = Math.random): T[] {
  return shuffle(arr, rng).slice(0, n);
}

/** 统一单词比较用的 key：小写、去首尾标点与多余空格 */
export function normalizeWord(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[^a-z0-9'\u00c0-\u024f-]+|[^a-z0-9'\u00c0-\u024f-]+$/g, "");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 在例句中查找单词（允许简单的词形变化：-s / -ed / -ing / y→i / 去尾 e）
 */
export function findWordInSentence(
  word: string,
  sentence: string,
): { start: number; end: number; matched: string } | null {
  const base = word.trim();
  if (!base || !sentence) return null;
  const stems = new Set<string>();
  stems.add(base);
  if (base.length > 3 && base.endsWith("e")) stems.add(base.slice(0, -1));
  if (base.length > 3 && base.endsWith("y")) stems.add(`${base.slice(0, -1)}i`);
  if (base.length > 3 && /[^aeiou][aeiou][^aeiouwxy]$/.test(base)) stems.add(base + base.slice(-1));

  for (const stem of stems) {
    const re = new RegExp(`\\b(${escapeRegExp(stem)}[a-z]{0,3})\\b`, "i");
    const m = re.exec(sentence);
    if (m && m.index !== undefined) {
      return { start: m.index, end: m.index + m[1].length, matched: m[1] };
    }
  }
  return null;
}

export function blankSentence(word: string, sentence: string): { blanked: string; matched: string } | null {
  const hit = findWordInSentence(word, sentence);
  if (!hit) return null;
  return {
    blanked: `${sentence.slice(0, hit.start)}______${sentence.slice(hit.end)}`,
    matched: hit.matched,
  };
}

export function formatRelativeTime(target: Date | string | null, now: Date = new Date()): string {
  if (!target) return "—";
  const t = typeof target === "string" ? new Date(target) : target;
  const diffMin = Math.round((t.getTime() - now.getTime()) / 60000);
  if (diffMin <= 0) return "现在";
  if (diffMin < 60) return `${diffMin} 分钟后`;
  const hours = Math.round(diffMin / 60);
  if (hours < 24) return `${hours} 小时后`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天后`;
  return `${Math.round(days / 30)} 个月后`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("zh-CN").format(n);
}

export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}
