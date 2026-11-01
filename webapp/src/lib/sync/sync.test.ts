// 云空间同步测试：collectChanges 字段映射与音频排除、push 分批、LWW 合并、fullSync 汇总。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, newUid, SYNCED_TABLES } from "../db/db";
import { collectChanges, PUSH_BATCH_SIZE, fullSync, loadLastSyncAt, pullAndMerge, pushAll } from "./sync";

const store = new Map<string, string>();

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

type PushBody = { changes: { clientUid: string; entity: string }[] };

/** 按 URL 路由的 fetch 桩；push 原样回显 accepted。 */
function mockFetch(handler: (url: string, bodyText: string) => Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const bodyText = typeof init?.body === "string" ? init.body : "";
      return handler(String(input), bodyText);
    }),
  );
}

function acceptedPush(_url: string, bodyText: string): Response {
  const body = JSON.parse(bodyText) as PushBody;
  return jsonResponse({
    results: body.changes.map((change) => ({ clientUid: change.clientUid, status: "accepted" })),
    serverTime: Date.now(),
  });
}

async function clearAll(): Promise<void> {
  await Promise.all(
    [...SYNCED_TABLES, "translations", "analysisRuns"].map((name) => db.table(name).clear()),
  );
}

beforeEach(async () => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => void store.clear(),
  });
  store.set("zhixi.web.gateway", "https://gateway.test");
  store.set("zhixi.web.device", JSON.stringify({ deviceId: "device-1", token: "token-1" }));
  await clearAll();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------- 种子数据 ----------

function courseSeed(uid: string, createdAtMillis: number, name = "市场营销导论") {
  return { uid, name, teacher: "", language: "中英双语", examProfile: "FOREIGN_CLASS" as const, courseNature: "", glossaryJson: "", createdAtMillis };
}

async function seedOnePerTable(): Promise<Record<string, string>> {
  const now = 1000;
  const uids = {
    courses: newUid(),
    learning_items: newUid(),
    review_cards: newUid(),
    review_logs: newUid(),
    sessions: newUid(),
    transcript_lines: newUid(),
    doubts: newUid(),
    materials: newUid(),
  };
  await db.courses.add(courseSeed(uids.courses, now));
  await db.learningItems.add({ uid: uids.learning_items, courseId: 1, type: "VOCABULARY", title: "mitosis", content: "有丝分裂", translation: null, example: null, sourceIds: [], inCET6: false, origin: "AI", createdAtMillis: now });
  await db.reviewCards.add({ uid: uids.review_cards, learningItemId: 1, itemType: "VOCABULARY", courseId: 1, front: "mitosis", back: "有丝分裂", dueAtMillis: 999, cardState: 2, step: null, stability: 3, difficulty: 5, reps: 1, lapses: 0, lastReviewedAtMillis: 555, lastRating: 3 });
  await db.reviewLogs.add({ uid: uids.review_logs, cardId: 1, rating: 3, reviewedAtMillis: 777, previousDueAtMillis: 100, nextDueAtMillis: 999 });
  await db.sessions.add({ uid: uids.sessions, startedAtMillis: 1234, endedAtMillis: 5678, title: "课堂记录", audioBlob: new Blob(["audio"]), audioMime: "audio/wav", courseId: 1, digestJson: "{}" });
  await db.transcriptLines.add({ uid: uids.transcript_lines, sessionId: 1, timestampMillis: 4321, text: "hello class", segmentKey: "s1", speaker: null, startMs: 0, endMs: 1000, language: "en" });
  await db.doubts.add({ uid: uids.doubts, sessionId: 1, transcriptLineId: null, timestampMillis: 8888, sourceText: "什么是 FSRS？", note: "没听懂", createdAtMillis: 8888 });
  await db.materials.add({ uid: uids.materials, courseId: 1, title: "讲义.pdf", mimeType: "application/pdf", documentId: "doc-1", documentJson: '{"pages":[]}', pageCount: 1, importedAtMillis: 6666 });
  return uids;
}

// ---------- collectChanges ----------

