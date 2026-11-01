// 复习队列快照的回归测试。
// 背景：评分会把本卡 dueAt 推到未来，若列表直接来自实时查询，评完一张后列表会立刻
// 少一张、而 index 同时 +1，叠加起来就跳过下一张（表现为「第 2/3 张」瞬间变「第 2/2 张」）。
// 这里用纯函数锁住「按快照顺序推进」的语义，不依赖 Dexie。

import { describe, expect, it } from "vitest";

/** 与 ReviewPage 内联的选取逻辑同构：按期到期时间升序，all 表示不限分类。 */
function pickDue(
  cards: Array<{ id: number; itemType: string; dueAtMillis: number }>,
  now: number,
  type: string,
): Array<{ id: number; itemType: string; dueAtMillis: number }> {
  const pool = cards.filter((card) => card.dueAtMillis <= now);
  const selected = type === "all" ? pool : pool.filter((card) => card.itemType === type);
  return selected.sort((a, b) => a.dueAtMillis - b.dueAtMillis);
}

/** 模拟评分：把该卡推到未来（FSRS 的最小效果）。 */
function rate(card: { id: number; itemType: string; dueAtMillis: number }, now: number) {
  return { ...card, dueAtMillis: now + 86_400_000 };
}

describe("复习队列", () => {
  const now = 1_000_000;
  const cards = [
    { id: 1, itemType: "VOCABULARY", dueAtMillis: now - 3000 },
    { id: 2, itemType: "VOCABULARY", dueAtMillis: now - 2000 },
    { id: 3, itemType: "PHRASE", dueAtMillis: now - 1000 },
  ];

  it("快照顺序按期到期时间升序，评完一张不会跳过下一张", () => {
    const snapshot = pickDue(cards, now, "all");
    expect(snapshot.map((c) => c.id)).toEqual([1, 2, 3]);

    // 评第 1 张后，实时列表只剩 [2,3]；若此刻用 index=1 去取实时列表，会得到 3（跳过 2）。
    const live = pickDue(cards.map((c) => (c.id === 1 ? rate(c, now) : c)), now, "all");
    expect(live.map((c) => c.id)).toEqual([2, 3]);
    expect(live[1].id).toBe(3); // 就是缺陷的表现

    // 快照方式下，index=1 仍指向第 2 张。
    expect(snapshot[1].id).toBe(2);
  });

  it("分类筛选只保留该类型", () => {
    expect(pickDue(cards, now, "VOCABULARY").map((c) => c.id)).toEqual([1, 2]);
    expect(pickDue(cards, now, "PHRASE").map((c) => c.id)).toEqual([3]);
  });

  it("未到期卡片不进入队列", () => {
    const future = [...cards, { id: 4, itemType: "VOCABULARY", dueAtMillis: now + 1000 }];
    expect(pickDue(future, now, "all").map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("队列走完时 index 等于总数（触发完成态）", () => {
    const snapshot = pickDue(cards, now, "all");
    let index = 0;
    for (const _ of snapshot) index += 1;
    expect(index).toBe(3);
    expect(snapshot[index]).toBeUndefined();
  });
});
