import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DEFAULT_MODEL_BASE_URL,
  ModelManager,
  OFFLINE_ASR_MODEL,
  resolveModelBaseUrl,
  saveModelBaseUrlOverride,
  verifyAsset,
  type ModelAsset,
  type ModelStore,
} from "./model-manager";
import { OfflineEngine, type OfflineSegment, type SherpaRecognizer } from "./engine";

describe("resolveModelBaseUrl（设置页回归：禁止递归爆栈）", () => {
  beforeEach(() => {
    // node 环境无 localStorage，用内存桩（与浏览器同接口）。
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => void store.clear(),
    });
  });

  it("无覆盖时返回默认镜像常量（不递归）", () => {
    expect(resolveModelBaseUrl()).toBe(DEFAULT_MODEL_BASE_URL);
    expect(OFFLINE_ASR_MODEL.baseUrl).toBe(DEFAULT_MODEL_BASE_URL);
    // 镜像必须与 webapp 同源（zhixi 域），否则跨源 fetch 会被 CORS 拦截。
    expect(DEFAULT_MODEL_BASE_URL).toMatch(/^https:\/\/zhixi\.seanyan\.store\//);
  });

  it("有覆盖时返回覆盖值（保留尾部斜杠）", () => {
    saveModelBaseUrlOverride("http://127.0.0.1:8901");
    expect(resolveModelBaseUrl()).toBe("http://127.0.0.1:8901/");
    saveModelBaseUrlOverride("");
    expect(resolveModelBaseUrl()).toBe(DEFAULT_MODEL_BASE_URL);
  });
});

class MemoryStore implements ModelStore {
  private entries = new Map<string, Response>();

  async get(name: string) {
    return this.entries.get(name);
  }
  async put(name: string, response: Response) {
    this.entries.set(name, response);
  }
  async delete(name: string) {
    this.entries.delete(name);
  }
  size(): number {
    return this.entries.size;
  }
}

const PAYLOAD = "offline-model-bytes";
const PAYLOAD_BYTES = new TextEncoder().encode(PAYLOAD);

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function assetWith(sha256: string, size: number): ModelAsset {
  return { name: "model-file.bin", sha256, size };
}

describe("verifyAsset", () => {
  it("哈希与字节数都一致才通过", async () => {
    const asset = assetWith(await sha256Hex(PAYLOAD_BYTES), PAYLOAD_BYTES.length);
    const good = PAYLOAD_BYTES.slice().buffer as ArrayBuffer;
    expect(await verifyAsset(good, asset)).toBe(true);
    expect(await verifyAsset(good, assetWith(asset.sha256, asset.size + 1))).toBe(false);
    expect(await verifyAsset(good, assetWith("0".repeat(64), asset.size))).toBe(false);
  });
});

describe("ModelManager", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("下载后校验通过并存入缓存；二次加载直接命中", async () => {
    const asset = assetWith(await sha256Hex(PAYLOAD_BYTES), PAYLOAD_BYTES.length);
    const store = new MemoryStore();
    const manager = new ModelManager(
      { version: "test", baseUrl: "https://mirror.example/", assets: [asset] },
      store,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(PAYLOAD_BYTES.slice() as unknown as ArrayBuffer)),
    );
    const phases: string[] = [];
    await manager.ensureLoaded({
      onProgress: (progress) => phases.push(progress.phase),
    });
    expect(store.size()).toBe(1);
    expect(phases).toContain("downloading");
    expect(phases).toContain("verifying");
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);

    // 二次加载：命中缓存，不再发起下载。
    await manager.ensureLoaded({});
    expect(vi.mocked(fetch).mock.calls.length).toBe(1);
  });

  it("哈希不符时报错并清除缓存", async () => {
    const asset = assetWith("f".repeat(64), PAYLOAD_BYTES.length);
    const store = new MemoryStore();
    const manager = new ModelManager(
      { version: "test", baseUrl: "https://mirror.example/", assets: [asset] },
      store,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(PAYLOAD_BYTES.slice() as unknown as ArrayBuffer)),
    );
    await expect(manager.ensureLoaded({})).rejects.toThrow("校验失败");
    expect(store.size()).toBe(0);
  });

  it("未登记哈希的资产直接报错", async () => {
    const manager = new ModelManager(
      { version: "test", baseUrl: "https://mirror.example/", assets: [{ name: "x", sha256: "", size: 0 }] },
      new MemoryStore(),
    );
    await expect(manager.ensureLoaded({})).rejects.toThrow("尚未登记校验哈希");
  });
});