describe("collectChanges", () => {
  it("8 张表齐全，translations/analysisRuns 不参与", async () => {
    await seedOnePerTable();
    await db.translations.add({ transcriptLineId: 1, targetLang: "zh", sourceHash: "", translatedText: "你好", status: "done", updatedAtMillis: 1 });
    await db.analysisRuns.add({ courseId: 1, targetType: "GLOSSARY", targetId: 0, inputSha256: "x", promptVersion: "v", schemaVersion: "1", model: "MANUAL", status: "COMPLETED", errorMessage: null, createdAtMillis: 1, completedAtMillis: 1 });
    const changes = await collectChanges();
    expect(changes).toHaveLength(8);
    expect(new Set(changes.map((change) => change.entity))).toEqual(
      new Set(["courses", "learning_items", "review_cards", "review_logs", "sessions", "transcript_lines", "doubts", "materials"]),
    );
    for (const change of changes) {
      expect(change.deleted).toBe(false);
      expect(typeof change.clientUid).toBe("string");
    }
  });

  it("updatedAt 字段映射正确（reviewCards 用 lastReviewedAtMillis ?? dueAtMillis）", async () => {
    await seedOnePerTable();
    const byEntity = new Map((await collectChanges()).map((change) => [change.entity, change]));
    expect(byEntity.get("courses")!.updatedAt).toBe(1000); // createdAtMillis
    expect(byEntity.get("learning_items")!.updatedAt).toBe(1000); // createdAtMillis
    expect(byEntity.get("review_cards")!.updatedAt).toBe(555); // lastReviewedAtMillis 优先
    expect(byEntity.get("review_logs")!.updatedAt).toBe(777); // reviewedAtMillis
    expect(byEntity.get("sessions")!.updatedAt).toBe(1234); // startedAtMillis
    expect(byEntity.get("transcript_lines")!.updatedAt).toBe(4321); // timestampMillis
    expect(byEntity.get("doubts")!.updatedAt).toBe(8888); // timestampMillis
    expect(byEntity.get("materials")!.updatedAt).toBe(6666); // importedAtMillis
  });

  it("新卡（未复习）updatedAt 回退到 dueAtMillis", async () => {
    await db.reviewCards.add({ uid: newUid(), learningItemId: 1, itemType: "QUIZ", courseId: 1, front: "f", back: "b", dueAtMillis: 4242, cardState: 0, step: null, stability: 0, difficulty: 0, reps: 0, lapses: 0, lastReviewedAtMillis: null, lastRating: null });
    const changes = await collectChanges();
    expect(changes.find((change) => change.entity === "review_cards")!.updatedAt).toBe(4242);
  });

  it("payload 排除 audioBlob/audioMime 与本地 id/uid；materials 保留 documentJson", async () => {
    await seedOnePerTable();
    const byEntity = new Map((await collectChanges()).map((change) => [change.entity, change]));
    const sessionPayload = byEntity.get("sessions")!.payload;
    expect(sessionPayload).not.toHaveProperty("audioBlob");
    expect(sessionPayload).not.toHaveProperty("audioMime");
    expect(sessionPayload).not.toHaveProperty("id");
    expect(sessionPayload).not.toHaveProperty("uid");
    expect(sessionPayload.title).toBe("课堂记录");
    const materialPayload = byEntity.get("materials")!.payload;
    expect(materialPayload.documentJson).toBe('{"pages":[]}');
    const linePayload = byEntity.get("transcript_lines")!.payload;
    expect(linePayload.text).toBe("hello class");
  });

  it("无 uid 的存量记录先补 uid 并写回数据库，clientUid 稳定", async () => {
    // 模拟 v1 时代的存量记录：没有 uid 字段。
    const legacy = { name: "旧课程", teacher: "", language: "中英双语", examProfile: "FOREIGN_CLASS" as const, courseNature: "", glossaryJson: "", createdAtMillis: 1000 };
    await db.courses.add(legacy as never);
    const first = await collectChanges();
    expect(first).toHaveLength(1);
    expect(first[0].clientUid).toBeTruthy();
    const stored = await db.courses.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("旧课程");
    expect(stored[0].uid).toBe(first[0].clientUid); // uid 已写回
    const second = await collectChanges();
    expect(second[0].clientUid).toBe(first[0].clientUid); // 身份不再变化
  });
});

// ---------- pushAll 分批 ----------

describe("pushAll", () => {
  it("超过单批上限拆批发送（950 条 → 400/400/150），返回 accepted 总数", async () => {
    const records = Array.from({ length: 950 }, (_, i) => courseSeed(newUid(), i + 1, `课程 ${i}`));
    await db.courses.bulkAdd(records);
    const pushCalls: number[] = [];
    mockFetch((url, bodyText) => {
      expect(url).toBe("https://gateway.test/v1/sync/push");
      const body = JSON.parse(bodyText) as PushBody;
      pushCalls.push(body.changes.length);
      expect(body.changes.length).toBeLessThanOrEqual(500);
      return acceptedPush(url, bodyText);
    });
    const pushed = await pushAll();
    expect(pushed).toBe(950);
    expect(pushCalls).toEqual([PUSH_BATCH_SIZE, PUSH_BATCH_SIZE, 950 - 2 * PUSH_BATCH_SIZE]);
  });
});

