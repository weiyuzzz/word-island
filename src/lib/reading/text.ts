/**
 * 书屿 · 纯文本处理工具（无副作用，可单测）
 * 段落分词 / 词元化索引 / 难度估算 / 笔记复现 key
 */

export interface WordToken {
  /** 原文单词（保留原始大小写） */
  word: string;
  start: number;
  end: number;
}

const WORD_RE = /[A-Za-z][A-Za-z'’-]*/g;

/** 把段落切成词 token（含字符偏移，标点与空白留在词间由渲染层补齐） */
export function tokenizeParagraph(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    tokens.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/** 单词归一：小写、去所有格撇号后缀与首尾撇号 */
export function baseWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[’'](?:s|d|ll|re|ve|m|t)\b/g, "")
    .replace(/^[’']+|[’']+$/g, "");
}

/**
 * 简单词元还原：剥掉常见屈折后缀并去掉规则 e 尾，
 * 得到可用于匹配对齐的 key（可能不是真词形，如 cause → caus；不规则变化不做还原，宁可漏配不误配）
 */
export function lemmatize(word: string): string {
  let w = baseWord(word);
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("sses") || w.endsWith("shes") || w.endsWith("ches") || w.endsWith("xes")) w = w.slice(0, -2);
  else if (w.endsWith("ss") || w.endsWith("us") || w.endsWith("is")) w = w;
  else if (w.endsWith("ing") && w.length > 5) {
    const stem = w.slice(0, -3);
    w = /(.)\1$/.test(stem) ? stem.slice(0, -1) : stem;
  } else if (w.endsWith("ied") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("ed") && w.length > 4) {
    const stem = w.slice(0, -2);
    w = /[a-z]{4,}$/.test(stem) ? stem : w.slice(0, -1);
  } else if (w.endsWith("s")) w = w.slice(0, -1);
  return w.endsWith("e") && w.length > 3 ? w.slice(0, -1) : w;
}

/**
 * 文章词汇索引：key 为「原形 + 词元」两套（词元化能命中 studied→study 这类变形）。
 * 值为出现次数（两套 key 计数会重复统计，仅用于权重参考，不影响存在性判断）。
 */
export function buildVocabIndex(paragraphs: readonly string[]): Record<string, number> {
  const index: Record<string, number> = {};
  const bump = (key: string) => {
    index[key] = (index[key] ?? 0) + 1;
  };
  for (const p of paragraphs) {
    for (const t of tokenizeParagraph(p)) {
      const base = baseWord(t.word);
      bump(base);
      const lemma = lemmatize(t.word);
      if (lemma !== base) bump(lemma);
    }
  }
  return index;
}

/** 难度估算（1-5）：基于平均句长 + 平均音节数的简化 Flesch-Kincaid */
export function estimateLevel(paragraphs: readonly string[]): number {
  const text = paragraphs.join(" ");
  const words = tokenizeParagraph(text);
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0);
  if (words.length === 0 || sentences.length === 0) return 3;
  const syllables = words.reduce((n, t) => n + countSyllables(t.word), 0);
  const asl = words.length / sentences.length;
  const asw = syllables / words.length;
  const grade = 0.39 * asl + 11.8 * asw - 15.59;
  if (grade <= 6) return 2;
  if (grade <= 9) return 3;
  if (grade <= 12) return 4;
  if (grade <= 15) return 5;
  return Math.min(5, Math.max(1, Math.round((grade - 5) / 3)));
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

/** 笔记复现归并 key：整段引文逐词词元化后拼接（多词短语/长句都能对齐） */
export function noteKeyFor(quote: string): string {
  const keys = tokenizeParagraph(quote).map((t) => lemmatize(t.word));
  return keys.join(" ").trim();
}

/** 笔记类型 */
export const NOTE_TYPES = ["expression", "phrase", "grammar", "long_sentence"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const NOTE_TYPE_LABEL: Record<NoteType, string> = {
  expression: "表达",
  phrase: "词组",
  grammar: "语法",
  long_sentence: "长难句",
};

export const FAMILIARITY_LABEL: Record<string, string> = {
  unmarked: "未标记",
  familiar: "熟悉",
  ok: "一般",
  forgotten: "遗忘",
};

/** 长难句判定：足够长，或 12 词以上且带 2 个从句标志词 */
export function looksLikeLongSentence(quote: string): boolean {
  const words = tokenizeParagraph(quote).length;
  if (words >= 22) return true;
  const clauses = (quote.match(/\b(which|that|who|whom|whose|where|when|while|although|because|whereas|if|since)\b/gi) ?? []).length;
  return words >= 12 && clauses >= 2;
}
