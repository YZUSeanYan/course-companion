// 知习网关 API 的 DTO。字段名与 FastAPI 的 camelCase 别名保持一致，
// 参见 server/app/schemas.py、v2_schemas.py、account_schemas.py、document_models.py。

export interface DeviceRegistration {
  deviceId: string;
  token: string;
  tokenType: "bearer";
}

export interface AccountLimits {
  aiPacksPerDay: number;
  audioMinutesPerDay: number;
  textCharactersPerDay: number;
  documentsPerDay: number;
  maxDevices: number;
}

export interface AccountUsage {
  date: string;
  aiPacks: number;
  audioMinutes: number;
  textCharacters: number;
  documents: number;
}

export interface AccountStatus {
  activated: boolean;
  required: boolean;
  status: string;
  phoneMasked: string;
  displayName: string;
  validUntil: string | null;
  limits: AccountLimits;
  usage: AccountUsage;
}

/** POST /v1/accounts/activate/request-code 响应。 */
export interface ActivationCodeResult {
  sent: boolean;
  phoneMasked: string;
  cooldownSeconds: number;
}

// ---------- 云空间同步（/v1/sync） ----------

/** 参与同步的实体；与 webapp/src/lib/db/db.ts 的 8 张表一一对应。 */
export type SyncEntity =
  | "courses"
  | "learning_items"
  | "review_cards"
  | "review_logs"
  | "sessions"
  | "transcript_lines"
  | "doubts"
  | "materials";

export interface SyncChange {
  entity: SyncEntity;
  /** 跨设备同步身份（uuid v4），与本地自增 id 无关。 */
  clientUid: string;
  /** 记录内容；不含音频（audioBlob/audioMime 排除）、不含任何密钥。 */
  payload: Record<string, unknown>;
  /** 最后更新时间（毫秒），LWW 合并依据。 */
  updatedAt: number;
  deleted: boolean;
}

export interface SyncPushResultItem {
  clientUid: string;
  status: "accepted" | "ignored";
}

export interface SyncPushResponse {
  results: SyncPushResultItem[];
  serverTime: number;
}

export interface SyncPullRecord {
  entity: SyncEntity;
  clientUid: string;
  payload: Record<string, unknown>;
  updatedAt: number;
  deleted: boolean;
}

export interface SyncPullResponse {
  records: SyncPullRecord[];
  serverTime: number;
}

export interface TranslateResponse {
  lineId: number;
  translation: string;
  sourceHash: string;
  model: string;
  schemaVersion: string;
}

export interface ChunkInput {
  sourceId: string;
  text: string;
  page?: number;
  startMs?: number;
  endMs?: number;
}

export interface GlossaryInput {
  term: string;
  definition?: string;
}

export interface ManualDoubtInput {
  doubtId: string;
  sourceText: string;
  note?: string;
}

export interface VisualBlockInput {
  sourceId: string;
  ocrText?: string;
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png";
}

export interface LearningPackRequest {
  courseName: string;
  courseNature?: string;
  language: string;
  analysisMode: "SESSION" | "MATERIAL" | "EXAM";
  chunks: ChunkInput[];
  glossary?: GlossaryInput[];
  manualDoubts?: ManualDoubtInput[];
  visualBlocks?: VisualBlockInput[];
}

export interface MinuteSection {
  sectionKey: string;
  title: string;
  body: string;
  order: number;
  sourceIds: string[];
}

export interface Minutes {
  title: string;
  overview: string;
  sections: MinuteSection[];
}

export interface DoubtAnswer {
  doubtId: string;
  answer: string;
  sourceIds: string[];
}

export interface VisualNote {
  sourceId: string;
  description: string;
  sourceIds: string[];
}

export interface VocabularyItem {
  term: string;
  definitionZh: string;
  definitionEn: string;
  example: string;
  sourceIds: string[];
}

export interface PhraseItem {
  phrase: string;
  definitionZh: string;
  definitionEn: string;
  example: string;
  sourceIds: string[];
}

export interface KeyPointItem {
  text: string;
  sourceIds: string[];
}

export interface QuestionItem {
  question: string;
  answer: string;
  sourceIds: string[];
}

export interface QuizCardItem {
  front: string;
  back: string;
  sourceIds: string[];
}

export interface LearningPackV2 {
  minutes: Minutes;
  doubtAnswers: DoubtAnswer[];
  visualNotes: VisualNote[];
  vocabulary: VocabularyItem[];
  phrases: PhraseItem[];
  keyPoints: KeyPointItem[];
  questions: QuestionItem[];
  quizCards: QuizCardItem[];
}

export interface LearningPackResponse {
  analysisId: string;
  inputSha256: string;
  promptVersion: string;
  schemaVersion: string;
  model: string;
  package: LearningPackV2;
}

export type LearningPackJobStatus = "queued" | "processing" | "succeeded" | "failed";

export interface LearningPackJobCreate {
  jobId: string;
  status: LearningPackJobStatus;
}

export interface LearningPackJob {
  jobId: string;
  status: LearningPackJobStatus;
  result?: LearningPackResponse;
  error?: { code: string; message: string };
}

export interface BlockAsset {
  regionId: string;
  type: "text" | "formula" | "table" | "figure" | "annotation";
  text: string;
  bboxNorm: number[] | null;
  cropRelativePath: string | null;
}

export interface PageAsset {
  pageId: string;
  pageIndex: number;
  nativeText: string;
  ocrText: string;
  pageText: string;
  textSource: string;
  imageRelativePath: string;
  widthPx: number;
  heightPx: number;
  status: string;
  blocks: BlockAsset[];
}

export interface DocumentAsset {
  documentId: string;
  sha256: string;
  mimeType: string;
  parserVersion: string;
  status: string;
  pages: PageAsset[];
  errors: string[];
}

// ---------- Lecsync Realtime WebSocket 事件 ----------

export interface RealtimeConfig {
  transcribe: {
    languages: string[];
    strict?: boolean;
    identifyLanguage?: boolean;
    displayMode?: "classic" | "sentence";
    segmentation?: "short" | "balanced" | "complete";
    speakers?: boolean;
  };
  translate?: { languages: [string, string] };
  glossary?: {
    terms?: string[];
    replacements?: { key: string; value: string }[];
    background?: string;
  };
  aiEnhance?: boolean;
  digest?: boolean;
  store?: boolean;
  region?: "us" | "uk" | "jp" | "ru";
}

export interface RealtimeEvent {
  type: string;
  sessionId?: string;
  store?: boolean;
  text?: string;
  segmentId?: string;
  speaker?: string;
  startMs?: number;
  endMs?: number;
  language?: string;
  targetLanguage?: string;
  effectiveSeconds?: number;
  accruedCents?: number;
  code?: string;
  message?: string;
  retryable?: boolean;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface HealthStatus {
  status: "ok";
  providerConfigured: boolean;
}
