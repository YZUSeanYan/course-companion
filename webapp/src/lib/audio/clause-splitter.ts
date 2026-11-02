// 长表述主动分句：把云端返回的整段 final 拆成字幕大小的短句，再逐句落库，
// 译文按相同句数拆开保存，保证每张卡片都是双语的。
//
// 与 Android 端 `audio/TranscriptClauseSplitter.kt` 同一套规则与阈值，
// 两边看到的分句节奏才会一致。云端 sentence 模式的 final 常常是一整段
// （讲者不停顿时甚至是一句到底），而每条转写都会渲染成一张卡片，
// 不拆就会得到一大段难读的文本。

/** 一条字幕的目标上限：约 8 个英文单词或 16 个汉字。 */
const MAX_UNITS = 16;
/** 超过这个长度才考虑按从句切。 */
const SPLIT_AT_UNITS = 20;
/** 太短的碎片并进相邻句，避免出现「嗯。」这种独立卡片。 */
const TINY_UNITS = 4;
/** 病态输入的保护阈值：超出的部分合并，绝不丢内容。 */
const MAX_PARTS = 8;

const SENTENCE_ENDERS = new Set([".", "!", "?", "。", "！", "？", "；", ";", "…"]);
const SENTENCE_CLOSERS = new Set([..."”\"'’）)】]」』"]);
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "st", "vs", "etc", "e.g", "i.e", "a.m", "p.m", "u.s", "u.k",
]);
const ENGLISH_BREAKERS = [
  " because ", " so ", " and ", " but ", " which ", " when ", " while ", " although ",
  " though ", " that ", " if ", " or ", " then ", " where ", " after ", " before ",
];
const CHINESE_BREAKERS = [
  "因为", "所以", "但是", "可是", "而且", "并且", "如果", "虽然", "然后", "因此",
  "不过", "而是", "于是", "同时",
];
const CLAUSE_MARKS = new Set([",", "，", "、", ":", "："]);

function isCjk(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf);
}

/** 字幕长度单位：汉字算 1，英文单词算 2。 */
function units(text: string): number {
  let cjk = 0;
  let words = 0;
  let inWord = false;
  for (const ch of text) {
    if (isCjk(ch)) {
      cjk += 1;
      inWord = false;
    } else if (/[\p{L}\p{N}]/u.test(ch)) {
      if (!inWord) {
        words += 1;
        inWord = true;
      }
    } else {
      inWord = false;
    }
  }
  return cjk + words * 2;
}

function previousWord(text: string, index: number): string {
  let cursor = index;
  while (cursor > 0 && !/\s/.test(text[cursor - 1])) cursor -= 1;
  return text.slice(cursor, index).replace(/^[,;:([\"']+|[,;:([\"']+$/g, "").trim();
}

function isSentenceBoundary(text: string, index: number): boolean {
  const ch = text[index];
  if (ch !== ".") return true;
  const previous = previousWord(text, index);
  if (previous.length === 1 && /[A-Za-z]/.test(previous)) return false;
  if (ABBREVIATIONS.has(previous.toLowerCase())) return false;
  const next = text[index + 1];
  const before = text[index - 1];
  if (next != null && /\d/.test(next) && before != null && /\d/.test(before)) return false;
  // "3.14"、"v2.0.8" 不是句末。
  if (before != null && /\d/.test(before)) return false;
  return true;
}

function splitSentences(text: string): string[] {
  const result: string[] = [];
  let start = 0;
  let index = 0;
  while (index < text.length) {
    const ch = text[index];
    if (SENTENCE_ENDERS.has(ch) && isSentenceBoundary(text, index)) {
      let end = index + 1;
      // "..." 这类连续省略号当作一个边界。
      while (end < text.length && text[end] === ch) end += 1;
      while (end < text.length && (SENTENCE_CLOSERS.has(text[end]) || text[end] === " ")) end += 1;
      const piece = text.slice(start, end).trim();
      if (piece) result.push(piece);
      start = end;
      index = end;
    } else {
      index += 1;
    }
  }
  if (start < text.length) {
    const tail = text.slice(start).trim();
    if (tail) result.push(tail);
  }
  return result;
}

function splitAtClauseMarks(text: string): string[] {
  const result: string[] = [];
  let start = 0;
  let index = 0;
  while (index < text.length) {
    if (CLAUSE_MARKS.has(text[index])) {
      let end = index + 1;
      while (end < text.length && text[end] === " ") end += 1;
      const piece = text.slice(start, end).trim();
      if (piece) result.push(piece);
      start = end;
      index = end;
    } else {
      index += 1;
    }
  }
  if (start < text.length) {
    const tail = text.slice(start).trim();
    if (tail) result.push(tail);
  }
  return result;
}

function splitAtBreakers(text: string): string[] {
  const lower = text.toLowerCase();
  const cuts: number[] = [];
  for (const breaker of ENGLISH_BREAKERS) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(breaker, from);
      if (at < 0) break;
      cuts.push(at + 1); // 前导空格留给后一句
      from = at + breaker.length;
    }
  }
  for (const breaker of CHINESE_BREAKERS) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(breaker, from);
      if (at < 0) break;
      cuts.push(at);
      from = at + breaker.length;
    }
  }
  if (cuts.length === 0) return [text];
  const sorted = [...new Set(cuts.filter((cut) => cut > 0 && cut < text.length))].sort((a, b) => a - b);
  if (sorted.length === 0) return [text];
  const result: string[] = [];
  let start = 0;
  for (const cut of sorted) {
    const piece = text.slice(start, cut).trim();
    if (piece) result.push(piece);
    start = cut;
  }
  const tail = text.slice(start).trim();
  if (tail) result.push(tail);
  return result;
}

