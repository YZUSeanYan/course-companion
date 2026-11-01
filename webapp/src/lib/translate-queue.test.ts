// 译文语种代号的回归测试。
// 背景：实时通道落库用服务端返回的 "zh"，补翻队列与展示侧用 "zh-CN"。三者口径不一致
// 会导致两个线上可见的问题——课堂页永远看不到译文；结束后队列把已翻译的行再排一次，
// 重复调用翻译接口并重复消耗额度。这组用例锁住修复后的行为。

import { beforeEach, describe, expect, it } from "vitest";
import { db, newUid } from "./db/db";
import { TranslationQueue, lineTranslationOf, pickLineTranslation } from "./translate-queue";
import type { TranscriptLineRecord } from "./db/db";

async function addLine(sessionId: number, text: string): Promise<number> {
  return db.transcriptLines.add({
    uid: newUid(),
    sessionId,
    timestampMillis: Date.now(),
    text,
    segmentKey: `seg-${text}`,
    speaker: null,
    startMs: null,
    endMs: null,
    language: null,
  } as TranscriptLineRecord);
}

beforeEach(async () => {
  await Promise.all([db.transcriptLines.clear(), db.translations.clear()]);
});

describe("lineTranslationOf", () => {
  it("按传入语种代号筛选，默认 zh-CN", async () => {
    const lineId = await addLine(1, "hello");
    await db.translations.add({
      transcriptLineId: lineId,
      targetLang: "zh",
      sourceHash: "",
      translatedText: "你好",
      status: "done",
      updatedAtMillis: Date.now(),
    });

    // 实时通道写入的 "zh" 行：默认参数（zh-CN）取不到，显式传 "zh" 才取得到。
    const line = (await db.transcriptLines.get(lineId))!;
    const rows = await db.translations.toArray();
    expect(lineTranslationOf(rows, line)).toBeUndefined();
    expect(lineTranslationOf(rows, line, "zh")?.translatedText).toBe("你好");
    expect(lineTranslationOf(rows, line, "zh-CN")).toBeUndefined();
  });

  it("只认 status=done 的译文", async () => {
    const lineId = await addLine(2, "world");
    await db.translations.add({
      transcriptLineId: lineId,
      targetLang: "zh-CN",
      sourceHash: "",
      translatedText: "",
      status: "pending",
      updatedAtMillis: Date.now(),
    });
    const line = (await db.transcriptLines.get(lineId))!;
    const rows = await db.translations.toArray();
    expect(lineTranslationOf(rows, line, "zh-CN")).toBeUndefined();
  });
});

describe("TranslationQueue.enqueueSession 去重", () => {
  it("已由实时通道（zh）翻译过的行不会被重新排队", async () => {
    const lineId = await addLine(3, "lecture line");
    await db.translations.add({
      transcriptLineId: lineId,
      targetLang: "zh",
      sourceHash: "",
      translatedText: "课堂内容",
      status: "done",
      updatedAtMillis: Date.now(),
    });

    const queue = new TranslationQueue("zh-CN");
    await queue.enqueueSession(3);
    queue.cancel();

    const rows = await db.translations.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].targetLang).toBe("zh");
    expect(rows.some((row) => row.status === "pending")).toBe(false);
  });

  it("未翻译的行会被排成 pending", async () => {
    await addLine(4, "fresh line");

    const queue = new TranslationQueue("zh-CN");
    await queue.enqueueSession(4);
    queue.cancel();

    const rows = await db.translations.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].targetLang).toBe("zh-CN");
  });

  it("失败过的行允许重试", async () => {
    const lineId = await addLine(5, "retry me");
    await db.translations.add({
      transcriptLineId: lineId,
      targetLang: "zh-CN",
      sourceHash: "",
      translatedText: "",
      status: "failed",
      updatedAtMillis: Date.now(),
    });

    const queue = new TranslationQueue("zh-CN");
    await queue.enqueueSession(5);
    queue.cancel();

    const rows = await db.translations.toArray();
    // 已有 failed 行之外会新增一条 pending，供重试。
    expect(rows.filter((row) => row.status === "pending")).toHaveLength(1);
  });
});

describe("pickLineTranslation（课堂页展示）", () => {
  function row(lineId: number, lang: string, text: string, status: "done" | "pending" = "done") {
    return {
      transcriptLineId: lineId,
      targetLang: lang,
      sourceHash: "",
      translatedText: text,
      status,
      updatedAtMillis: Date.now(),
    };
  }

  it("英文课（→中文）：能取到实时通道落库的 zh 译文", async () => {
    const lineId = await addLine(6, "A lathe removes material.");
    const line = (await db.transcriptLines.get(lineId))!;
    const rows = await db.translations.bulkAdd([row(lineId, "zh", "车床用来去除材料。")], { allKeys: true });
    void rows;
    expect(pickLineTranslation(await db.translations.toArray(), line, "zh")?.translatedText).toBe(
      "车床用来去除材料。",
    );
  });

  it("中文课（→英文）：目标语言是 en 时也要取到，而不是返回 undefined", async () => {
    const lineId = await addLine(7, "车床用来去除材料。");
    const line = { ...(await db.transcriptLines.get(lineId))!, language: "zh" };
    await db.translations.add(row(lineId, "en", "The lathe removes material."));
    expect(pickLineTranslation(await db.translations.toArray(), line, "en")?.translatedText).toBe(
      "The lathe removes material.",
    );
  });

  it("目标语言写的是 en-US（队列口径）也能匹配实时通道的 en", async () => {
    const lineId = await addLine(8, "车床用来去除材料。");
    const line = (await db.transcriptLines.get(lineId))!;
    await db.translations.add(row(lineId, "en", "The lathe removes material."));
    expect(pickLineTranslation(await db.translations.toArray(), line, "en-US")?.translatedText).toBe(
      "The lathe removes material.",
    );
  });

  it("同一行有多语种译文时，优先返回本次会话的目标语言", async () => {
    const lineId = await addLine(9, "mixed");
    const line = (await db.transcriptLines.get(lineId))!;
    await db.translations.bulkAdd([
      row(lineId, "zh", "中文版本"),
      row(lineId, "en", "English version"),
    ]);
    const rows = await db.translations.toArray();
    expect(pickLineTranslation(rows, line, "en")?.translatedText).toBe("English version");
    expect(pickLineTranslation(rows, line, "zh")?.translatedText).toBe("中文版本");
  });

  it("没有完成态译文时返回 undefined（不会把 pending 当译文显示）", async () => {
    const lineId = await addLine(10, "pending only");
    const line = (await db.transcriptLines.get(lineId))!;
    await db.translations.add(row(lineId, "zh", "", "pending"));
    expect(pickLineTranslation(await db.translations.toArray(), line, "zh")).toBeUndefined();
  });

  it("没有译文时返回 undefined", async () => {
    const lineId = await addLine(11, "no translation");
    const line = (await db.transcriptLines.get(lineId))!;
    expect(pickLineTranslation(await db.translations.toArray(), line, "zh")).toBeUndefined();
  });
});
