// 实时事件解析回归。
// 重点锁住两类线上差异：
// 1) sentence 模式的 partial 可能只给 paragraphs/pending/tail，没有扁平 text；
// 2) segmentId 可能是数字 0，不能被 `if (!id)` 当成缺失。

import { describe, expect, it } from "vitest";
import {
  normalizeSegmentId,
  partialTextOf,
  partialTranslationOf,
  segmentKeyOf,
} from "./classroom-events";
import type { RealtimeEvent } from "./api/types";

describe("normalizeSegmentId", () => {
  it("保留字符串 id 并去掉首尾空白", () => {
    expect(normalizeSegmentId(" s1 ")).toBe("s1");
  });

  it("数字 0 是合法段号，不能当成缺失", () => {
    expect(normalizeSegmentId(0)).toBe("0");
    expect(normalizeSegmentId(12)).toBe("12");
  });

  it("缺失或非法值返回空串", () => {
    expect(normalizeSegmentId(undefined)).toBe("");
    expect(normalizeSegmentId(null)).toBe("");
    expect(normalizeSegmentId(Number.NaN)).toBe("");
    expect(normalizeSegmentId({})).toBe("");
  });
});

describe("partialTextOf", () => {
  it("优先使用句模式的 paragraphs + tail", () => {
    const event = {
      type: "transcript.partial",
      paragraphs: [{ pieces: [{ text: "The point of this", confirmed: true }] }],
      tail: "exercise is",
      text: "should not win",
    } as RealtimeEvent;
    expect(partialTextOf(event)).toBe("The point of this exercise is");
  });

  it("只有扁平 text 时直接使用", () => {
    expect(partialTextOf({ type: "transcript.partial", text: "hello" } as RealtimeEvent)).toBe("hello");
  });

  it("没有 text 时退回 pending", () => {
    const event = { type: "transcript.partial", pending: "正在识别" } as RealtimeEvent;
    expect(partialTextOf(event)).toBe("正在识别");
  });

  it("text 已包含 tail 时不重复拼接", () => {
    const event = { type: "transcript.partial", text: "the same tail", tail: "tail" } as RealtimeEvent;
    expect(partialTextOf(event)).toBe("the same tail");
  });

  it("中日韩片段之间不插空格，英文片段之间补空格", () => {
    const cjk = {
      type: "transcript.partial",
      paragraphs: [{ pieces: [{ text: "这个练习" }, { text: "的要点" }] }],
    } as RealtimeEvent;
    expect(partialTextOf(cjk)).toBe("这个练习的要点");
    const english = {
      type: "transcript.partial",
      paragraphs: [{ pieces: [{ text: "the point" }, { text: "of this" }] }],
    } as RealtimeEvent;
    expect(partialTextOf(english)).toBe("the point of this");
  });

  it("空事件返回空串", () => {
    expect(partialTextOf({ type: "transcript.partial" } as RealtimeEvent)).toBe("");
  });
});

describe("partialTranslationOf", () => {
  it("tailTranslation 最贴近当前半句", () => {
    const event = {
      type: "transcript.partial",
      tailTranslation: "这个练习",
      paragraphs: [{ pieces: [], translation: "旧段落译文" }],
    } as RealtimeEvent;
    expect(partialTranslationOf(event)).toBe("这个练习");
  });

  it("没有 tail 时取最后一个段落译文", () => {
    const event = {
      type: "transcript.partial",
      paragraphs: [
        { pieces: [{ text: "one" }], translation: "一" },
        { pieces: [{ text: "two" }], translation: "二" },
      ],
    } as RealtimeEvent;
    expect(partialTranslationOf(event)).toBe("二");
  });

  it("段落译文是对象时取 text 字段", () => {
    const event = {
      type: "transcript.partial",
      paragraphs: [{ translation: { text: "对象译文" } }],
    } as RealtimeEvent;
    expect(partialTranslationOf(event)).toBe("对象译文");
  });

  it("啥都没有时返回空串", () => {
    expect(partialTranslationOf({ type: "transcript.partial" } as RealtimeEvent)).toBe("");
  });
});

describe("segmentKeyOf", () => {
  it("流代号与段号拼成稳定键", () => {
    expect(segmentKeyOf("s2", "abc")).toBe("s2:abc");
    expect(segmentKeyOf("s2", "0")).toBe("s2:0");
  });
});
