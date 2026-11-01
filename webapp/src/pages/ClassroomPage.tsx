// 听课页：云端实时转写（含翻译）、暂停/继续、标记疑问与生成学习包入口。
// 本页依赖麦克风权限与前台标签页；浏览器不支持锁屏后台录音。

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type ClassroomSessionRecord, type DoubtEventRecord, type TranscriptLineRecord, type TranslationRecord } from "../lib/db/db";
import { ClassroomController, type ClassroomSnapshot } from "../lib/classroom";
import { TranslationQueue, lineTranslationOf } from "../lib/translate-queue";
import { loadGatewayUrl } from "../lib/api/client";
import { retranscribeWav, type TranscriptSegment } from "../lib/audio/transcribe-job";
import { generatePackForSession } from "../lib/generate";
import AccountCard from "../components/AccountCard";

const LANG_OPTIONS = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

interface DigestSection {
  title: string;
  points: string[];
}

function parseDigestSections(digestJson: string): DigestSection[] {
  if (!digestJson.trim()) return [];
  try {
    const parsed = JSON.parse(digestJson) as { sections?: unknown };
    if (!Array.isArray(parsed.sections)) return [];
    return parsed.sections
      .filter((section): section is Record<string, unknown> => typeof section === "object" && section !== null)
      .map((section) => ({
        title: typeof section.title === "string" ? section.title : "",
        points: Array.isArray(section.points) ? section.points.filter((p): p is string => typeof p === "string") : [],
      }))
      .filter((section) => section.title || section.points.length);
  } catch {
    return [];
  }
}

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
  const [liveMinutes, setLiveMinutes] = useState(false);
  const [mode, setMode] = useState<"cloud" | "offline">("cloud");
  const [digestJson, setDigestJson] = useState("");
  const [retranscribing, setRetranscribing] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;
    controller.subscribe({
      onSnapshot: setSnapshot,
      onLineSaved: () => undefined,
      onDigest: setDigestJson,
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
    setDigestJson("");
    if (mode === "cloud" && !loadGatewayUrl()) {
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
        liveMinutes,
        mode,
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

  const retranscribe = async () => {
    if (snapshot.sessionId == null) return;
    const sessionRecord: ClassroomSessionRecord | undefined = await db.sessions.get(snapshot.sessionId);
    if (!sessionRecord?.audioBlob) {
      setGenerateStatus("本节课没有可用的本地录音存档，无法补转写。");
      return;
    }
    if ((lines ?? []).length > 0 && !window.confirm("补转写会替换现有转写内容并重新翻译，继续吗？")) {
      return;
    }
    setRetranscribing(true);
    setGenerateStatus("正在上传音频…");
    try {
      const outcome = await retranscribeWav(sessionRecord.audioBlob, {
        onStatus: setGenerateStatus,
      });
      if (!outcome.segments.length) {
        setGenerateStatus("云端没有返回可用的转写内容。");
        return;
      }
      const sessionId = snapshot.sessionId;
      const existingLineIds = (await db.transcriptLines.where("sessionId").equals(sessionId).toArray())
        .map((line) => line.id!)
        .filter(Boolean);
      await db.transaction("rw", db.transcriptLines, db.translations, db.doubts, async () => {
        if (existingLineIds.length) {
          await db.translations.bulkDelete(
            (await db.translations.toArray()).filter((t) => existingLineIds.includes(t.transcriptLineId)).map((t) => t.id!),
          );
          await db.transcriptLines.bulkDelete(existingLineIds);
        }
        const base = sessionRecord.startedAtMillis;
        await db.transcriptLines.bulkAdd(
          outcome.segments.map((segment: TranscriptSegment, index: number) => ({
            sessionId,
            timestampMillis: base + (segment.startMs || index * 1000),
            text: segment.text,
            segmentKey: `retranscribe-${index}`,
            speaker: null,
            startMs: segment.startMs || null,
            endMs: segment.endMs || null,
            language: null,
          })),
        );
      });
      setGenerateStatus(`补转写完成：${outcome.segments.length} 行，正在重新翻译…`);
      void translationQueue.enqueueSession(sessionId);
    } catch (error) {
      setGenerateStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setRetranscribing(false);
    }
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
          <label className="field-label">识别模式</label>
          <select className="text-input" value={mode} onChange={(event) => setMode(event.target.value as "cloud" | "offline")}>
            <option value="cloud">云端实时（转写+翻译+纪要，需额度）</option>
            <option value="offline">浏览器离线（无需额度，首次需下载模型约 200MB）</option>
          </select>
          <label className="field-label">实时纪要（AI 课堂小结，额外消耗云端音频时长）</label>
          <select
            className="text-input"
            value={liveMinutes ? "on" : "off"}
            onChange={(event) => setLiveMinutes(event.target.value === "on")}
            disabled={mode === "offline"}
          >
            <option value="off">关闭</option>
            <option value="on">开启</option>
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
            <button className="btn" onClick={() => void retranscribe()} disabled={retranscribing}>
              {retranscribing ? "补转写中…" : "云端补转写"}
            </button>
            <button className="btn" onClick={openCourse}>
              查看课程
            </button>
          </div>
          {generateStatus && <p className="muted" style={{ marginBottom: 0 }}>{generateStatus}</p>}
        </div>
      )}

      {parseDigestSections(digestJson).length > 0 && (
        <div className="glass-card">
          <div className="card-title">
            课堂纪要
            {snapshot.phase === "listening" && <span className="pill">实时</span>}
          </div>
          {parseDigestSections(digestJson).map((section, index) => (
            <div className="transcript-line" key={index}>
              {section.title && <div className="zh"><strong>{section.title}</strong></div>}
              {section.points.map((point, pointIndex) => (
                <div className="zh" key={pointIndex}>· {point}</div>
              ))}
            </div>
          ))}
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
