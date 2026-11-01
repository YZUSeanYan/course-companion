// 本地存储层：Dexie（IndexedDB），结构对齐 Android 端 Room 实体
// （data/ClassroomDatabase.kt、learning/LearningEntities.kt、data/DoubtModels.kt）。
// 差异：录音 blob 直接存 IndexedDB；译文按行保存；文档页文本存 JSON 字段。

import Dexie, { type Table } from "dexie";

export interface CourseRecord {
  id?: number;
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
  startedAtMillis: number;
  endedAtMillis: number | null;
  title: string;
  audioBlob: Blob | null;
  audioMime: string;
  courseId: number | null;
}

export interface TranscriptLineRecord {
  id?: number;
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
  }
}

export const db = new ZhixiWebDatabase();

export async function todayStartMillis(now = Date.now()): Promise<number> {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
