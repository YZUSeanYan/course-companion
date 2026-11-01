// 学习页：课程列表 + 新建课程（名称/教师/性质/术语表）。

import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db/db";

export default function LearningPage() {
  const courses = useLiveQuery(() => db.courses.orderBy("createdAtMillis").reverse().toArray(), []);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [nature, setNature] = useState("");
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
      name: name.trim(),
      teacher: teacher.trim(),
      language: "中英双语",
      examProfile: "FOREIGN_CLASS",
      courseNature: nature.trim(),
      glossaryJson: glossary.length ? JSON.stringify(glossary) : "",
      createdAtMillis: Date.now(),
    });
    setName("");
    setTeacher("");
    setNature("");
    setGlossaryText("");
    setCreating(false);
    setError(null);
  };

  return (
    <main>
      <h1 className="page-title">学习</h1>
      <div className="glass-card">
        <div className="card-title">
          我的课程
          <button className="btn btn-sm btn-primary" onClick={() => setCreating((value) => !value)}>
            {creating ? "收起" : "新建课程"}
          </button>
        </div>
        {creating && (
          <>
            <label className="field-label">课程名称 *</label>
            <input className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：市场营销导论" />
            <label className="field-label">授课教师（可选）</label>
            <input className="text-input" value={teacher} onChange={(event) => setTeacher(event.target.value)} />
            <label className="field-label">课程性质（可选，进入生成请求）</label>
            <input className="text-input" value={nature} onChange={(event) => setNature(event.target.value)} placeholder="例如：公选课 / 专业课" />
            <label className="field-label">术语表（每行一条：术语：释义，可选）</label>
            <textarea className="textarea" value={glossaryText} onChange={(event) => setGlossaryText(event.target.value)} placeholder={"mitosis：有丝分裂"} />
            {error && <p className="banner banner-warn">{error}</p>}
            <div className="btn-row">
              <button className="btn btn-primary" onClick={() => void createCourse()}>
                创建课程
              </button>
            </div>
          </>
        )}
        {!creating && (courses ?? []).length === 0 && (
          <p className="card-desc" style={{ marginBottom: 0 }}>
            还没有课程。可以先新建课程，再到「听课」关联课堂，或直接上传讲义生成学习包。
          </p>
        )}
        {(courses ?? []).map((course) => (
          <div className="list-item" key={course.id}>
            <div>
              <strong>{course.name}</strong>
              {course.teacher && <span className="muted" style={{ marginLeft: 8 }}>{course.teacher}</span>}
              <div className="muted">{new Date(course.createdAtMillis).toLocaleDateString("zh-CN")}</div>
            </div>
            <Link className="btn btn-sm" to={`/learning/course/${course.id}`}>
              打开
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}
