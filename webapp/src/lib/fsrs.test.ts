import { describe, expect, it } from "vitest";
import { newCardSchedule, reviewCard, RATING_AGAIN, RATING_EASY } from "./fsrs/scheduler";
import type { ReviewCardRecord } from "./db/db";
import { State, type Grade } from "ts-fsrs";

function record(): ReviewCardRecord {
  const now = 1_700_000_000_000;
  return {
    id: 1,
    uid: "test-uid",
    learningItemId: 10,
    itemType: "VOCABULARY",
    courseId: 1,
    front: "mitosis",
    back: "有丝分裂",
    ...newCardSchedule(now),
    lastReviewedAtMillis: null,
    lastRating: null,
  };
}

describe("reviewCard", () => {
  it("新卡 GOOD 评分后进入调度并写日志", () => {
    const now = 1_700_000_000_000;
    const before = record();
    const outcome = reviewCard(before, 3, now);
    expect(outcome.card.reps).toBe(1);
    expect(outcome.card.lapses).toBe(0);
    expect(outcome.card.lastReviewedAtMillis).toBe(now);
    expect(outcome.card.lastRating).toBe(3);
    expect(outcome.card.dueAtMillis).toBeGreaterThan(now);
    expect(outcome.log).toMatchObject({
      rating: 3,
      reviewedAtMillis: now,
      previousDueAtMillis: before.dueAtMillis,
      nextDueAtMillis: outcome.card.dueAtMillis,
    });
  });

  it("AGAIN 增加遗忘次数并重置到期", () => {
    const now = 1_700_000_000_000;
    const before = record();
    before.cardState = State.Review as number;
    before.reps = 5;
    before.lapses = 1;
    before.stability = 10;
    before.difficulty = 5;
    before.dueAtMillis = now + 86_400_000;
    const outcome = reviewCard(before, RATING_AGAIN, now);
    expect(outcome.card.lapses).toBe(2);
    expect(outcome.card.reps).toBe(6);
    expect(outcome.card.dueAtMillis).toBeLessThan(now + 86_400_000);
  });

  it("EASY 提供更长的间隔", () => {
    const now = 1_700_000_000_000;
    const before = record();
    before.cardState = State.Review as number;
    before.stability = 5;
    before.difficulty = 5;
    const good = reviewCard(before, 3, now);
    const easy = reviewCard(before, RATING_EASY, now);
    expect(easy.card.dueAtMillis).toBeGreaterThanOrEqual(good.card.dueAtMillis);
  });

  it("拒绝未知评分", () => {
    expect(() => reviewCard(record(), 0 as unknown as Grade, 0)).toThrow();
    expect(() => reviewCard(record(), 5 as unknown as Grade, 0)).toThrow();
  });
});
