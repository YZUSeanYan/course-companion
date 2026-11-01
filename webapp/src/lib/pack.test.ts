import { describe, expect, it } from "vitest";
import {
  groupLearningItems,
  learningTypeLabel,
  minutesContent,
  parseGlossary,
  summarizeReviewCategories,
} from "./pack";
import type { LearningItemRecord, ReviewCardRecord } from "./db/db";
import type { LearningPackV2 } from "./api/types";

function item(partial: Partial<LearningItemRecord> & { id: number; type: string }): LearningItemRecord {
  return {
    courseId: 1,
    title: `t${partial.id}`,
    content: `c${partial.id}`,
    translation: null,
    example: null,
    sourceIds: [],
    inCET6: false,
    origin: "AI",
    createdAtMillis: 0,
    ...partial,
  } as LearningItemRecord;
}

describe("groupLearningItems", () => {
  it("按固定顺序分组且空分类不出现", () => {
    const items = [
      item({ id: 1, type: "VOCABULARY" }),
      item({ id: 2, type: "MEETING_MINUTES" }),
      item({ id: 3, type: "QUIZ" }),
    ];
    const groups = groupLearningItems(items);
    expect(groups.map((group) => group.type)).toEqual(["MEETING_MINUTES", "VOCABULARY", "QUIZ"]);
  });

  it("未知类型排到最后并标记为学习内容", () => {
    const items = [
      item({ id: 1, type: "MYSTERY" }),
      item({ id: 2, type: "PHRASE" }),
    ];
    const groups = groupLearningItems(items);
    expect(groups.map((group) => group.type)).toEqual(["PHRASE", "MYSTERY"]);
    expect(groups[1].title).toBe("学习内容");
  });
});

describe("learningTypeLabel", () => {
  it("映射已知类型，未知返回学习内容", () => {
    expect(learningTypeLabel("VOCABULARY")).toBe("词汇");
    expect(learningTypeLabel("WHATEVER")).toBe("学习内容");
  });
});

describe("minutesContent", () => {
  it("overview 加上按 order 排序的小节", () => {
    const pack = {
      minutes: {
        title: "T",
        overview: "概览",
        sections: [
          { sectionKey: "b", title: "第二节", body: "B", order: 2, sourceIds: ["s1"] },
          { sectionKey: "a", title: "第一节", body: "A", order: 1, sourceIds: ["s1"] },
        ],
      },
    } as LearningPackV2;
    const content = minutesContent(pack);
    expect(content.startsWith("概览")).toBe(true);
    expect(content.indexOf("第一节")).toBeLessThan(content.indexOf("第二节"));
  });
});

describe("parseGlossary", () => {
  it("解析合法 JSON，过滤非法项", () => {
    expect(parseGlossary(JSON.stringify([{ term: "mitosis", definition: "有丝分裂" }]))).toEqual([
      { term: "mitosis", definition: "有丝分裂" },
    ]);
    expect(parseGlossary("not-json")).toEqual([]);
    expect(parseGlossary(JSON.stringify([{ nope: 1 }]))).toEqual([]);
    expect(parseGlossary("")).toEqual([]);
  });
});

describe("summarizeReviewCategories", () => {
  const now = 1_000_000;
  function card(partial: Partial<ReviewCardRecord> & { id: number }): ReviewCardRecord {
    return {
      learningItemId: partial.id,
      itemType: "VOCABULARY",
      courseId: 1,
      front: "f",
      back: "b",
      dueAtMillis: now - 1,
      cardState: 0,
      step: null,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      lastReviewedAtMillis: null,
      lastRating: null,
      ...partial,
    };
  }

  it("统计到期数与下次到期时间，只保留可复习分类", () => {
    const cards = [
      card({ id: 1, itemType: "VOCABULARY", dueAtMillis: now - 10 }),
      card({ id: 2, itemType: "VOCABULARY", dueAtMillis: now + 100 }),
      card({ id: 3, itemType: "MEETING_MINUTES", dueAtMillis: now - 10 }),
    ];
    const summaries = summarizeReviewCategories(cards, now);
    expect(summaries.map((s) => s.type)).toEqual(["VOCABULARY"]);
    expect(summaries[0]).toMatchObject({ total: 2, due: 1, nextDueAtMillis: now + 100 });
  });

  it("未知类型归入末位其他复习卡片", () => {
    const cards = [card({ id: 1, itemType: "EXTRA" })];
    const summaries = summarizeReviewCategories(cards, now);
    expect(summaries.map((s) => s.type)).toEqual(["EXTRA"]);
    expect(summaries[0].label).toBe("学习内容");
  });
});
