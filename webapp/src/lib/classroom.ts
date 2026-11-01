// 课堂听课控制器：协调麦克风采集、云端实时转写 WebSocket、本地落库、译文队列与实时纪要。
// 事件口径与 Android LecsyncRealtimeEngine 一致；浏览器离线识别（sherpa-onnx WASM）在 offline 引擎中单独实现。

import { db, newUid } from "./db/db";
import { zhixi } from "./api/client";
import { startPcmCapture, requestMicrophone, type PcmCaptureHandle } from "./audio/capture";
import { RealtimeSession, closeReason } from "./audio/realtime";
import { encodeWav } from "./audio/wav";
import { getOfflineEngine, type OfflineCallbacks, type OfflineSegment } from "./offline/engine";
import type { RealtimeConfig, RealtimeEvent } from "./api/types";
import type { TranslationRecord } from "./db/db";

export type ClassroomPhase = "idle" | "connecting" | "listening" | "paused" | "stopping" | "ended";

export interface ClassroomSnapshot {
  phase: ClassroomPhase;
  sessionId: number | null;
  partialText: string;
  elapsedSeconds: number;
  usageSeconds: number;
  statusMessage: string | null;
}

export interface ClassroomCallbacks {
  onSnapshot(snapshot: ClassroomSnapshot): void;
  /** 定稿新行落库后回调，供 UI 增量刷新。 */
  onLineSaved?(lineId: number): void;
  /** 实时纪要更新（digest.update 原始 JSON）。 */
  onDigest?(digestJson: string): void;
}

export interface ClassroomStartOptions {
  courseId: number | null;
  courseName: string;
  /** 源语言列表；目标语言=另一方向。 */
  sourceLanguages: string[];
  translateDirection: [string, string];
  speakerAttribution: boolean;
  glossaryTerms: string[];
  liveMinutes: boolean;
  /** 识别模式：云端实时（默认）或浏览器离线（sherpa-onnx WASM）。 */
  mode: "cloud" | "offline";
}

function defaultConfig(options: ClassroomStartOptions): RealtimeConfig {
  return {
    transcribe: {
      languages: options.sourceLanguages,
      segmentation: "balanced",
      speakers: options.speakerAttribution,
    },
    translate: { languages: options.translateDirection },
    glossary: options.glossaryTerms.length ? { terms: options.glossaryTerms.slice(0, 50) } : undefined,
    digest: options.liveMinutes,
    store: false,
  };
}

export class ClassroomController {
  private snapshot: ClassroomSnapshot = {
    phase: "idle",
    sessionId: null,
    partialText: "",
    elapsedSeconds: 0,
    usageSeconds: 0,
    statusMessage: null,
  };

  private capture: PcmCaptureHandle | null = null;
  private stream: MediaStream | null = null;
  private pcmFrames: Int16Array[] = [];
  private realtime: RealtimeSession | null = null;
  private segmentLines = new Map<string, number>();
  private pendingTranslations = new Map<string, RealtimeEvent>();
  private usageSeconds = 0;
  private startedAt = 0;
  private accumulatedMs = 0;
  private pauseStartedAt: number | null = null;
  private ticker: number | null = null;
  private callbacks: ClassroomCallbacks | null = null;
  private digestJson = "";
  private mode: "cloud" | "offline" = "cloud";
  private offlineCallbacks: OfflineCallbacks | null = null;
  private offlineSessionId: number | null = null;

  subscribe(callbacks: ClassroomCallbacks): ClassroomSnapshot {
    this.callbacks = callbacks;
    return this.snapshot;
  }

