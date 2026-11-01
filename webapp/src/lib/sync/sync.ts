// 云空间同步客户端：把本地 IndexedDB 的学习数据同步到账号云空间。
//
// 同步语义（与网关 /v1/sync/push、/v1/sync/pull 契约对应）：
// - 账号级：以设备 Bearer 鉴权，数据归属激活手机号的账号；
// - 身份：每条记录以 uid（uuid v4）跨设备标识，与本地自增 id 无关；
// - 合并：LWW（last-write-wins）——按 (entity, uid) 匹配，updatedAt 大者胜；
//   远端 deleted=true 删除本地；本地独有（远端没有）的记录保留；
//   首次同步先 push 保证云端有全量，之后 pull 与本地做 LWW；
// - 隐私：仅同步学习元数据与文本；payload 不含音频（audioBlob/audioMime 排除）、
//   不含任何密钥；translations 不参与同步；materials 的 documentJson 保留，
//   整体 payload ≤128KB 由调用方保证（讲义解析结果本身有大小约束）。
//
// 已知边界（一期）：sessionId/courseId/cardId 等关联字段是设备本地自增 id，
// 仅在来源设备上有意义；跨设备恢复后引用可能断开，待后续版本做 uid 关联重映射。

import { db, ensureUid, type ClassroomSessionRecord, type CourseRecord, type DoubtEventRecord, type LearningItemRecord, type MaterialRecord, type ReviewCardRecord, type ReviewLogRecord, type TranscriptLineRecord } from "../db/db";
import type { Table } from "dexie";
import { zhixi, ZhixiApiError } from "../api/client";
import type { SyncChange, SyncEntity } from "../api/types";

/** 实体 → Dexie 表。translations/analysisRuns 不参与同步。
 *  8 张表的记录类型互不相同，payload 即记录字段本身，这里统一用宽松表类型处理。 */
const SYNC_TABLES: Record<SyncEntity, Table<any, number>> = {
  courses: db.courses,
  learning_items: db.learningItems,
  review_cards: db.reviewCards,
  review_logs: db.reviewLogs,
  sessions: db.sessions,
  transcript_lines: db.transcriptLines,
  doubts: db.doubts,
  materials: db.materials,
};

/** 每类记录的 LWW 时间戳来源（毫秒）。 */
function updatedAtOf(entity: SyncEntity, record: object): number {
  switch (entity) {
    case "courses":
      return (record as CourseRecord).createdAtMillis;
    case "learning_items":
      return (record as LearningItemRecord).createdAtMillis;
    case "review_logs":
      return (record as ReviewLogRecord).reviewedAtMillis;
    case "review_cards":
      // 复习卡以最近一次复习时间参与合并；从未复习过的新卡回退到到期时间。
      return (record as ReviewCardRecord).lastReviewedAtMillis ?? (record as ReviewCardRecord).dueAtMillis;
    case "sessions":
      return (record as ClassroomSessionRecord).startedAtMillis;
    case "transcript_lines":
      return (record as TranscriptLineRecord).timestampMillis;
    case "doubts":
      return (record as DoubtEventRecord).timestampMillis;
    case "materials":
      return (record as MaterialRecord).importedAtMillis;
  }
}

/** 各实体不入 payload 的字段；音频永不入云。 */
const EXCLUDED_PAYLOAD_FIELDS: Partial<Record<SyncEntity, string[]>> = {
  sessions: ["audioBlob", "audioMime"],
};

function buildPayload(entity: SyncEntity, record: object): Record<string, unknown> {
  const excluded = new Set(EXCLUDED_PAYLOAD_FIELDS[entity] ?? []);
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    // id 是本地自增主键、uid 由 change.clientUid 携带，均不进 payload。
    if (key === "id" || key === "uid" || excluded.has(key)) continue;
    payload[key] = value;
  }
  return payload;
}

