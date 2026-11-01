// 麦克风采集：AudioWorklet 重采样为 16kHz 单声道 Int16 PCM。
// 实时课堂 WebSocket 的音频分片按 0.2 秒（3200 样本 / 6400 字节）成帧，
// 与网关 sent_seconds = bytes/32000 的口径一致（网关按 len(audio)/32000 计费并转给上游）。

export const TARGET_SAMPLE_RATE = 16000;
export const FRAME_SAMPLES = 3200; // 0.2s

/**
 * worklet 模块源码。两个坑都在这里：
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
 */
export const WORKLET_SOURCE = `
const TARGET_SAMPLE_RATE = ${TARGET_SAMPLE_RATE};
const FRAME_SAMPLES = ${FRAME_SAMPLES};
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
}

export interface PcmCaptureOptions {
  onFrame(frame: Int16Array): void;
  onError(error: Error): void;
  /** 声明式镜像采集（可选），用于本地保存原始录音。 */
  recorder?: MediaRecorder | null;
}

export async function startPcmCapture(
  stream: MediaStream,
  options: PcmCaptureOptions,
): Promise<PcmCaptureHandle> {
  const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new AudioContextCtor();
  await context.resume();
  const workletUrl = URL.createObjectURL(
    new Blob([WORKLET_SOURCE], { type: "application/javascript" }),
  );
  let node: AudioWorkletNode | null = null;
  try {
    await context.audioWorklet.addModule(workletUrl);
    node = new AudioWorkletNode(context, "pcm-resample");
  } finally {
    URL.revokeObjectURL(workletUrl);
  }
  node.port.onmessage = (event: MessageEvent<Int16Array>) => {
    options.onFrame(event.data);
  };
  node.port.postMessage({ paused: false });
  const source = context.createMediaStreamSource(stream);
  source.connect(node);
  // 不连接 destination，避免回声。

  let paused = false;
  return {
    get paused() {
      return paused;
    },
    setPaused(next: boolean) {
      paused = next;
      node?.port.postMessage({ paused: next });
    },
    async stop() {
      try {
        node?.disconnect();
        source.disconnect();
      } finally {
        await context.close().catch(() => undefined);
      }
    },
  };
}

export async function requestMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前浏览器不支持麦克风采集，请使用较新的 Chrome/Edge/Safari。");
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}