  private emit(patch: Partial<ClassroomSnapshot> = {}): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.callbacks?.onSnapshot(this.snapshot);
  }

  private elapsedMs(): number {
    if (this.pauseStartedAt !== null) return this.accumulatedMs;
    return this.accumulatedMs + (Date.now() - this.startedAt);
  }

  async start(options: ClassroomStartOptions): Promise<void> {
    if (this.snapshot.phase !== "idle" && this.snapshot.phase !== "ended") return;
    this.emit({
      phase: "connecting",
      statusMessage: options.mode === "offline" ? "正在准备离线识别引擎…" : "正在连接云端课堂…",
      partialText: "",
      usageSeconds: 0,
    });
    try {
      this.mode = options.mode;
      let token: string | null = null;
      if (options.mode === "cloud") {
        // 云端：先注册设备并确认账号可用；未激活/过期时网关会在 WS 握手阶段直接拒绝，
        // 提前检查可以给出可执行的引导，而不是让连接悄悄挂起。
        token = await zhixi.deviceToken();
        const account = await zhixi.accountStatus();
        if (!account.activated) {
          throw new Error("请先在设置中激活试用额度，再开始云端听课。");
        }
      }
      this.stream = await requestMicrophone();
      const sessionId = await db.sessions.add({
        uid: newUid(),
        startedAtMillis: Date.now(),
        endedAtMillis: null,
        title: options.courseName ? `${options.courseName} 课堂记录` : "课堂记录",
        audioBlob: null,
        audioMime: "",
        courseId: options.courseId,
        digestJson: "",
      });
      this.segmentLines.clear();
      this.pendingTranslations.clear();
      this.pcmFrames = [];
      this.digestJson = "";
      this.usageSeconds = 0;
      this.accumulatedMs = 0;
      this.pauseStartedAt = null;
      this.startedAt = Date.now();
      if (options.mode === "offline") {
        await this.startOffline(sessionId, options);
      } else {
        this.startCloud(sessionId, options, token!);
      }
      this.capture = await startPcmCapture(this.stream, {
        onFrame: (frame) => {
          // 原地累积 PCM 用于 WAV 存档（暂停时 worklet 不产帧，存档与转写时间轴一致）。
          this.pcmFrames.push(frame);
          if (this.realtime?.isActive) this.realtime.sendPcm(frame);
          if (this.mode === "offline" && this.offlineCallbacks) {
            getOfflineEngine().feed(frame, this.offlineCallbacks);
          }
        },
        onError: (error) => this.emit({ statusMessage: error.message }),
      });
      this.ticker = window.setInterval(() => {
        this.emit({
          elapsedSeconds: Math.floor(this.elapsedMs() / 1000),
          usageSeconds: Math.round(this.usageSeconds),
        });
      }, 500);
      this.emit({ phase: "listening", sessionId, statusMessage: null });
    } catch (error) {
      await this.releaseMedia();
      const message = error instanceof Error ? error.message : String(error);
      this.emit({ phase: "idle", statusMessage: message });
      throw error;
    }
  }

  private startCloud(sessionId: number, options: ClassroomStartOptions, token: string): void {
    this.realtime = new RealtimeSession(zhixi.realtimeUrl(), token, defaultConfig(options), {
      onEvent: (event) => void this.handleEvent(sessionId, event),
      onClose: (code, reason) => void this.handleClose(sessionId, code, reason),
      onError: (error) => this.emit({ statusMessage: error.message }),
    });
    this.realtime.connect();
  }

  private async startOffline(sessionId: number, _options: ClassroomStartOptions): Promise<void> {
    // 离线模式：无账号/额度要求；识别失败可随时在课堂设置切回云端。
    const engine = getOfflineEngine();
    if (!engine.isReady) {
      await engine.ensureReady((message) => this.emit({ statusMessage: message }));
    }
    engine.start();
    this.offlineSessionId = sessionId;
    this.offlineCallbacks = {
      onPartial: (text) => this.emit({ partialText: text }),
      onFinal: (segment) => void this.persistOfflineFinal(this.offlineSessionId, segment),
    };
  }

  /** 离线定稿与云端 transcript.final 走同一落库口径。 */
  private async persistOfflineFinal(sessionId: number | null, segment: OfflineSegment): Promise<void> {
    if (sessionId == null) return;
    const now = Date.now();
    const lineId = await db.transcriptLines.add({
      uid: newUid(),
      sessionId,
      timestampMillis: now,
      text: segment.text,
      segmentKey: segment.segmentId,
      speaker: null,
      startMs: segment.startMs,
      endMs: segment.endMs,
      language: null,
    });
    this.callbacks?.onLineSaved?.(lineId);
  }

  async pause(): Promise<void> {
    if (this.snapshot.phase !== "listening") return;
    this.capture?.setPaused(true);
    this.pauseStartedAt = Date.now();
    this.accumulatedMs += this.pauseStartedAt - this.startedAt;
    this.emit({ phase: "paused", statusMessage: "已暂停，麦克风保持静音" });
  }

  async resume(): Promise<void> {
    if (this.snapshot.phase !== "paused") return;
    this.capture?.setPaused(false);
    this.pauseStartedAt = null;
    this.startedAt = Date.now();
    this.emit({ phase: "listening", statusMessage: null });
  }

  /** 手动标记疑问：优先取当前 partial 文本，否则允许空备注（与 App 一致）。 */
  async markDoubt(note: string): Promise<void> {
    const sessionId = this.snapshot.sessionId;
    if (sessionId == null) throw new Error("尚未开始课堂");
    const sourceText = this.snapshot.partialText.trim();
    const now = Date.now();
    const doubtId = await db.doubts.add({
      uid: newUid(),
      sessionId,
      transcriptLineId: null,
      timestampMillis: now,
      sourceText,
      note,
      createdAtMillis: now,
    });
    this.emit({ partialText: "", statusMessage: sourceText ? "已标记疑问" : "已保存疑问（无备注）" });
    return void doubtId;
  }

  async stop(): Promise<void> {
    if (this.snapshot.phase === "idle" || this.snapshot.phase === "ended") return;
    this.emit({ phase: "stopping", statusMessage: "正在结束课堂…" });
    if (this.ticker !== null) {
      window.clearInterval(this.ticker);
      this.ticker = null;
    }
    try {
      await this.realtime?.stop();
    } catch {
      // ignore
    }
    if (this.mode === "offline" && this.offlineCallbacks) {
      // 结束离线识别：未触发端点的余句作为最后一行落库。
      const remaining = getOfflineEngine().stop(this.offlineCallbacks);
      if (remaining) await this.persistOfflineFinal(this.offlineSessionId, remaining);
      this.offlineCallbacks = null;
      this.offlineSessionId = null;
    }
    await this.finishSession();
  }

  private async handleClose(sessionId: number, code: number, reason: string): Promise<void> {
    if (this.snapshot.phase === "stopping" || this.snapshot.phase === "ended" || this.snapshot.phase === "idle") {
      return;
    }
    const message = closeReason(code) ?? (reason || null);
    await this.finishSession();
    this.emit({ phase: "ended", statusMessage: message ?? "课堂连接已结束" });
    void sessionId;
  }

  private async finishSession(): Promise<void> {
    const sessionId = this.snapshot.sessionId;
    await this.capture?.stop().catch(() => undefined);
    // 从累积的 PCM 编码 WAV 存档（网关音频接口支持 .wav；暂停期间无帧，时间轴一致）。
    let audioBlob: Blob | null = null;
    try {
      audioBlob = this.pcmFrames.length ? encodeWav(this.pcmFrames) : null;
    } catch {
      audioBlob = null;
    }
    await this.releaseMedia();
    if (sessionId != null) {
      await db.sessions.update(sessionId, {
        endedAtMillis: Date.now(),
        audioBlob,
        audioMime: audioBlob ? "audio/wav" : "",
        digestJson: this.digestJson,
      });
    }
    this.realtime = null;
    this.emit({
      phase: "ended",
      elapsedSeconds: Math.floor(this.elapsedMs() / 1000),
      statusMessage: this.snapshot.statusMessage ?? "课堂已结束",
    });
  }

  private async releaseMedia(): Promise<void> {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.capture = null;
  }

  private async handleEvent(sessionId: number, event: RealtimeEvent): Promise<void> {
    switch (event.type) {
      case "session.ready":
        this.emit({ statusMessage: null });
        break;
      case "transcript.partial":
        this.emit({ partialText: event.text ?? "" });
        break;
      case "transcript.final": {
        const text = (event.text ?? "").trim();
        const segment = event.segmentId;
        if (!text || !segment) return;
        const now = Date.now();
        const lineId = await db.transcriptLines.add({
          uid: newUid(),
          sessionId,
          timestampMillis: now,
          text,
          segmentKey: segment,
          speaker: event.speaker ?? null,
          startMs: event.startMs ?? null,
          endMs: event.endMs ?? null,
          language: event.language ?? null,
        });
        this.segmentLines.set(segment, lineId);
        const pending = this.pendingTranslations.get(segment);
        if (pending) {
          this.pendingTranslations.delete(segment);
          await this.saveTranslation(lineId, pending);
        }
        this.emit({ partialText: "" });
        this.callbacks?.onLineSaved?.(lineId);
        break;
      }
      case "translation.final": {
        const segment = event.segmentId;
        if (!segment) return;
        const lineId = this.segmentLines.get(segment);
        if (lineId == null) {
          this.pendingTranslations.set(segment, event);
        } else {
          await this.saveTranslation(lineId, event);
        }
        break;
      }
      case "usage.update":
        this.usageSeconds = event.effectiveSeconds ?? this.usageSeconds;
        break;
      case "digest.update": {
        // 实时纪要：保存最新事件（含 sections），结束后随会话落库。
        this.digestJson = JSON.stringify(event);
        this.callbacks?.onDigest?.(this.digestJson);
        break;
      }
      case "session.error":
        this.emit({
          statusMessage: event.message ?? "云端课堂出现错误",
        });
        break;
      default:
        break;
    }
  }

  private async saveTranslation(lineId: number, event: RealtimeEvent): Promise<void> {
    const translated = (event.text ?? "").trim();
    if (!translated) return;
    const existing = await db.translations
      .where("[transcriptLineId+targetLang]")
      .equals([lineId, event.targetLanguage ?? "zh"])
      .first();
    const record: TranslationRecord = {
      id: existing?.id,
      transcriptLineId: lineId,
      targetLang: event.targetLanguage ?? "zh",
      sourceHash: "",
      translatedText: translated,
      status: "done",
      updatedAtMillis: Date.now(),
    };
    if (existing) {
      await db.translations.update(existing.id!, record);
    } else {
      await db.translations.add(record);
    }
  }
}
