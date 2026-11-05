import { describe, expect, it } from "vitest";
import { applyReview, gradeAnswer, initialProgress, chooseMode, INTERVAL_LADDER_MINUTES } from "../game/srs";
import { answerReward, levelFromXp, sessionBonus, xpToNext } from "../game/economy";
import { parseCsvWords, parseJsonWords, toCsv, parseCsv } from "../vocab/parse";
import { blankSentence, findWordInSentence, normalizeWord, shiftDateKey } from "../utils";
import { BUILTIN_DECKS } from "../../data/vocabulary";
import { BUILDING_CATALOG, ISLAND_SLOTS, upgradeCost, getBuildingDef } from "../game/buildings";

const now = new Date("2026-01-01T08:00:00Z");

describe("间隔复习算法", () => {
  it("第一次答对后进入学习中并安排复习", () => {
    const next = applyReview(initialProgress(), "en2zh", 2, now);
    expect(next.status).toBe("learning");
    expect(next.proficiency).toBe(12);
    expect(next.streak).toBe(1);
    expect(next.nextReviewAt!.getTime()).toBe(now.getTime() + INTERVAL_LADDER_MINUTES[1] * 60000);
  });

  it("答错会降低熟练度、重置连击并在 10 分钟后复习", () => {
    let s = initialProgress();
    s = applyReview(s, "en2zh", 2, now);
    s = applyReview(s, "zh2en", 2, now);
    const before = s.proficiency;
    const wrong = applyReview(s, "zh2en", 0, now);
    expect(wrong.proficiency).toBeLessThan(before);
    expect(wrong.streak).toBe(0);
    expect(wrong.lapses).toBe(1);
    expect(wrong.nextReviewAt!.getTime()).toBe(now.getTime() + 10 * 60000);
    expect(wrong.status).not.toBe("mastered");
  });

  it("犹豫答对的收益低于干脆答对，且间隔更短", () => {
    const base = applyReview(initialProgress(), "spelling", 2, now);
    const hesitant = applyReview(initialProgress(), "spelling", 1, now);
    expect(hesitant.proficiency).toBeLessThan(base.proficiency);
    expect(hesitant.intervalMinutes).toBeLessThanOrEqual(base.intervalMinutes);
  });

  it("只靠英译中无法快速掌握，需要多次稳定答对", () => {
    let s = initialProgress();
    for (let i = 0; i < 4; i++) s = applyReview(s, "en2zh", 2, now);
    expect(s.status).not.toBe("mastered");
    for (let i = 0; i < 4; i++) s = applyReview(s, "spelling", 2, now);
    expect(s.status).toBe("mastered");
    expect(s.intervalMinutes).toBeGreaterThanOrEqual(30 * 24 * 60);
  });

  it("已掌握的单词答错会退回复习状态", () => {
    let s = initialProgress();
    for (let i = 0; i < 8; i++) s = applyReview(s, "spelling", 2, now);
    expect(s.status).toBe("mastered");
    const dropped = applyReview(s, "context", 0, now);
    expect(dropped.status).toBe("review");
  });

  it("根据用时与提示判断答题质量", () => {
    expect(gradeAnswer(false, "en2zh", 1000)).toBe(0);
    expect(gradeAnswer(true, "en2zh", 1000)).toBe(2);
    expect(gradeAnswer(true, "en2zh", 20000)).toBe(1);
    expect(gradeAnswer(true, "spelling", 1000, true)).toBe(1);
  });

  it("新词总是先用英译中，熟练后偏向主动回忆", () => {
    expect(chooseMode("new", true, () => 0.9)).toBe("en2zh");
    expect(["spelling", "context"]).toContain(chooseMode("mastered", true, () => 0.1));
    expect(chooseMode("mastered", false, () => 0.1)).toBe("spelling");
  });
});

