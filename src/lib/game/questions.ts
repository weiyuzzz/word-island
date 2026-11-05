import { relationsFor } from "@/data/relations";
import type { QuestionRecord, QuizMode, WordStatus } from "@/lib/types";
import { blankSentence, findWordInSentence, normalizeWord, pickRandom, shuffle } from "@/lib/utils";

export interface WordLike {
  id: number;
  word: string;
  phonetic: string;
  pos: string;
  meaning: string;
  example: string;
  translation: string;
}

/** 战斗中的攻击类型与伤害（由题型决定） */
export const ATTACK: Record<QuizMode, { label: string; damage: number }> = {
  en2zh: { label: "普通攻击", damage: 18 },
  zh2en: { label: "强化攻击", damage: 24 },
  spelling: { label: "精准攻击", damage: 30 },
  context: { label: "特殊攻击", damage: 22 },
  listen: { label: "特殊攻击", damage: 20 },
  synonym: { label: "技能攻击", damage: 26 },
  antonym: { label: "技能攻击", damage: 24 },
  sentence: { label: "特殊攻击", damage: 22 },
};

function uniqueDistractors<T>(candidates: T[], count: number, exclude: (v: T) => boolean, rng: () => number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of shuffle(candidates, rng)) {
    const key = String(c).toLowerCase();
    if (exclude(c) || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= count) break;
  }
  return out;
}

/** 单词的常见词形变化，用于「句子构建」干扰项 */
export function wordForms(word: string): string[] {
  const w = word.trim();
  const forms = new Set<string>([w]);
  if (/[^aeiou]y$/i.test(w)) forms.add(`${w.slice(0, -1)}ies`);
  else if (/(s|x|z|ch|sh)$/i.test(w)) forms.add(`${w}es`);
  else forms.add(`${w}s`);
  if (w.endsWith("e")) {
    forms.add(`${w}d`);
    forms.add(`${w.slice(0, -1)}ing`);
  } else {
    forms.add(`${w}ed`);
    forms.add(`${w}ing`);
    if (/[^aeiou][aeiou][^aeiouwxy]$/i.test(w)) {
      forms.add(`${w}${w.slice(-1)}ed`);
      forms.add(`${w}${w.slice(-1)}ing`);
    }
  }
  return [...forms];
}

/** 该单词可以生成哪些题型 */
export function availableModes(word: WordLike, includeAdvanced: boolean): QuizMode[] {
  const modes: QuizMode[] = ["en2zh", "zh2en"];
  if (word.example && findWordInSentence(word.word, word.example)) {
    modes.push("context", "sentence");
    modes.push("spelling");
  } else {
    modes.push("spelling");
  }
  if (includeAdvanced) {
    const rel = relationsFor(word.word);
    if (rel?.synonyms.length) modes.push("synonym");
    if (rel?.antonyms?.length) modes.push("antonym");
    modes.push("listen");
  }
  return modes;
}

export function buildChallenge(
  mode: QuizMode,
  word: WordLike,
  pool: WordLike[],
  status: WordStatus = "review",
  rng: () => number = Math.random,
): QuestionRecord {
  const others = pool.filter((p) => p.id !== word.id);
  const base: QuestionRecord = {
    wordId: word.id,
    mode,
    options: [],
    correct: "",
    prompt: null,
    isNew: status === "new",
    answered: false,
    wasCorrect: null,
  };
  const blank = word.example ? blankSentence(word.word, word.example) : null;
  const rel = relationsFor(word.word);

  switch (mode) {
    case "listen": {
      const meanings = uniqueDistractors(others.map((o) => o.meaning), 3, (m) => m === word.meaning, rng);
      return { ...base, mode: "listen", options: shuffle([word.meaning, ...meanings], rng), correct: word.meaning };
    }
    case "synonym": {
      const target = pickRandom(rel?.synonyms ?? [], 1, rng)[0] ?? word.meaning;
      const allSynonyms = Object.values(relationsFor(word.word) ?? {}).flat();
      const poolSynonyms = others.flatMap((o) => relationsFor(o.word)?.synonyms ?? []);
      const distractors = uniqueDistractors([...poolSynonyms, ...allSynonyms], 3, (s) => s === target, rng);
      return { ...base, mode: "synonym", options: shuffle([target, ...distractors], rng), correct: target };
    }
    case "antonym": {
      const list = rel?.antonyms ?? [];
      const target = pickRandom(list, 1, rng)[0] ?? word.meaning;
      const poolAntonyms = others.flatMap((o) => relationsFor(o.word)?.antonyms ?? []);
      const distractors = uniqueDistractors(poolAntonyms, 3, (s) => s === target, rng);
      return { ...base, mode: "antonym", options: shuffle([target, ...distractors], rng), correct: target };
    }
    case "sentence": {
      const hit = blank ? findWordInSentence(word.word, word.example) : null;
      const matched = hit?.matched ?? word.word;
      const forms = wordForms(word.word).filter((f) => normalizeWord(f) !== normalizeWord(matched));
      const extra = others.flatMap((o) => wordForms(o.word));
      const distractors = uniqueDistractors([...forms, ...extra], 3, (f) => normalizeWord(f) === normalizeWord(matched), rng);
      return {
        ...base,
        mode: "sentence",
        prompt: blank?.blanked ?? null,
        options: shuffle([matched, ...distractors], rng),
        correct: matched,
      };
    }
    case "context": {
      const meanings = uniqueDistractors(others.map((o) => o.word), 3, (m) => normalizeWord(m) === normalizeWord(word.word), rng);
      return {
        ...base,
        mode: "context",
        prompt: blank?.blanked ?? null,
        options: shuffle([word.word, ...meanings], rng),
        correct: word.word,
      };
    }
    case "spelling": {
      return { ...base, mode: "spelling", prompt: blank?.blanked ?? null, correct: word.word };
    }
    case "zh2en": {
      const words = uniqueDistractors(others.map((o) => o.word), 3, (m) => normalizeWord(m) === normalizeWord(word.word), rng);
      return { ...base, mode: "zh2en", options: shuffle([word.word, ...words], rng), correct: word.word };
    }
    default: {
      const meanings = uniqueDistractors(others.map((o) => o.meaning), 3, (m) => m === word.meaning, rng);
      return { ...base, mode: "en2zh", options: shuffle([word.meaning, ...meanings], rng), correct: word.meaning };
    }
  }
}

export function isCorrectAnswer(mode: QuizMode, correct: string, answer: string): boolean {
  if (mode === "en2zh" || mode === "listen") return answer.trim() === correct.trim();
  return normalizeWord(answer) === normalizeWord(correct);
}
