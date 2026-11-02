// 课堂落库层回归：
// - 一条长定稿要拆成多行，且不同 segment 之间只追加、不互相覆盖；
// - 同一 segment 重复到达时原地更新（不产生重复卡片）；
// - 译文按源句数量拆开，增强译文覆盖同一行。
// 这组断言直接对应线上「只看到最新一句 / 旧句丢失」的问题。

import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db/db";
import { saveFinalTranscript, saveSegmentTranslation } from "./transcript-store";

const SESSION = 7;
const THREE_SENTENCES =
  "The first point is simple. The second point is important. The third point closes the loop.";

async function rows() {
  return db.transcriptLines.where("sessionId").equals(SESSION).sortBy("timestampMillis");
}

beforeEach(async () => {
  await db.transcriptLines.clear();
  await db.translations.clear();
});

describe("saveFinalTranscript", () => {
  it("长定稿拆成多行，每行独立落库并保持顺序", async () => {
    const saved = await saveFinalTranscript({
      sessionId: SESSION,
      segmentKey: "s1:seg1",
      text: THREE_SENTENCES,
      now: 1_000,
    });
    expect(saved.clauses).toHaveLength(3);
    expect(saved.lineIds).toHaveLength(3);

    const stored = await rows();
    expect(stored.map((row) => row.text)).toEqual(saved.clauses);
    expect(stored.map((row) => row.text)).toEqual([
      "The first point is simple.",
      "The second point is important.",
      "The third point closes the loop.",
    ]);
    expect(stored.map((row) => row.segmentKey)).toEqual(["s1:seg1#0", "s1:seg1#1", "s1:seg1#2"]);
    expect(stored.map((row) => row.timestampMillis)).toEqual([1_000, 1_001, 1_002]);
  });

  it("不同 segment 依次到达时历史只增不减（不会只剩最新一句）", async () => {
    await saveFinalTranscript({ sessionId: SESSION, segmentKey: "s1:a", text: "First sentence.", now: 100 });
    await saveFinalTranscript({ sessionId: SESSION, segmentKey: "s1:b", text: "Second sentence.", now: 200 });
    await saveFinalTranscript({ sessionId: SESSION, segmentKey: "s1:c", text: "Third sentence.", now: 300 });

    const stored = await rows();
    expect(stored.map((row) => row.text)).toEqual([
      "First sentence.",
      "Second sentence.",
      "Third sentence.",
    ]);
  });

  it("同一 segment 重复到达时原地更新，行 id 与总行数都不变", async () => {
    const first = await saveFinalTranscript({
      sessionId: SESSION,
      segmentKey: "s1:a",
      text: "First sentence.",
      now: 100,
    });
    const again = await saveFinalTranscript({
      sessionId: SESSION,
      segmentKey: "s1:a",
      text: "First sentence.",
      now: 900,
    });
    expect(again.lineIds).toEqual(first.lineIds);
    expect(await db.transcriptLines.count()).toBe(1);
    expect((await rows())[0].timestampMillis).toBe(900);
  });

  it("重复定稿变短时删除多余旧行及其译文", async () => {
    const longer = await saveFinalTranscript({
      sessionId: SESSION,
      segmentKey: "s1:a",
      text: THREE_SENTENCES,
      now: 100,
    });
    await saveSegmentTranslation({
      lineIds: longer.lineIds,
      clauses: longer.clauses,
      text: "第一点很简单。第二点很重要。第三点收尾。",
      targetLang: "zh",
    });
    expect(await db.translations.count()).toBe(3);

    const shorter = await saveFinalTranscript({
      sessionId: SESSION,
      segmentKey: "s1:a",
      text: "Only one sentence remains.",
      now: 200,
    });
    expect(shorter.lineIds).toHaveLength(1);
    expect(await db.transcriptLines.count()).toBe(1);
    expect(await db.translations.count()).toBe(1);
    expect((await rows())[0].text).toBe("Only one sentence remains.");
  });

  it("空白定稿不落库", async () => {
    const saved = await saveFinalTranscript({ sessionId: SESSION, segmentKey: "s1:a", text: "   " });
    expect(saved).toEqual({ clauses: [], lineIds: [] });
    expect(await db.transcriptLines.count()).toBe(0);
  });
});

describe("saveSegmentTranslation", () => {
  it("译文按源句数量拆开，每行一条", async () => {
    const saved = await saveFinalTranscript({
      sessionId: SESSION,
      segmentKey: "s1:a",
      text: THREE_SENTENCES,
      now: 100,
    });
    await saveSegmentTranslation({
      lineIds: saved.lineIds,
      clauses: saved.clauses,
      text: "第一点很简单。第二点很重要。第三点收尾。",
      targetLang: "zh",
    });

    const translations = await db.translations.orderBy("transcriptLineId").toArray();
    expect(translations).toHaveLength(3);
    expect(translations.map((row) => row.translatedText)).toEqual([
      "第一点很简单。",
      "第二点很重要。",
      "第三点收尾。",
    ]);
    expect(translations.every((row) => row.status === "done" && row.targetLang === "zh")).toBe(true);
  });

  it("增强译文二次下发时覆盖同一行，不新增记录", async () => {
    const saved = await saveFinalTranscript({
      sessionId: SESSION,
      segmentKey: "s1:a",
      text: "First sentence. Second sentence.",
      now: 100,
    });
    await saveSegmentTranslation({
      lineIds: saved.lineIds,
      clauses: saved.clauses,
      text: "第一句。第二句。",
      targetLang: "zh",
    });
    await saveSegmentTranslation({
      lineIds: saved.lineIds,
      clauses: saved.clauses,
      text: "第一句（增强）。第二句（增强）。",
      targetLang: "zh",
    });

    const translations = await db.translations.orderBy("transcriptLineId").toArray();
    expect(translations).toHaveLength(2);
    expect(translations.map((row) => row.translatedText)).toEqual(["第一句（增强）。", "第二句（增强）。"]);
  });

  it("单句译文整段写入", async () => {
    const saved = await saveFinalTranscript({
      sessionId: SESSION,
      segmentKey: "s1:a",
      text: "One short sentence.",
      now: 100,
    });
    await saveSegmentTranslation({
      lineIds: saved.lineIds,
      clauses: saved.clauses,
      text: "一个短句。",
      targetLang: "zh",
    });
    const [translation] = await db.translations.toArray();
    expect(translation.translatedText).toBe("一个短句。");
  });

  it("空译文不写库", async () => {
    const saved = await saveFinalTranscript({
      sessionId: SESSION,
      segmentKey: "s1:a",
      text: "One short sentence.",
      now: 100,
    });
    await saveSegmentTranslation({ lineIds: saved.lineIds, clauses: saved.clauses, text: " ", targetLang: "zh" });
    expect(await db.translations.count()).toBe(0);
  });
});