describe("OfflineEngine 解码循环（注入假识别器）", () => {
  interface FakeStream {
    samples: Float32Array[];
    acceptWaveform(rate: number, samples: Float32Array): void;
  }

  function fakeRecognizer(endpointAfterSamples: number): SherpaRecognizer {
    let decoded = 0;
    return {
      createStream(): FakeStream {
        const stream: FakeStream = {
          samples: [],
          acceptWaveform(_rate: number, samples: Float32Array) {
            stream.samples.push(samples);
          },
        };
        return stream;
      },
      isReady(stream) {
        return (stream as FakeStream).samples.length > decoded;
      },
      decode(stream) {
        decoded += 1;
        void stream;
      },
      isEndpoint(stream) {
        const total = (stream as FakeStream).samples.reduce((sum, s) => sum + s.length, 0);
        return total >= endpointAfterSamples;
      },
      getResult() {
        return { text: decoded > 0 ? "hello" : "" };
      },
      reset(stream) {
        decoded = 0;
        (stream as FakeStream).samples = [];
      },
    };
  }

  function frame(samples: number): Int16Array {
    return new Int16Array(samples);
  }

  it("端点触发时产出 final 段（时间轴按样本数换算）", () => {
    const engine = new OfflineEngine();
    engine.attachRecognizerForTests(fakeRecognizer(6400)); // 0.4s
    engine.start();
    const partials: string[] = [];
    const finals: OfflineSegment[] = [];
    const callbacks = {
      onPartial: (text: string) => partials.push(text),
      onFinal: (segment: OfflineSegment) => finals.push(segment),
    };
    // 4 帧 × 0.2s：第 2 帧累计 0.4s 触发端点 → final(0→400ms)；
    // 第 4 帧再次累计到 0.4s → final(400→800ms)。
    for (let i = 0; i < 4; i++) {
      engine.feed(frame(3200), callbacks);
    }
    expect(finals.length).toBe(2);
    expect(finals[0]).toMatchObject({ text: "hello", segmentId: "offline-1", startMs: 0, endMs: 400 });
    expect(finals[1]).toMatchObject({ text: "hello", segmentId: "offline-2", startMs: 400, endMs: 800 });
    // 端点后重新计时：第 5 帧（0.2s）未到端点阈值不触发；
    // 第 6 帧累计 0.4s → final(800→1200ms)，段落连续无空隙。
    engine.feed(frame(3200), callbacks);
    expect(finals.length).toBe(2);
    engine.feed(frame(3200), callbacks);
    expect(finals.length).toBe(3);
    expect(finals[2]).toMatchObject({ text: "hello", segmentId: "offline-3", startMs: 800, endMs: 1200 });
  });

  it("stop 把未触发端点的余句作为最后一段返回", () => {
    const engine = new OfflineEngine();
    engine.attachRecognizerForTests(fakeRecognizer(Number.MAX_SAFE_INTEGER)); // 永不端点
    engine.start();
    const finals: OfflineSegment[] = [];
    const callbacks = { onPartial: () => undefined, onFinal: (segment: OfflineSegment) => finals.push(segment) };
    engine.feed(frame(3200), callbacks);
    const remaining = engine.stop(callbacks);
    expect(remaining).not.toBeNull();
    expect(remaining?.text).toBe("hello");
    expect(remaining?.endMs).toBe(200);
  });
});
