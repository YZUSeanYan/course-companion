// 实时课堂事件解析：把上游（Lecsync）不同形态的字段收敛成网页端可渲染的文本。
//
// sentence 模式下 transcript.partial 是「快照」而不是增量：
//   { text?, pending?, tail?, paragraphs?: [{ speaker?, pieces: [{ text, confirmed }], translation? }], tailTranslation? }
// 其中 paragraphs 是已对齐的段落（含每段译文），tail/tailTranslation 描述还没说完的半句，
// pending 是扁平兜底。网页端早先只读 text，一旦上游把内容放进 paragraphs 或 pending，
// 实时行就会空着或只剩半句；这里统一按「paragraphs+tail → text → pending」兜底。
//
// segmentId 是上游生成的不透明 id，可能是字符串也可能是数字（数字 0 也不能当作缺失），
// 直接写 `if (!segmentId)` 会把合法的 0 号段整段丢掉。

import type { RealtimeEvent } from "./api/types";

interface RawParagraph {
  pieces?: unknown;
  translation?: unknown;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 两个片段拼接：中日韩文字之间不加空格，拉丁文字之间补一个空格。 */
function joinText(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  const leftChar = left[left.length - 1];
  const rightChar = right[0];
  const leftCjk = /[\u3400-\u9fff\uff00-\uffef]/.test(leftChar);
  const rightCjk = /[\u3400-\u9fff\uff00-\uffef]/.test(rightChar);
  const needsSpace = !leftCjk && !rightCjk && !/\s/.test(leftChar) && !/\s/.test(rightChar);
  return needsSpace ? `${left} ${right}` : `${left}${right}`;
}

function paragraphText(paragraphs: unknown): string {
  if (!Array.isArray(paragraphs)) return "";
  let text = "";
  for (const raw of paragraphs) {
    if (typeof raw !== "object" || raw === null) continue;
    const pieces = (raw as RawParagraph).pieces;
    if (!Array.isArray(pieces)) continue;
    for (const piece of pieces) {
      if (typeof piece !== "object" || piece === null) continue;
      const pieceText = asString((piece as { text?: unknown }).text);
      if (pieceText) text = joinText(text, pieceText);
    }
  }
  return text;
}

/** 去掉空白和标点，只留文字，用于判断 tail 是否已经并进 base。 */
function comparable(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
}

/** 追加未定稿半句；上游有时已经把它并进 text，重复时不再拼接。 */
function appendTail(base: string, tail: string): string {
  if (!tail) return base;
  if (!base) return tail;
  const normalizedTail = comparable(tail);
  if (!normalizedTail) return base;
  if (comparable(base).endsWith(normalizedTail)) return base;
  return joinText(base, tail);
}

/** 实时行要显示的原文：优先句模式快照，再退到扁平 text / pending。 */
export function partialTextOf(event: RealtimeEvent): string {
  const paragraphs = paragraphText(event.paragraphs);
  if (paragraphs) return appendTail(paragraphs, asString(event.tail)).trim();
  const text = asString(event.text);
  if (text) return text.trim();
  const pending = asString(event.pending);
  if (pending) return appendTail(pending, asString(event.tail)).trim();
  return "";
}

function paragraphTranslation(paragraphs: unknown): string {
  if (!Array.isArray(paragraphs)) return "";
  let translation = "";
  for (const raw of paragraphs) {
    if (typeof raw !== "object" || raw === null) continue;
    const value = (raw as RawParagraph).translation;
    if (typeof value === "string") {
      if (value.trim()) translation = value.trim();
    } else if (typeof value === "object" && value !== null) {
      const nested = asString((value as { text?: unknown }).text);
      if (nested.trim()) translation = nested.trim();
    }
  }
  return translation;
}

/**
 * 实时行的译文预览：句模式的 tailTranslation 最贴近当前半句；
 * 没有时退到已对齐段落的最后一条译文，再退到 aggregate translation.partial（调用方另行处理）。
 */
export function partialTranslationOf(event: RealtimeEvent): string {
  const tail = asString(event.tailTranslation).trim();
  if (tail) return tail;
  return paragraphTranslation(event.paragraphs);
}

/**
 * segmentId 归一化：接受字符串与数字（包括 0），其余视为缺失。
 * 返回空串表示这条事件没有可用的段 id。
 */
export function normalizeSegmentId(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** 同一连接内 segmentId 才是唯一的；跨重连要加上流代号，避免旧段的译文串到新段上。 */
export function segmentKeyOf(streamToken: string, segmentId: string): string {
  return `${streamToken}:${segmentId}`;
}
