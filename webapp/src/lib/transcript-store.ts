// 课堂转写与译文的落库层：定稿拆句、按 segment 幂等更新、译文按句数拆开。
//
// 实时课堂里同一个 segment 的 final 可能重复到达（重连、上游重发），
// 所以按「同一会话 + 同一 segmentKey」原地更新，而不是无脑 add：
// 否则历史里会出现重复卡片，甚至旧片段残留。
// 这一步也是「只看到最新一句」类问题的兜底——每一条 final 都独立落库，
// 不存在后一条覆盖前一条的路径。

import { db, newUid, type TranscriptLineRecord, type TranslationRecord } from "./db/db";
import { MAX_PARTS, splitClauses, splitTranslation } from "./audio/clause-splitter";

export interface FinalTranscriptInput {
  sessionId: number;
  /** 已带流代号的段键（见 classroom-events.segmentKeyOf）。 */
  segmentKey: string;
  text: string;
  speaker?: string | null;
  startMs?: number | null;
  endMs?: number | null;
  language?: string | null;
  /** 同段多句共用的时间基准，默认取当前时间；单测可注入固定值。 */
  now?: number;
}

export interface SavedSegment {
  clauses: string[];
  lineIds: number[];
}

/** 归一化后的 segmentKey：单句直接用段键，多句加 `#n` 后缀。 */
function clauseKey(base: string, index: number, total: number): string {
  return total > 1 ? `${base}#${index}` : base;
}

/** 找出同一段已落库的旧行（含 `#n` 变体），按时间排序。
 *  用 (sessionId, segmentKey) 复合索引精确查有限个键，避免每条 final 全表扫描。 */
async function existingLines(sessionId: number, base: string): Promise<TranscriptLineRecord[]> {
  const keys: [number, string][] = [[sessionId, base]];
  for (let index = 0; index < MAX_PARTS; index += 1) {
    keys.push([sessionId, `${base}#${index}`]);
  }
  const rows = await db.transcriptLines.where("[sessionId+segmentKey]").anyOf(keys).toArray();
  return rows.sort((left, right) => left.timestampMillis - right.timestampMillis);
}

/**
 * 把一条定稿拆成字幕大小的短句并落库。
 *
 * - 短句数量与旧行一致时原地更新（保留行 id，已挂的译文不丢）；
 * - 旧行更多时删除多余行及其译文；
 * - 旧行更少时补新增行。
 */
export async function saveFinalTranscript(input: FinalTranscriptInput): Promise<SavedSegment> {
  const text = input.text.trim();
  if (!text) return { clauses: [], lineIds: [] };
  const clauses = splitClauses(text);
  if (clauses.length === 0) return { clauses: [], lineIds: [] };
  const now = input.now ?? Date.now();
  const prior = await existingLines(input.sessionId, input.segmentKey);
  const lineIds: number[] = [];

  await db.transaction("rw", db.transcriptLines, db.translations, async () => {
    for (const [index, clause] of clauses.entries()) {
      const previous = prior[index];
      const record: TranscriptLineRecord = {
        uid: previous?.uid ?? newUid(),
        sessionId: input.sessionId,
        // 同段多句共用起点时间，但 +index 保证稳定顺序（也避免批量写入时同毫秒乱序）。
        timestampMillis: now + index,
        text: clause,
        segmentKey: clauseKey(input.segmentKey, index, clauses.length),
        speaker: index === 0 ? input.speaker ?? null : null,
        startMs: input.startMs ?? null,
        endMs: input.endMs ?? null,
        language: input.language ?? null,
      };
      if (previous?.id != null) {
        await db.transcriptLines.update(previous.id, record);
        lineIds.push(previous.id);
      } else {
        lineIds.push(await db.transcriptLines.add(record));
      }
    }

    const dropped = prior.slice(clauses.length);
    if (dropped.length) {
      const droppedIds = dropped.map((row) => row.id).filter((id): id is number => id != null);
      if (droppedIds.length) {
        const staleTranslations = await db.translations
          .where("transcriptLineId")
          .anyOf(droppedIds)
          .toArray();
        if (staleTranslations.length) {
          await db.translations.bulkDelete(staleTranslations.map((row) => row.id!).filter(Boolean));
        }
        await db.transcriptLines.bulkDelete(droppedIds);
      }
    }
  });

  return { clauses, lineIds };
}

export interface SegmentTranslationInput {
  lineIds: number[];
  /** 与 lineIds 一一对应的源句，用于译文长度比例兜底。 */
  clauses: string[];
  text: string;
  targetLang: string;
}

/**
 * 保存一条 segment 译文，按源句数量拆开写进每一行。
 * 同一 (行, 目标语种) 已存在时覆盖——上游 AI 增强会二次下发同一 segment。
 */
export async function saveSegmentTranslation(input: SegmentTranslationInput): Promise<void> {
  const translated = input.text.trim();
  if (!translated || input.lineIds.length === 0) return;
  const targetLang = input.targetLang || "zh";
  const parts =
    input.lineIds.length === 1
      ? [translated]
      : splitTranslation(translated, input.lineIds.length, input.clauses);
  const now = Date.now();

  await db.transaction("rw", db.translations, async () => {
    for (const [index, lineId] of input.lineIds.entries()) {
      const part = (parts[index] ?? "").trim();
      if (!part) continue;
      const existing = await db.translations
        .where("[transcriptLineId+targetLang]")
        .equals([lineId, targetLang])
        .first();
      const record: TranslationRecord = {
        id: existing?.id,
        transcriptLineId: lineId,
        targetLang,
        sourceHash: existing?.sourceHash ?? "",
        translatedText: part,
        status: "done",
        updatedAtMillis: now,
      };
      if (existing) {
        await db.translations.update(existing.id!, record);
      } else {
        await db.translations.add(record);
      }
    }
  });
}
