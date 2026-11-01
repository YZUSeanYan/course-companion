// 学习包生成：从课堂会话或讲义材料构建 LearningPackRequest 并轮询任务。

import { db, newUid, type CourseRecord } from "./db/db";
import { zhixi } from "./api/client";
import { parseGlossary, saveLearningPackage } from "./pack";
import type { ManualDoubtInput } from "./api/types";

export interface GenerateOutcome {
  itemCount: number;
  cardCount: number;
}

/** 同一课程 + 同一目标 + 相同内容的旧成功包直接复用（本地去重，Android 同口径）。 */
export async function hasExistingPack(courseId: number, targetType: "SESSION" | "MATERIAL", targetId: number): Promise<boolean> {
  const runs = await db.analysisRuns.where("courseId").equals(courseId).toArray();
  return runs.some(
    (run) => run.targetType === targetType && run.targetId === targetId && run.status === "succeeded",
  );
}

/**
 * 讲义页 → 学习包分片。
 *
 * 页面文本字段不保证存在：扫描版 PDF 可能只有图像；旧版本解析结果里文本存在
 * nativeText / ocrText，没有合并后的 pageText；个别记录甚至整个 pages 缺失。
 * 早先直接 `page.pageText.trim()`，遇到缺失字段就抛
 * "Cannot read properties of undefined (reading 'trim')"，用户只在讲义卡上看到这一行。
 */
export function materialChunks(
  pages: { pageIndex?: number; pageText?: string | null; nativeText?: string | null; ocrText?: string | null }[] | undefined,
): { sourceId: string; text: string; page: number }[] {
  return (pages ?? [])
    .map((page, index) => {
      const pageNumber = (page.pageIndex ?? index) + 1;
      return {
        sourceId: `page-${pageNumber}`,
        text: (page.pageText ?? page.nativeText ?? page.ocrText ?? "").trim(),
        page: pageNumber,
      };
    })
    .filter((chunk) => chunk.text.length > 0);
}

export async function generatePackForSession(options: {
  sessionId: number;
  onStatus?: (status: string) => void;
}): Promise<GenerateOutcome> {
  const session = await db.sessions.get(options.sessionId);
  if (!session) throw new Error("课堂记录不存在");
  let course = session.courseId != null ? await db.courses.get(session.courseId) : undefined;
  if (!course) {
    const courseId = await db.courses.add({
      uid: newUid(),
      name: session.title.replace(/\s*课堂记录$/, "") || "未命名课堂",
      teacher: "",
      language: "中英双语",
      examProfile: "FOREIGN_CLASS",
      courseNature: "",
      glossaryJson: "",
      createdAtMillis: Date.now(),
    });
    const created = await db.courses.get(courseId);
    if (!created) throw new Error("课程创建失败");
    course = created;
    await db.sessions.update(session.id!, { courseId });
  }

  const lines = await db.transcriptLines.where("sessionId").equals(session.id!).sortBy("timestampMillis");
  if (!lines.length) throw new Error("本节课还没有可用的转写内容");
  const doubts = await db.doubts.where("sessionId").equals(session.id!).toArray();
  const chunks = lines.map((line, index) => ({
    sourceId: `seg-${line.segmentKey ?? line.id ?? index}`,
    text: line.text,
    startMs: line.startMs ?? undefined,
    endMs: line.endMs ?? undefined,
  }));
  const manualDoubts: ManualDoubtInput[] = doubts
    // sourceText 可能是空的（只备注没打点），存量数据里也可能是 null，
    // 直接 .trim() 会抛 "Cannot read properties of undefined"，用户只看到一行报错。
    .filter((doubt) => (doubt.sourceText ?? "").trim())
    .map((doubt, index) => ({
      doubtId: `doubt-${doubt.id ?? index}`,
      sourceText: doubt.sourceText,
      note: doubt.note || undefined,
    }));

  return runJob({
    course,
    analysisMode: "SESSION",
    targetType: "SESSION",
    targetId: session.id!,
    chunks,
    manualDoubts,
    onStatus: options.onStatus,
  });
}

export async function generatePackForMaterial(options: {
  materialId: number;
  onStatus?: (status: string) => void;
}): Promise<GenerateOutcome> {
  const material = await db.materials.get(options.materialId);
  if (!material) throw new Error("讲义不存在");
  const course = await db.courses.get(material.courseId);
  if (!course) throw new Error("课程不存在");
  const asset = JSON.parse(material.documentJson) as {
    pages?: { pageIndex?: number; pageText?: string; nativeText?: string; ocrText?: string }[];
  };
  const chunks = materialChunks(asset.pages);
  if (!chunks.length) throw new Error("该讲义没有可提取的文本，复杂版式请等待视觉解析支持");
  return runJob({
    course,
    analysisMode: "MATERIAL",
    targetType: "MATERIAL",
    targetId: material.id!,
    chunks,
    manualDoubts: [],
    onStatus: options.onStatus,
  });
}

async function runJob(options: {
  course: CourseRecord;
  analysisMode: "SESSION" | "MATERIAL";
  targetType: "SESSION" | "MATERIAL";
  targetId: number;
  chunks: { sourceId: string; text: string; page?: number; startMs?: number; endMs?: number }[];
  manualDoubts: ManualDoubtInput[];
  onStatus?: (status: string) => void;
}): Promise<GenerateOutcome> {
  const { course, analysisMode, targetType, targetId, chunks, manualDoubts, onStatus } = options;
  // 提交前本地查重：同一目标已有成功包时不重复计费。
  if (await hasExistingPack(course.id!, targetType, targetId)) {
    throw new Error("该内容已生成过学习包，可在课程页直接查看");
  }
  const payload = {
    courseName: course.name,
    courseNature: course.courseNature || undefined,
    language: "zh-CN",
    analysisMode,
    chunks,
    glossary: parseGlossary(course.glossaryJson),
    manualDoubts: manualDoubts.length ? manualDoubts : undefined,
  } as const;

  onStatus?.("正在创建生成任务…");
  const created = await zhixi.createLearningPackJob(payload);
  onStatus?.("任务已排队，等待 AI 生成…");
  const response = await zhixi.pollLearningPackJob(created.jobId, {
    onStatus: (status) =>
      onStatus?.(status === "processing" ? "AI 正在生成学习内容…" : `任务状态：${status}`),
  });
  const saved = await saveLearningPackage({
    course,
    pack: response.package,
    analysisId: response.analysisId,
    inputSha256: response.inputSha256,
    promptVersion: response.promptVersion,
    schemaVersion: response.schemaVersion,
    model: response.model,
    targetType,
    targetId,
  });
  return { itemCount: saved.items, cardCount: saved.cards };
}
