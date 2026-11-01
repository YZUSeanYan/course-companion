// 存储层测试：uid 生成/补齐/持久化与索引回归（fake-indexeddb 环境）。
// 其中「Dexie 索引回归」一组来自线上白屏根因：where() 了未索引字段会让
// Dexie 抛 SchemaError 并在 useLiveQuery 渲染期炸掉整棵 React 树。

import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, ensureUid, newUid, SYNCED_TABLES } from "./db";

beforeEach(async () => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => void store.clear(),
  });
  await Promise.all(
    [...SYNCED_TABLES, "translations", "analysisRuns"].map((name) => db.table(name).clear()),
  );
});

describe("newUid", () => {
  it("生成 uuid v4 或 32 位随机 hex，且不重复", () => {
    const uid = newUid();
    expect(uid).toMatch(/^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(newUid());
    expect(seen.size).toBe(200);
  });
});

describe("ensureUid", () => {
  it("已有 uid 时原样保留，不重新生成", () => {
    const record = { uid: "fixed-uid" };
    expect(ensureUid(record)).toBe("fixed-uid");
    expect(record.uid).toBe("fixed-uid");
  });

  it("缺失 uid 时生成并写回对象", () => {
    const record: { uid?: string; name: string } = { name: "旧数据" };
    const uid = ensureUid(record);
    expect(uid).toBeTruthy();
    expect(record.uid).toBe(uid);
    // 同一对象重复调用结果稳定。
    expect(ensureUid(record)).toBe(uid);
  });
});

describe("uid 落库与索引（Dexie v3）", () => {
  it("带 uid 创建后读回一致，且可按 uid 索引查询", async () => {
    const uid = newUid();
    const id = await db.courses.add({
      uid,
      name: "市场营销导论",
      teacher: "",
      language: "中英双语",
      examProfile: "FOREIGN_CLASS",
      courseNature: "",
      glossaryJson: "",
      createdAtMillis: 1000,
    });
    const course = await db.courses.get(id);
    expect(course?.uid).toBe(uid);
    const found = await db.courses.where("uid").equals(uid).first();
    expect(found?.id).toBe(id);
  });

  it("旧数据（无 uid）读回后经 ensureUid 补齐并写回，可按 uid 查询", async () => {
    // 模拟 v1 时代的存量记录：没有 uid 字段。
    const legacyId = await db.courses.add({
      name: "旧课程",
      teacher: "",
      language: "中英双语",
      examProfile: "GENERAL_EXAM",
      courseNature: "",
      glossaryJson: "",
      createdAtMillis: 900,
    } as never);
    const legacy = await db.courses.get(legacyId);
    expect(legacy?.uid).toBeUndefined();
    const uid = ensureUid(legacy!);
    await db.courses.put(legacy!);
    const found = await db.courses.where("uid").equals(uid).first();
    expect(found?.name).toBe("旧课程");
  });

  it("全部 8 张同步表 add 后读回均有 uid（创建点已生成）", async () => {
    const now = Date.now();
    await db.sessions.add({ uid: newUid(), startedAtMillis: now, endedAtMillis: null, title: "t", audioBlob: null, audioMime: "", courseId: null, digestJson: "" });
    await db.transcriptLines.add({ uid: newUid(), sessionId: 1, timestampMillis: now, text: "hi", segmentKey: null, speaker: null, startMs: null, endMs: null, language: null });
    await db.doubts.add({ uid: newUid(), sessionId: 1, transcriptLineId: null, timestampMillis: now, sourceText: "q", note: "n", createdAtMillis: now });
    await db.materials.add({ uid: newUid(), courseId: 1, title: "讲义", mimeType: "application/pdf", documentId: null, documentJson: "{}", pageCount: 0, importedAtMillis: now });
    await db.learningItems.add({ uid: newUid(), courseId: 1, type: "VOCABULARY", title: "w", content: "c", translation: null, example: null, sourceIds: [], inCET6: false, origin: "MANUAL", createdAtMillis: now });
    await db.reviewCards.add({ uid: newUid(), learningItemId: 1, itemType: "VOCABULARY", courseId: 1, front: "f", back: "b", dueAtMillis: now, cardState: 0, step: null, stability: 0, difficulty: 0, reps: 0, lapses: 0, lastReviewedAtMillis: null, lastRating: null });
    await db.reviewLogs.add({ uid: newUid(), cardId: 1, rating: 3, reviewedAtMillis: now, previousDueAtMillis: now, nextDueAtMillis: now });
    await db.courses.add({ uid: newUid(), name: "c", teacher: "", language: "", examProfile: "FOREIGN_CLASS", courseNature: "", glossaryJson: "", createdAtMillis: now });

    const [sessions, lines, doubts, materials, items, cards, logs, courses] = await Promise.all([
      db.sessions.toArray(),
      db.transcriptLines.toArray(),
      db.doubts.toArray(),
      db.materials.toArray(),
      db.learningItems.toArray(),
      db.reviewCards.toArray(),
      db.reviewLogs.toArray(),
      db.courses.toArray(),
    ]);
    for (const record of [...sessions, ...lines, ...doubts, ...materials, ...items, ...cards, ...logs, ...courses]) {
      expect(typeof record.uid).toBe("string");
      expect(record.uid.length).toBeGreaterThan(0);
    }
  });
});

describe("Dexie 索引回归（白屏根因：where 字段必须有索引）", () => {
  it("translations.targetLang 可查询（课堂页实时译文）", async () => {
    await db.transcriptLines.add({
      uid: newUid(),
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
    await db.courses.add({ uid: newUid(), name: "t", teacher: "", language: "", examProfile: "FOREIGN_CLASS", courseNature: "", glossaryJson: "", createdAtMillis: now });
    await db.sessions.add({ uid: newUid(), startedAtMillis: now, endedAtMillis: null, title: "t", audioBlob: null, audioMime: "", courseId: null, digestJson: "" });
    const session = (await db.sessions.toArray())[0];
    await db.doubts.add({ uid: newUid(), sessionId: session.id!, transcriptLineId: null, timestampMillis: now, sourceText: "d", note: "", createdAtMillis: now });
    await db.materials.add({ uid: newUid(), courseId: 1, title: "m", mimeType: "application/pdf", documentId: null, documentJson: "{}", pageCount: 1, importedAtMillis: now });
    await db.learningItems.add({ uid: newUid(), courseId: 1, type: "VOCABULARY", title: "w", content: "c", translation: null, example: null, sourceIds: [], inCET6: false, origin: "AI", createdAtMillis: now });
    await db.reviewCards.add({ uid: newUid(), learningItemId: 1, itemType: "VOCABULARY", courseId: 1, front: "f", back: "b", dueAtMillis: now, cardState: 0, step: null, stability: 0, difficulty: 0, reps: 0, lapses: 0, lastReviewedAtMillis: null, lastRating: null });
    await db.reviewLogs.add({ uid: newUid(), cardId: 1, rating: 3, reviewedAtMillis: now, previousDueAtMillis: now, nextDueAtMillis: now });
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