// ---------- pullAndMerge（LWW） ----------

function remoteCourse(uid: string, updatedAt: number, overrides: Record<string, unknown> = {}) {
  return {
    entity: "courses" as const,
    clientUid: uid,
    payload: { name: "云端课程", teacher: "王老师", language: "中英双语", examProfile: "FOREIGN_CLASS", courseNature: "", glossaryJson: "", createdAtMillis: updatedAt, ...overrides },
    updatedAt,
    deleted: false,
  };
}

describe("pullAndMerge（LWW）", () => {
  it("远端较新 → 覆盖本地；远端较旧 → 保留本地", async () => {
    const uid = newUid();
    await db.courses.add(courseSeed(uid, 100, "本地课程"));
    mockFetch(() =>
      jsonResponse({
        records: [remoteCourse(uid, 500, { name: "云端新版" })],
        serverTime: 1000,
      }),
    );
    const applied = await pullAndMerge();
    expect(applied).toBe(1);
    let local = await db.courses.where("uid").equals(uid).first();
    expect(local!.name).toBe("云端新版");
    expect(local!.createdAtMillis).toBe(500);
    expect(local!.teacher).toBe("王老师");

    // 再拉一次较旧的版本：本地保留。
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ records: [remoteCourse(uid, 300, { name: "过期云端版" })], serverTime: 1100 })),
    );
    const applied2 = await pullAndMerge();
    expect(applied2).toBe(0);
    local = await db.courses.where("uid").equals(uid).first();
    expect(local!.name).toBe("云端新版");
  });

  it("远端 deleted=true → 删除本地；本地独有 → 保留；远端新记录 → 新增", async () => {
    const deletedUid = newUid();
    const localOnlyUid = newUid();
    const newRemoteUid = newUid();
    await db.courses.add(courseSeed(deletedUid, 100, "将被删除"));
    await db.courses.add(courseSeed(localOnlyUid, 100, "本地独有"));
    mockFetch(() =>
      jsonResponse({
        records: [
          { ...remoteCourse(deletedUid, 900), deleted: true },
          remoteCourse(newRemoteUid, 800, { name: "云端新来的" }),
        ],
        serverTime: 1200,
      }),
    );
    const applied = await pullAndMerge();
    expect(applied).toBe(2); // 删除 1 + 新增 1
    expect(await db.courses.where("uid").equals(deletedUid).first()).toBeUndefined();
    const localOnly = await db.courses.where("uid").equals(localOnlyUid).first();
    expect(localOnly!.name).toBe("本地独有");
    const added = await db.courses.where("uid").equals(newRemoteUid).first();
    expect(added!.name).toBe("云端新来的");
    // 新增记录由 Dexie 分配本地 id，uid 来自 clientUid。
    expect(added!.id).toBeGreaterThan(0);
  });
});

// ---------- fullSync ----------

describe("fullSync", () => {
  it("push → pull → 更新 lastSyncAt；结果汇总 pushed/pulled", async () => {
    const localUid = newUid();
    await db.courses.add(courseSeed(localUid, 100, "本地课程"));
    const remoteUid = newUid();
    mockFetch((url, bodyText) => (url.endsWith("/sync/push") ? acceptedPush(url, bodyText) : jsonResponse({ records: [remoteCourse(remoteUid, 900)], serverTime: 1 })));
    const onStatus: string[] = [];
    const outcome = await fullSync((status) => onStatus.push(status));
    expect(outcome).toMatchObject({ pushed: 1, pulled: 1, ok: true, message: null });
    expect(loadLastSyncAt()).not.toBeNull();
    expect(onStatus.length).toBeGreaterThan(0);
    expect(await db.courses.count()).toBe(2);
  });

  it("失败不抛出：返回 ok=false 与可读 message，且不写 lastSyncAt", async () => {
    const uid = newUid();
    await db.courses.add(courseSeed(uid, 100));
    mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    const outcome = await fullSync();
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("网络连接失败");
    expect(loadLastSyncAt()).toBeNull();
  });
});
