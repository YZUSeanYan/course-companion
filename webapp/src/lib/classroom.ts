// 课堂听课控制器：协调麦克风采集、云端实时转写 WebSocket、本地落库、译文队列与实时纪要。
// 事件口径与 Android LecsyncRealtimeEngine 一致；浏览器离线识别（sherpa-onnx WASM）在 offline 引擎中单独实现。

import { db, newUid } from "./db/db";
import { zhixi, sleep } from "./api/client";
import { startPcmCapture, requestMicrophone, type PcmCaptureHandle } from "./audio/capture";
import { RealtimeSession, closeReason } from "./audio/realtime";
import { encodeWav } from "./audio/wav";
import { normalizeSegmentId, partialTextOf, partialTranslationOf, segmentKeyOf } from "./classroom-events";
import { saveFinalTranscript, saveSegmentTranslation } from "./transcript-store";
import { getOfflineEngine, type OfflineCallbacks, type OfflineSegment } from "./offline/engine";
import type { RealtimeConfig, RealtimeEvent } from "./api/types";

export type ClassroomPhase = "idle" | "connecting" | "listening" | "paused" | "stopping" | "ended";

export interface ClassroomSnapshot {
  phase: ClassroomPhase;
  sessionId: number | null;
  partialText: string;
  /** 未定稿片段的译文预览（服务端 translation.partial / transcript.partial.tailTranslation）。
   *  没有它时，用户要等整句定稿且翻译完成才看到译文，等待感明显强于 App。 */
  partialTranslation: string;
  elapsedSeconds: number;
  usageSeconds: number;
  statusMessage: string | null;
  /** 实时纪要原始 JSON。放进快照是为了切页回来后能恢复，而不是依赖页面本地 state。 */
  digestJson: string;
  /** 本节讲师语言与目标译文语言；切页回来后展示层还要用，不能留在页面 state 里。 */
  sourceLanguage: string;
  targetLanguage: string;
  /** 本节字幕模式；切页回来后设置面板要与正在跑的课堂一致。 */
  displayMode: "sentence" | "classic";
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
  /**
   * 字幕模式，与 App 的「整句阅读 / 跟随语音」一致。
   * sentence（默认）按标点/停顿成句，译文随句到达；classic 按端点检测分段。
   * 显式下发，避免上游默认值变化后网页端又退回高延时模式。
   */
  displayMode?: "sentence" | "classic";
  /**
   * 是否把本节 PCM 编码成 WAV 存进 IndexedDB（默认 false）。
   * 只有「云端补转写」需要它；关闭时结束不落音频，隐私页口径与此一致。
   */
  saveAudio?: boolean;
}

/** 「保存原始录音」开关的持久化键。默认关，与 Android 端一致。 */
const SAVE_AUDIO_KEY = "zhixi.web.saveAudio";

