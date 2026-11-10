// 历史讲义恢复：旧记录必须就地更新，不能新增第二条。
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fakeAnalyze } = vi.hoisted(() => ({ fakeAnalyze: vi.fn() }));

vi.mock("./api/client", () => ({ zhixi: { analyzeDocument: fakeAnalyze } }));

import { db } from "./db/db";
import { restoreMaterialDocument } from "./materials";

const ASSET = {
  documentId: "0123456789abcdef01234567",
  mimeType: "application/pdf",
  pages: [{ pageIndex: 0, nativeText: "page one", imageRelativePath: "0123456789abcdef01234567/pages/page-0000.jpg" }],
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
      documentId: "ffffffffffffffffffffffff",
      documentJson: JSON.stringify({ legacy: true }),
      pageCount: 2,
      importedAtMillis: 1_700_000_000_000,
    });
    fakeAnalyze.mockResolvedValue(ASSET);

    const file = new File([new Uint8Array([1, 2, 3])], "第 3 讲.pdf", { type: "application/pdf" });
    const asset = await restoreMaterialDocument(originalId, file);

    expect(asset.documentId).toBe(ASSET.documentId);
    const rows = await db.materials.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: originalId,
      uid: "material-uid",
      courseId: 7,
      documentId: ASSET.documentId,
      pageCount: 1,
      importedAtMillis: 1_700_000_000_000,
    });
    expect(JSON.parse(rows[0]!.documentJson).documentId).toBe(ASSET.documentId);
  });

  it("记录已被删除时明确报错，而不是静默丢一次解析额度", async () => {
    fakeAnalyze.mockResolvedValue(ASSET);
    const file = new File([new Uint8Array([1])], "lost.pdf", { type: "application/pdf" });

    await expect(restoreMaterialDocument(999, file)).rejects.toThrow("讲义记录已不存在");
    expect(await db.materials.count()).toBe(0);
  });
});