function splitAtWidth(text: string): string[] {
  const result: string[] = [];
  let remaining = text.trim();
  while (units(remaining) > MAX_UNITS && remaining) {
    let cursor = 0;
    let unitCount = 0;
    let inWord = false;
    let cut = -1;
    while (cursor < remaining.length && unitCount <= MAX_UNITS) {
      const ch = remaining[cursor];
      if (isCjk(ch)) {
        unitCount += 1;
        inWord = false;
        if (unitCount >= MAX_UNITS) cut = cursor + 1;
      } else if (/[\p{L}\p{N}]/u.test(ch)) {
        if (!inWord) {
          unitCount += 2;
          inWord = true;
        }
        if (unitCount >= MAX_UNITS) cut = cursor + 1;
      } else if (/\s/.test(ch)) {
        inWord = false;
        cut = cursor + 1;
      } else {
        inWord = false;
      }
      cursor += 1;
    }
    if (cut <= 0 || cut >= remaining.length) cut = Math.max(1, cursor);
    const piece = remaining.slice(0, cut).trim();
    if (piece) result.push(piece);
    remaining = remaining.slice(cut).trim();
    if (result.length >= MAX_PARTS) break;
  }
  if (remaining) result.push(remaining);
  return result;
}

function splitAtPunctuation(text: string): string[] {
  const result: string[] = [];
  let start = 0;
  let index = 0;
  while (index < text.length) {
    const ch = text[index];
    if (SENTENCE_ENDERS.has(ch) || CLAUSE_MARKS.has(ch)) {
      let end = index + 1;
      while (end < text.length && (SENTENCE_CLOSERS.has(text[end]) || text[end] === " ")) end += 1;
      const piece = text.slice(start, end).trim();
      if ([...piece].some((c) => /[\p{L}\p{N}]/u.test(c) || isCjk(c))) result.push(piece);
      start = end;
      index = end;
    } else {
      index += 1;
    }
  }
  if (start < text.length) {
    const tail = text.slice(start).trim();
    if (tail) result.push(tail);
  }
  return result;
}

function isBreakFriendly(ch: string): boolean {
  return /\s/.test(ch) || SENTENCE_ENDERS.has(ch) || CLAUSE_MARKS.has(ch);
}