export function loadSaveAudio(): boolean {
  try {
    return window.localStorage.getItem(SAVE_AUDIO_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveSaveAudio(value: boolean): void {
  try {
    window.localStorage.setItem(SAVE_AUDIO_KEY, value ? "1" : "0");
  } catch {
    // 隐私模式下 localStorage 不可写：仅在本次会话内生效，不视为错误。
  }
}

function defaultConfig(options: ClassroomStartOptions): RealtimeConfig {
  const displayMode = options.displayMode ?? "sentence";
  return {
    transcribe: {
      languages: options.sourceLanguages,
      // sentence 模式忽略 segmentation（官方文档明确说明），只下发 displayMode；
      // classic 才用「均衡」分段节奏。与 Android CloudListeningConfig 同口径。
      displayMode,
      ...(displayMode === "classic" ? { segmentation: "balanced" as const } : {}),
      speakers: options.speakerAttribution,
    },
    translate: { languages: options.translateDirection },
    glossary: options.glossaryTerms.length ? { terms: options.glossaryTerms.slice(0, 50) } : undefined,
    digest: options.liveMinutes,
    store: false,
  };
}

/** 连接存活时长追踪起点（onOpen 时刷新），用于判断是否为短命异常连接。 */
export const SHORT_LIVED_MS = 30_000;
export const MAX_RECONNECT_ATTEMPTS = 3;

/** 云课堂断开后是否自动重连：非用户停止、非语义性拒绝（鉴权/额度/限流/时长）、未超次数即重试。 */
export function shouldReconnectAfterClose(input: {
  code: number;
  livedMs: number;
  userStopped: boolean;
  attempts: number;
  maxAttempts?: number;
}): boolean {
  if (input.userStopped) return false;
  // 4401 鉴权 / 4403 额度 / 4429 限流 / 4408 4 小时上限：重连也会被拒，直接结束并给指引。
  const fatal = new Set([4401, 4403, 4429, 4408]);
  if (fatal.has(input.code)) return false;
  // 正常关闭且课堂已持续较久：视为真实结束，不重连。
  if (input.code === 1000 && input.livedMs >= SHORT_LIVED_MS) return false;
  if (input.attempts >= (input.maxAttempts ?? MAX_RECONNECT_ATTEMPTS)) return false;
  return true;
}

export function reconnectDelayMs(attempt: number): number {
  return 1000 * 2 ** Math.max(0, attempt - 1);
}

export class ClassroomController {
  private snapshot: ClassroomSnapshot = {
    phase: "idle",
    sessionId: null,
    partialText: "",
    partialTranslation: "",
    elapsedSeconds: 0,
    usageSeconds: 0,
    statusMessage: null,
    digestJson: "",
    sourceLanguage: "en",
    targetLanguage: "zh",
    displayMode: "sentence",
  };

  private capture: PcmCaptureHandle | null = null;
  private stream: MediaStream | null = null;
  private pcmFrames: Int16Array[] = [];
  private realtime: RealtimeSession | null = null;
  /** 一个 segment 可能被拆成多行，所以保存有序的行 id 列表。键是「流代号:段号」。 */
  private segmentLines = new Map<string, number[]>();
  /** 与上面一一对应：每行的源句文本，拆分译文时按长度比例兜底。 */
  private segmentClauses = new Map<string, string[]>();
  /** 上游段号 → 交付它的流代号；重连后 translation.final 仍能找到旧段。 */
  private segmentStreams = new Map<string, string>();
  private pendingTranslations = new Map<string, RealtimeEvent>();
  /** 当前上游连接的流代号与自增序号（重连时 +1，防止段号复用串行）。 */
  private streamToken = "s0";
  private streamSeq = 0;
  /** 上游不给段号时按到达顺序补一个，避免整条定稿被丢弃。 */
  private anonSegmentSeq = 0;
  private usageSeconds = 0;
  private startedAt = 0;
  private accumulatedMs = 0;
  private pauseStartedAt: number | null = null;
  private ticker: number | null = null;
  /** 允许多个订阅者：课堂页与外壳的「进行中」入口同时在听。 */
  private listeners = new Set<ClassroomCallbacks>();
  private digestJson = "";
  private mode: "cloud" | "offline" = "cloud";
  /** 本节是否落音频存档（「保存原始录音」，默认关）。 */
  private saveAudio = false;
  private offlineCallbacks: OfflineCallbacks | null = null;
  private offlineSessionId: number | null = null;
  private cloudOptions: ClassroomStartOptions | null = null;
  private cloudSessionId: number | null = null;
  private cloudOpenedAt = 0;
  private reconnectAttempts = 0;
  private reconnectGeneration = 0;
  private fatalSessionError = false;
  /** 结束流程幂等：用户停止、session.ended 与连接关闭可能同时触发。 */
  private finishPromise: Promise<void> | null = null;

  /** 订阅快照更新；返回取消订阅函数。重复订阅/切页都不会重置控制器。 */
  subscribe(callbacks: ClassroomCallbacks): () => void {
    this.listeners.add(callbacks);
    callbacks.onSnapshot(this.snapshot);
    return () => {
      this.listeners.delete(callbacks);
    };
  }

  /** 供 React 外壳在首次渲染时取当前状态（切页回来不闪空态）。 */
  getSnapshot(): ClassroomSnapshot {
    return this.snapshot;
  }

  private emit(patch: Partial<ClassroomSnapshot> = {}): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener.onSnapshot(this.snapshot);
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
      partialTranslation: "",
      usageSeconds: 0,
      digestJson: "",
      // 新课还没建会话：先把上一节的 sessionId 清掉，否则切页回来会错误地展示旧课记录。
      sessionId: null,
      elapsedSeconds: 0,
      sourceLanguage: options.sourceLanguages[0] ?? "en",
      targetLanguage: options.translateDirection[1] ?? "zh",
      displayMode: options.displayMode ?? "sentence",
    });
    try {
      this.mode = options.mode;
      this.saveAudio = options.saveAudio ?? false;
      this.reconnectAttempts = 0;
      this.fatalSessionError = false;
      this.reconnectGeneration += 1;
      let token: string | null = null;
      if (options.mode === "cloud") {
        // 云端：先注册设备并确认账号可用；未激活/过期时网关会在 WS 握手阶段直接拒绝，
        // 提前检查可以给出可执行的引导，而不是让连接悄悄挂起。
        token = await zhixi.deviceToken();
        const account = await zhixi.accountStatus();
        if (!account.activated) {
          throw new Error("需要先激活试用额度：在「设置 → 试用额度」用手机号激活，即可开始云端听课。");
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
      this.segmentClauses.clear();
      this.segmentStreams.clear();
      this.pendingTranslations.clear();
      this.streamSeq = 0;
      this.streamToken = "s0";
      this.anonSegmentSeq = 0;
      this.finishPromise = null;
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
          // 只有开启「保存原始录音」才累积 PCM（约 115KB/s，长课几百 MB），
          // 否则默认路径完全用不上，只会白占内存。
          if (this.saveAudio) this.pcmFrames.push(frame);
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
    this.cloudOptions = options;
    this.cloudSessionId = sessionId;
    this.cloudOpenedAt = Date.now();
    // 每条上游连接一个流代号：重连后段号可能从头发，不能和上一轮的段键撞在一起。
    this.streamSeq += 1;
    this.streamToken = `s${this.streamSeq}`;
    this.realtime = new RealtimeSession(zhixi.realtimeUrl(), token, defaultConfig(options), {
      onEvent: (event) => {
        // 单个事件处理失败不能变成未捕获拒绝；给用户一个可读提示，录音继续。
        void this.handleEvent(sessionId, event).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.emit({ statusMessage: `转写保存失败：${message}` });
        });
      },
      onClose: (code, reason) => void this.handleClose(sessionId, code, reason),
      onError: (error) => this.emit({ statusMessage: error.message }),
      onOpen: () => {
        this.cloudOpenedAt = Date.now();
      },
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

  /** 离线定稿与云端 transcript.final 走同一落库口径（同样拆句、同样幂等）。 */
  private async persistOfflineFinal(sessionId: number | null, segment: OfflineSegment): Promise<void> {
    if (sessionId == null) return;
    // 离线引擎的段号只在本次引擎会话内有效，加固定前缀避免与云端段号串键。
    const segmentKey = segmentKeyOf("offline", normalizeSegmentId(segment.segmentId) || newUid());
    const saved = await saveFinalTranscript({
      sessionId,
      segmentKey,
      text: segment.text,
      startMs: segment.startMs,
      endMs: segment.endMs,
    });
    for (const lineId of saved.lineIds) this.notifyLineSaved(lineId);
  }

  private notifyLineSaved(lineId: number): void {
    for (const listener of this.listeners) listener.onLineSaved?.(lineId);
  }

  async pause(): Promise<void> {
    if (this.snapshot.phase !== "listening") return;
    // 先让上游把当前半句定稿（译文也一起出），再停麦克风；否则最后一句会卡在 partial。
    this.realtime?.finalize();
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
    this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // 用户主动停止：禁用自动重连
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
    // 瞬时断开自动重连（最多 3 次，指数退避）：非用户停止、非语义性拒绝。
    if (
      this.mode === "cloud" &&
      !this.fatalSessionError &&
      shouldReconnectAfterClose({
        code,
        livedMs: Date.now() - this.cloudOpenedAt,
        userStopped: false,
        attempts: this.reconnectAttempts,
      })
    ) {
      this.reconnectAttempts += 1;
      const delay = reconnectDelayMs(this.reconnectAttempts);
      const generation = this.reconnectGeneration;
      this.emit({
        phase: "listening",
        partialText: "",
        statusMessage: `连接中断，${Math.round(delay / 1000)} 秒后自动重连（${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}）…`,
      });
      await sleep(delay);
      if (
        this.snapshot.phase !== "listening" ||
        this.mode !== "cloud" ||
        generation !== this.reconnectGeneration
      ) {
        return; // 重连等待期间用户已停止或开启了新课。
      }
      try {
        const token = await zhixi.deviceToken();
        if (this.cloudSessionId != null && this.cloudOptions) {
          this.startCloud(this.cloudSessionId, this.cloudOptions, token);
          return;
        }
      } catch (error) {
        // 取 token 失败也走正常结束路径，把错误带给用户。
        this.emit({ statusMessage: error instanceof Error ? error.message : String(error) });
      }
    }
    const message = closeReason(code) ?? (reason || null);
    await this.finishSession();
    this.emit({ phase: "ended", statusMessage: message ?? this.snapshot.statusMessage ?? "课堂连接已结束" });
    void sessionId;
  }

  private async finishSession(sessionIdOverride?: number): Promise<void> {
    // 同一节课只收尾一次：用户点停止时上游也会回 session.ended，两个入口不能重复写库。
    if (this.finishPromise) return this.finishPromise;
    this.finishPromise = this.doFinishSession(sessionIdOverride ?? this.snapshot.sessionId);
    return this.finishPromise;
  }

  private async doFinishSession(sessionId: number | null): Promise<void> {
    if (this.ticker !== null) {
      window.clearInterval(this.ticker);
      this.ticker = null;
    }
    await this.capture?.stop().catch(() => undefined);
    // 只有用户显式开启「保存原始录音」才把 PCM 编码成 WAV 落库（用于云端补转写）。
    // 默认关闭：录音不进 IndexedDB，与隐私页口径一致，也避免整节课音频占满存储配额。
    let audioBlob: Blob | null = null;
    if (this.saveAudio) {
      try {
        audioBlob = this.pcmFrames.length ? encodeWav(this.pcmFrames) : null;
      } catch {
        audioBlob = null;
      }
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
    // 「正在结束…」「N 秒后自动重连…」是过程提示，不能固化成结束状态；真实错误才保留。
    const previous = this.snapshot.statusMessage;
    const transient = previous != null && (previous.startsWith("正在结束") || previous.includes("自动重连"));
    this.emit({
      phase: "ended",
      sessionId,
      elapsedSeconds: Math.floor(this.elapsedMs() / 1000),
      statusMessage: previous && !transient ? previous : "课堂已结束",
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
        // 重连成功：重置重连计数并清掉状态提示。
        this.reconnectAttempts = 0;
        this.cloudOpenedAt = Date.now();
        this.emit({ statusMessage: null });
        break;
      case "transcript.partial":
        // sentence 模式的 partial 是快照：原文可能只在 paragraphs/tail/pending 里，
        // 译文预览在 tailTranslation 或对齐段落里。统一交给解析层收敛。
        this.emit({
          partialText: partialTextOf(event),
          partialTranslation: partialTranslationOf(event),
        });
        break;
      case "transcript.final": {
        const text = (event.text ?? "").trim();
        const segmentId = normalizeSegmentId(event.segmentId);
        if (!text) return;
        // 段号缺失时造一个：宁可多一行，也不能把整条定稿丢掉。
        const resolved = segmentId || `anon-${++this.anonSegmentSeq}`;
        const token = this.streamToken;
        const key = segmentKeyOf(token, resolved);
        // 立即清掉实时预览（在 await 之前），否则下一句的 partial 先到、
        // 本条 final 落库后返回又会把新预览清空，表现为实时行闪断。
        this.emit({ partialText: "", partialTranslation: "" });
        this.segmentStreams.set(resolved, token);
        const saved = await saveFinalTranscript({
          sessionId,
          segmentKey: key,
          text,
          speaker: event.speaker ?? null,
          startMs: event.startMs ?? null,
          endMs: event.endMs ?? null,
          language: event.language ?? null,
        });
        this.segmentLines.set(key, saved.lineIds);
        this.segmentClauses.set(key, saved.clauses);
        for (const lineId of saved.lineIds) this.notifyLineSaved(lineId);
        const pending = this.pendingTranslations.get(key);
        if (pending) {
          this.pendingTranslations.delete(key);
          await this.saveTranslation(key, saved.lineIds, pending);
        }
        break;
      }
      case "translation.partial":
        // 流式译文：先把已确认的部分显示出来，不必等定稿译文。
        this.emit({ partialTranslation: event.text ?? "" });
        break;
      case "translation.final": {
        const segmentId = normalizeSegmentId(event.segmentId);
        if (!segmentId) return;
        // 优先用交付该段的流代号：重连后段号可能从头开始，不能直接拿当前流拼键。
        const token = this.segmentStreams.get(segmentId) ?? this.streamToken;
        const key = segmentKeyOf(token, segmentId);
        const lineIds = this.segmentLines.get(key);
        if (lineIds == null) {
          this.pendingTranslations.set(key, event);
        } else {
          await this.saveTranslation(key, lineIds, event);
        }
        // partialText 非空说明下一句已经在识别中，这份预览属于新句子，不能清掉。
        if (!this.snapshot.partialText) this.emit({ partialTranslation: "" });
        break;
      }
      case "usage.update":
        this.usageSeconds = event.effectiveSeconds ?? this.usageSeconds;
        break;
      case "digest.update": {
        // 实时纪要：保存最新事件（含 sections），结束后随会话落库。
        this.digestJson = JSON.stringify(event);
        this.emit({ digestJson: this.digestJson });
        for (const listener of this.listeners) listener.onDigest?.(this.digestJson);
        break;
      }
      case "session.ended":
        // 先把相位切到 stopping 再收尾：上游发完 ended 会立刻关闭 socket，
        // handleClose 若在收尾完成前看到「仍是 listening」，短课堂会被误判成断线并重连。
        this.emit({ phase: "stopping", statusMessage: "正在结束课堂…" });
        await this.finishSession(sessionId);
        break;
      case "session.error":
        // 不可重试的服务端错误（如额度耗尽）：记下并禁用自动重连，避免无效重试。
        if (event.retryable === false) {
          this.fatalSessionError = true;
          this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
        }
        this.emit({
          statusMessage: event.message ?? "云端课堂出现错误",
        });
        break;
      default:
        break;
    }
  }

  /**
   * 保存一个 segment 的译文。
   *
   * 源文被拆成多句后，译文也要按同样的句数拆开，否则会出现「三句源文 + 一整段译文」
   * 的错位：每张卡片都挂上同一段完整译文。拆分规则在 transcript-store 里。
   */
  private async saveTranslation(key: string, lineIds: number[], event: RealtimeEvent): Promise<void> {
    const clauses = this.segmentClauses.get(key) ?? [];
    await saveSegmentTranslation({
      lineIds,
      clauses,
      text: event.text ?? "",
      targetLang: event.targetLanguage ?? "zh",
    });
  }
}
