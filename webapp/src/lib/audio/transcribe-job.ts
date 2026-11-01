// 云端音频补转写：把本地 WAV 存档上传 /v2/lecsync/audio/jobs，轮询任务并拉取分段结果。
// 接口口径：POST /v2/lecsync/audio/jobs（file + options 表单）→ GET .../jobs/{id} → GET .../jobs/{id}/result。
// 上游字段名经网关 normalize 转为 camelCase；分段时间戳单位按数值大小自适应（秒/毫秒）。

import { zhixi } from "../api/client";

export interface TranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
}

export interface RetranscribeCallbacks {
  onStatus?(status: string): void;
}

export interface RetranscribeResult {
  segments: TranscriptSegment[];
  raw: unknown;
}

export async function retranscribeWav(
  wavBlob: Blob,
  callbacks: RetranscribeCallbacks = {},
  timeoutMs = 600_000,
  intervalMs = 4_000,
): Promise<RetranscribeResult> {
  callbacks.onStatus?.("正在上传音频…");
  const created = await zhixi.createAudioJob(wavBlob, {
    language: "auto",
    timestamps: "segment",
  });
  const jobId = created.jobId ?? created.requestId ?? created.id;
  if (!jobId) throw new Error("转写任务创建失败：缺少任务号");

  const deadline = Date.now() + timeoutMs;
  let lastStatus = "";
  while (Date.now() < deadline) {
    callbacks.onStatus?.(lastStatus ? `任务状态：${lastStatus}` : "云端转写进行中…");
    await sleep(intervalMs);
    const task = await zhixi.getAudioJob(jobId);
    const status = String(task.status ?? "").toLowerCase();
    if (status && status !== lastStatus) {
      lastStatus = status;
      callbacks.onStatus?.(`任务状态：${status}`);
    }
    if (status === "succeeded" || status === "completed" || status === "finished" || status === "ok") {
      break;
    }
    if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") {
      throw new Error("云端转写任务失败，请稍后重试。");
    }
  }
  if (lastStatus && !["succeeded", "completed", "finished", "ok"].includes(lastStatus)) {
    throw new Error("云端转写超时，可稍后重试。");
  }

  callbacks.onStatus?.("正在获取转写结果…");
  const result = await zhixi.getAudioJobResult(jobId);
  return { segments: parseSegments(result), raw: result };
}

/** 容错解析分段：网关 normalize 后为 startMs/endMs（毫秒）；兼容官方 start/end（秒）。 */
export function parseSegments(payload: unknown): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const collect = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    for (const entry of node) {
      if (typeof entry !== "object" || entry === null) continue;
      const record = entry as Record<string, unknown>;
      const text = typeof record.text === "string" ? record.text.trim() : "";
      const start = toMillis(record.startMs, record.start);
      const end = toMillis(record.endMs, record.end);
      if (text) segments.push({ text, startMs: start ?? 0, endMs: end ?? start ?? 0 });
      if (!text) collect(record.segments ?? record.paragraphs);
    }
  };
  const root = payload as Record<string, unknown> | null;
  if (root) {
    collect(root.segments ?? root.paragraphs);
    const data = root.data;
    if (typeof data === "object" && data !== null) {
      const dataRecord = data as Record<string, unknown>;
      collect(dataRecord.segments ?? dataRecord.paragraphs);
    }
  }
  return segments;
}

function toMillis(msValue: unknown, secondsValue: unknown): number | undefined {
  if (typeof msValue === "number" && Number.isFinite(msValue) && msValue >= 0) {
    return Math.round(msValue);
  }
  if (typeof secondsValue === "number" && Number.isFinite(secondsValue) && secondsValue >= 0) {
    return Math.round(secondsValue * 1000);
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
