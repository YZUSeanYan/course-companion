// 课堂小窗：桌面 Chromium 的 Document Picture-in-Picture 里渲染的紧凑课堂视图。
//
// 它与主页面共享同一个 JS 上下文和全局 ClassroomController，所以切到别的标签页、
// 最小化主窗口时计时、麦克风、转写与译文都继续；小窗本身始终置顶。
// 手机浏览器不支持 Document PiP，这里不会被挂载。

import { useLiveQuery } from "dexie-react-hooks";
import { db, type TranscriptLineRecord, type TranslationRecord } from "../../lib/db/db";
import { classroomSession } from "../../lib/classroom-session";
import { useClassroomSnapshot } from "../../hooks/useClassroomSnapshot";
import { pickLineTranslation } from "../../lib/translate-queue";
import { enqueueSessionTranslation } from "../../lib/translation-queue-registry";

interface ClassroomMiniProps {
  /** 小窗自己的 window，用于关闭（不能用全局 window，那会关掉主窗口）。 */
  pipWindow: Window;
  /** 聚焦主窗口并回到课堂页。 */
  onReturn: () => void;
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function phaseLabel(phase: string): string {
  switch (phase) {
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
    default:
      return "待开始";
  }
}

export default function ClassroomMini({ pipWindow, onReturn }: ClassroomMiniProps) {
  const snapshot = useClassroomSnapshot();
  const session = snapshot.sessionId;
  const lines = useLiveQuery(
    () =>
      session == null
        ? Promise.resolve([] as TranscriptLineRecord[])
        : db.transcriptLines.where("sessionId").equals(session).sortBy("timestampMillis"),
    [session],
  );
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

  const active =
    snapshot.phase === "listening" ||
    snapshot.phase === "paused" ||
    snapshot.phase === "connecting" ||
    snapshot.phase === "stopping";
  const listening = snapshot.phase === "listening";
  const visible = (lines ?? []).slice(-8);

  const stop = async () => {
    await classroomSession.stop();
    const finished = classroomSession.getSnapshot();
    if (finished.sessionId != null) {
      enqueueSessionTranslation(finished.sessionId, finished.sourceLanguage);
    }
  };

  return (
    <div className="pip">
      <header className="pip__head">
        <div className="pip__meta">
          <span className={`pill ${listening ? "pill-ok pill-dot" : ""} ${snapshot.phase === "paused" ? "pill-warn" : ""}`}>
            {phaseLabel(snapshot.phase)}
          </span>
          {active && <span className="muted">计费 {formatSeconds(snapshot.usageSeconds)}</span>}
        </div>
        <b className="pip__timer">{formatSeconds(snapshot.elapsedSeconds)}</b>
      </header>

      <div className="pip__body">
        {session == null && <p className="pip__empty">课堂还没有开始。回到主窗口点「开始听课」。</p>}
        {visible.map((line) => {
          const translation = pickLineTranslation(translations ?? [], line, snapshot.targetLanguage);
          return (
            <div className="pip__line" key={line.id}>
              <div className="pip__source">{line.text}</div>
              {translation?.translatedText && <div className="pip__translation">{translation.translatedText}</div>}
            </div>
          );
        })}
        {active && (
          <div className="pip__line pip__line--live">
            <div className="pip__source">
              {listening && (
                <span className="live-line__wave" aria-hidden>
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              )}
              <span>
                {snapshot.partialText ||
                  (listening
                    ? "正在聆听…"
                    : snapshot.phase === "connecting"
                      ? "正在连接音频服务器…"
                      : snapshot.phase === "stopping"
                        ? "正在结束课堂…"
                        : "已暂停")}
              </span>
            </div>
            {snapshot.partialTranslation && <div className="pip__translation">{snapshot.partialTranslation}</div>}
          </div>
        )}
        {!active && session != null && visible.length === 0 && <p className="pip__empty">本节课没有转写内容。</p>}
      </div>

      {snapshot.statusMessage && <p className="pip__status">{snapshot.statusMessage}</p>}

      <footer className="pip__foot">
        {active && (
          <>
            {snapshot.phase === "paused" ? (
              <button className="btn btn-primary" onClick={() => void classroomSession.resume()}>
                继续
              </button>
            ) : (
              <button className="btn" onClick={() => void classroomSession.pause()} disabled={snapshot.phase !== "listening"}>
                暂停
              </button>
            )}
            <button className="btn btn-danger" onClick={() => void stop()}>
              停止
            </button>
          </>
        )}
        <button className="btn" onClick={onReturn}>
          回到课堂
        </button>
        <button className="btn" onClick={() => pipWindow.close()}>
          关闭小窗
        </button>
      </footer>
      <p className="pip__hint">小窗置顶显示；关掉主标签页会同时结束课堂。锁屏或切换 App 仍可能被系统暂停。</p>
    </div>
  );
}
