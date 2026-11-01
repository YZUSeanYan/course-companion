// 存储层 uid 测试：生成/补齐/持久化与 uid 索引（fake-indexeddb 环境）。

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

describe("uid 落库与索引（Dexie v2）", () => {
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
