// 译文队列：原文先落库，定稿行逐条翻译；失败不阻塞录音，可重试。
// 与 Android 端“原文优先落库，独立 AI 翻译队列”的行为一致。

import { db, type TranslationRecord, type TranscriptLineRecord } from "./db/db";
import { zhixi } from "./api/client";
import { sha256Hex } from "./api/client";

export type TranslationProgress = (done: number, total: number) => void;

export class TranslationQueue {
  private running = false;
  private cancelled = false;
  private progress: TranslationProgress | null = null;

  constructor(private readonly targetLang: "zh-CN" | "en-US" = "zh-CN") {}

  /** 为尚未翻译的定稿行创建 pending 记录并启动队列。 */
  async enqueueSession(sessionId: number, progress: TranslationProgress | null = null): Promise<void> {
    this.progress = progress;
    const lines = await db.transcriptLines.where("sessionId").equals(sessionId).toArray();
    const existing = await db.translations.where("targetLang").equals(this.targetLang).toArray();
    const translatedLineIds = new Set(
      existing
        .filter((t) => t.status !== "failed")
        .map((t) => t.transcriptLineId),
    );
    const pending: TranslationRecord[] = [];
    for (const line of lines) {
      if (translatedLineIds.has(line.id!)) continue;
      pending.push({
        transcriptLineId: line.id!,
        targetLang: this.targetLang,
        sourceHash: await sha256Hex(line.text),
        translatedText: "",
        status: "pending",
        updatedAtMillis: Date.now(),
      });
    }
    if (pending.length) {
      await db.translations.bulkAdd(pending);
    }
    void this.drain();
  }

  cancel(): void {
    this.cancelled = true;
  }

  get isRunning(): boolean {
    return this.running;
  }

  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.cancelled = false;
    try {
      for (;;) {
        const batch = await db.translations
          .where("status")
          .equals("pending")
          .limit(5)
          .toArray();
        if (!batch.length) break;
        let done = 0;
        for (const record of batch) {
          if (this.cancelled) return;
          await this.translateOne(record);
          done += 1;
          this.progress?.(done, batch.length);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async translateOne(record: TranslationRecord): Promise<void> {
    const line = await db.transcriptLines.get(record.transcriptLineId);
    if (!line) {
      await db.translations.delete(record.id!);
      return;
    }
    try {
      const response = await zhixi.translate(
        record.transcriptLineId,
        line.text,
        this.targetLang,
      );
      await db.translations.update(record.id!, {
        translatedText: response.translation,
        sourceHash: response.sourceHash,
        status: "done",
        updatedAtMillis: Date.now(),
      });
    } catch {
      // 失败标记后由用户手动重试，不阻塞录音（Android 同口径）。
      await db.translations.update(record.id!, {
        status: "failed",
        updatedAtMillis: Date.now(),
      });
    }
  }

  /** 重试所有失败行。 */
  async retryFailed(): Promise<void> {
    const failed = await db.translations.where("status").equals("failed").toArray();
    if (!failed.length) return;
    await db.translations.bulkPut(
      failed.map((record) => ({ ...record, status: "pending" as const, updatedAtMillis: Date.now() })),
    );
    void this.drain();
  }
}

export function lineTranslationOf(
  translations: TranslationRecord[],
  line: TranscriptLineRecord,
  targetLang = "zh-CN",
): TranslationRecord | undefined {
  return translations.find(
    (t) => t.transcriptLineId === line.id && t.targetLang === targetLang && t.status === "done",
  );
}
