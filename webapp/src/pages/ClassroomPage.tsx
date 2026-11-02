// 听课台：云端实时转写（含翻译）、暂停/继续、标记疑问与生成学习包入口。
// 网页端形态：桌面为「主区（计时台 + 转写流）+ 侧栏（设置 / 纪要 / 回看 / 额度）」的工作台，
// 窄屏收成单列。转写流独立滚动并吸顶表头，长课时主区仍可停留在视野内。
// 依赖麦克风权限与前台标签页；浏览器不支持锁屏后台录音。

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, newUid, type ClassroomSessionRecord, type DoubtEventRecord, type TranscriptLineRecord, type TranslationRecord } from "../lib/db/db";
import { ClassroomController, loadSaveAudio, saveSaveAudio, type ClassroomSnapshot } from "../lib/classroom";
import { TranslationQueue, pickLineTranslation } from "../lib/translate-queue";
import { describeError, isActivationError, loadGatewayUrl } from "../lib/api/client";
import ActivationNotice from "../components/ActivationNotice";
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

/** 转写条目的时间标签：相对本节开始时刻。 */
function clockOf(timestampMillis: number, baseMillis: number | null): string {
  if (!baseMillis) return "";
  const delta = Math.max(0, Math.round((timestampMillis - baseMillis) / 1000));
  return formatSeconds(delta);
}

