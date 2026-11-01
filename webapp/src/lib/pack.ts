// 学习内容分类与学习包落库，逻辑对齐 Android 端
// learning/LearningCategories.kt 与 LearningPresenter 的 saveLearningPackage。

import { db, newUid, type LearningItemRecord, type ReviewCardRecord, type CourseRecord } from "./db/db";
import type { LearningPackV2 } from "./api/types";
import { newCardSchedule } from "./fsrs/scheduler";
import { fullSync } from "./sync/sync";

export interface LearningCategory {
  type: LearningItemRecord["type"];
  label: string;
  description: string;
  reviewable: boolean;
}

/** 顺序同时决定课程页和复习页的展示顺序；空分类不显示。 */
export const LEARNING_CATEGORIES: LearningCategory[] = [
  { type: "MEETING_MINUTES", label: "课堂纪要", description: "本节课的主题、讲解与结论", reviewable: false },
  { type: "DOUBT", label: "我的疑问", description: "你标记的问题和 AI 参考解答", reviewable: false },
  { type: "KEY_POINT", label: "重点与摘要", description: "课堂摘要、重难点和图像说明", reviewable: false },
  { type: "VOCABULARY", label: "词汇", description: "专业词汇、中文释义与例句", reviewable: true },
  { type: "PHRASE", label: "短语", description: "常用表达与固定搭配", reviewable: true },
  { type: "QUESTION", label: "自测问答", description: "先回忆，再看参考答案", reviewable: true },
  { type: "QUIZ", label: "练习", description: "正反面练习卡片", reviewable: true },
];

export function learningTypeLabel(type: string): string {
  return LEARNING_CATEGORIES.find((category) => category.type === type)?.label ?? "学习内容";
}

export interface LearningCategoryGroup {
  type: string;
  title: string;
  description: string;
  items: LearningItemRecord[];
}

/** 按固定顺序分组，未知类型排到最后，空分类不出现。 */
export function groupLearningItems(items: LearningItemRecord[]): LearningCategoryGroup[] {
  const byType = new Map<string, LearningItemRecord[]>();
  for (const item of items) {
    const list = byType.get(item.type) ?? [];
    list.push(item);
    byType.set(item.type, list);
  }
  const knownTypes = new Set(LEARNING_CATEGORIES.map((c) => c.type));
  const known = LEARNING_CATEGORIES
    .map((category) => {
      const group = byType.get(category.type);
      if (!group || group.length === 0) return null;
      return {
        type: category.type,
        title: category.label,
        description: category.description,
        items: group,
      };
    })
    .filter((group): group is LearningCategoryGroup => group !== null);
  const others = Array.from(byType.keys())
    .filter((type) => !knownTypes.has(type))
    .sort()
    .map((type) => ({
      type,
      title: learningTypeLabel(type),
      description: "其他学习内容",
      items: byType.get(type) ?? [],
    }));
  return [...known, ...others];
}

export interface ReviewCategorySummary {
  type: string;
  label: string;
  description: string;
  total: number;
  due: number;
  nextDueAtMillis: number | null;
}

export function summarizeReviewCategories(
  cards: ReviewCardRecord[],
  nowMillis: number,
): ReviewCategorySummary[] {
  const byType = new Map<string, ReviewCardRecord[]>();
  for (const card of cards) {
    const list = byType.get(card.itemType) ?? [];
    list.push(card);
    byType.set(card.itemType, list);
  }
  const knownTypes = new Set(LEARNING_CATEGORIES.map((c) => c.type));
  const known = LEARNING_CATEGORIES
    .filter((category) => category.reviewable)
    .map((category) => {
      const group = byType.get(category.type);
      if (!group || group.length === 0) return null;
      return summarize(category.type, category.label, category.description, group, nowMillis);
    })
    .filter((s): s is ReviewCategorySummary => s !== null);
  const others = Array.from(byType.keys())
    .filter((type) => !knownTypes.has(type))
    .sort()
    .map((type) => summarize(type, learningTypeLabel(type), "其他复习卡片", byType.get(type) ?? [], nowMillis))
    .filter((s): s is ReviewCategorySummary => s !== null);
  return [...known, ...others];
}

function summarize(
  type: string,
  label: string,
  description: string,
  cards: ReviewCardRecord[],
  nowMillis: number,
): ReviewCategorySummary {
  const upcoming = cards.filter((card) => card.dueAtMillis > nowMillis);
  return {
    type,
    label,
    description,
    total: cards.length,
    due: cards.length - upcoming.length,
    nextDueAtMillis: upcoming.length ? Math.min(...upcoming.map((card) => card.dueAtMillis)) : null,
  };
}

