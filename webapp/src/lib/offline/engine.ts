// 浏览器离线识别引擎：sherpa-onnx WASM（v1.13.7 流式中英 Zipformer，SIMD）。
// 产物（js/wasm/data）全部由模型管理器从镜像下载并 SHA-256 校验；运行时把
// wasm/data 映射为 blob URL、经 Module.locateFile 交给 emscripten，脚本以
// blob URL 注入。解码口径与官方 wasm demo（wasm/asr/app-asr.js）一致：
// acceptWaveform → isReady/decode → isEndpoint → getResult → reset。

import {
  createCacheModelStore,
  injectScript,
  ModelManager,
  OFFLINE_ASR_MODEL,
  type ModelLoadProgress,
} from "./model-manager";

export type OfflinePhase = "idle" | "loading" | "ready" | "failed";

export interface OfflineSegment {
  text: string;
  segmentId: string;
  startMs: number;
  endMs: number;
}

export interface OfflineCallbacks {
  onPartial(text: string): void;
  onFinal(segment: OfflineSegment): void;
}

/** 官方胶水层暴露的最小识别器接口。 */
export interface SherpaRecognizer {
  createStream(): unknown;
  isReady(stream: unknown): boolean;
  decode(stream: unknown): void;
  isEndpoint(stream: unknown): boolean;
  getResult(stream: unknown): { text: string };
  reset(stream: unknown): void;
}

const SAMPLE_RATE = 16000;
/** 16000 Hz：每毫秒 16 个样本。 */
const SAMPLES_PER_MS = 16;

const WASM_FILE = "sherpa-onnx-wasm-main-asr.wasm";
const DATA_FILE = "sherpa-onnx-wasm-main-asr.data";
const LOADER_FILE = "sherpa-onnx-wasm-main-asr.js";
const GLUE_FILE = "sherpa-onnx-asr.js";

interface EmscriptenModuleLike {
  locateFile(path: string, scriptDirectory?: string): string;
  setStatus?(status: string): void;
  onRuntimeInitialized?: () => void;
}

type GlueGlobals = {
  Module?: EmscriptenModuleLike;
  createOnlineRecognizer?: (module: EmscriptenModuleLike, config?: unknown) => SherpaRecognizer;
};

function recognizerConfigJson(): unknown {
  return {
    featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: "./encoder.onnx", decoder: "./decoder.onnx", joiner: "./joiner.onnx" },
      paraformer: { encoder: "", decoder: "" },
      zipformer2Ctc: { model: "" },
      nemoCtc: { model: "" },
      toneCtc: { model: "" },
      tokens: "./tokens.txt",
      numThreads: 1,
      provider: "cpu",
      debug: 0,
      modelType: "",
      modelingUnit: "cjkchar",
      bpeVocab: "",
    },
    decodingMethod: "greedy_search",
    maxActivePaths: 4,
    enableEndpoint: 1,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 20,
    hotwordsFile: "",
    hotwordsScore: 1.5,
    ctcFstDecoderConfig: { graph: "", maxActive: 3000 },
    ruleFsts: "",
    ruleFars: "",
  };
}

function waitRuntimeInitialized(moduleConfig: EmscriptenModuleLike, onStatus?: (message: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("离线识别引擎初始化超时")), 120_000);
    moduleConfig.onRuntimeInitialized = () => {
      clearTimeout(timeout);
      onStatus?.("识别引擎已就绪");
      resolve();
    };
  });
}

function arrayBufferToBlobResponse(buffer: ArrayBuffer): Response {
  return new Response(buffer, { headers: { "Content-Type": "application/javascript" } });
}

export class OfflineEngine {
  private manager = new ModelManager(OFFLINE_ASR_MODEL, createCacheModelStore());
  private phase: OfflinePhase = "idle";
  private recognizer: SherpaRecognizer | null = null;
  private stream: unknown = null;
  private fedSamples = 0;
  private segmentStartSamples = 0;
  private segmentCounter = 0;
  private lastResult = "";
  private loading: Promise<void> | null = null;
  private blobUrls = new Map<string, string>();

  get isReady(): boolean {
    return this.phase === "ready";
  }

  get currentState(): OfflinePhase {
    return this.phase;
  }

  /** 幂等加载：模型产物就绪并创建识别器。 */
  async ensureReady(onStatus: (message: string) => void): Promise<void> {
    if (this.isReady) return;
    if (this.loading) return this.loading;
    const task = (async () => {
      this.phase = "loading";
      try {
        const progressToStatus = (progress: ModelLoadProgress) => {
          const mega = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
          if (progress.phase === "downloading") {
            onStatus(`正在下载 ${progress.fileName}… ${mega(progress.receivedBytes)}/${mega(progress.totalBytes)} MB`);
          } else if (progress.phase === "verifying") {
            onStatus(`正在校验 ${progress.fileName}…`);
          }
        };
        await this.manager.ensureLoaded({ onProgress: progressToStatus });
        onStatus("正在初始化识别引擎…");
        await this.initializeRecognizer();
        this.phase = "ready";
        onStatus("离线识别已就绪");
      } catch (error) {
        this.phase = "failed";
        this.loading = null;
        throw error;
      }
    })();
    this.loading = task;
    return task;
  }