export default function ClassroomPage() {
  const navigate = useNavigate();
  const controller = useMemo(() => new ClassroomController(), []);
  // 补翻队列的目标语言跟着讲师语言走：英文课翻成中文，中文课翻成英文。
  // 早先写死 "zh-CN"，中文课结束后会把整节中文行再翻成中文（失败行还会被这样重试）。
  const queueRef = useRef<TranslationQueue | null>(null);
  const sessionSourceLangRef = useRef("en");
  const queueFor = (sourceLanguage: string): TranslationQueue => {
    const target: "zh-CN" | "en-US" = sourceLanguage === "en" ? "zh-CN" : "en-US";
    if (!queueRef.current || queueRef.current.targetLang !== target) {
      queueRef.current = new TranslationQueue(target);
    }
    return queueRef.current;
  };
  const [snapshot, setSnapshot] = useState<ClassroomSnapshot>({
    phase: "idle",
    sessionId: null,
    partialText: "",
    partialTranslation: "",
    elapsedSeconds: 0,
    usageSeconds: 0,
    statusMessage: null,
  });
  const [sourceLang, setSourceLang] = useState("en");
  const [courseId, setCourseId] = useState<string>("");
  const [doubtNote, setDoubtNote] = useState("");
  const [generateStatus, setGenerateStatus] = useState<string | null>(null);
  const [needsActivation, setNeedsActivation] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [liveMinutes, setLiveMinutes] = useState(false);
  const [mode, setMode] = useState<"cloud" | "offline">("cloud");
  const [saveAudio, setSaveAudio] = useState(() => loadSaveAudio());
  const [digestJson, setDigestJson] = useState("");
  const [retranscribing, setRetranscribing] = useState(false);
  const [sessionBase, setSessionBase] = useState<number | null>(null);
  // 长课时只渲染最近一段，避免几百行 DOM 拖慢输入；上翻后暂停自动吸底。
  const [followLive, setFollowLive] = useState(true);
  const [showAllLines, setShowAllLines] = useState(false);
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
  // 只取本节这些行的译文，不要整表全量拉取：跨课堂累积后这块会随课时线性变大。
  // 按 transcriptLineId 取（该字段有索引），语种代号在两条通道里不一致的问题留给展示层处理。
  const translations = useLiveQuery(
    async () => {
      if (session == null) return [] as TranslationRecord[];
      const ids = (await db.transcriptLines.where("sessionId").equals(session).toArray())
        .map((line) => line.id!)
        .filter(Boolean);
      if (ids.length === 0) return [] as TranslationRecord[];
      return db.translations.where("transcriptLineId").anyOf(ids).toArray();
    },
    [session],
  );
  const doubts = useLiveQuery(
    () => (session == null ? Promise.resolve([] as DoubtEventRecord[]) : db.doubts.where("sessionId").equals(session).toArray()),
    [session],
  );

  // 转写条目显示相对时间，需要本节开始时刻作为基准。
  useEffect(() => {
    if (session == null) {
      setSessionBase(null);
      return;
    }
    let cancelled = false;
    void db.sessions.get(session).then((record) => {
      if (!cancelled) setSessionBase(record?.startedAtMillis ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const active = snapshot.phase === "listening" || snapshot.phase === "paused" || snapshot.phase === "connecting" || snapshot.phase === "stopping";
  const listening = snapshot.phase === "listening";

  useEffect(() => {
    const el = listRef.current;
    if (!el || !followLive || !lines || lines.length === 0) return;
    el.scrollTop = el.scrollHeight;
  }, [lines?.length, followLive]);

  // 用户往上翻就停跟随，回到底部附近再恢复，避免新句子把阅读位置顶走。
  const onTranscriptScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
    setFollowLive(atBottom);
  };

  const start = async () => {
    setGenerateStatus(null);
    setDigestJson("");
    // 会话级状态复位：上一节上翻过的转写或展开过的全量列表不应带到新课堂。
    setFollowLive(true);
    setShowAllLines(false);
    if (mode === "cloud" && !loadGatewayUrl()) {
      setGenerateStatus("请先在设置中配置网关地址");
      return;
    }
    try {
      sessionSourceLangRef.current = sourceLang;
      await controller.start({
        courseId: courseId ? Number(courseId) : null,
        courseName: courses?.find((course) => String(course.id) === courseId)?.name ?? "",
        sourceLanguages: [sourceLang, sourceLang === "en" ? "zh" : "en"],
        translateDirection: sourceLang === "en" ? ["en", "zh"] : ["zh", "en"],
        speakerAttribution: false,
        glossaryTerms: [],
        liveMinutes,
        mode,
        saveAudio,
      });
    } catch {
      // 错误已通过 snapshot.statusMessage 呈现。
    }
  };

  const stop = async () => {
    await controller.stop();
    if (snapshot.sessionId != null) {
      void queueFor(sessionSourceLangRef.current).enqueueSession(snapshot.sessionId);
    }
  };

  // 统一错误出口：额度未激活时给出可点击的「去激活」入口。
  const reportError = (error: unknown) => {
    setGenerateStatus(describeError(error));
    setNeedsActivation(isActivationError(error));
  };

  const markDoubt = async () => {
    try {
      await controller.markDoubt(doubtNote.trim());
      setDoubtNote("");
    } catch (error) {
      reportError(error);
    }
  };

  const generatePack = async () => {
    if (snapshot.sessionId == null) return;
    setNeedsActivation(false);
    setGenerateStatus("正在创建生成任务…");
    try {
      const outcome = await generatePackForSession({
        sessionId: snapshot.sessionId,
        onStatus: setGenerateStatus,
      });
      setGenerateStatus(`已生成 ${outcome.itemCount} 项学习内容、${outcome.cardCount} 张复习卡`);
    } catch (error) {
      reportError(error);
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
            uid: newUid(),
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
      void queueFor(sessionSourceLangRef.current).enqueueSession(sessionId);
    } catch (error) {
      reportError(error);
    } finally {
      setRetranscribing(false);
    }
  };

  const digest = parseDigestSections(digestJson);
  // 译文目标语言：与 translateDirection 保持一致（英文课→中文，中文课→英文）。
  const sessionTargetLang = sessionSourceLangRef.current === "en" ? "zh" : "en";
  const hasTranscript = session != null && lines != null && lines.length > 0;
  // 默认只渲染最近 60 行（Android 端窗口是 30 行），需要时展开全部。
  const WINDOW = 60;
  const truncated = !showAllLines && (lines?.length ?? 0) > WINDOW;
  const visibleLines = truncated ? (lines ?? []).slice(-WINDOW) : lines ?? [];

  return (
    <>
      {!loadGatewayUrl() && (
        <div className="banner banner-warn">
          <span aria-hidden>●</span>
          <span>尚未配置网关地址。AI 与云端功能需要先到「设置」填写服务地址。</span>
        </div>
      )}

      <div className="cols cols--workbench">
        {/* ── 主区：计时台 + 转写流 ── */}
        <div className="cols__main">
          <section className="glass-card glass-card--hero">
            <div className="session">
              <div className="session__meta">
                <span
                  className={`pill ${snapshot.phase === "paused" ? "pill-warn" : ""} ${listening ? "pill-ok pill-dot" : ""} ${
                    snapshot.phase === "idle" || snapshot.phase === "ended" ? "pill-brand" : ""
                  }`}
                >
                  {phaseLabel(snapshot.phase)}
                </span>
                {snapshot.phase !== "idle" && (
                  <span className="muted">云端听写 · 计费用量 {formatSeconds(snapshot.usageSeconds)}</span>
                )}
                {mode === "offline" && <span className="pill">浏览器离线</span>}
                {liveMinutes && <span className="pill pill-brand">实时纪要</span>}
              </div>

              <div className="session__timer">
                {formatSeconds(snapshot.elapsedSeconds)}
                <small>{active ? (listening ? "Recording" : "Paused") : "Ready"}</small>
              </div>

              <div className="session__dock">
                {!active ? (
                  <>
                    <button className="btn btn-primary btn-lg" onClick={() => void start()}>
                      开始听课
                    </button>
                    <button className="btn btn-lg" onClick={() => setShowSettings(true)}>
                      课堂设置
                    </button>
                  </>
                ) : (
                  <>
                    {snapshot.phase === "paused" ? (
                      <button className="btn btn-primary btn-lg" onClick={() => void controller.resume()}>
                        继续
                      </button>
                    ) : (
                      <button className="btn btn-lg" onClick={() => void controller.pause()} disabled={snapshot.phase !== "listening"}>
                        暂停
                      </button>
                    )}
                    <button className="btn btn-lg btn-danger" onClick={() => void stop()}>
                      停止
                    </button>
                  </>
                )}
              </div>

              {active && (
                <>
                  <div className="live-line">
                    {listening && (
                      <span className="live-line__wave" aria-hidden>
                        <i />
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {snapshot.partialText || (listening ? "正在聆听…" : "已暂停，点「继续」恢复")}
                      {/* 未定稿片段的译文预览：先把已确认的译文显示出来，不必等整句定稿 */}
                      {snapshot.partialTranslation && (
                        <span className="live-line__translation">{snapshot.partialTranslation}</span>
                      )}
                    </span>
                  </div>
                  <div className="btn-row" style={{ alignItems: "center" }}>
                    <input
                      className="text-input"
                      style={{ flex: "1 1 240px", width: "auto" }}
                      placeholder="疑问备注（可留空，直接保存当前原话）"
                      value={doubtNote}
                      onChange={(event) => setDoubtNote(event.target.value)}
                      maxLength={3000}
                    />
                    <button className="btn" onClick={() => void markDoubt()}>
                      标记疑问
                    </button>
                  </div>
                </>
              )}

              {snapshot.statusMessage && <p className="card-desc" style={{ marginTop: 12 }}>{snapshot.statusMessage}</p>}
            </div>
          </section>

          {hasTranscript ? (
            <section className="glass-card transcript">
              <div className="transcript__head">
                <div className="card-title" style={{ margin: 0 }}>
                  实时转写
                  <span className="pill">{lines.length} 行</span>
                </div>
                <div className="card-title__actions">
                  {!followLive && (
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        setFollowLive(true);
                        const el = listRef.current;
                        if (el) el.scrollTop = el.scrollHeight;
                      }}
                    >
                      回到最新
                    </button>
                  )}
                  {doubts && doubts.length > 0 && <span className="pill pill-brand">疑问 {doubts.length}</span>}
                </div>
              </div>
              {truncated && (
                <p className="muted" style={{ margin: "0 0 6px" }}>
                  只显示最近 {WINDOW} 行 ·{" "}
                  <button
                    className="btn btn-sm"
                    style={{ height: 22, padding: "0 8px", fontSize: 11 }}
                    onClick={() => setShowAllLines(true)}
                  >
                    显示全部 {lines.length} 行
                  </button>
                </p>
              )}
              <div className="transcript__body" ref={listRef} onScroll={onTranscriptScroll} style={{ maxHeight: "min(58vh, 620px)" }}>
                {visibleLines.map((line) => {
                  // 目标语言随讲师语言变化（英文课→中文、中文课→英文），且两条通道的
                  // 语种代号不一致（"zh"/"zh-CN"），交给 pickLineTranslation 统一处理。
                  const translation = pickLineTranslation(translations ?? [], line, sessionTargetLang);
                  return (
                    <div className="transcript-line" key={line.id}>
                      <span className="ts">{clockOf(line.timestampMillis, sessionBase)}</span>
                      <div>
                        <div className="zh">{line.text}</div>
                        {translation?.translatedText && <div className="en">{translation.translatedText}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="glass-card">
              <p className="eyebrow">Live transcript</p>
              <h2 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700 }}>转写会出现在这里</h2>
              <p className="card-desc" style={{ maxWidth: "56ch" }}>
                点「开始听课」并允许麦克风权限后，{sourceLang === "en" ? "英文" : "中文"}原声会被实时转写，
                逐句附上译文。音频只在页面停留前台时采集，切换标签页或锁屏会暂停。
              </p>
              <div className="empty-hint">等待第一句话</div>
            </section>
          )}
        </div>

        {/* ── 侧栏：设置 / 纪要 / 回看 / 额度 ── */}
        <div className="cols__side cols__side--sticky">
          {snapshot.phase === "ended" && snapshot.sessionId != null && (
            <div className="glass-card">
              <div className="card-title">本节课回看</div>
              <p className="card-desc">把本节转写整理成结构化学习包，或重新跑一次云端转写。</p>
              <div className="btn-row" style={{ marginTop: 0 }}>
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
              {generateStatus && <ActivationNotice text={generateStatus} needsActivation={needsActivation} />}
            </div>
          )}

          {digest.length > 0 && (
            <div className="glass-card">
              <div className="card-title">
                课堂纪要
                {snapshot.phase === "listening" && <span className="pill pill-ok pill-dot">实时</span>}
              </div>
              {digest.map((section, index) => (
                <div className="digest-section" key={index}>
                  {section.title && <h3>{section.title}</h3>}
                  {section.points.length > 0 && (
                    <ul>
                      {section.points.map((point, pointIndex) => (
                        <li key={pointIndex}>{point}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className={`glass-card panel-settings${showSettings ? " is-open" : ""}`}>
            <div className="card-title">
              课堂设置
              <button className="btn btn-sm" onClick={() => setShowSettings(false)}>
                收起
              </button>
            </div>
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
              <option value="cloud">云端实时（转写 + 翻译 + 纪要，需额度）</option>
              <option value="offline">浏览器离线（无需额度，首次下载约 200MB）</option>
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
            <label className="field-label">
              保存原始录音（用于「云端补转写」，默认关{active ? " · 本次课堂按开始时的设置执行" : ""}）
            </label>
            <select
              className="text-input"
              value={saveAudio ? "on" : "off"}
              disabled={active}
              onChange={(event) => {
                const next = event.target.value === "on";
                setSaveAudio(next);
                saveSaveAudio(next);
              }}
            >
              <option value="off">不保存（只留文字转写）</option>
              <option value="on">保存整节 WAV 到本浏览器（占用较多存储）</option>
            </select>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={() => setShowSettings(false)}>
                完成
              </button>
            </div>
          </div>

          {!active && <AccountCard />}
        </div>
      </div>
    </>
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