/** minutes 正文：overview + 按序小节，与 Android LearningPresenter 拼接方式一致。 */
export function minutesContent(pack: LearningPackV2): string {
  const minutes = pack.minutes;
  const parts: string[] = [minutes.overview];
  for (const section of [...minutes.sections].sort((a, b) => a.order - b.order)) {
    parts.push("", `## ${section.title}`, section.body);
  }
  return parts.join("\n");
}

export interface SavedPackSummary {
  items: number;
  cards: number;
}

/** 学习包结果落库：条目 + 可复习卡片（front=title, back=content），并写入 analysis_runs。 */
export async function saveLearningPackage(options: {
  course: CourseRecord;
  pack: LearningPackV2;
  analysisId: string;
  inputSha256: string;
  promptVersion: string;
  schemaVersion: string;
  model: string;
  targetType: "SESSION" | "MATERIAL";
  targetId: number;
}): Promise<SavedPackSummary> {
  const { course, pack, analysisId, inputSha256, promptVersion, schemaVersion, model, targetType, targetId } = options;
  const now = Date.now();
  const items: LearningItemRecord[] = [];
  const push = (
    type: LearningItemRecord["type"],
    title: string,
    content: string,
    sourceIds: string[],
    translation: string | null = null,
    example: string | null = null,
  ) => {
    items.push({
      uid: newUid(),
      courseId: course.id!,
      type,
      title,
      content,
      translation,
      example,
      sourceIds,
      inCET6: false,
      origin: "AI",
      createdAtMillis: now,
    });
  };

  if (pack.minutes) {
    const sourceIds = Array.from(new Set(pack.minutes.sections.flatMap((s) => s.sourceIds)));
    push("MEETING_MINUTES", pack.minutes.title, minutesContent(pack), sourceIds);
  }
  for (const answer of pack.doubtAnswers) {
    push("DOUBT", "我的疑问与参考解答", answer.answer, answer.sourceIds);
  }
  for (const note of pack.visualNotes) {
    push("KEY_POINT", "图像说明", note.description, note.sourceIds);
  }
  for (const vocabulary of pack.vocabulary) {
    push("VOCABULARY", vocabulary.term, vocabulary.definitionZh, vocabulary.sourceIds, vocabulary.definitionEn, vocabulary.example);
  }
  for (const phrase of pack.phrases) {
    push("PHRASE", phrase.phrase, phrase.definitionZh, phrase.sourceIds, phrase.definitionEn, phrase.example);
  }
  for (const keyPoint of pack.keyPoints) {
    push("KEY_POINT", "重难点", keyPoint.text, keyPoint.sourceIds);
  }
  for (const question of pack.questions) {
    push("QUESTION", question.question, question.answer, question.sourceIds);
  }
  for (const quiz of pack.quizCards) {
    push("QUIZ", quiz.front, quiz.back, quiz.sourceIds);
  }

  const reviewable = new Set(["VOCABULARY", "PHRASE", "QUESTION", "QUIZ"]);
  const cards: ReviewCardRecord[] = [];
  for (const item of items) {
    if (!reviewable.has(item.type)) continue;
    cards.push({
      uid: newUid(),
      learningItemId: 0, // 落库后回填
      itemType: item.type,
      courseId: course.id!,
      front: item.title,
      back: item.content,
      ...newCardSchedule(now),
      lastReviewedAtMillis: null,
      lastRating: null,
    });
  }

  const itemIds = await db.learningItems.bulkAdd(items, { allKeys: true });
  let cardIndex = 0;
  for (let i = 0; i < items.length; i++) {
    if (!reviewable.has(items[i].type)) continue;
    cards[cardIndex].learningItemId = itemIds[i] as number;
    cardIndex += 1;
  }
  if (cards.length) {
    await db.reviewCards.bulkAdd(cards);
  }
  await db.analysisRuns.add({
    courseId: course.id!,
    targetType,
    targetId,
    inputSha256,
    promptVersion,
    schemaVersion,
    model,
    status: "succeeded",
    errorMessage: null,
    createdAtMillis: now,
    completedAtMillis: Date.now(),
  });
  void analysisId;
  // 学习包落库成功后静默触发一次云空间同步（fire-and-forget；失败不影响主流程，也不弹提示）。
  void fullSync().catch(() => undefined);
  return { items: items.length, cards: cards.length };
}

export function parseGlossary(glossaryJson: string): { term: string; definition?: string }[] {
  if (!glossaryJson.trim()) return [];
  try {
    const parsed = JSON.parse(glossaryJson) as { term: string; definition?: string }[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.term === "string" && item.term.trim());
  } catch {
    return [];
  }
}
