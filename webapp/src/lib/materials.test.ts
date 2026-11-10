// 历史讲义恢复：旧记录必须就地更新，不能新增第二条。
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fakeAnalyze } = vi.hoisted(() => ({ fakeAnalyze: vi.fn() }));

vi.mock("./api/client", () => ({ zhixi: { analyzeDocument: fakeAnalyze } }));

import { db } from "./db/db";
import { restoreMaterialDocument } from "./materials";

const ASSET = {
  documentId: "039058c6f2c0cb492c533b0a",
  mimeType: "application/pdf",
  pages: [{ pageIndex: 0, nativeText: "page one", imageRelativePath: "039058c6f2c0cb492c533b0a/pages/page-0000.jpg" }],
};

beforeEach(async () => {
  fakeAnalyze.mockReset();
  await db.materials.clear();
});

describe("restoreMaterialDocument", () => {
  it("就地更新既有讲义，不新增第二条，并保留首次导入时间", async () => {
    const originalId = await db.materials.add({
      uid: "material-uid",
      courseId: 7,
      title: "第 3 讲.pdf",
      mimeType: "application/pdf",
      documentId: ASSET.documentId,
      documentJson: JSON.stringify({ legacy: true }),
      pageCount: 2,
      importedAtMillis: 1_700_000_000_000,
    });
    fakeAnalyze.mockResolvedValue(ASSET);

    const file = new File([new Uint8Array([1, 2, 3])], "renamed.pdf", { type: "application/pdf" });
    const asset = await restoreMaterialDocument(originalId, file);

    expect(asset.documentId).toBe(ASSET.documentId);
    const rows = await db.materials.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: originalId,
      title: "第 3 讲.pdf",
      uid: "material-uid",
      courseId: 7,
      documentId: ASSET.documentId,
      pageCount: 1,
      importedAtMillis: 1_700_000_000_000,
    });
    expect(JSON.parse(rows[0]!.documentJson).documentId).toBe(ASSET.documentId);
  });

  it("选择不同原文件时在上传前拒绝，不破坏旧讲义和来源引用", async () => {
    const record = {
      uid: "original-uid", courseId: 7, title: "旧讲义.pdf", mimeType: "application/pdf",
      documentId: "ffffffffffffffffffffffff", documentJson: JSON.stringify({ legacy: true }),
      pageCount: 2, importedAtMillis: 1000,
    };
    const id = await db.materials.add(record);
    fakeAnalyze.mockResolvedValue(ASSET);
    const file = new File([new Uint8Array([1, 2, 3])], "别的讲义.pdf");
    await expect(restoreMaterialDocument(id, file)).rejects.toThrow("原文件不一致");
    expect(fakeAnalyze).not.toHaveBeenCalled();
    expect(await db.materials.get(id)).toEqual({ ...record, id });
  });

  it("上传期间记录被替换时不覆盖新记录", async () => {
    const id = await db.materials.add({
      uid: "before", courseId: 7, title: "旧讲义.pdf", mimeType: "application/pdf",
      documentId: ASSET.documentId, documentJson: "{}", pageCount: 1, importedAtMillis: 1000,
    });
    fakeAnalyze.mockImplementationOnce(async () => {
      await db.materials.update(id, { uid: "after", title: "新记录.pdf" });
      return ASSET;
    });
    const file = new File([new Uint8Array([1, 2, 3])], "lecture.pdf");
    await expect(restoreMaterialDocument(id, file)).rejects.toThrow("讲义记录已变化");
    expect(await db.materials.get(id)).toMatchObject({ uid: "after", title: "新记录.pdf", documentJson: "{}" });
  });

  it("云端返回不匹配的文档标识时保留旧记录", async () => {
    const id = await db.materials.add({
      uid: "original", courseId: 7, title: "讲义.pdf", mimeType: "application/pdf",
      documentId: ASSET.documentId, documentJson: "{}", pageCount: 1, importedAtMillis: 1000,
    });
    fakeAnalyze.mockResolvedValue({ ...ASSET, documentId: "ffffffffffffffffffffffff" });
    const file = new File([new Uint8Array([1, 2, 3])], "lecture.pdf");
    await expect(restoreMaterialDocument(id, file)).rejects.toThrow("文档标识不一致");
    expect(await db.materials.get(id)).toMatchObject({ documentJson: "{}", documentId: ASSET.documentId });
  });

  it("记录已被删除时明确报错，而不是静默丢一次解析额度", async () => {
    fakeAnalyze.mockResolvedValue(ASSET);
    const file = new File([new Uint8Array([1])], "lost.pdf", { type: "application/pdf" });

    await expect(restoreMaterialDocument(999, file)).rejects.toThrow("讲义记录已不存在");
    expect(await db.materials.count()).toBe(0);
    expect(fakeAnalyze).not.toHaveBeenCalled();
  });
});
