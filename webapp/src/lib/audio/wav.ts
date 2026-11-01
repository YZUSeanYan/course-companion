// WAV 编码：把 16kHz 单声道 Int16 PCM 帧序列写成标准 WAV 文件（44 字节头）。
// 网关音频接口允许 .wav（audio/wav），webm 不在允许列表，所以本地存档用 WAV。

export const WAV_SAMPLE_RATE = 16000;
export const WAV_HEADER_BYTES = 44;

export function encodeWav(frames: Int16Array[], sampleRate = WAV_SAMPLE_RATE): Blob {
  let totalSamples = 0;
  for (const frame of frames) totalSamples += frame.length;
  const dataBytes = totalSamples * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = WAV_HEADER_BYTES;
  for (const frame of frames) {
    new Int16Array(buffer, offset, frame.length).set(frame);
    offset += frame.length * 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function wavSeconds(blobSize: number, sampleRate = WAV_SAMPLE_RATE): number {
  const dataBytes = Math.max(0, blobSize - WAV_HEADER_BYTES);
  return dataBytes / 2 / sampleRate;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
