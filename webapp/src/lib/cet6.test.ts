import { describe, expect, it } from "vitest";
import { parseGlossaryCsv } from "./cet6";

describe("parseGlossaryCsv（对齐 Android GlossaryImporter）", () => {
  it("解析 CSV 与 TSV，支持表头跳过", () => {
    expect(parseGlossaryCsv("mitosis,有丝分裂\nmeiosis,减数分裂")).toEqual([
      { term: "mitosis", definition: "有丝分裂" },
      { term: "meiosis", definition: "减数分裂" },
    ]);
    expect(parseGlossaryCsv("term,definition\nmitosis,有丝分裂")).toEqual([
      { term: "mitosis", definition: "有丝分裂" },
    ]);
    expect(parseGlossaryCsv("单词\t释义\nlathe\t车床")).toEqual([{ term: "lathe", definition: "车床" }]);
  });

  it("小写去重、跳过空行与空释义、去包裹引号", () => {
    const entries = parseGlossaryCsv("Mitosis,有丝分裂\nmitosis,重复\n\nblank,\nquoted,\"定义\"");
    expect(entries).toEqual([
      { term: "Mitosis", definition: "有丝分裂" },
      { term: "quoted", definition: "定义" },
    ]);
  });

  it("释义中的逗号保留（limit 2 切分）", () => {
    expect(parseGlossaryCsv("word,a,b")).toEqual([{ term: "word", definition: "a,b" }]);
  });

  it("拒绝缺释义行、空表、超限", () => {
    expect(() => parseGlossaryCsv("only-term")).toThrow("缺少释义");
    expect(() => parseGlossaryCsv("\n\n  ")).toThrow("没有有效词条");
    expect(() => parseGlossaryCsv(`${"x".repeat(121)},定义`)).toThrow("内容过长");
    expect(() => parseGlossaryCsv("word,定义\nword2,定义")).not.toThrow();
  });
});
