// 课程详情页：分类学习内容、讲义导入、CET6 词表导入、生成学习包、导出 Markdown。
// 分类口径与 Android LearningCategories.kt 一致：固定顺序、空分类不显示。
// 网页端形态：左主区是分类内容（可展开），右栏放讲义与导入动作——桌面上一屏内完成「看得见内容
// 也够得着操作」，不用在长列表和操作区之间来回滚动。

import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, newUid } from "../lib/db/db";
import { groupLearningItems, LEARNING_CATEGORIES } from "../lib/pack";
import { generatePackForMaterial } from "../lib/generate";
import { importCet6Csv } from "../lib/cet6";
import { exportCourseMarkdown } from "../lib/export";
import { describeError, isActivationError, zhixi } from "../lib/api/client";
import type { DocumentAsset } from "../lib/api/types";
import { restoreMaterialDocument } from "../lib/materials";
import ActivationNotice from "../components/ActivationNotice";

export default function CourseDetailPage() {
  const { courseId } = useParams();
  // 非法 id（如 /learning/course/abc）会得到 NaN，Dexie 的 IDBKeyRange.only(NaN) 直接抛
  // DataError，useLiveQuery 在渲染期抛出会把整棵树卸载成白屏。换成不可能命中的 -1，
  // 让下面的「课程不存在」兜底卡片接管。
  const parsed = Number(courseId);
  const courseIdNumber = Number.isFinite(parsed) ? parsed : -1;
  // 默认值给 null，用来区分「还在查」与「确实不存在」：不给默认值时两者都是 undefined，
  // 每次进页面都会先闪一下「课程不存在」再被真实内容顶掉。
  const course = useLiveQuery(() => db.courses.get(courseIdNumber), [courseIdNumber], null);
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
  const cet6InputRef = useRef<HTMLInputElement | null>(null);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const restoreTargetRef = useRef<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [needsActivation, setNeedsActivation] = useState(false);
  const [openType, setOpenType] = useState<string | null>(null);

  // 统一错误出口：额度未激活时给出可点击的「去激活」入口，而不是把服务端原文直接铺在页面上。
  const reportError = (error: unknown) => {
    setStatus(describeError(error));
    setNeedsActivation(isActivationError(error));
  };

  if (course === null) {
    return (
      <div className="glass-card">
        <p className="eyebrow">Loading</p>
        <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700 }}>正在读取课程…</h2>
        <p className="card-desc" style={{ marginBottom: 0 }}>
          课程内容保存在本浏览器，首次打开需要一点时间。
        </p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="glass-card">
        <p className="eyebrow">Not found</p>
        <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700 }}>课程不存在</h2>
        <p className="card-desc" style={{ marginBottom: 12 }}>
          可能已被删除，或链接来自另一台设备。
        </p>
        <Link className="btn btn-sm" to="/learning">
          返回课程列表
        </Link>
      </div>
    );
  }

  const groups = groupLearningItems(items ?? []);
  const totalItems = (items ?? []).length;

  const uploadDocument = async (file: File) => {
    setUploading(true);
    setStatus(`正在上传并解析 ${file.name}…`);
    try {
      const asset: DocumentAsset = await zhixi.analyzeDocument(file);
      await db.materials.add({
        uid: newUid(),
        courseId: courseIdNumber,
        title: file.name,
        mimeType: asset.mimeType,
        documentId: asset.documentId,
        documentJson: JSON.stringify(asset),
        pageCount: asset.pages.length,
        importedAtMillis: Date.now(),
      });
      setNeedsActivation(false);
      setStatus(`已导入 ${file.name}（${asset.pages.length} 页）`);
    } catch (error) {
      reportError(error);
    } finally {
      setUploading(false);
    }
  };

  const restoreDocument = async (materialId: number, file: File) => {
    setRestoringId(materialId);
    setStatus(`正在重新解析 ${file.name}…`);
    try {
      const asset = await restoreMaterialDocument(materialId, file);
      setNeedsActivation(false);
      setStatus(`已恢复 ${file.name}（${asset.pages.length} 页）的页面预览。`);
    } catch (error) {
      reportError(error);
    } finally {
      setRestoringId(null);
    }
  };

  const generateFromMaterial = async (materialId: number) => {
    setStatus("正在创建生成任务…");
    try {
      const outcome = await generatePackForMaterial({ materialId, onStatus: setStatus });
      setNeedsActivation(false);
      setStatus(`已生成 ${outcome.itemCount} 项学习内容、${outcome.cardCount} 张复习卡`);
    } catch (error) {
      reportError(error);
    }
  };

  const importCet6 = async (file: File) => {
    setStatus(`正在解析 ${file.name}…`);
    try {
      const text = await file.text();
      const count = await importCet6Csv(courseIdNumber, text);
      setNeedsActivation(false);
      setStatus(`已导入 ${count} 个 CET6 词条，重复词条已跳过`);
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            {course.examProfile === "CET6" ? "CET6" : course.examProfile === "GENERAL_EXAM" ? "General" : "Course"}
          </p>
          <h2>{course.name}</h2>
          <p>
            {[course.teacher, course.courseNature, course.language].filter(Boolean).join(" · ") || "课程信息待补充"}
            {totalItems > 0 ? ` · ${totalItems} 项学习内容` : ""}
          </p>
        </div>
        <div className="card-title__actions">
          <button className="btn" onClick={() => void exportCourseMarkdown(course)}>
            导出 Markdown
          </button>
        </div>
      </div>

      <div className="cols cols--workbench">
        {/* ── 主区：分类学习内容 ── */}
        <div className="cols__main">
          {groups.length > 0 ? (
            <div className="category-grid">
              {groups.map((group) => {
                const meta = LEARNING_CATEGORIES.find((category) => category.type === group.type);
                const open = openType === group.type;
                // 不超过 3 项时没有「收起」的意义，直接全部展开——否则纪要/疑问/释义这类
                // 每类只有 1–2 条的正文永远看不到（展开按钮原本只在超过 3 项时出现）。
                const showBody = open || group.items.length <= 3;
                const visible = open ? group.items : group.items.slice(0, 3);
                return (
                  <div className="glass-card" key={group.type}>
                    <div className="card-title">
                      {group.title}
                      <span className="pill">{group.items.length}</span>
                    </div>
                    <p className="card-desc">{meta?.description ?? "其他学习内容"}</p>
                    {visible.map((item) => (
                      <div className="transcript-line transcript-line--plain" key={item.id}>
                        <div className="zh">
                          <strong style={{ fontWeight: 650 }}>{item.title}</strong>
                          {showBody && item.content && <ItemBody text={item.content} />}
                          {showBody && item.translation && (
                            <div className="en">EN：{stripInlineMarkdown(item.translation)}</div>
                          )}
                          {showBody && item.example && (
                            <div className="en">例：{stripInlineMarkdown(item.example)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                    {group.items.length > 3 && (
                      <div className="btn-row">
                        <button className="btn btn-sm" onClick={() => setOpenType(open ? null : group.type)}>
                          {open ? "收起" : `查看全部 ${group.items.length} 项`}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="glass-card">
              <p className="eyebrow">Empty</p>
              <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700 }}>还没有学习内容</h2>
              <p className="card-desc" style={{ maxWidth: "56ch" }}>
                在右侧导入讲义并生成学习包，或在「听课」中结束一节课后生成课堂学习包。
                生成的内容会按「纪要 / 疑问 / 重点 / 词汇 / 短语 / 问答 / 练习」分类出现在这里。
              </p>
            </div>
          )}
        </div>

        {/* ── 侧栏：讲义与导入 ── */}
        <div className="cols__side cols__side--sticky">
          <div className="glass-card">
            <div className="card-title">
              讲义与学习包
              <span className="pill">{materials?.length ?? 0} 份</span>
            </div>
            <p className="card-desc">支持 PDF / PNG / JPG（≤50MB）。生成学习包消耗当日文档解析与 AI 学习包额度。</p>
            <p className="card-desc">
              旧版讲义的页面预览会提示无法访问：点「恢复预览」重新选择当时的原文件即可恢复，内容需与当初完全一致。
            </p>
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
            <input
              ref={cet6InputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importCet6(file);
                event.target.value = "";
              }}
            />
            <input
              ref={restoreInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                const target = restoreTargetRef.current;
                restoreTargetRef.current = null;
                event.target.value = "";
                if (file && target != null) void restoreDocument(target, file);
              }}
            />
            <div className="btn-row" style={{ marginTop: 0 }}>
              <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? "上传中…" : "导入讲义"}
              </button>
              {course.examProfile === "CET6" && (
                <button className="btn" onClick={() => cet6InputRef.current?.click()} disabled={uploading}>
                  导入 CET6 词表
                </button>
              )}
            </div>

            {(materials ?? []).length > 0 ? (
              <div style={{ marginTop: 14 }}>
                {(materials ?? []).map((material) => (
                  <div className="list-item" key={material.id}>
                    <div className="list-item__main">
                      <strong>{material.title}</strong>
                      <div className="muted">
                        {material.pageCount} 页 · {new Date(material.importedAtMillis).toLocaleString("zh-CN")}
                      </div>
                    </div>
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        restoreTargetRef.current = material.id!;
                        restoreInputRef.current?.click();
                      }}
                      disabled={uploading || restoringId !== null}
                      title="旧版讲义的页面预览会提示无法访问，重新选择当时的原文件即可恢复"
                    >
                      {restoringId === material.id ? "恢复中…" : "恢复预览"}
                    </button>
                    <button className="btn btn-sm" onClick={() => void generateFromMaterial(material.id!)} disabled={uploading}>
                      生成学习包
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
                还没有讲义。也可以在「听课」页生成课堂学习包。
              </p>
            )}
            {status && <ActivationNotice text={status} needsActivation={needsActivation} />}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * 去掉行内 Markdown 标记（加粗、行内代码）。
 * 服务端产出的释义与例句里偶尔带这些标记，当纯文本显示会把星号铺在页面上。
 */
function stripInlineMarkdown(value: string): string {
  return value.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

/**
 * 学习条目正文。
 * 旧 prompt 会给纪要小节加 `## 标题`，当纯文本显示会把井号原样铺在页面上。
 * 这里按行拆开：`#` 开头的行渲染成小标题，其余行作为段落。
 */
function ItemBody({ text }: { text: string }) {
  return (
    <div style={{ marginTop: 6, display: "grid", gap: 3 }}>
      {text.split("\n").map((raw, index) => {
        const trimmed = raw.trimStart();
        if (trimmed.startsWith("#")) {
          const title = stripInlineMarkdown(trimmed.replace(/^#+\s*/, "")).trim();
          if (title) {
            return (
              <div key={index} style={{ marginTop: 4, fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)" }}>
                {title}
              </div>
            );
          }
        }
        const line = stripInlineMarkdown(raw).trimEnd();
        if (!line.trim()) return <div key={index} aria-hidden style={{ height: 2 }} />;
        return (
          <div key={index} style={{ fontSize: 13.5, lineHeight: 1.7, color: "var(--ink-2)" }}>
            {line}
          </div>
        );
      })}
    </div>
  );
}
