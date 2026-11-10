import { describe, expect, it } from "vitest";
import { microphoneConstraintAttempts, pcmWorkletDataUrl, WORKLET_SOURCE } from "./capture";

describe("pcmWorkletDataUrl", () => {
  it("生成可解码回原源码的 data URL（iOS 微信优先用这条，而不是 blob:）", () => {
    const url = pcmWorkletDataUrl(WORKLET_SOURCE);
    expect(url.startsWith("data:application/javascript;charset=utf-8,")).toBe(true);
    const encoded = url.slice("data:application/javascript;charset=utf-8,".length);
    expect(decodeURIComponent(encoded)).toBe(WORKLET_SOURCE);
    expect(url.includes("blob:")).toBe(false);
  });
});

describe("microphoneConstraintAttempts", () => {
  it("先用详细约束，失败后再用 audio: true（兼容 iOS 微信拒绝 channelCount 的情况）", () => {
    const attempts = microphoneConstraintAttempts();
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    expect(attempts[1]).toEqual({ audio: true });
  });
});
