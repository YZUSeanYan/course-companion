// 麦克风采集：优先 AudioWorklet 重采样为 16kHz 单声道 Int16 PCM；
// iOS 微信 WKWebView 上 blob URL 的 addModule 常失败，先走 data: URL，
// 再回退 blob，最后回退到 ScriptProcessor（需接到静音 destination 才会回调）。
// 分片按 0.1 秒（1600 样本 / 3200 字节）：与 App 的采集节奏一致，降低排队延时；
// 网关按 len(audio)/32000 计时，帧长不影响计费口径。

export const TARGET_SAMPLE_RATE = 16000;
export const FRAME_SAMPLES = 1600; // 0.1s

/**
 * 降采样器类的源码。两个坑都在这里：
 *
 * 1. 降采样必须按比率丢样本。早先的写法是「每个输入采样都输出一个」，48kHz 下等于
 *    每秒产出 48000 个样本却按 16kHz 打标——网关把它当 3 倍慢放的音频转给上游 ASR，
 *    识别结果为空，额度还按 3 倍掉。正确做法是累加器每越过一次 ratio 才输出一个样本。
 *
 * 2. 这段必须是纯字符串常量，不能写成 `${SomeClass.toString()}` 拼出来：生产构建会
 *    把类名压缩成 cS 之类，而字符串里手写的 `new PcmDownsampler(...)` 不会被重命名，
 *    运行期直接 ReferenceError，录音在线上完全失效（开发模式反而是好的）。
 *    代价是这份算术以文本形式存在，所以单测直接执行这串源码本身
 *    （见 pcm-resample.test.ts），测的就是线上跑的那份。
 *
 * 主线程 ScriptProcessor 回退路径通过 createPcmDownsampler() 执行同一段源码，
 * 避免两套实现逐渐分叉。iOS 微信里采样率经常是 48k 或 44.1k。
 */
export const DOWNSAMPLER_CLASS_SOURCE = `
class PcmDownsampler {
  constructor(inputRate, emit) {
    this.ratio = inputRate / TARGET_SAMPLE_RATE;
    this.emit = emit;
    this.frame = new Int16Array(FRAME_SAMPLES);
    this.acc = 0;
    this.prev = 0;
    this.started = false;
    this.fill = 0;
  }
  push(input) {
    const ratio = this.ratio;
    for (let i = 0; i < input.length; i++) {
      const sample = input[i];
      if (!this.started) {
        // 首样本只作插值基准，不产出，否则起点会被多算一个。
        this.prev = sample;
        this.started = true;
        continue;
      }
      this.acc += 1;
      while (this.acc >= ratio) {
        this.acc -= ratio;
        // 在 prev→sample 之间按剩余相位线性插值（ratio=1 时退化为 prev，差一拍可忽略）。
        const weight = this.acc / ratio;
        const value = this.prev + (sample - this.prev) * weight;
        const clamped = value < -1 ? -1 : value > 1 ? 1 : value;
        this.frame[this.fill++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        if (this.fill >= this.frame.length) {
          this.emit(this.frame.slice(0));
          this.fill = 0;
        }
      }
      this.prev = sample;
    }
  }
}
`;

export const WORKLET_SOURCE = `
const TARGET_SAMPLE_RATE = ${TARGET_SAMPLE_RATE};
const FRAME_SAMPLES = ${FRAME_SAMPLES};
${DOWNSAMPLER_CLASS_SOURCE}
class PcmResampleProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.paused = false;
    this.down = new PcmDownsampler(sampleRate, (frame) => this.port.postMessage(frame));
    this.port.onmessage = (event) => {
      if (event.data && typeof event.data.paused === "boolean") {
        this.paused = event.data.paused;
      }
    };
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || this.paused) return true;
    this.down.push(channel);
    return true;
  }
}
registerProcessor("pcm-resample", PcmResampleProcessor);
`;

export interface PcmCaptureHandle {
  stop(): Promise<void>;
  setPaused(paused: boolean): void;
  readonly paused: boolean;
  readonly backend: CaptureBackend;
}

export type CaptureBackend = "worklet" | "script";

export interface PcmCaptureOptions {
  onFrame(frame: Int16Array): void;
  onError(error: Error): void;
  /** 声明式镜像采集（可选），用于本地保存原始录音。 */
  recorder?: MediaRecorder | null;
  /** 由调用方在用户手势同步栈里创建并 resume，避免 iOS 微信在 await 之后无法解锁。 */
  audioContext?: AudioContext;
}

export function pcmWorkletDataUrl(source: string): string {
  return `data:application/javascript;charset=utf-8,${encodeURIComponent(source)}`;
}

/** 用与 worklet 完全相同的字符串构造降采样器（ScriptProcessor 回退路径）。 */
export function createPcmDownsampler(
  inputRate: number,
  emit: (frame: Int16Array) => void,
): { push(input: ArrayLike<number>): void } {
  const Downsampler = new Function(
    "TARGET_SAMPLE_RATE",
    "FRAME_SAMPLES",
    `${DOWNSAMPLER_CLASS_SOURCE}\nreturn PcmDownsampler;`,
  )(TARGET_SAMPLE_RATE, FRAME_SAMPLES) as new (
    inputRate: number,
    emit: (frame: Int16Array) => void,
  ) => { push(input: ArrayLike<number>): void };
  return new Downsampler(inputRate, emit);
}

