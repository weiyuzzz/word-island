import { describe, expect, it } from "vitest";
import { ATTACK, availableModes, buildChallenge, isCorrectAnswer, wordForms } from "../game/questions";
import { relationsFor } from "@/data/relations";

const word = {
  id: 1,
  word: "prohibit",
  phonetic: "/prəˈhɪbɪt/",
  pos: "v.",
  meaning: "禁止",
  example: "Smoking is prohibited in all public buildings.",
  translation: "所有公共建筑内禁止吸烟。",
};

const pool = [
  word,
  { id: 2, word: "ban", phonetic: "", pos: "v.", meaning: "禁令", example: "There is a ban on smoking.", translation: "" },
  { id: 3, word: "allow", phonetic: "", pos: "v.", meaning: "允许", example: "They allow pets here.", translation: "" },
  { id: 4, word: "permit", phonetic: "", pos: "v.", meaning: "许可证", example: "You need a permit.", translation: "" },
];

describe("探索题型构建器", () => {
  it("每种攻击方式都有伤害定义", () => {
    expect(ATTACK.spelling.damage).toBeGreaterThan(ATTACK.en2zh.damage);
    expect(ATTACK.synonym.label).toBe("技能攻击");
  });

  it("句型变化包含常见词形", () => {
    const forms = wordForms("prohibit");
    expect(forms).toContain("prohibited");
    expect(forms).toContain("prohibiting");
    expect(wordForms("carry")).toContain("carries");
  });

  it("句子构建使用句中真实出现的词形，干扰项不与答案重复", () => {
    const q = buildChallenge("sentence", word, pool, "review", () => 0);
    expect(q.correct).toBe("prohibited");
    expect(q.prompt).toContain("______");
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options.map((o) => o.toLowerCase())).size).toBe(4);
  });

  it("同义词与反义词题型使用关系表", () => {
    expect(relationsFor("prohibit")?.synonyms).toContain("ban");
    const syn = buildChallenge("synonym", word, pool, "review", () => 0);
    expect(syn.options).toHaveLength(4);
    expect(relationsFor("prohibit")!.synonyms).toContain(syn.correct);
    const ant = buildChallenge("antonym", word, pool, "review", () => 0);
    expect(relationsFor("prohibit")!.antonyms).toContain(ant.correct);
  });

  it("听音辨词只给释义选项，语境题挖空", () => {
    const listen = buildChallenge("listen", word, pool, "review", () => 0);
    expect(listen.options).toContain("禁止");
    expect(listen.options.every((o) => o === "禁止" || o !== word.word)).toBe(true);
    const ctx = buildChallenge("context", word, pool, "review", () => 0);
    expect(ctx.prompt).toContain("______");
    expect(ctx.options).toContain("prohibit");
  });

  it("判分区分大小写与空格", () => {
    expect(isCorrectAnswer("spelling", "prohibit", " Prohibit ")).toBe(true);
    expect(isCorrectAnswer("en2zh", "禁止", "允许")).toBe(false);
    expect(isCorrectAnswer("synonym", "ban", "Ban")).toBe(true);
  });

  it("可用题型包含基础题型并随词料扩展", () => {
    const modes = availableModes(word, true);
    expect(modes).toContain("en2zh");
    expect(modes).toContain("zh2en");
    expect(modes).toContain("sentence");
    expect(modes).toContain("synonym");
  });
});
