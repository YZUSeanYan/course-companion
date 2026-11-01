// FSRS 复习调度：包装 ts-fsrs，映射到本地 ReviewCardRecord。
// 与 Android 端 ReviewScheduler.kt 行为一致：官方 FSRS 参数、默认保留率、关闭 fuzz。

import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";
import type { ReviewCardRecord } from "../db/db";

export const RATING_AGAIN = 1;
export const RATING_HARD = 2;
export const RATING_GOOD = 3;
export const RATING_EASY = 4;
export type ReviewRating = 1 | 2 | 3 | 4;

const params = generatorParameters({ enable_fuzz: false });
const scheduler = fsrs(params);

export interface ReviewOutcome {
  card: Omit<ReviewCardRecord, "id" | "learningItemId" | "itemType" | "courseId" | "front" | "back">;
  log: {
    rating: number;
    reviewedAtMillis: number;
    previousDueAtMillis: number;
    nextDueAtMillis: number;
  };
}

function toTsFsrsCard(record: ReviewCardRecord, now: Date): Card {
  const state = (record.cardState >= 0 && record.cardState <= 3
    ? record.cardState
    : State.New) as State;
  const card = createEmptyCard(now);
  card.due = new Date(record.dueAtMillis);
  card.state = state;
  card.stability = record.stability > 0 ? record.stability : card.stability;
  card.difficulty = record.difficulty > 0 ? record.difficulty : card.difficulty;
  card.reps = record.reps;
  card.lapses = record.lapses;
  if (record.lastReviewedAtMillis != null) {
    card.last_review = new Date(record.lastReviewedAtMillis);
  }
  if (typeof (card as { learning_steps?: number }).learning_steps === "number") {
    (card as { learning_steps: number }).learning_steps = record.step ?? 0;
  }
  return card;
}

export function isDue(card: ReviewCardRecord, nowMillis: number): boolean {
  return card.dueAtMillis <= nowMillis;
}

export function reviewCard(record: ReviewCardRecord, rating: ReviewRating, nowMillis: number): ReviewOutcome {
  if (rating < RATING_AGAIN || rating > RATING_EASY) {
    throw new Error(`Unknown FSRS rating: ${rating}`);
  }
  const now = new Date(nowMillis);
  const result = scheduler.repeat(toTsFsrsCard(record, now), now)[rating as Grade];
  const updated = result.card;
  const stepField = (updated as { learning_steps?: number }).learning_steps;
  return {
    card: {
      dueAtMillis: updated.due.getTime(),
      cardState: updated.state as number,
      step: typeof stepField === "number" ? stepField : null,
      stability: updated.stability ?? 0,
      difficulty: updated.difficulty ?? 0,
      reps: record.reps + 1,
      lapses: record.lapses + (rating === RATING_AGAIN ? 1 : 0),
      lastReviewedAtMillis: nowMillis,
      lastRating: rating,
    },
    log: {
      rating,
      reviewedAtMillis: nowMillis,
      previousDueAtMillis: record.dueAtMillis,
      nextDueAtMillis: updated.due.getTime(),
    },
  };
}

/** 新卡片的初始调度状态：立即到期。 */
export function newCardSchedule(nowMillis: number): Omit<
  ReviewCardRecord,
  "id" | "learningItemId" | "itemType" | "courseId" | "front" | "back" | "lastReviewedAtMillis" | "lastRating"
> {
  const card = createEmptyCard(new Date(nowMillis));
  const stepField = (card as { learning_steps?: number }).learning_steps;
  return {
    dueAtMillis: card.due.getTime(),
    cardState: card.state as number,
    stability: card.stability ?? 0,
    difficulty: card.difficulty ?? 0,
    reps: 0,
    lapses: 0,
    step: typeof stepField === "number" ? stepField : null,
  };
}

export { Rating };
