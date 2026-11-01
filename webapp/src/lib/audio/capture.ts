// 麦克风采集：AudioWorklet 重采样为 16kHz 单声道 Int16 PCM。
// 实时课堂 WebSocket 的音频分片按 0.2 秒（3200 样本 / 6400 字节）成帧，
// 与网关 sent_seconds = bytes/32000 的口径一致。

export const TARGET_SAMPLE_RATE = 16000;
export const FRAME_SAMPLES = 3200; // 0.2s

const WORKLET_SOURCE = `
const TARGET = 16000;
const FRAME_SAMPLES = 3200;
class PcmResampleProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET;
    this.lerpPos = 0;
    this.frame = new Int16Array(FRAME_SAMPLES);
    this.frameFill = 0;
    this.prevSample = 0;
    this.nextSample = 0;
    this.hasPrev = false;
    this.paused = false;
    this.port.onmessage = (event) => {
      if (event.data && typeof event.data.paused === "boolean") {
        this.paused = event.data.paused;
      }
    };
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || this.paused) return true;
    for (let i = 0; i < channel.length; i++) {
      const sample = channel[i];
      if (!this.hasPrev) {
        this.prevSample = sample;
        this.nextSample = sample;
        this.hasPrev = true;
        this.lerpPos = 0;
        continue;
      }
      this.lerpPos += this.ratio;
      while (this.lerpPos >= 1) {
        this.lerpPos -= 1;
        this.prevSample = this.nextSample;
        this.nextSample = sample;
      }
      const value = this.prevSample + (this.nextSample - this.prevSample) * this.lerpPos;
      const clamped = Math.max(-1, Math.min(1, value));
      this.frame[this.frameFill++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      if (this.frameFill >= FRAME_SAMPLES) {
        this.port.postMessage(this.frame.slice(0));
        this.frameFill = 0;
      }
    }
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
