// 降采样算术的回归测试。
//
// 测的是 WORKLET_SOURCE —— 线上真正注入 AudioWorklet 的那串源码本身，而不是一份
// 复制品。为此在 Node 里用 new Function 把它跑起来，并注入 AudioWorkletProcessor /
// registerProcessor / sampleRate 三个 worklet 作用域的全局。
//
// 背景：旧实现每个输入采样都输出一个样本，48kHz 下等于每秒产出 48000 个样本却按
// 16kHz 打标。网关按 len(audio)/32000 计费并转给上游 ASR，结果是 3 倍慢放 + 3 倍
// 额度，识别为空。
//
// 注意：帧攒满 FRAME_SAMPLES（0.1s）才发出，所以任意时刻最多有不足一帧留在缓冲里，
// 断言不能用「1 秒恰好 16000 个」，要按「每秒样本数」算并留一帧容差。

import { describe, expect, it } from "vitest";
import { FRAME_SAMPLES, TARGET_SAMPLE_RATE, WORKLET_SOURCE, createPcmDownsampler } from "./capture";

interface FakeProcessor {
  port: { onmessage: ((event: { data: unknown }) => void) | null; postMessage: (message: unknown) => void };
  process(inputs: Float32Array[][]): boolean;
}

/** 在假的 worklet 作用域里执行 WORKLET_SOURCE，拿回注册的处理器构造器。 */
function loadProcessor(inputRate: number) {
  const frames: Int16Array[] = [];
  let registered: (new () => FakeProcessor) | null = null;

  class AudioWorkletProcessorStub {
    port = {
      onmessage: null as ((event: { data: unknown }) => void) | null,
      postMessage: (message: unknown) => {
        frames.push(message as Int16Array);
      },
    };
  }

  const factory = new Function(
    "AudioWorkletProcessor",
    "registerProcessor",
    "sampleRate",
    WORKLET_SOURCE,
  );
  factory(
    AudioWorkletProcessorStub,
    (_name: string, cls: new () => FakeProcessor) => {
      registered = cls;
    },
    inputRate,
  );

  if (registered === null) throw new Error("worklet 没有调用 registerProcessor");
  const Processor = registered as new () => FakeProcessor;
  return { processor: new Processor(), frames };
}

function collect(inputRate: number, seconds: number, freq = 440) {
  const { processor, frames } = loadProcessor(inputRate);
  const total = Math.round(inputRate * seconds);
  // 按 128 个采样一块喂，模拟 worklet 的 render quantum
  for (let offset = 0; offset < total; offset += 128) {
    const chunk = new Float32Array(Math.min(128, total - offset));
    for (let i = 0; i < chunk.length; i++) {
      chunk[i] = Math.sin((2 * Math.PI * freq * (offset + i)) / inputRate);
    }
    processor.process([[chunk]]);
  }
  const samples = frames.reduce((sum, frame) => sum + frame.length, 0);
  return {
    frames,
    samples,
    all: frames.flatMap((frame) => Array.from(frame)),
    seconds: samples / TARGET_SAMPLE_RATE,
  };
}

/** 一帧不发出的缓冲，折算成秒的容差。 */
const ONE_FRAME_SECONDS = FRAME_SAMPLES / TARGET_SAMPLE_RATE + 0.01;

