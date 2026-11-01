import { describe, expect, it } from "vitest";
import { parseSegments } from "./transcribe-job";

describe("parseSegments", () => {
  it("解析标准 segments（秒级时间戳 → 毫秒）", () => {
    const segments = parseSegments({
      segments: [
        { text: "Hello world", start: 0.5, end: 1.8 },
        { text: "第二句", start: 2, end: 3.4 },
      ],
    });
    expect(segments).toEqual([
      { text: "Hello world", startMs: 500, endMs: 1800 },
      { text: "第二句", startMs: 2000, endMs: 3400 },
    ]);
  });

  it("接受毫秒级 startMs/endMs 与 paragraphs 嵌套", () => {
    const segments = parseSegments({
      paragraphs: [
        { text: "A", startMs: 1200, endMs: 2400 },
        { segments: [{ text: "B", start: 3 }] },
      ],
    });
    expect(segments).toEqual([
      { text: "A", startMs: 1200, endMs: 2400 },
      { text: "B", startMs: 3000, endMs: 3000 },
    ]);
  });

  it("跳过无文本条目与非法时间戳", () => {
    const segments = parseSegments({
      segments: [
        { text: "  ", start: 1 },
        { start: 2, end: 3 },
        { text: "ok", start: "bad" },
      ],
    });
    expect(segments).toEqual([{ text: "ok", startMs: 0, endMs: 0 }]);
  });

  it("非结构化负载返回空数组", () => {
    expect(parseSegments(null)).toEqual([]);
    expect(parseSegments("nonsense")).toEqual([]);
    expect(parseSegments({ segments: "nope" })).toEqual([]);
  });
});
