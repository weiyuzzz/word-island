import { z } from "zod";

const WORD_INPUT = z.object({
  word: z.string().trim().min(1).max(64),
  phonetic: z.string().trim().max(128),
  pos: z.string().trim().max(32),
  meaning: z.string().trim().min(1).max(256),
  example: z.string().trim().max(512),
  translation: z.string().trim().max(512),
  difficulty: z.number().int().min(1).max(5),
});

const SESSION_KIND = z.enum(["mixed", "mixed_dictation", "review", "new", "dictation", "wrong", "wrong_dictation"]);
const WORD_STATUS = z.enum(["new", "learning", "review", "mastered"]);
const IMPORT_FORMAT = z.enum(["csv", "json"]);

export const schemas = {
  startSession: z.object({
    deckId: z.number().int().positive().nullable(),
    kind: SESSION_KIND,
    size: z.number().int().min(1).max(200),
  }),
  answer: z.object({
    sessionId: z.number().int().positive(),
    index: z.number().int().min(0).max(99),
    answer: z.string().trim().min(1).max(128),
    responseMs: z.number().int().min(0).max(600000),
    usedHint: z.boolean(),
  }),
  finishSession: z.number().int().positive(),
  claimTask: z.string().trim().min(1).max(64),
  updateDailyGoal: z.number().int().min(1).max(200),
  build: z.object({
    type: z.string().trim().min(1).max(32),
    slot: z.number().int().min(0).max(29),
  }),
  upgrade: z.number().int().positive(),
  removeBuilding: z.number().int().positive(),
  moveBuilding: z.object({
    id: z.number().int().positive(),
    slot: z.number().int().min(0).max(29),
  }),
  placeFromInventory: z.object({
    itemKey: z.string().trim().min(1).max(64),
    slot: z.number().int().min(0).max(29),
  }),
  isleSlug: z.string().trim().min(1).max(40),
  themeKey: z.enum(["tropical", "aurora", "sunset"]),
  resolveRaidWave: z.object({
    raidId: z.number().int().positive(),
    waveIndex: z.number().int().min(0).max(11),
    answerIndex: z.number().int().min(0).max(5),
  }),
  getWords: z.object({
    deckId: z.number().int().positive().nullable(),
    q: z.string().trim().max(128).optional(),
    status: z.union([WORD_STATUS, z.literal("all")]).optional(),
    wrongOnly: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional(),
  }),
  createDeck: z.object({
    name: z.string().trim().min(1).max(64),
    description: z.string().trim().max(256),
  }),
  deleteDeck: z.number().int().positive(),
  addWord: z.object({
    deckId: z.number().int().positive(),
    input: WORD_INPUT,
  }),
  updateWord: z.object({
    id: z.number().int().positive(),
    input: WORD_INPUT,
  }),
  deleteWord: z.number().int().positive(),
  importWords: z.object({
    deckId: z.number().int().positive().nullable(),
    newDeckName: z.string().trim().max(64).nullable(),
    text: z.string().min(1).max(500000),
    format: IMPORT_FORMAT,
  }),
  exportDeck: z.object({
    deckId: z.number().int().positive(),
    format: IMPORT_FORMAT,
  }),
  shareDeck: z.object({
    deckId: z.number().int().positive(),
  }),
  login: z.object({
    username: z.string().trim().min(1).max(20),
    password: z.string().min(1).max(64),
  }),
  register: z.object({
    username: z.string().trim().min(2).max(20),
    password: z.string().min(6).max(64),
  }),
  adminCreateUser: z.object({
    username: z.string().trim().min(2).max(20),
    password: z.string().min(6).max(64),
  }),
  adminResetPassword: z.object({
    userId: z.number().int().positive(),
    password: z.string().min(6).max(64),
  }),
  adminDeleteUser: z.number().int().positive(),
  // ---------- 书屿 ----------
  readingSlot: z.enum(["deep", "broad", "news"]),
  saveProgress: z.object({
    deliveryId: z.number().int().positive(),
    paragraphIndex: z.number().int().min(0).max(500),
    addSeconds: z.number().int().min(0).max(30),
  }),
  finishArticle: z.number().int().positive(),
  saveHighlight: z.object({
    articleId: z.number().int().positive(),
    paragraphIndex: z.number().int().min(0).max(500),
    startOffset: z.number().int().min(0).max(5000),
    endOffset: z.number().int().min(1).max(5001),
    color: z.enum(["sun", "leaf", "ocean"]),
  }),
  removeHighlight: z.number().int().positive(),
  saveNote: z.object({
    articleId: z.number().int().positive(),
    paragraphIndex: z.number().int().min(0).max(500),
    startOffset: z.number().int().min(0).max(5000),
    endOffset: z.number().int().min(0).max(5001),
    quote: z.string().trim().min(1).max(600),
    noteType: z.enum(["expression", "phrase", "grammar", "long_sentence"]),
    content: z.string().trim().max(2000),
    tags: z.array(z.string().trim().min(1).max(24)).max(6),
    aiAnalysis: z.string().max(4000).nullable().optional(),
  }),
  noteFamiliarity: z.object({
    ids: z.array(z.number().int().positive()).min(1).max(100),
    familiarity: z.enum(["unmarked", "familiar", "ok", "forgotten"]),
  }),
  deleteNote: z.number().int().positive(),
  lookupWord: z.string().trim().min(1).max(64),
  addReadingWord: z.object({
    word: z.string().trim().min(1).max(64),
    meaning: z.string().trim().min(1).max(256),
    phonetic: z.string().trim().max(128).optional(),
    pos: z.string().trim().max(32).optional(),
    example: z.string().trim().max(512).optional(),
    translation: z.string().trim().max(512).optional(),
  }),
  analyzeSentence: z.string().trim().min(1).max(600),
  manualImport: z.object({
    title: z.string().trim().min(1).max(300),
    author: z.string().trim().max(200).optional(),
    url: z.string().trim().max(500).optional(),
    topic: z.string().trim().max(40).optional(),
    text: z.string().min(1).max(200000),
  }),
  ingestSource: z.enum(["conversation", "guardian", "bbc", "news"]),
  selfAssess: z.object({
    wordId: z.number().int().positive(),
    grade: z.enum(["familiar", "ok", "forgotten"]),
  }),
  restoreBuiltinDeck: z.string().trim().min(1).max(40),
};

