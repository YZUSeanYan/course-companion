// 学习页：课程列表 + 新建课程（名称/教师/性质/术语表）。
// 网页端形态：课程是能以网格铺开的实体（桌面一屏可扫完），新建课程收进独立表单卡，
// 不再挤在同一个列表卡里。

import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, newUid } from "../lib/db/db";

const EXAM_PROFILES = [
  { value: "FOREIGN_CLASS", label: "外教课堂" },
  { value: "CET6", label: "六级备考（支持标准词表导入）" },
  { value: "GENERAL_EXAM", label: "通用备考" },
];

export default function LearningPage() {
  const courses = useLiveQuery(() => db.courses.orderBy("createdAtMillis").reverse().toArray(), []);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [nature, setNature] = useState("");
  const [examProfile, setExamProfile] = useState<"FOREIGN_CLASS" | "CET6" | "GENERAL_EXAM">("FOREIGN_CLASS");
  const [glossaryText, setGlossaryText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createCourse = async () => {
    if (!name.trim()) {
      setError("请填写课程名称");
      return;
    }
    const glossary = glossaryText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [term, definition] = line.split(/[：:]/, 2);
        return definition ? { term: term.trim(), definition: definition.trim() } : { term: term.trim() };
      });
    await db.courses.add({
      uid: newUid(),
      name: name.trim(),
      teacher: teacher.trim(),
      language: "中英双语",
      examProfile,
      courseNature: nature.trim(),
      glossaryJson: glossary.length ? JSON.stringify(glossary) : "",
      createdAtMillis: Date.now(),
    });
    setName("");
    setTeacher("");
    setNature("");
    setExamProfile("FOREIGN_CLASS");
    setGlossaryText("");
    setCreating(false);
    setError(null);
  };

  const list = courses ?? [];

  return (
    <div className="cols">
      <div className="cols__main">
        <div className="page-head">
          <div>
            <p className="eyebrow">Courses</p>
            <h2>{list.length > 0 ? `我的课程 · ${list.length}` : "我的课程"}</h2>
            <p>每门课程汇总课堂学习包、导入讲义与复习卡；点开课程可以导入讲义、按分类查看内容。</p>
          </div>
          <button className="btn btn-primary" onClick={() => setCreating((value) => !value)}>
            {creating ? "收起表单" : "新建课程"}
          </button>
        </div>

        {creating && (
          <div className="glass-card">
            <div className="card-title">新建课程</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0 14px" }}>
              <div>
                <label className="field-label">课程名称 *</label>
                <input className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：市场营销导论" />
              </div>
              <div>
                <label className="field-label">授课教师（可选）</label>
                <input className="text-input" value={teacher} onChange={(event) => setTeacher(event.target.value)} />
              </div>
              <div>
                <label className="field-label">课程性质（可选，进入生成请求）</label>
                <input className="text-input" value={nature} onChange={(event) => setNature(event.target.value)} placeholder="例如：公选课 / 专业课" />
              </div>
              <div>
                <label className="field-label">课程类型</label>
                <select className="text-input" value={examProfile} onChange={(event) => setExamProfile(event.target.value as typeof examProfile)}>
                  {EXAM_PROFILES.map((profile) => (
                    <option key={profile.value} value={profile.value}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="field-label">术语表（每行一条：术语：释义，可选）</label>
            <textarea className="textarea" value={glossaryText} onChange={(event) => setGlossaryText(event.target.value)} placeholder={"mitosis：有丝分裂"} />
            {error && <p className="banner banner-warn" style={{ marginTop: 12, marginBottom: 0 }}>{error}</p>}
            <div className="btn-row">
              <button className="btn btn-primary" onClick={() => void createCourse()}>
                创建课程
              </button>
              <button className="btn" onClick={() => setCreating(false)}>
                取消
              </button>
            </div>
          </div>
        )}

        {list.length === 0 && !creating && (
          <div className="glass-card">
            <p className="eyebrow">Empty</p>
            <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700 }}>还没有课程</h2>
            <p className="card-desc" style={{ maxWidth: "56ch" }}>
              先新建一门课程，再到「听课」把它关联到课堂；也可以直接上传讲义生成学习包，课程会自动出现。
            </p>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                新建第一门课程
              </button>
            </div>
          </div>
        )}

        {list.length > 0 && (
          <div className="course-grid">
            {list.map((course) => (
              <Link className="course-card" key={course.id} to={`/learning/course/${course.id}`}>
                <div className="course-card__top">
                  <h3>{course.name}</h3>
                  {course.examProfile === "CET6" && <span className="pill pill-brand">CET6</span>}
                </div>
                <div className="course-card__meta">
                  {course.teacher && <span>教师 · {course.teacher}</span>}
                  {course.courseNature && <span>{course.courseNature}</span>}
                  <span>{course.language}</span>
                </div>
                <div className="course-card__foot">
                  <span>{new Date(course.createdAtMillis).toLocaleDateString("zh-CN")} 创建</span>
                  <span>打开 →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
