import { describe, expect, it } from "vitest";
import { encodeWav, wavSeconds, WAV_HEADER_BYTES, WAV_SAMPLE_RATE } from "./wav";

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe("encodeWav", () => {
  it("生成 44 字节头、正确的声明与 PCM 数据", async () => {
    const frameA = new Int16Array([1, -1, 32767, -32768]);
    const frameB = new Int16Array([100, 200]);
    const blob = encodeWav([frameA, frameB]);
    expect(blob.type).toBe("audio/wav");
    const bytes = await blobBytes(blob);
    expect(bytes.length).toBe(WAV_HEADER_BYTES + 12);

    const ascii = (offset: number, length: number) =>
      String.fromCharCode(...bytes.slice(offset, offset + length));
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(ascii(12, 4)).toBe("fmt ");
    expect(ascii(36, 4)).toBe("data");

    const view = new DataView(bytes.buffer);
    expect(view.getUint32(4, true)).toBe(36 + 12); // RIFF size
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(WAV_SAMPLE_RATE);
    expect(view.getUint32(40, true)).toBe(12); // data bytes

    const pcm = new Int16Array(bytes.buffer, WAV_HEADER_BYTES, 6);
    expect(Array.from(pcm)).toEqual([1, -1, 32767, -32768, 100, 200]);
  });

  it("空帧生成有效空 WAV，时长计算正确", () => {
    const blob = encodeWav([]);
    expect(wavSeconds(blob.size)).toBe(0);
    const oneSecond = encodeWav([new Int16Array(WAV_SAMPLE_RATE)]);
    expect(Math.round(wavSeconds(oneSecond.size))).toBe(1);
  });
});
