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

const SESSION_KIND = z.enum(["mixed", "review", "new", "dictation"]);
const WORD_STATUS = z.enum(["new", "learning", "review", "mastered"]);
const IMPORT_FORMAT = z.enum(["csv", "json"]);

export const schemas = {
  startSession: z.object({
    deckId: z.number().int().positive().nullable(),
    kind: SESSION_KIND,
    size: z.number().int().min(1).max(50),
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
    msg.includes("重复")
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