export const gameSchemas = {
  startExploration: z.object({
    regionKey: z.string().trim().min(1).max(32),
    useTea: z.boolean(),
  }),
  resolveEvent: z.object({
    eventKey: z.string().trim().min(1).max(128),
    questionIndex: z.number().int().min(0).max(99),
    answer: z.string().trim().min(1).max(128),
    responseMs: z.number().int().min(0).max(600000),
  }),
  finishExploration: z.number().int().positive(),
  abandonExploration: z.number().int().positive(),
  claimQuest: z.string().trim().min(1).max(64),
  buyItem: z.string().trim().min(1).max(64),
  getGarden: z.enum(["all", "seed", "sprout", "sapling", "tree", "bloom"]),
};

export type SchemaKey = keyof typeof schemas;
export type GameSchemaKey = keyof typeof gameSchemas;

function isKnownError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message;
  return (
    msg.includes("未知的建筑类型") ||
    msg.includes("金币不足") ||
    msg.includes("尚未解锁") ||
    msg.includes("已达到最高等级") ||
    msg.includes("该位置不可建造") ||
    msg.includes("词库名称") ||
    msg.includes("单词已存在") ||
    msg.includes("未找到") ||
    msg.includes("已回答过") ||
    msg.includes("会话已结束") ||
    msg.includes("探索已结束") ||
    msg.includes("已领取") ||
    msg.includes("任务尚未完成") ||
    msg.includes("无可用") ||
    msg.includes("格式无效") ||
    msg.includes("请输入") ||
    msg.includes("不能为空") ||
    msg.includes("重复") ||
    // 书屿
    msg.includes("背包") ||
    msg.includes("位置已有") ||
    msg.includes("这个位置上") ||
    msg.includes("不能拆除") ||
    msg.includes("阅读") ||
    msg.includes("文章") ||
    msg.includes("选区") ||
    msg.includes("摘录") ||
    msg.includes("释义") ||
    msg.includes("热点") ||
    msg.includes("AI") ||
    msg.includes("词典") ||
    msg.includes("笔记")
  );
}

export function sanitizeError(e: unknown): string {
  if (e instanceof z.ZodError) {
    const first = e.issues[0];
    return `参数校验失败：${first.path.join(".")} ${first.message}`;
  }
  if (e instanceof Error && isKnownError(e)) {
    return e.message;
  }
  return "操作失败，请稍后重试";
}
