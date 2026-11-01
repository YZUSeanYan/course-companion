// 课程详情页：分类学习内容、讲义导入、生成学习包、导出 Markdown。
// 分类口径与 Android LearningCategories.kt 一致：固定顺序、空分类不显示。

import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db/db";
import { groupLearningItems, LEARNING_CATEGORIES } from "../lib/pack";
import { generatePackForMaterial } from "../lib/generate";
import { exportCourseMarkdown } from "../lib/export";
import { zhixi } from "../lib/api/client";
import type { DocumentAsset } from "../lib/api/types";

export default function CourseDetailPage() {
  const { courseId } = useParams();
  const courseIdNumber = Number(courseId);
  const course = useLiveQuery(() => db.courses.get(courseIdNumber), [courseIdNumber]);
  const items = useLiveQuery(
    () => db.learningItems.where("courseId").equals(courseIdNumber).toArray(),
    [courseIdNumber],
    [],
  );
  const materials = useLiveQuery(
    () => db.materials.where("courseId").equals(courseIdNumber).sortBy("importedAtMillis"),
    [courseIdNumber],
    [],
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [openType, setOpenType] = useState<string | null>(null);

  if (!course) {
    return (
      <main>
        <Link className="backlink" to="/learning">← 返回学习</Link>
        <p className="muted">课程不存在。</p>
      </main>
    );
  }

  const groups = groupLearningItems(items ?? []);

  const uploadDocument = async (file: File) => {
    setUploading(true);
    setStatus(`正在上传并解析 ${file.name}…`);
    try {
      const asset: DocumentAsset = await zhixi.analyzeDocument(file);
      await db.materials.add({
        courseId: courseIdNumber,
        title: file.name,
        mimeType: asset.mimeType,
        documentId: asset.documentId,
        documentJson: JSON.stringify(asset),
        pageCount: asset.pages.length,
        importedAtMillis: Date.now(),
      });
      setStatus(`已导入 ${file.name}（${asset.pages.length} 页）`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  };

  const generateFromMaterial = async (materialId: number) => {
    setStatus("正在创建生成任务…");
    try {
      const outcome = await generatePackForMaterial({ materialId, onStatus: setStatus });
      setStatus(`已生成 ${outcome.itemCount} 项学习内容、${outcome.cardCount} 张复习卡`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <main>
      <Link className="backlink" to="/learning">← 返回学习</Link>
      <h1 className="page-title">{course.name}</h1>

      <div className="glass-card">
        <div className="card-title">
          讲义与学习包
          <button
            className="btn btn-sm btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "上传中…" : "导入讲义"}
          </button>
        </div>
        <p className="card-desc">支持 PDF / PNG / JPG（≤50MB）。复杂版式将由服务端视觉解析；生成学习包消耗当日文档解析与 AI 学习包额度。</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadDocument(file);
            event.target.value = "";
          }}
        />
        {(materials ?? []).map((material) => (
          <div className="list-item" key={material.id}>
            <div>
              <strong>{material.title}</strong>
              <div className="muted">{material.pageCount} 页 · {new Date(material.importedAtMillis).toLocaleString("zh-CN")}</div>
            </div>
            <button className="btn btn-sm" onClick={() => void generateFromMaterial(material.id!)} disabled={uploading}>
              生成学习包
            </button>
          </div>
        ))}
        {(materials ?? []).length === 0 && <p className="muted" style={{ marginBottom: 0 }}>还没有讲义。也可以在「听课」页生成课堂学习包。</p>}
        {status && <p className="muted" style={{ marginBottom: 0 }}>{status}</p>}
      </div>

      <div className="category-grid">
        {groups.map((group) => {
          const meta = LEARNING_CATEGORIES.find((category) => category.type === group.type);
          return (
            <div className="glass-card" key={group.type} style={{ marginBottom: 0 }}>
              <div className="card-title">
                {group.title}
                <span className="pill">{group.items.length}</span>
              </div>
              <p className="card-desc">{meta?.description ?? "其他学习内容"}</p>
              {openType === group.type ? (
                <>
                  {group.items.map((item) => (
                    <div className="transcript-line" key={item.id}>
                      <div className="zh"><strong>{item.title}</strong></div>
                      <div className="zh" style={{ whiteSpace: "pre-wrap" }}>{item.content}</div>
                      {item.translation && <div className="en">EN：{item.translation}</div>}
                      {item.example && <div className="en">例：{item.example}</div>}
                    </div>
                  ))}
                  <div className="btn-row">
                    <button className="btn btn-sm" onClick={() => setOpenType(null)}>收起</button>
                  </div>
                </>
              ) : (
                <>
                  {group.items.slice(0, 3).map((item) => (
                    <div className="transcript-line" key={item.id}>
                      <div className="zh">{item.title}</div>
                    </div>
                  ))}
                  <div className="btn-row">
                    <button className="btn btn-sm" onClick={() => setOpenType(group.type)}>
                      查看全部 {group.items.length} 项
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {groups.length === 0 && (
        <div className="glass-card">
          <p className="card-desc" style={{ marginBottom: 0 }}>
            还没有学习内容。导入讲义并生成学习包，或在「听课」页结束一节课后生成课堂学习包。
          </p>
        </div>
      )}

      <div className="btn-row">
        <button className="btn" onClick={() => void exportCourseMarkdown(course)}>
          导出课程 Markdown
        </button>
      </div>
    </main>
  );
}
