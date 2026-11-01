// CET6 词表导入：解析规则与 Android GlossaryImporter.kt 逐条对齐。
// CSV（逗号，limit 2）或 TSV；表头 term/word/单词/词汇 跳过；小写去重；≤5000 词条。

import { db, type LearningItemRecord } from "./db/db";
import { newCardSchedule } from "./fsrs/scheduler";
import { sha256Hex } from "./api/client";

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export function parseGlossaryCsv(text: string): GlossaryEntry[] {
  const entries = new Map<string, GlossaryEntry>();
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    // Kotlin split(',', limit=2) 把余部保留在第二段；JS split(n) 会截断，需手工切分。
    const commaIndex = line.indexOf(",");
    const parts = line.includes("\t")
      ? line.split("\t")
      : commaIndex === -1
        ? [line]
        : [line.slice(0, commaIndex), line.slice(commaIndex + 1)];
    if (index === 0 && ["term", "word", "单词", "词汇"].includes(parts[0]?.trim().toLowerCase() ?? "")) {
      return;
    }
    if (parts.length < 2) {
      throw new Error(`第 ${index + 1} 行缺少释义，请使用“单词,释义”或 TSV`);
    }
    const term = parts[0].trim();
    const definition = parts
      .slice(1)
      .join(",")
      .trim()
      .replace(/^"/, "")
      .replace(/"$/, "");
    if (!term || !definition) return;
    if (term.length > 120 || definition.length > 1000) {
      throw new Error(`第 ${index + 1} 行内容过长`);
    }
    if (!entries.has(term.toLowerCase())) {
      entries.set(term.toLowerCase(), { term, definition });
    }
  });
  if (entries.size === 0) throw new Error("词表没有有效词条");
  if (entries.size > 5000) throw new Error("单次最多导入 5000 个词条");
  return Array.from(entries.values());
}

/** 导入词表：VOCABULARY 条目（inCET6、MANUAL、sourceIds=CET6-CSV）+ 立即到期复习卡。 */
export async function importCet6Csv(courseId: number, text: string): Promise<number> {
  if (text.length > 2_000_000) throw new Error("词表文件过大");
  const entries = parseGlossaryCsv(text);
  const existing = new Set(
    (await db.learningItems.where("courseId").equals(courseId).toArray())
      .map((item) => item.title.toLowerCase()),
  );
  const now = Date.now();
  const items: LearningItemRecord[] = entries
    .filter((entry) => !existing.has(entry.term.toLowerCase()))
    .map((entry) => ({
      courseId,
      type: "VOCABULARY",
      title: entry.term,
      content: entry.definition,
      translation: null,
      example: null,
      sourceIds: ["CET6-CSV"],
      inCET6: true,
      origin: "MANUAL" as const,
      createdAtMillis: now,
    }));
  const itemIds = await db.learningItems.bulkAdd(items, { allKeys: true });
  const cards = items.map((item, index) => ({
    learningItemId: itemIds[index] as number,
    itemType: "VOCABULARY",
    courseId,
    front: item.title,
    back: item.content,
    ...newCardSchedule(now),
    lastReviewedAtMillis: null,
    lastRating: null,
  }));
  if (cards.length) await db.reviewCards.bulkAdd(cards);
  await db.analysisRuns.add({
    courseId,
    targetType: "GLOSSARY",
    targetId: 0,
    inputSha256: await sha256Hex(text),
    promptVersion: "manual-csv-v1",
    schemaVersion: "1.0",
    model: "MANUAL",
    status: "COMPLETED",
    errorMessage: null,
    createdAtMillis: now,
    completedAtMillis: now,
  });
  return items.length;
}
