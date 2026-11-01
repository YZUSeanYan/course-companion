// 讲义页 → 学习包分片的容错测试。
// 背景：线上讲义卡上出现过 "Cannot read properties of undefined (reading 'trim')"，
// 因为页面文本字段在不同来源下存在 pageText / nativeText / ocrText 三种形态，
// 扫描版 PDF 甚至完全没有文本。这组用例锁住「缺字段不崩、空页跳过」。

import { describe, expect, it } from "vitest";
import { materialChunks } from "./generate";

describe("materialChunks", () => {
  it("优先用 pageText", () => {
    expect(materialChunks([{ pageIndex: 0, pageText: "  hello  ", nativeText: "ignored" }])).toEqual([
      { sourceId: "page-1", text: "hello", page: 1 },
    ]);
  });

  it("pageText 缺失时回退到 nativeText / ocrText", () => {
    const chunks = materialChunks([
      { pageIndex: 1, nativeText: "native text" },
      { pageIndex: 2, ocrText: "ocr text" },
    ]);
    expect(chunks.map((c) => c.text)).toEqual(["native text", "ocr text"]);
  });

  it("pageText 为 null 或缺字段都不抛错", () => {
    expect(() => materialChunks([{ pageIndex: 0, pageText: null }, {}])).not.toThrow();
    expect(materialChunks([{ pageIndex: 0, pageText: null }, {}])).toEqual([]);
  });

  it("整个 pages 缺失时返回空数组", () => {
    expect(materialChunks(undefined)).toEqual([]);
    expect(materialChunks([])).toEqual([]);
  });

  it("纯空白页被跳过，sourceId 与 page 按原始页序保留", () => {
    const chunks = materialChunks([
      { pageIndex: 0, pageText: "" },
      { pageIndex: 1, pageText: "   " },
      { pageIndex: 2, pageText: "third page" },
      { pageIndex: 3, pageText: "fourth page" },
    ]);
    expect(chunks).toEqual([
      { sourceId: "page-3", text: "third page", page: 3 },
      { sourceId: "page-4", text: "fourth page", page: 4 },
    ]);
  });

  it("缺 pageIndex 时用数组下标兜底", () => {
    expect(materialChunks([{ pageText: "a" }, { pageText: "b" }])).toEqual([
      { sourceId: "page-1", text: "a", page: 1 },
      { sourceId: "page-2", text: "b", page: 2 },
    ]);
  });
});