/** 遍历 8 张表收集本地变更；无 uid 的记录先补 uid 并写回，保证同步身份稳定。 */
export async function collectChanges(): Promise<SyncChange[]> {
  const changes: SyncChange[] = [];
  for (const [entity, table] of Object.entries(SYNC_TABLES) as [SyncEntity, Table<any, number>][]) {
    const records: Record<string, unknown>[] = await table.toArray();
    for (const record of records) {
      if (typeof record.uid !== "string" || !record.uid) {
        ensureUid(record);
        await table.put(record); // 写回新生成的 uid，后续同步身份不变
      }
      changes.push({
        entity,
        clientUid: record.uid as string,
        payload: buildPayload(entity, record),
        updatedAt: updatedAtOf(entity, record),
        deleted: false,
      });
    }
  }
  return changes;
}

/** push 分批大小：服务端上限 500 条/批，留余量。 */
export const PUSH_BATCH_SIZE = 400;

/** 全量推送本地变更（分批），返回被服务端接受的条数。 */
export async function pushAll(): Promise<number> {
  const changes = await collectChanges();
  let pushed = 0;
  for (let i = 0; i < changes.length; i += PUSH_BATCH_SIZE) {
    const batch = changes.slice(i, i + PUSH_BATCH_SIZE);
    const response = await zhixi.syncPush(batch);
    pushed += response.results.filter((item) => item.status === "accepted").length;
  }
  return pushed;
}

/**
 * 拉取远端全量并与本地做 LWW 合并，返回应用（新增/更新/删除）的条数。
 * 远端没有的本地记录一律保留（由首次 push 保证云端全量）。
 */
export async function pullAndMerge(): Promise<number> {
  const response = await zhixi.syncPull([]); // 空数组 = 全部实体
  let applied = 0;
  for (const remote of response.records) {
    const table = SYNC_TABLES[remote.entity];
    if (!table) continue; // 未知实体：跳过，不阻塞其余合并
    const existing = await table.where("uid").equals(remote.clientUid).first();
    if (remote.deleted) {
      if (existing?.id != null) {
        await table.delete(existing.id);
        applied += 1;
      }
      continue;
    }
    if (existing?.id != null) {
      if (remote.updatedAt > updatedAtOf(remote.entity, existing)) {
        // payload 不含 id/uid：update 只合并字段，保留本地主键与 uid。
        await table.update(existing.id, remote.payload as Record<string, unknown>);
        applied += 1;
      }
    } else {
      await table.add({ ...remote.payload, uid: remote.clientUid });
      applied += 1;
    }
  }
  return applied;
}

const LAST_SYNC_KEY = "zhixi.web.lastSyncAt";

/** 上次完整同步成功时间（毫秒）；从未同步过返回 null。 */
export function loadLastSyncAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_SYNC_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export const SYNC_EVENT_NAME = "zhixi.web.sync-finished";

export interface SyncOutcome {
  /** 被 accept 的推送条数。 */
  pushed: number;
  /** 拉取合并（新增/更新/删除）的条数。 */
  pulled: number;
  ok: boolean;
  /** 失败时的可读原因；成功为 null。 */
  message: string | null;
}

function toMessage(error: unknown): string {
  if (error instanceof ZhixiApiError) return error.userMessage;
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * 完整同步：pushAll → pullAndMerge → 记录 zhixi.web.lastSyncAt。
 * 失败不抛出：返回 { ok:false, message }，UI 可安全展示。
 */
export async function fullSync(onStatus?: (status: string) => void): Promise<SyncOutcome> {
  let pushed = 0;
  let pulled = 0;
  try {
    onStatus?.("正在收集本地变更…");
    pushed = await pushAll();
    onStatus?.(`已推送 ${pushed} 条，正在拉取云端…`);
    pulled = await pullAndMerge();
    try {
      localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    } catch {
      // ignore：无法记录时间不影响同步结果
    }
    onStatus?.("同步完成");
    return { pushed, pulled, ok: true, message: null };
  } catch (error) {
    return { pushed, pulled, ok: false, message: toMessage(error) };
  } finally {
    // 通知设置页同步卡片等监听者刷新（无论成败；无 window 的环境忽略）。
    try {
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
        window.dispatchEvent(new CustomEvent(SYNC_EVENT_NAME));
      }
    } catch {
      // ignore
    }
  }
}
