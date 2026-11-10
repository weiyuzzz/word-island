import { describe, expect, it } from "vitest";
import { baseWord, buildVocabIndex, estimateLevel, lemmatize, looksLikeLongSentence, noteKeyFor, tokenizeParagraph } from "../text";

describe("tokenizeParagraph", () => {
  it("保留原始大小写与偏移", () => {
    const text = "The Abundant rain fell.";
    const tokens = tokenizeParagraph(text);
    expect(tokens.map((t) => t.word)).toEqual(["The", "Abundant", "rain", "fell"]);
    expect(tokens[1]).toEqual({ word: "Abundant", start: 4, end: 12 });
    // 偏移能对回原文
    for (const t of tokens) expect(text.slice(t.start, t.end)).toBe(t.word);
  });

  it("处理撇号与连字符", () => {
    expect(tokenizeParagraph("it's a state-of-the-art lab").map((t) => t.word)).toEqual(["it's", "a", "state-of-the-art", "lab"]);
  });
});

describe("lemmatize / baseWord", () => {
  it("屈折变化还原", () => {
    expect(lemmatize("Studies")).toBe("study");
    expect(lemmatize("studied")).toBe("study");
    expect(lemmatize("studying")).toBe("study");
    expect(lemmatize("cities")).toBe("city");
    expect(lemmatize("boxes")).toBe("box");
    expect(lemmatize("went")).toBe("went"); // 不规则变化不做还原，宁可漏配不误配
  });

  it("所有格剥离", () => {
    expect(baseWord("researchers’")).toBe("researchers");
    expect(baseWord("planet's")).toBe("planet");
  });
});

describe("buildVocabIndex", () => {
  it("原形与词元都能命中", () => {
    const idx = buildVocabIndex(["Researchers studied the ocean."]);
    expect(idx["researcher"]).toBeGreaterThan(0);
    expect(idx["study"]).toBeGreaterThan(0);
    expect(idx["ocean"]).toBeGreaterThan(0);
  });
});

describe("estimateLevel", () => {
  it("短句简单文本难度低", () => {
    const easy = ["The cat sat on the mat. It was warm. The dog ran fast."];
    expect(estimateLevel(easy)).toBeLessThanOrEqual(2);
  });

  it("长句长词学术文本难度高", () => {
    const hard = [
      "Notwithstanding the methodological sophistication characterizing contemporary longitudinal investigations, the extrapolation of correlational findings into deterministic causal pronouncements remains epistemologically indefensible.",
    ];
    expect(estimateLevel(hard)).toBeGreaterThanOrEqual(4);
  });
});

describe("noteKeyFor", () => {
  it("同一表达不同词形归并为同一 key", () => {
    expect(noteKeyFor("caused a decline")).toBe(noteKeyFor("causes a decline"));
    expect(noteKeyFor("leading to results")).toBe(noteKeyFor("lead to results"));
  });

  it("不同表达 key 不同", () => {
    expect(noteKeyFor("lead to")).not.toBe(noteKeyFor("result in"));
  });
});

describe("looksLikeLongSentence", () => {
  it("长句或带从句标志词的句子被识别", () => {
    expect(looksLikeLongSentence("The study, which was conducted over a decade, found that sleep matters.")).toBe(true);
    expect(looksLikeLongSentence("Birds fly.")).toBe(false);
  });
});
