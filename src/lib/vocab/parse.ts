import { normalizeWord } from "@/lib/utils";

export interface WordInput {
  word: string;
  phonetic: string;
  pos: string;
  meaning: string;
  example: string;
  translation: string;
  difficulty: number;
}

export interface ParseIssue {
  line: number;
  reason: string;
}

export interface ParseResult {
  items: WordInput[];
  issues: ParseIssue[];
  duplicatesInFile: number;
}

export type ImportFormat = "csv" | "json";

export const CSV_HEADER = ["word", "phonetic", "pos", "meaning", "example", "translation", "difficulty"] as const;

const HEADER_ALIASES: Record<(typeof CSV_HEADER)[number], string[]> = {
  word: ["word", "单词", "english", "en", "term"],
  phonetic: ["phonetic", "音标", "ipa", "pronunciation"],
  pos: ["pos", "词性", "part_of_speech", "partofspeech", "type"],
  meaning: ["meaning", "释义", "中文", "中文释义", "definition", "chinese", "zh", "cn"],
  example: ["example", "例句", "sentence", "example_sentence"],
  translation: ["translation", "翻译", "例句翻译", "example_translation", "sentence_translation"],
  difficulty: ["difficulty", "难度", "level"],
};

/** RFC4180 风格的 CSV 解析，支持引号、转义引号、换行 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(items: WordInput[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const it of items) {
    lines.push(
      [it.word, it.phonetic, it.pos, it.meaning, it.example, it.translation, String(it.difficulty)]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function toJson(items: WordInput[]): string {
  return JSON.stringify(items, null, 2);
}

export function detectFormat(text: string, filename?: string): ImportFormat {
  if (filename?.toLowerCase().endsWith(".json")) return "json";
  if (filename?.toLowerCase().endsWith(".csv")) return "csv";
  const trimmed = text.trim();
  return trimmed.startsWith("[") || trimmed.startsWith("{") ? "json" : "csv";
}

function clampDifficulty(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return 2;
  return Math.min(5, Math.max(1, n));
}

function sanitizeItem(raw: Record<string, unknown>, line: number): { item?: WordInput; issue?: ParseIssue } {
  const word = String(raw.word ?? "").trim();
  const meaning = String(raw.meaning ?? "").trim();
  if (!word) return { issue: { line, reason: "缺少单词（word）" } };
  if (!meaning) return { issue: { line, reason: `「${word}」缺少释义（meaning）` } };
  if (word.length > 64) return { issue: { line, reason: `「${word.slice(0, 20)}…」单词过长` } };
  return {
    item: {
      word,
      phonetic: String(raw.phonetic ?? "").trim(),
      pos: String(raw.pos ?? "").trim(),
      meaning,
      example: String(raw.example ?? "").trim(),
      translation: String(raw.translation ?? "").trim(),
      difficulty: clampDifficulty(raw.difficulty),
    },
  };
}

function resolveHeader(cells: string[]): { map: Partial<Record<(typeof CSV_HEADER)[number], number>>; isHeader: boolean } {
  const map: Partial<Record<(typeof CSV_HEADER)[number], number>> = {};
  cells.forEach((cell, idx) => {
    const key = cell.trim().toLowerCase().replace(/\s+/g, "_");
    for (const field of CSV_HEADER) {
      if (map[field] === undefined && HEADER_ALIASES[field].includes(key)) {
        map[field] = idx;
      }
    }
  });
  const isHeader = map.word !== undefined && map.meaning !== undefined;
  return { map, isHeader };
}

function dedupe(items: WordInput[], issues: ParseIssue[]): ParseResult {
  const seen = new Set<string>();
  const out: WordInput[] = [];
  let duplicatesInFile = 0;
  for (const it of items) {
    const key = normalizeWord(it.word);
    if (!key) continue;
    if (seen.has(key)) {
      duplicatesInFile++;
      continue;
    }
    seen.add(key);
    out.push(it);
  }
  return { items: out, issues, duplicatesInFile };
}

export function parseCsvWords(text: string): ParseResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { items: [], issues: [{ line: 0, reason: "文件为空" }], duplicatesInFile: 0 };
  const { map, isHeader } = resolveHeader(rows[0]);
  const columnMap = isHeader
    ? map
    : Object.fromEntries(CSV_HEADER.map((f, i) => [f, i])) as Record<(typeof CSV_HEADER)[number], number>;
  const dataRows = isHeader ? rows.slice(1) : rows;
  const items: WordInput[] = [];
  const issues: ParseIssue[] = [];
  dataRows.forEach((cells, i) => {
    const line = i + (isHeader ? 2 : 1);
    if (cells.length < 2) {
      issues.push({ line, reason: "列数不足（至少需要 word 和 meaning）" });
      return;
    }
    const raw: Record<string, unknown> = {};
    for (const field of CSV_HEADER) {
      const idx = columnMap[field];
      if (idx !== undefined && idx < cells.length) raw[field] = cells[idx];
    }
    const { item, issue } = sanitizeItem(raw, line);
    if (item) items.push(item);
    if (issue) issues.push(issue);
  });
  return dedupe(items, issues);
}

export function parseJsonWords(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return { items: [], issues: [{ line: 0, reason: "JSON 格式无效，无法解析" }], duplicatesInFile: 0 };
  }
  const list: unknown = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { words?: unknown }).words)
      ? (data as { words: unknown[] }).words
      : null;
  if (!Array.isArray(list)) {
    return { items: [], issues: [{ line: 0, reason: "JSON 需要是单词数组，或包含 words 数组的对象" }], duplicatesInFile: 0 };
  }
  const items: WordInput[] = [];
  const issues: ParseIssue[] = [];
  list.forEach((entry, i) => {
    const line = i + 1;
    if (!entry || typeof entry !== "object") {
      issues.push({ line, reason: "条目不是对象" });
      return;
    }
    const obj = entry as Record<string, unknown>;
    const raw: Record<string, unknown> = {};
    for (const field of CSV_HEADER) {
      const alias = HEADER_ALIASES[field].find((a) => obj[a] !== undefined);
      if (alias) raw[field] = obj[alias];
    }
    const { item, issue } = sanitizeItem(raw, line);
    if (item) items.push(item);
    if (issue) issues.push(issue);
  });
  return dedupe(items, issues);
}

export function parseImport(text: string, format: ImportFormat): ParseResult {
  return format === "json" ? parseJsonWords(text) : parseCsvWords(text);
}

export const CSV_TEMPLATE = `word,phonetic,pos,meaning,example,translation,difficulty
serendipity,/ˌserənˈdɪpəti/,n.,意外发现美好事物的运气,"Finding this café was pure serendipity.",发现这家咖啡馆纯属意外之喜,4
resilient,/rɪˈzɪliənt/,adj.,有韧性的；能快速恢复的,"Children are often remarkably resilient.",孩子们往往有惊人的恢复能力,3`;