  private async initializeRecognizer(): Promise<void> {
    // 先把 wasm/data 映射为 blob URL：locateFile 是同步回调，不能临时 await。
    await this.blobUrlFor(WASM_FILE);
    await this.blobUrlFor(DATA_FILE);
    const globals = window as unknown as GlueGlobals;
    if (typeof globals.createOnlineRecognizer !== "function") {
      await injectScript(arrayBufferToBlobResponse(await this.manager.assetBuffer(GLUE_FILE)));
    }
    const moduleConfig: EmscriptenModuleLike = {
      locateFile: (path: string) => {
        const mapped = this.blobUrls.get(path);
        if (mapped) return mapped;
        throw new Error(`离线识别产物缺少 ${path}`);
      },
    };
    globals.Module = moduleConfig;
    await injectScript(arrayBufferToBlobResponse(await this.manager.assetBuffer(LOADER_FILE)));
    await waitRuntimeInitialized(moduleConfig);
    const create = globals.createOnlineRecognizer;
    if (typeof create !== "function") {
      throw new Error("离线识别脚本未提供 createOnlineRecognizer");
    }
    this.recognizer = create(moduleConfig, recognizerConfigJson());
    if (!this.recognizer) throw new Error("离线识别器初始化失败");
  }

  /** 测试与诊断用：注入自定义识别器实例。 */
  attachRecognizerForTests(recognizer: SherpaRecognizer): void {
    this.recognizer = recognizer;
    this.phase = "ready";
  }

  private async blobUrlFor(name: string): Promise<string> {
    const existing = this.blobUrls.get(name);
    if (existing) return existing;
    const buffer = await this.manager.assetBuffer(name);
    const url = URL.createObjectURL(new Blob([buffer]));
    this.blobUrls.set(name, url);
    return url;
  }

  /** 开始一节离线课堂：创建识别流。 */
  start(): void {
    if (!this.recognizer) throw new Error("离线识别引擎未就绪");
    this.stream = this.recognizer.createStream();
    this.fedSamples = 0;
    this.segmentStartSamples = 0;
    this.segmentCounter = 0;
    this.lastResult = "";
  }

  /** 喂入 0.2s @16kHz 的 Int16 帧；立即解码并驱动 partial/final 回调。 */
  feed(frame: Int16Array, callbacks: OfflineCallbacks): void {
    const recognizer = this.recognizer;
    const stream = this.stream;
    if (!recognizer || !stream) return;
    const samples = int16ToFloat32(frame);
    this.fedSamples += samples.length;
    // 官方 demo：stream.acceptWaveform(sampleRate, samples)。
    acceptOnStream(recognizer, stream, SAMPLE_RATE, samples);
    while (recognizer.isReady(stream)) {
      recognizer.decode(stream);
    }
    const text = recognizer.getResult(stream).text;
    if (text && text !== this.lastResult) {
      this.lastResult = text;
      callbacks.onPartial(text);
    }
    if (recognizer.isEndpoint(stream)) {
      if (this.lastResult) {
        this.segmentCounter += 1;
        callbacks.onFinal({
          text: this.lastResult,
          segmentId: `offline-${this.segmentCounter}`,
          startMs: Math.round(this.segmentStartSamples / SAMPLES_PER_MS),
          endMs: Math.round(this.fedSamples / SAMPLES_PER_MS),
        });
        callbacks.onPartial("");
      }
      this.lastResult = "";
      this.segmentStartSamples = this.fedSamples;
      recognizer.reset(stream);
    }
  }

  /** 结束课堂：把未触发端点的余句作为最后一行返回（可能为 null）。 */
  stop(callbacks: OfflineCallbacks): OfflineSegment | null {
    if (!this.recognizer || !this.stream) return null;
    const remaining = this.lastResult;
    const segment: OfflineSegment | null = remaining
      ? {
          text: remaining,
          segmentId: `offline-${this.segmentCounter + 1}`,
          startMs: Math.round(this.segmentStartSamples / SAMPLES_PER_MS),
          endMs: Math.round(this.fedSamples / SAMPLES_PER_MS),
        }
      : null;
    if (segment) callbacks.onPartial("");
    this.stream = null;
    this.lastResult = "";
    return segment;
  }
}

/** 官方 demo：stream.acceptWaveform(sampleRate, samples)。 */
function acceptOnStream(recognizer: SherpaRecognizer, stream: unknown, sampleRate: number, samples: Float32Array): void {
  const withAccept = stream as { acceptWaveform?: (rate: number, samples: Float32Array) => void };
  if (typeof withAccept.acceptWaveform === "function") {
    withAccept.acceptWaveform(sampleRate, samples);
    return;
  }
  const onRecognizer = (recognizer as unknown as { acceptWaveform?: (stream: unknown, rate: number, samples: Float32Array) => void }).acceptWaveform;
  onRecognizer?.(stream, sampleRate, samples);
}

function int16ToFloat32(frame: Int16Array): Float32Array {
  const samples = new Float32Array(frame.length);
  for (let i = 0; i < frame.length; i++) {
    samples[i] = frame[i] / 32768;
  }
  return samples;
}

/** 页面级单例：模型产物与 WASM 堆全页共享一份。 */
let sharedEngine: OfflineEngine | null = null;

export function getOfflineEngine(): OfflineEngine {
  if (!sharedEngine) sharedEngine = new OfflineEngine();
  return sharedEngine;
}
