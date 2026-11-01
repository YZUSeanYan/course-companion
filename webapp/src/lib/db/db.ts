// 本地存储层：Dexie（IndexedDB），结构对齐 Android 端 Room 实体
// （data/ClassroomDatabase.kt、learning/LearningEntities.kt、data/DoubtModels.kt）。
// 差异：录音 blob 直接存 IndexedDB；译文按行保存；文档页文本存 JSON 字段。

import Dexie, { type Table } from "dexie";

// uid：跨设备同步身份（uuid v4，不可用时降级随机 hex），与本地自增 id 无关。
// 参与云空间同步的 8 张表均有 uid；translations/analysisRuns 不参与同步，无需 uid。
export interface CourseRecord {
  id?: number;
  uid: string;
  name: string;
  teacher: string;
  language: string; // 例如 "中英双语"
  examProfile: "FOREIGN_CLASS" | "CET6" | "GENERAL_EXAM";
  courseNature: string;
  glossaryJson: string; // GlossaryInput[] 的 JSON
  createdAtMillis: number;
}

export interface ClassroomSessionRecord {
  id?: number;
  uid: string;
  startedAtMillis: number;
  endedAtMillis: number | null;
  title: string;
  audioBlob: Blob | null;
  audioMime: string;
  courseId: number | null;
  digestJson: string; // 实时纪要 digest.update 原始事件 JSON
}

export interface TranscriptLineRecord {
  id?: number;
  uid: string;
  sessionId: number;
  timestampMillis: number;
  text: string;
  segmentKey: string | null;
  speaker: string | null;
  startMs: number | null;
  endMs: number | null;
  language: string | null;
}

export interface DoubtEventRecord {
  id?: number;
  uid: string;
  sessionId: number;
  transcriptLineId: number | null;
  timestampMillis: number;
  sourceText: string;
  note: string;
  createdAtMillis: number;
}

export interface TranslationRecord {
  id?: number;
  transcriptLineId: number;
  targetLang: string;
  sourceHash: string;
  translatedText: string;
  status: "pending" | "done" | "failed";
  updatedAtMillis: number;
}

export interface MaterialRecord {
  id?: number;
  uid: string;
  courseId: number;
  title: string;
  mimeType: string;
  documentId: string | null; // /v2/documents/analyze 返回的 documentId
  documentJson: string; // DocumentAsset 的 JSON
  pageCount: number;
  importedAtMillis: number;
}

export type LearningItemType =
  | "MEETING_MINUTES"
  | "DOUBT"
  | "KEY_POINT"
  | "VOCABULARY"
  | "PHRASE"
  | "QUESTION"
  | "QUIZ";

export interface LearningItemRecord {
  id?: number;
  uid: string;
  courseId: number;
  type: LearningItemType | string;
  title: string;
  content: string;
  translation: string | null;
  example: string | null;
  sourceIds: string[];
  inCET6: boolean;
  origin: "AI" | "AI_CACHE" | "MANUAL";
  createdAtMillis: number;
}

export interface ReviewCardRecord {
  id?: number;
  uid: string;
  learningItemId: number;
  itemType: string; // 冗余存储，便于复习页按分类分组（Android 用 JOIN）
  courseId: number;
  front: string;
  back: string;
  dueAtMillis: number;
  cardState: number; // 0=New 1=Learning 2=Review 3=Relearning
  step: number | null;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReviewedAtMillis: number | null;
  lastRating: number | null;
}

export interface ReviewLogRecord {
  id?: number;
  uid: string;
  cardId: number;
  rating: number;
  reviewedAtMillis: number;
  previousDueAtMillis: number;
  nextDueAtMillis: number;
}

export interface AnalysisRunRecord {
  id?: number;
  courseId: number;
  targetType: string; // SESSION | MATERIAL | GLOSSARY
  targetId: number;
  inputSha256: string;
  promptVersion: string;
  schemaVersion: string;
  model: string;
  status: string;
  errorMessage: string | null;
  createdAtMillis: number;
  completedAtMillis: number | null;
}

