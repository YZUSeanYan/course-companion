// 听课台：云端实时转写（含翻译）、暂停/继续、标记疑问与生成学习包入口。
// 网页端形态：桌面为「主区（计时台 + 转写流）+ 侧栏（设置 / 纪要 / 回看 / 额度）」的工作台，
// 窄屏收成单列。
//
// 两处与旧版的关键差异：
// 1. 历史与实时行在同一张卡片里：定稿句子留在上方，最新半句固定在底部。
//    旧版把实时行放在计时卡、把历史放到下面另一张卡，手机上首屏只看得到当前一句，
//    看起来就像「只记录最新一句」。
// 2. 课堂控制器是模块级单例（lib/classroom-session.ts）：切到学习/设置页只卸载视图，
//    麦克风、WebSocket 和转写落库继续跑；外壳会显示「课堂进行中」入口。

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, newUid, type ClassroomSessionRecord, type DoubtEventRecord, type TranscriptLineRecord, type TranslationRecord } from "../lib/db/db";
import { loadSaveAudio, saveSaveAudio } from "../lib/classroom";
import { classroomSession } from "../lib/classroom-session";
import { useClassroomSnapshot } from "../hooks/useClassroomSnapshot";
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

const DISPLAY_MODES = [
  { value: "sentence", label: "整句阅读（推荐，译文随句到达）" },
  { value: "classic", label: "跟随语音（按停顿分段）" },
] as const;

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
  const snapshot = useClassroomSnapshot();
  // 补翻队列的目标语言跟着讲师语言走：英文课翻成中文，中文课翻成英文。
  const queueRef = useRef<TranslationQueue | null>(null);
  const queueFor = (sourceLanguage: string): TranslationQueue => {
    const target: "zh-CN" | "en-US" = sourceLanguage === "en" ? "zh-CN" : "en-US";
    if (!queueRef.current || queueRef.current.targetLang !== target) {
      queueRef.current = new TranslationQueue(target);
    }
    return queueRef.current;
  };
  // 切页回来时沿用本节已选的讲师语言；否则设置面板会显示成默认英文，和正在跑的课堂不一致。
  const [sourceLang, setSourceLang] = useState(() => classroomSession.getSnapshot().sourceLanguage || "en");
  const [displayMode, setDisplayMode] = useState<"sentence" | "classic">(
    () => classroomSession.getSnapshot().displayMode,
  );
  const [courseId, setCourseId] = useState<string>("");
  const [doubtNote, setDoubtNote] = useState("");
  const [generateStatus, setGenerateStatus] = useState<string | null>(null);
  const [needsActivation, setNeedsActivation] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [liveMinutes, setLiveMinutes] = useState(false);
  const [mode, setMode] = useState<"cloud" | "offline">("cloud");
  const [saveAudio, setSaveAudio] = useState(() => loadSaveAudio());
  const [retranscribing, setRetranscribing] = useState(false);
  const [sessionBase, setSessionBase] = useState<number | null>(null);
  // 长课时只渲染最近一段，避免几百行 DOM 拖慢输入；上翻后暂停自动吸底。
  const [followLive, setFollowLive] = useState(true);
  const [showAllLines, setShowAllLines] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const courses = useLiveQuery(() => db.courses.toArray());
  const session = snapshot.sessionId;
  const lines = useLiveQuery(
    () => (session == null ? Promise.resolve([] as TranscriptLineRecord[]) : db.transcriptLines.where("sessionId").equals(session).sortBy("timestampMillis")),
    [session],
  );
  // 只取本节这些行的译文，不要整表全量拉取：跨课堂累积后这块会随课时线性变大。
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
    if (!el || !followLive) return;
    el.scrollTop = el.scrollHeight;
  }, [lines?.length, snapshot.partialText, snapshot.partialTranslation, followLive]);

  // 用户往上翻就停跟随，回到底部附近再恢复，避免新句子把阅读位置顶走。
  const onTranscriptScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
    setFollowLive(atBottom);
  };

  const start = async () => {
    setGenerateStatus(null);
    // 会话级状态复位：上一节上翻过的转写或展开过的全量列表不应带到新课堂。
    setFollowLive(true);
    setShowAllLines(false);
    if (mode === "cloud" && !loadGatewayUrl()) {
      setGenerateStatus("请先在设置中配置网关地址");
      return;
    }
    try {
      await classroomSession.start({
        courseId: courseId ? Number(courseId) : null,
        courseName: courses?.find((course) => String(course.id) === courseId)?.name ?? "",
        sourceLanguages: [sourceLang, sourceLang === "en" ? "zh" : "en"],
        translateDirection: sourceLang === "en" ? ["en", "zh"] : ["zh", "en"],
        speakerAttribution: false,
        glossaryTerms: [],
        liveMinutes,
        mode,
        displayMode,
        saveAudio,
      });
    } catch {
      // 错误已通过 snapshot.statusMessage 呈现。
    }
  };

  const stop = async () => {
    await classroomSession.stop();
    const finished = classroomSession.getSnapshot();
    if (finished.sessionId != null) {
      void queueFor(finished.sourceLanguage).enqueueSession(finished.sessionId);
    }
  };

  // 统一错误出口：额度未激活时给出可点击的「去激活」入口。
  const reportError = (error: unknown) => {
    setGenerateStatus(describeError(error));
    setNeedsActivation(isActivationError(error));
  };

  const markDoubt = async () => {
    try {
      await classroomSession.markDoubt(doubtNote.trim());
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

  const openCourse = () => {
    if (session == null) return;
    void db.sessions.get(session).then((record) => {
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
      void queueFor(snapshot.sourceLanguage).enqueueSession(sessionId);
    } catch (error) {
      reportError(error);
    } finally {
      setRetranscribing(false);
    }
  };

  const digest = parseDigestSections(snapshot.digestJson);
  // 译文目标语言由控制器记录（切页回来也不会丢），与 translateDirection 一致。
  const sessionTargetLang = snapshot.targetLanguage;
  const hasLines = (lines?.length ?? 0) > 0;
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
        {/* ── 主区：计时 + 转写（历史与实时在同一张卡片里） ── */}
        <div className="cols__main">
          <section className="glass-card classroom-stage">
            <div className="stage__top">
              <div className="stage__meta">
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

              <div className="stage__timer">
                {formatSeconds(snapshot.elapsedSeconds)}
                <small>{active ? (listening ? "Recording" : "Paused") : "Ready"}</small>
              </div>

              <div className="stage__actions">
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
                      <button className="btn btn-primary btn-lg" onClick={() => void classroomSession.resume()}>
                        继续
                      </button>
                    ) : (
                      <button className="btn btn-lg" onClick={() => void classroomSession.pause()} disabled={snapshot.phase !== "listening"}>
                        暂停
                      </button>
                    )}
                    <button className="btn btn-lg btn-danger" onClick={() => void stop()}>
                      停止
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="stage__head">
              <div className="card-title" style={{ margin: 0 }}>
                实时课堂记录
                <span className="pill">{lines?.length ?? 0} 行</span>
              </div>
              <div className="card-title__actions">
                {truncated && (
                  <button
                    className="btn btn-sm"
                    style={{ height: 22, padding: "0 8px", fontSize: 11 }}
                    onClick={() => setShowAllLines(true)}
                  >
                    显示全部 {lines?.length ?? 0} 行
                  </button>
                )}
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

            <div className="transcript__body stage__body" ref={listRef} onScroll={onTranscriptScroll}>
              {!hasLines && !active && (
                <div className="stage__empty">
                  <p className="eyebrow">Live transcript</p>
                  <p className="empty-hint">
                    点「开始听课」并允许麦克风权限后，{sourceLang === "en" ? "英文" : "中文"}原声会被实时转写，逐句附上译文。
                    历史句子会一直留在上面，切到其他页面再回来也会继续记录。
                  </p>
                </div>
              )}

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

              {active && (
                <div className="transcript-line transcript-line--live" aria-live="polite">
                  <span className="ts">{formatSeconds(snapshot.elapsedSeconds)}</span>
                  <div>
                    <div className="zh">
                      {listening && (
                        <span className="live-line__wave" aria-hidden>
                          <i />
                          <i />
                          <i />
                          <i />
                          <i />
                        </span>
                      )}
                      <span>{snapshot.partialText || (listening ? "正在聆听…" : "已暂停，点「继续」恢复")}</span>
                    </div>
                    {snapshot.partialTranslation && (
                      <div className="en transcript-line__preview">{snapshot.partialTranslation}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {active && (
              <div className="btn-row stage__doubt">
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
            )}

            {snapshot.statusMessage && <p className="card-desc" style={{ marginTop: 10 }}>{snapshot.statusMessage}</p>}
          </section>
        </div>

        {/* ── 侧栏：回看 / 纪要 / 设置 / 额度 ── */}
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
            <label className="field-label">
              字幕模式{active ? " · 本次课堂按开始时的设置执行" : ""}
            </label>
            <select
              className="text-input"
              value={displayMode}
              disabled={active || mode === "offline"}
              onChange={(event) => setDisplayMode(event.target.value as "sentence" | "classic")}
            >
              {DISPLAY_MODES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
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

function phaseLabel(phase: "idle" | "connecting" | "listening" | "paused" | "stopping" | "ended"): string {
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
