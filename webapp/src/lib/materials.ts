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
  const asset = await zhixi.analyzeDocument(file);
  const updated = await db.materials.update(materialId, {
    title: file.name,
    mimeType: asset.mimeType,
    documentId: asset.documentId,
    documentJson: JSON.stringify(asset),
    pageCount: asset.pages.length,
  });
  if (updated === 0) throw new Error("讲义记录已不存在，请刷新后重试。");
  return asset;
}
