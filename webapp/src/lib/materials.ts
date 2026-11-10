// 讲义记录维护。
// 页面图片按账号授权：旧版本上传的讲义没有归属信息，重新打开预览会 404。
// 恢复方式只能是让用户重新选择当时的原文件——服务端按内容摘要重新登记归属。

import { zhixi } from "./api/client";
import type { DocumentAsset } from "./api/types";
import { db } from "./db/db";

/**
 * 重新解析原文件并更新既有讲义记录。
 * 必须 update 而不是 add：同一份讲义在列表里只应有一条，首次导入时间与同步 uid 都保留。
 */
export async function restoreMaterialDocument(
  materialId: number,
  file: File,
): Promise<DocumentAsset> {
  const original = await db.materials.get(materialId);
  if (!original) throw new Error("讲义记录已不存在，请刷新后重试。");
  if (!original.documentId || !/^[0-9a-f]{24}$/.test(original.documentId)) {
    throw new Error("讲义缺少原文件校验信息，请重新导入为新讲义，旧记录不会被替换。");
  }
  if (file.size === 0 || file.size > 50 * 1024 * 1024) {
    throw new Error("请选择非空且不超过 50MB 的原文件。");
  }
  // 与服务端 documentId 一致；先在本机校验，选错文件不上传、不消耗解析额度。
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const documentId = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
  if (documentId !== original.documentId) {
    throw new Error("所选文件与原文件不一致，请选择当时导入的同一文件；旧讲义未修改。");
  }
  const asset = await zhixi.analyzeDocument(file);
  if (asset.documentId !== documentId) throw new Error("云端返回的文档标识不一致，旧讲义未修改。");
  await db.transaction("rw", db.materials, async () => {
    const current = await db.materials.get(materialId);
    if (!current) throw new Error("讲义记录已不存在，请刷新后重试。");
    if (current.uid !== original.uid || current.documentId !== original.documentId) {
      throw new Error("讲义记录已变化，请刷新后重试。");
    }
    await db.materials.update(materialId, {
      mimeType: asset.mimeType,
      documentJson: JSON.stringify(asset),
      pageCount: asset.pages.length,
    });
  });
  return asset;
}
