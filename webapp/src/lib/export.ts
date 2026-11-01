// Markdown 导出：与 Android 端导出口径一致——学习条目按分类拼接，浏览器直接下载。

import { db } from "./db/db";
import { groupLearningItems, learningTypeLabel, LEARNING_CATEGORIES } from "./pack";
import type { CourseRecord, TranscriptLineRecord, DoubtEventRecord } from "./db/db";

function downloadText(filename: string, text: string, mime = "text/markdown"): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "知习导出";
}

export async function exportCourseMarkdown(course: CourseRecord): Promise<void> {
  const items = await db.learningItems.where("courseId").equals(course.id!).toArray();
  const groups = groupLearningItems(items);
  const lines: string[] = [`# ${course.name}`, ""];
  if (course.teacher) lines.push(`授课教师：${course.teacher}`, "");
  if (groups.length === 0) {
    lines.push("（本课程还没有学习内容）", "");
  }
  for (const group of groups) {
    lines.push(`## ${group.title}`, "");
    for (const item of group.items) {
      lines.push(`### ${item.title}`);
      lines.push(item.content, "");
      if (item.translation) {
        lines.push(`> EN：${item.translation}`, "");
      }
      if (item.example) {
        lines.push(`> 例句：${item.example}`, "");
      }
    }
  }
  downloadText(`${safeFilename(course.name)}.md`, lines.join("\n"));
}

export async function exportSessionTranscriptMarkdown(sessionId: number): Promise<void> {
  const [session, lines, translations, doubts] = await Promise.all([
    db.sessions.get(sessionId),
    db.transcriptLines.where("sessionId").equals(sessionId).sortBy("timestampMillis"),
    db.translations.where("targetLang").equals("zh-CN").toArray(),
    db.doubts.where("sessionId").equals(sessionId).toArray(),
  ]);
  const title = session?.title ?? "课堂记录";
  const out: string[] = [`# ${title}`, ""];
  if (session) {
    out.push(
      `开始时间：${new Date(session.startedAtMillis).toLocaleString("zh-CN")}`,
      "",
    );
  }
  const translationByLine = new Map(translations.map((t) => [t.transcriptLineId, t]));
  for (const line of lines) {
    out.push(`- ${line.text}`);
    const translation = translationByLine.get(line.id!);
    if (translation?.translatedText) {
      out.push(`  - 译：${translation.translatedText}`);
    }
  }
  if (doubts.length) {
    out.push("", "## 标记的疑问", "");
    for (const doubt of doubts) {
      out.push(`- ${doubt.sourceText}${doubt.note ? `（${doubt.note}）` : ""}`);
    }
  }
  const started = session ? new Date(session.startedAtMillis) : new Date();
  const stamp = `${started.getFullYear()}${String(started.getMonth() + 1).padStart(2, "0")}${String(started.getDate()).padStart(2, "0")}`;
  downloadText(`${safeFilename(title)}-${stamp}.md`, out.join("\n"));
}

export function itemTypeOrder(type: string): number {
  const index = LEARNING_CATEGORIES.findIndex((category) => category.type === type);
  return index === -1 ? LEARNING_CATEGORIES.length : index;
}

export { learningTypeLabel };
export type { TranscriptLineRecord, DoubtEventRecord };