describe("worklet 降采样", () => {
  it("48kHz 输入产出 16kHz 输出（10 秒输入 ≈ 10 秒音频）", () => {
    const { seconds } = collect(48000, 10);
    expect(Math.abs(seconds - 10)).toBeLessThan(ONE_FRAME_SECONDS);
    expect(seconds).toBeGreaterThanOrEqual(10 - 0.2);
  });

  it("44.1kHz 输入同样收敛到 16kHz", () => {
    const { seconds } = collect(44100, 10);
    expect(Math.abs(seconds - 10)).toBeLessThan(ONE_FRAME_SECONDS);
  });

  it("16kHz 输入直通（比率 1 时不变速）", () => {
    const { seconds } = collect(16000, 10);
    expect(Math.abs(seconds - 10)).toBeLessThan(ONE_FRAME_SECONDS);
  });

  it("三种输入率产出的音频时长彼此一致（关键回归点）", () => {
    // 旧实现下 48k 会产出 3 倍于 16k 的样本数；修好后三者应基本相等。
    const a = collect(48000, 5).samples;
    const b = collect(44100, 5).samples;
    const c = collect(16000, 5).samples;
    expect(Math.abs(a - c)).toBeLessThanOrEqual(FRAME_SAMPLES);
    expect(Math.abs(b - c)).toBeLessThanOrEqual(FRAME_SAMPLES);
  });

  it("每个输出帧长度固定为 FRAME_SAMPLES（= 0.1s）", () => {
    const { frames } = collect(48000, 2);
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame.length).toBe(FRAME_SAMPLES);
    }
  });

  it("输出不是静音，且落在 Int16 合法范围内", () => {
    const { all } = collect(48000, 1);
    let nonZero = 0;
    let min = 0;
    let max = 0;
    for (const v of all) {
      if (v !== 0) nonZero++;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(nonZero).toBeGreaterThan(0);
    expect(min).toBeGreaterThanOrEqual(-32768);
    expect(max).toBeLessThanOrEqual(32767);
  });

  it("频率不变速：440Hz 正弦的过零率约为 880 次/秒", () => {
    const { all, seconds } = collect(48000, 5);
    let crossings = 0;
    for (let i = 1; i < all.length; i++) {
      if ((all[i - 1] < 0 && all[i] >= 0) || (all[i - 1] >= 0 && all[i] < 0)) crossings++;
    }
    const perSecond = crossings / seconds;
    // 旧实现下音频被拉长 3 倍，过零率会掉到约 293 次/秒。
    expect(perSecond).toBeGreaterThan(860);
    expect(perSecond).toBeLessThan(900);
  });

  it("越界输入会被夹到 Int16 边界", () => {
    const { processor, frames } = loadProcessor(16000);
    processor.process([[new Float32Array(FRAME_SAMPLES * 2).fill(4)]]);
    const all = frames.flatMap((frame) => Array.from(frame));
    expect(all.length).toBeGreaterThan(0);
    expect(Math.max(...all)).toBeLessThanOrEqual(32767);
    expect(Math.min(...all)).toBeGreaterThanOrEqual(-32768);
  });

  it("暂停时不再产出帧", () => {
    const { processor, frames } = loadProcessor(16000);
    processor.port.onmessage?.({ data: { paused: true } });
    processor.process([[new Float32Array(FRAME_SAMPLES * 2).fill(0.5)]]);
    expect(frames.length).toBe(0);
    processor.port.onmessage?.({ data: { paused: false } });
    // 首样本只作插值基准不产出，所以喂两帧的量才稳稳凑满一帧。
    processor.process([[new Float32Array(FRAME_SAMPLES * 2).fill(0.5)]]);
    expect(frames.length).toBeGreaterThan(0);
  });

  it("空输入不抛错", () => {
    const { processor } = loadProcessor(48000);
    expect(processor.process([[]])).toBe(true);
    expect(processor.process([])).toBe(true);
  });
});


describe("createPcmDownsampler 与 worklet 同源", () => {
  it("主线程回退路径与 worklet 对同一 48kHz 输入产出相同样本", () => {
    const worklet = collect(48000, 2, 440);
    const frames: Int16Array[] = [];
    const down = createPcmDownsampler(48000, (frame) => frames.push(frame));
    const total = 48000 * 2;
    for (let offset = 0; offset < total; offset += 128) {
      const chunk = new Float32Array(Math.min(128, total - offset));
      for (let i = 0; i < chunk.length; i++) {
        chunk[i] = Math.sin((2 * Math.PI * 440 * (offset + i)) / 48000);
      }
      down.push(chunk);
    }
    const samples = frames.reduce((sum, frame) => sum + frame.length, 0);
    expect(samples).toBe(worklet.samples);
    expect(frames.flatMap((frame) => Array.from(frame))).toEqual(worklet.all);
  });
});