describe("经济系统", () => {
  it("等级曲线单调且从 1 级开始", () => {
    expect(levelFromXp(0)).toEqual({ level: 1, levelXp: 0, levelNeed: 100 });
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(249).level).toBe(2);
    expect(levelFromXp(250).level).toBe(3);
    expect(xpToNext(3)).toBe(200);
  });

  it("答错不给金币，只给少量经验", () => {
    expect(answerReward({ quality: 0, isNew: false, isReview: false, streakAfter: 0 })).toEqual({ coins: 0, xp: 1, streakBonus: 0 });
  });

  it("每 5 连击额外奖励金币", () => {
    expect(answerReward({ quality: 2, isNew: false, isReview: false, streakAfter: 4 }).streakBonus).toBe(0);
    expect(answerReward({ quality: 2, isNew: false, isReview: false, streakAfter: 5 }).streakBonus).toBe(5);
  });

  it("未完成整组不发完成奖励，全对有额外奖励", () => {
    expect(sessionBonus({ total: 10, answered: 6, correct: 6 }).coins).toBe(0);
    expect(sessionBonus({ total: 10, answered: 10, correct: 10 }).coins).toBe(28);
    expect(sessionBonus({ total: 10, answered: 10, correct: 5 }).coins).toBe(10);
  });
});

describe("导入解析", () => {
  it("解析带引号与换行的 CSV", () => {
    const rows = parseCsv('a,"b, c","say ""hi"""\n1,2,3\r\n');
    expect(rows).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("CSV 带表头、缺字段与重复检测", () => {
    const text = `word,phonetic,pos,meaning,example,translation
apple,/ˈæpl/,n.,苹果,"I ate an apple.",我吃了一个苹果
,,,没有单词,,
Apple,,n.,苹果（重复）,,
banana,,n.,,,`;
    const res = parseCsvWords(text);
    expect(res.items.map((i) => i.word)).toEqual(["apple"]);
    expect(res.duplicatesInFile).toBe(1);
    expect(res.issues).toHaveLength(2);
  });

  it("无表头 CSV 按默认列顺序解析", () => {
    const res = parseCsvWords("cat,/kæt/,n.,猫\ndog,/dɒɡ/,n.,狗");
    expect(res.items).toHaveLength(2);
    expect(res.items[1].meaning).toBe("狗");
  });

  it("JSON 支持别名字段与无效输入", () => {
    const res = parseJsonWords(JSON.stringify([{ 单词: "tree", 释义: "树", 难度: 9 }, { word: "x" }]));
    expect(res.items).toHaveLength(1);
    expect(res.items[0].difficulty).toBe(5);
    expect(res.issues).toHaveLength(1);
    expect(parseJsonWords("{oops").issues[0].reason).toContain("JSON");
  });

  it("导出的 CSV 可以被重新解析", () => {
    const csv = toCsv([{ word: "hello", phonetic: "", pos: "int.", meaning: "你好，\"世界\"", example: "Hello, world", translation: "", difficulty: 1 }]);
    const parsed = parseCsvWords(csv);
    expect(parsed.items[0].meaning).toBe('你好，"世界"');
    expect(parsed.items[0].example).toBe("Hello, world");
  });
});

describe("工具函数", () => {
  it("在例句中找到词形变化并挖空", () => {
    expect(findWordInSentence("prohibit", "Smoking is prohibited here.")?.matched).toBe("prohibited");
    expect(findWordInSentence("commodity", "the most traded commodities")?.matched).toBe("commodities");
    expect(findWordInSentence("generate", "Turbines generating power")?.matched).toBe("generating");
    expect(blankSentence("cat", "The category is wrong")).toBeNull();
    expect(blankSentence("apple", "An apple a day.")?.blanked).toBe("An ______ a day.");
  });

  it("单词标准化与日期偏移", () => {
    expect(normalizeWord("  Hello! ")).toBe("hello");
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("内置数据一致性", () => {
  it("内置词库无重复且字段完整", () => {
    for (const deck of BUILTIN_DECKS) {
      const keys = new Set<string>();
      for (const row of deck.words) {
        expect(row[0].length).toBeGreaterThan(0);
        expect(row[3].length).toBeGreaterThan(0);
        expect(row[4]).toContain(" ");
        expect(keys.has(row[0].toLowerCase())).toBe(false);
        keys.add(row[0].toLowerCase());
      }
    }
    expect(BUILTIN_DECKS.reduce((n, d) => n + d.words.length, 0)).toBeGreaterThanOrEqual(120);
  });

  it("建筑目录与建造点定义合法", () => {
    const types = new Set(BUILDING_CATALOG.map((b) => b.type));
    expect(types.size).toBe(BUILDING_CATALOG.length);
    expect(new Set(ISLAND_SLOTS.map((s) => s.id)).size).toBe(ISLAND_SLOTS.length);
    const cabin = getBuildingDef("cabin")!;
    expect(upgradeCost(cabin, 1)).toBe(80);
    expect(upgradeCost(cabin, 3)).toBeNull();
  });
});