export function audioContextConstructor(): (typeof AudioContext) | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

/** 必须在用户点击的同步调用栈里创建，这样 iOS / 微信才能 resume() 成功。 */
export function createClassroomAudioContext(): AudioContext {
  const Ctor = audioContextConstructor();
  if (!Ctor) {
    throw new Error("当前浏览器不支持音频处理。若在微信中打开，可点击右上角「…」选择在 Safari 中打开，或改用 App。");
  }
  const context = new Ctor();
  void context.resume();
  return context;
}

function attachAudioContextUnlock(context: AudioContext): () => void {
  const resume = () => {
    if (context.state === "closed") return;
    void context.resume();
  };
  const onVisible = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") resume();
  };
  const onStateChange = () => {
    if (context.state === "suspended" && (typeof document === "undefined" || document.visibilityState === "visible")) {
      resume();
    }
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisible);
    // 微信 JSBridge 就绪后再 resume 一次，覆盖内置浏览器晚初始化音频会话的情况。
    document.addEventListener("WeixinJSBridgeReady", resume);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);
  }
  context.addEventListener("statechange", onStateChange);
  return () => {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("WeixinJSBridgeReady", resume);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("focus", resume);
    }
    context.removeEventListener("statechange", onStateChange);
  };
}

async function addPcmWorkletModule(context: AudioContext, source: string): Promise<void> {
  // iOS WKWebView（含微信）上 blob: URL 的 audioWorklet.addModule 经常失败，
  // data: URL 是更稳妥的第一选择。
  try {
    await context.audioWorklet.addModule(pcmWorkletDataUrl(source));
    return;
  } catch {
    // fall through to blob URL
  }
  const workletUrl = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
  try {
    await context.audioWorklet.addModule(workletUrl);
  } finally {
    URL.revokeObjectURL(workletUrl);
  }
}

function startScriptProcessorCapture(
  context: AudioContext,
  source: MediaStreamAudioSourceNode,
  options: PcmCaptureOptions,
): { node: ScriptProcessorNode; mute: GainNode; setPaused: (paused: boolean) => void } {
  const createScriptProcessor = (
    context as AudioContext & {
      createScriptProcessor?: (bufferSize: number, inputChannels: number, outputChannels: number) => ScriptProcessorNode;
    }
  ).createScriptProcessor;
  if (typeof createScriptProcessor !== "function") {
    throw new Error("当前浏览器既不支持 AudioWorklet，也不支持 ScriptProcessor，无法采集麦克风。");
  }
  const node = createScriptProcessor.call(context, 4096, 1, 1);
  const down = createPcmDownsampler(context.sampleRate, (frame) => options.onFrame(frame));
  let paused = false;
  node.onaudioprocess = (event: AudioProcessingEvent) => {
    if (paused) return;
    down.push(event.inputBuffer.getChannelData(0));
  };
  // ScriptProcessor 必须接到 destination 才会回调；经增益 0 避免回声。
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(node);
  node.connect(mute);
  mute.connect(context.destination);
  return {
    node,
    mute,
    setPaused(next: boolean) {
      paused = next;
    },
  };
}

export async function startPcmCapture(
  stream: MediaStream,
  options: PcmCaptureOptions,
): Promise<PcmCaptureHandle> {
  const context = options.audioContext ?? createClassroomAudioContext();
  await context.resume();
  const detachUnlock = attachAudioContextUnlock(context);
  const source = context.createMediaStreamSource(stream);

  let backend: CaptureBackend = "script";
  let workletNode: AudioWorkletNode | null = null;
  let script: ReturnType<typeof startScriptProcessorCapture> | null = null;

  const canWorklet = typeof context.audioWorklet?.addModule === "function";
  if (canWorklet) {
    try {
      await addPcmWorkletModule(context, WORKLET_SOURCE);
      workletNode = new AudioWorkletNode(context, "pcm-resample");
      workletNode.port.onmessage = (event: MessageEvent<Int16Array>) => {
        options.onFrame(event.data);
      };
      workletNode.port.postMessage({ paused: false });
      source.connect(workletNode);
      backend = "worklet";
    } catch {
      backend = "script";
    }
  }

  if (backend === "script") {
    try {
      script = startScriptProcessorCapture(context, source, options);
    } catch (error) {
      detachUnlock();
      await context.close().catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  }

  let paused = false;
  return {
    backend,
    get paused() {
      return paused;
    },
    setPaused(next: boolean) {
      paused = next;
      if (workletNode) workletNode.port.postMessage({ paused: next });
      script?.setPaused(next);
    },
    async stop() {
      detachUnlock();
      try {
        workletNode?.disconnect();
        script?.node.disconnect();
        script?.mute.disconnect();
        source.disconnect();
      } finally {
        await context.close().catch(() => undefined);
      }
    },
  };
}

export function microphoneConstraintAttempts(): MediaStreamConstraints[] {
  return [
    {
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    },
    // iOS 微信有时会因过于具体的约束直接拒绝；降级为 audio: true。
    { audio: true },
  ];
}

export async function requestMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前浏览器不支持麦克风采集，请使用较新的 Chrome/Edge/Safari。若在微信中打开，可点击右上角「…」选择在 Safari 中打开。");
  }
  const attempts = microphoneConstraintAttempts();
  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? "未知错误");
  throw new Error(`无法使用麦克风：${detail}`);
}
