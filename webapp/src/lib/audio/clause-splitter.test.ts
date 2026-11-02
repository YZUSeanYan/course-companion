// 分句器的回归测试。
// 规则与 Android 端 TranscriptClauseSplitter.kt 一致：网页版与 App 必须给出同样的
// 分句节奏，否则同一节课在两端的卡片切分不同。

import { describe, expect, it } from "vitest";
import { splitClauses, splitTranslation } from "./clause-splitter";

describe("splitClauses", () => {
  it("短句原样返回", () => {
    expect(splitClauses("Thank you.")).toEqual(["Thank you."]);
    expect(splitClauses("谢谢。")).toEqual(["谢谢。"]);
  });

  it("空白输入返回空数组", () => {
    expect(splitClauses("   ")).toEqual([]);
    expect(splitClauses("")).toEqual([]);
  });

  it("按句末标点切分英文长段落", () => {
    const text =
      "How did he come, doctor? There you go. Those are three. Thank you. We also use it because it's closure for this one.";
    const parts = splitClauses(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));
  });

  it("按句末标点切分中文长段落", () => {
    const text = "这节课讲车床的基本结构。主轴箱传递动力。进给箱改变进给量。溜板箱带动刀架。";
    const parts = splitClauses(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join("")).toBe(text);
  });

  it("超长单句按从句标点切", () => {
    const text =
      "So the point of this exercise is that we need to keep the tool cool, and that means coolant flow has to be steady, because otherwise the insert will wear out much faster than expected.";
    const parts = splitClauses(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(text.length);
    }
  });

  it("小数与版本号里的点不当作句末", () => {
    const parts = splitClauses("The value is 3.14 and the version is v2.0.8 for this build of the app.");
    expect(parts.join(" ")).toContain("3.14");
    expect(parts.join(" ")).toContain("v2.0.8");
  });

  it("常见缩写不当作句末", () => {
    const parts = splitClauses("We asked Dr. Smith and Prof. Chen about the e.g. sample value.");
    expect(parts.join(" ")).toContain("Dr. Smith");
    expect(parts.join(" ")).toContain("Prof. Chen");
  });

  it("不丢内容：拼接后与原文一致（忽略空白差异）", () => {
    const samples = [
      "Hello there. This is a much longer sentence that keeps going and going, because the lecturer never paused at all during the whole explanation.",
      "这个车床的进给系统由进给箱、光杠、丝杠组成，它可以把主轴的旋转运动转换成刀架的直线进给运动，从而完成切削加工。",
      "A short one.",
    ];
    for (const sample of samples) {
      const parts = splitClauses(sample);
      const rejoined = parts.join(" ").replace(/\s+/g, " ").trim();
      const original = sample.replace(/\s+/g, " ").trim();
      // 中文拼接会多出空格，统一去掉再比
      expect(rejoined.replace(/\s+/g, "")).toBe(original.replace(/\s+/g, ""));
    }
  });

  it("极端输入不超过 8 段（保护阀，内容合并而非丢弃）", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i + 1} is here.`).join(" ");
    const parts = splitClauses(text);
    expect(parts.length).toBeLessThanOrEqual(8);
    expect(parts.join("").replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
  });

  it("碎片会并进相邻句，不会出现独立的一两个字", () => {
    // "Yes." 只有 2 个单位，下一句 10 个单位，合并后 12 ≤ 20，应该并成一句
    const parts = splitClauses("Yes. This is the main point.");
    expect(parts).toEqual(["Yes. This is the main point."]);
  });

  it("超长句被硬切后，碎片仍会与相邻片段合并到合理长度", () => {
    const text = "Yes. This is the main explanation of the lathe and its coolant flow system which matters a lot.";
    const parts = splitClauses(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].startsWith("Yes.")).toBe(true);
    expect(parts.join("").replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
  });
});

describe("splitTranslation", () => {
  const sources = ["How did he come, doctor?", "There you go.", "Those are three."];

  it("只有一段时原样返回", () => {
    expect(splitTranslation("他是怎么来的，医生？", 1, sources)).toEqual(["他是怎么来的，医生？"]);
  });

  it("句数一致时按句切", () => {
    expect(splitTranslation("他是怎么来的，医生？你懂了。那是三个。", 3, sources)).toEqual([
      "他是怎么来的，医生？",
      "你懂了。",
      "那是三个。",
    ]);
  });

  it("句数不一致时按标点切到相同段数", () => {
    const parts = splitTranslation("谢谢，我们也会用它，因为它是这个的闭合。", 3, sources);
    expect(parts).toHaveLength(3);
    expect(parts.join("")).toBe("谢谢，我们也会用它，因为它是这个的闭合。");
  });

  it("没有任何标点时按源句长度比例切，且不丢字", () => {
    const longSources = ["A much longer first clause here", "b", "c"];
    const text = "这是一段没有任何标点的译文需要按比例切开";
    const parts = splitTranslation(text, 3, longSources);
    expect(parts).toHaveLength(3);
    expect(parts.join("")).toBe(text);
    expect(parts[0].length).toBeGreaterThan(parts[1].length);
  });

  it("空译文返回对应数量的空串", () => {
    expect(splitTranslation("   ", 3, sources)).toEqual(["", "", ""]);
  });

  it("段数恒等于请求值", () => {
    for (const count of [2, 3, 5]) {
      expect(splitTranslation("一二三四五六七八九十", count, [])).toHaveLength(count);
    }
  });
});
