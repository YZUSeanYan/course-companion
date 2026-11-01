// 回归测试：所有 where() 字段必须有索引（线上白屏根因即缺索引的 SchemaError）。
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("Dexie 索引回归（白屏根因）", () => {
  it("translations.targetLang 可查询（课堂页实时译文）", async () => {
    await db.transcriptLines.add({
      sessionId: 1,
      timestampMillis: Date.now(),
      text: "hello",
      segmentKey: "s1",
      speaker: null,
      startMs: 0,
      endMs: 1000,
      language: "en",
    });
    const line = await db.transcriptLines.toArray();
    await db.translations.add({
      transcriptLineId: line[0].id!,
      targetLang: "zh",
      sourceHash: "",
      translatedText: "你好",
      status: "done",
      updatedAtMillis: Date.now(),
    });
    const rows = await db.translations.where("targetLang").equals("zh").toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].translatedText).toBe("你好");
  });

  it("translations.status 可查询（译文队列 pending/failed）", async () => {
    await db.translations.add({
      transcriptLineId: 1,
      targetLang: "zh",
      sourceHash: "",
      translatedText: "",
      status: "pending",
      updatedAtMillis: Date.now(),
    });
    const pending = await db.translations.where("status").equals("pending").toArray();
    expect(pending).toHaveLength(1);
  });

  it("其余表的 where 字段全部可查询", async () => {
    const now = Date.now();
    await db.courses.add({ name: "t", teacher: "", language: "", examProfile: "FOREIGN_CLASS", courseNature: "", glossaryJson: "", createdAtMillis: now });
    await db.sessions.add({ startedAtMillis: now, endedAtMillis: null, title: "t", audioBlob: null, audioMime: "", courseId: null, digestJson: "" });
    const session = (await db.sessions.toArray())[0];
    await db.doubts.add({ sessionId: session.id!, transcriptLineId: null, timestampMillis: now, sourceText: "d", note: "", createdAtMillis: now });
    await db.materials.add({ courseId: 1, title: "m", mimeType: "application/pdf", documentId: null, documentJson: "{}", pageCount: 1, importedAtMillis: now });
    await db.learningItems.add({ courseId: 1, type: "VOCABULARY", title: "w", content: "c", translation: null, example: null, sourceIds: [], inCET6: false, origin: "AI", createdAtMillis: now });
    await db.reviewCards.add({ learningItemId: 1, itemType: "VOCABULARY", courseId: 1, front: "f", back: "b", dueAtMillis: now, cardState: 0, step: null, stability: 0, difficulty: 0, reps: 0, lapses: 0, lastReviewedAtMillis: null, lastRating: null });
    await db.reviewLogs.add({ cardId: 1, rating: 3, reviewedAtMillis: now, previousDueAtMillis: now, nextDueAtMillis: now });
    await db.analysisRuns.add({ courseId: 1, targetType: "SESSION", targetId: 1, inputSha256: "x", promptVersion: "p", schemaVersion: "1", model: "m", status: "succeeded", errorMessage: null, createdAtMillis: now, completedAtMillis: now });

    expect((await db.courses.where("createdAtMillis").above(0).toArray()).length).toBe(1);
    expect((await db.doubts.where("sessionId").equals(session.id!).toArray()).length).toBe(1);
    expect((await db.materials.where("courseId").equals(1).toArray()).length).toBe(1);
    expect((await db.learningItems.where("courseId").equals(1).toArray()).length).toBe(1);
    expect((await db.reviewCards.where("dueAtMillis").below(now + 1).toArray()).length).toBe(1);
    expect((await db.reviewLogs.where("cardId").equals(1).toArray()).length).toBe(1);
    expect((await db.analysisRuns.where("courseId").equals(1).toArray()).length).toBe(1);
    expect((await db.sessions.where("startedAtMillis").below(now + 1).toArray()).length).toBe(1);
  });
});