function proportionalCut(text: string, count: number, sources: string[]): string[] {
  const weights = Array.from({ length: count }, (_, index) => Math.max(1, sources[index]?.length ?? 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const parts: string[] = [];
  let cursor = 0;
  let accumulated = 0;
  for (let index = 0; index < count - 1; index += 1) {
    accumulated += weights[index];
    const target = Math.trunc((text.length * accumulated) / total);
    const minCut = cursor + 1;
    const maxCut = text.length - (count - 1 - index);
    // 优先在标点/空白处下刀：窗口放宽到整段的 1/(count*2)，避免切在「要点」这类词中间。
    const window = Math.max(4, Math.trunc(text.length / (count * 2)));
    let cut = Math.min(Math.max(target, minCut), maxCut);
    for (let offset = 0; offset <= window; offset += 1) {
      const left = target - offset;
      if (left >= minCut && left <= maxCut && isBreakFriendly(text[left - 1])) {
        cut = left;
        break;
      }
      const right = target + offset;
      if (right >= minCut && right <= maxCut && isBreakFriendly(text[right - 1])) {
        cut = right;
        break;
      }
    }
    parts.push(text.slice(cursor, cut).trim());
    cursor = cut;
  }
  parts.push(text.slice(cursor).trim());
  return parts;
}

/**
 * 把句子数不足的译文补到 count 段：每次挑最长的一句再拆成两段，
 * 优先按标点，其次按字符中点。这样每一行都还有译文，不会出现空行。
 */
function expandToCount(sentences: string[], count: number, sources: string[]): string[] {
  const parts = [...sentences].filter((part) => part.trim());
  let guard = 0;
  while (parts.length < count && guard < count * 2) {
    guard += 1;
    let longest = 0;
    for (let index = 1; index < parts.length; index += 1) {
      if (parts[index].length > parts[longest].length) longest = index;
    }
    const target = parts[longest];
    const pieces = splitAtPunctuation(target);
    if (pieces.length >= 2) {
      const half = Math.ceil(pieces.length / 2);
      parts.splice(longest, 1, pieces.slice(0, half).join(""), pieces.slice(half).join(""));
    } else if (target.length >= 4) {
      const mid = Math.trunc(target.length / 2);
      parts.splice(longest, 1, target.slice(0, mid).trim(), target.slice(mid).trim());
    } else {
      break;
    }
  }
  return parts.length === count ? parts : proportionalCut(sentences.join(""), count, sources);
}

function join(left: string, right: string): string {
  const leftCjk = left.length > 0 && isCjk(left[left.length - 1]);
  const rightCjk = right.length > 0 && isCjk(right[0]);
  return leftCjk && rightCjk ? left + right : `${left} ${right}`;
}

function mergeTiny(parts: string[]): string[] {
  const result: string[] = [];
  for (const part of parts) {
    const previous = result.length > 0 ? result[result.length - 1] : null;
    if (
      previous != null &&
      (units(part) < TINY_UNITS || units(previous) < TINY_UNITS) &&
      units(previous) + units(part) <= SPLIT_AT_UNITS
    ) {
      result[result.length - 1] = join(previous, part);
    } else {
      result.push(part);
    }
  }
  return result;
}

function mergeToLimit(parts: string[]): string[] {
  const result = parts.slice(0, MAX_PARTS);
  for (const extra of parts.slice(MAX_PARTS)) {
    result[result.length - 1] = join(result[result.length - 1], extra);
  }
  return result;
}

function splitLongPiece(piece: string): string[] {
  const byClause = splitAtClauseMarks(piece);
  const fragments = byClause.length > 1 ? byClause : splitAtBreakers(piece);
  const bounded: string[] = [];
  for (const fragment of fragments) {
    if (units(fragment) <= MAX_UNITS) bounded.push(fragment);
    else bounded.push(...splitAtWidth(fragment));
  }
  return mergeTiny(bounded);
}

/**
 * 把一段 final 拆成有序短句；本身已经够短时原样返回。
 * 输入为空白时返回空数组。
 */
export function splitClauses(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const pieces: string[] = [];
  for (const sentence of splitSentences(normalized)) {
    if (units(sentence) <= SPLIT_AT_UNITS) pieces.push(sentence);
    else pieces.push(...splitLongPiece(sentence));
  }
  const merged = mergeTiny(pieces.filter((piece) => piece.trim()));
  return merged.length <= MAX_PARTS ? merged : mergeToLimit(merged);
}

/**
 * 把一段译文拆成恰好 count 段，与源文的分句一一对应。
 * 先按句末标点切，再按从句标点切，最后按源句长度比例切。
 */
export function splitTranslation(text: string, count: number, sources: string[]): string[] {
  const normalized = text.trim();
  if (count <= 1) return [normalized];
  if (!normalized) return Array.from({ length: count }, () => "");
  const sentences = splitSentences(normalized).filter((sentence) => sentence.trim());
  if (sentences.length === count) return sentences;
  const clauses = splitAtPunctuation(normalized);
  if (clauses.length === count) return clauses;
  // 译文有句子结构但比源句少时，拆最长的句子补齐（标点优先），避免最后几行没有译文。
  // 完全没有标点（只有一句）时仍走按源句长度比例切，尊重原文的详略。
  if (sentences.length > 1 && sentences.length < count) {
    return expandToCount(sentences, count, sources);
  }
  return proportionalCut(normalized, count, sources);
}
