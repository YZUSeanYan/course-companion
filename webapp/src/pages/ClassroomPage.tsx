// 听课页：云端实时转写（含翻译）、暂停/继续、标记疑问与生成学习包入口。
// 本页依赖麦克风权限与前台标签页；浏览器不支持锁屏后台录音。

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type DoubtEventRecord, type TranscriptLineRecord, type TranslationRecord } from "../lib/db/db";
import { ClassroomController, type ClassroomSnapshot } from "../lib/classroom";
import { TranslationQueue, lineTranslationOf } from "../lib/translate-queue";
import { loadGatewayUrl } from "../lib/api/client";
import { generatePackForSession } from "../lib/generate";
import AccountCard from "../components/AccountCard";

const LANG_OPTIONS = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function ClassroomPage() {
  const navigate = useNavigate();
  const controller = useMemo(() => new ClassroomController(), []);
  const translationQueue = useMemo(() => new TranslationQueue("zh-CN"), []);
  const [snapshot, setSnapshot] = useState<ClassroomSnapshot>({
    phase: "idle",
    sessionId: null,
    partialText: "",
    elapsedSeconds: 0,
    usageSeconds: 0,
    statusMessage: null,
  });
  const [sourceLang, setSourceLang] = useState("en");
  const [courseId, setCourseId] = useState<string>("");
  const [doubtNote, setDoubtNote] = useState("");
  const [generateStatus, setGenerateStatus] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;
    controller.subscribe({
      onSnapshot: setSnapshot,
      onLineSaved: () => undefined,
    });
  }, [controller]);

  const courses = useLiveQuery(() => db.courses.toArray());
  const session = snapshot.sessionId != null ? snapshot.sessionId : null;
  const lines = useLiveQuery(
    () => (session == null ? Promise.resolve([] as TranscriptLineRecord[]) : db.transcriptLines.where("sessionId").equals(session).sortBy("timestampMillis")),
    [session],
  );
  const translations = useLiveQuery(
    () =>
      session == null
        ? Promise.resolve([] as TranslationRecord[])
        : db.translations.where("targetLang").equals("zh").toArray(),
    [session],
  );
  const doubts = useLiveQuery(
    () => (session == null ? Promise.resolve([] as DoubtEventRecord[]) : db.doubts.where("sessionId").equals(session).toArray()),
    [session],
  );

  const active = snapshot.phase === "listening" || snapshot.phase === "paused" || snapshot.phase === "connecting" || snapshot.phase === "stopping";
  const listening = snapshot.phase === "listening";

  useEffect(() => {
    if (listRef.current && lines && lines.length > 0) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [lines?.length]);

  const start = async () => {
    setGenerateStatus(null);
    if (!loadGatewayUrl()) {
      setGenerateStatus("请先在设置中配置网关地址");
      return;
    }
    try {
      await controller.start({
        courseId: courseId ? Number(courseId) : null,
        courseName: courses?.find((course) => String(course.id) === courseId)?.name ?? "",
        sourceLanguages: [sourceLang, sourceLang === "en" ? "zh" : "en"],
        translateDirection: sourceLang === "en" ? ["en", "zh"] : ["zh", "en"],
        speakerAttribution: false,
        glossaryTerms: [],
        liveMinutes: false,
      });
    } catch {
      // 错误已通过 snapshot.statusMessage 呈现。
    }
  };

  const stop = async () => {
    await controller.stop();
    if (snapshot.sessionId != null) {
      void translationQueue.enqueueSession(snapshot.sessionId);
    }
  };

  const markDoubt = async () => {
    try {
      await controller.markDoubt(doubtNote.trim());
      setDoubtNote("");
    } catch (error) {
      setGenerateStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const generatePack = async () => {
    if (snapshot.sessionId == null) return;
    setGenerateStatus("正在创建生成任务…");
    try {
      const outcome = await generatePackForSession({
        sessionId: snapshot.sessionId,
        onStatus: setGenerateStatus,
      });
      setGenerateStatus(`已生成 ${outcome.itemCount} 项学习内容、${outcome.cardCount} 张复习卡`);
    } catch (error) {
      setGenerateStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const lastSessionId = session;
  const openCourse = () => {
    if (lastSessionId == null) return;
    void db.sessions.get(lastSessionId).then((record) => {
      if (record?.courseId) navigate(`/learning/course/${record.courseId}`);
    });
  };

  return (
    <main>
      <h1 className="page-title">听课</h1>
      {!loadGatewayUrl() && (
        <div className="banner banner-warn">尚未配置网关地址，请先到「设置」填写 AI 服务地址。</div>
      )}
      {showSettings && !active ? (
        <div className="glass-card">
          <div className="card-title">课堂设置</div>
          <label className="field-label">讲师语言</label>
          <select className="text-input" value={sourceLang} onChange={(event) => setSourceLang(event.target.value)}>
            {LANG_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="field-label">关联课程（可选）</label>
          <select className="text-input" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            <option value="">不关联</option>
            {(courses ?? []).map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
          <div className="btn-row">
            <button className="btn" onClick={() => setShowSettings(false)}>
              完成
            </button>
          </div>
        </div>
      ) : (
        <div className="glass-card">
          <div className="card-title">
            <span className={`pill ${snapshot.phase === "paused" ? "pill-warn" : snapshot.phase === "listening" ? "pill-ok" : ""}`}>
              {phaseLabel(snapshot.phase)}
            </span>
            <span className="muted">云端听写 · 用量 {formatSeconds(snapshot.usageSeconds)}</span>
          </div>
          <div className="big-timer">{formatSeconds(snapshot.elapsedSeconds)}</div>
          <div className="dock">
            {!active && (
              <>
                <button className="btn btn-primary" onClick={() => void start()}>
                  开始听课
                </button>
                <button className="btn" onClick={() => setShowSettings(true)}>
                  课堂设置
                </button>
              </>
            )}
            {active && (
              <>
                {snapshot.phase === "paused" ? (
                  <button className="btn" onClick={() => void controller.resume()}>
                    继续
                  </button>
                ) : (
                  <button className="btn" onClick={() => void controller.pause()} disabled={snapshot.phase !== "listening"}>
                    暂停
                  </button>
                )}
                <button className="btn btn-danger" onClick={() => void stop()}>
                  停止
                </button>
              </>
            )}
          </div>
          {active && (
            <>
              <div className="transcript-partial">
                {snapshot.partialText || (listening ? "正在聆听…" : "已暂停")}
              </div>
              <div className="btn-row">
                <button className="btn" onClick={() => void markDoubt()}>
                  标记疑问
                </button>
              </div>
              <input
                className="text-input"
                style={{ marginTop: 8 }}
                placeholder="疑问备注（可留空，直接保存当前原话）"
                value={doubtNote}
                onChange={(event) => setDoubtNote(event.target.value)}
                maxLength={3000}
              />
            </>
          )}
          {snapshot.statusMessage && (
            <p className="muted" style={{ marginBottom: 0 }}>
              {snapshot.statusMessage}
            </p>
          )}
        </div>
      )}

      {snapshot.phase === "ended" && snapshot.sessionId != null && (
        <div className="glass-card">
          <div className="card-title">本节课回看</div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => void generatePack()}>
              生成 AI 学习包
            </button>
            <button className="btn" onClick={openCourse}>
              查看课程
            </button>
          </div>
          {generateStatus && <p className="muted" style={{ marginBottom: 0 }}>{generateStatus}</p>}
        </div>
      )}

      {session != null && lines && lines.length > 0 && (
        <div className="glass-card">
          <div className="card-title">
            实时转写（{lines.length} 行）
            {doubts && doubts.length > 0 && <span className="pill">疑问 {doubts.length}</span>}
          </div>
          <div ref={listRef} style={{ maxHeight: 320, overflowY: "auto" }}>
            {lines.map((line) => {
              const translation = lineTranslationOf(translations ?? [], line);
              return (
                <div className="transcript-line" key={line.id}>
                  <div className="zh">{line.text}</div>
                  {translation?.translatedText && <div className="en">译：{translation.translatedText}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!active && <AccountCard />}
    </main>
  );
}

function phaseLabel(phase: ClassroomSnapshot["phase"]): string {
  switch (phase) {
    case "idle":
      return "待开始";
    case "connecting":
      return "连接中";
    case "listening":
      return "听课中";
    case "paused":
      return "已暂停";
    case "stopping":
      return "结束中";
    case "ended":
      return "已结束";
  }
}