class ZhixiWebDatabase extends Dexie {
  courses!: Table<CourseRecord, number>;
  sessions!: Table<ClassroomSessionRecord, number>;
  transcriptLines!: Table<TranscriptLineRecord, number>;
  doubts!: Table<DoubtEventRecord, number>;
  translations!: Table<TranslationRecord, number>;
  materials!: Table<MaterialRecord, number>;
  learningItems!: Table<LearningItemRecord, number>;
  reviewCards!: Table<ReviewCardRecord, number>;
  reviewLogs!: Table<ReviewLogRecord, number>;
  analysisRuns!: Table<AnalysisRunRecord, number>;

  constructor() {
    super("zhixi-web");
    this.version(1).stores({
      courses: "++id, createdAtMillis",
      sessions: "++id, startedAtMillis, courseId",
      transcriptLines: "++id, sessionId, [sessionId+timestampMillis]",
      doubts: "++id, sessionId, createdAtMillis",
      translations: "++id, transcriptLineId, [transcriptLineId+targetLang]",
      materials: "++id, courseId, importedAtMillis",
      learningItems: "++id, courseId, [courseId+type], createdAtMillis",
      reviewCards: "++id, learningItemId, dueAtMillis, courseId",
      reviewLogs: "++id, cardId, reviewedAtMillis",
      analysisRuns: "++id, courseId, createdAtMillis",
    });
    // v2：参与云空间同步的 8 张表增加 uid 索引（按 uid 查找/合并）；旧数据由惰性补齐兜底。
    this.version(2).stores({
      courses: "++id, createdAtMillis, uid",
      sessions: "++id, startedAtMillis, courseId, uid",
      transcriptLines: "++id, sessionId, [sessionId+timestampMillis], uid",
      doubts: "++id, sessionId, createdAtMillis, uid",
      translations: "++id, transcriptLineId, [transcriptLineId+targetLang]",
      materials: "++id, courseId, importedAtMillis, uid",
      learningItems: "++id, courseId, [courseId+type], createdAtMillis, uid",
      reviewCards: "++id, learningItemId, dueAtMillis, courseId, uid",
      reviewLogs: "++id, cardId, reviewedAtMillis, uid",
      analysisRuns: "++id, courseId, createdAtMillis",
    });
  }
}

export const db = new ZhixiWebDatabase();

/** 生成同步身份 uid：优先 uuid v4，crypto 不可用时降级为随机 hex（32 字符）。 */
export function newUid(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** 惰性补 uid：无 uid 时生成并写回对象（不落库，落库由调用方决定），返回最终 uid。 */
export function ensureUid<T extends { uid?: string | null }>(record: T): string {
  if (typeof record.uid === "string" && record.uid) return record.uid;
  const uid = newUid();
  record.uid = uid;
  return uid;
}

/** 参与云空间同步的表名（Dexie 名）；translations/analysisRuns 不参与同步。 */
export const SYNCED_TABLES = [
  "courses",
  "sessions",
  "transcriptLines",
  "doubts",
  "materials",
  "learningItems",
  "reviewCards",
  "reviewLogs",
] as const;

const UID_BACKFILL_KEY = "zhixi.web.uidBackfilled";

// 旧数据惰性补 uid：首次打开时一次性扫描补齐并打标记，之后不再全表扫描。
// 打标记失败（无 localStorage 等）只会导致下次多扫一遍，不影响功能。
db.on("ready", async () => {
  try {
    let already = false;
    try {
      already = localStorage.getItem(UID_BACKFILL_KEY) === "2";
    } catch {
      already = false;
    }
    if (already) return;
    for (const name of SYNCED_TABLES) {
      const table = db.table(name);
      const stale: Record<string, unknown>[] = await table.filter(
        (record: unknown) => !!record && typeof (record as { uid?: unknown }).uid !== "string",
      ).toArray();
      if (stale.length) {
        await db.transaction("rw", table, async () => {
          for (const record of stale) {
            ensureUid(record);
            await table.put(record);
          }
        });
      }
    }
    try {
      localStorage.setItem(UID_BACKFILL_KEY, "2");
    } catch {
      // ignore：内存环境或隐私模式
    }
  } catch {
    // 补齐失败不阻塞数据库打开；同步前 collectChanges 会再次兜底补 uid。
  }
});

export async function todayStartMillis(now = Date.now()): Promise<number> {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
