// 离线识别模型管理：从镜像下载 sherpa-onnx WASM 产物（版本锁定 v1.13.7），
// SHA-256 锚定校验后存入 Cache API；命中时复验哈希，不符即清缓存重下。
// 上游发布物：https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.13.7（Apache-2.0）。
// 镜像发布步骤见 webapp/README.md；哈希与 Android 端"镜像+校验"口径一致。

export interface ModelAsset {
  name: string;
  /** 预期 SHA-256（十六进制小写）；镜像产物固定后锚定在代码中。 */
  sha256: string;
  /** 预期字节数；不符直接判校验失败。 */
  size: number;
}

export interface OfflineModelSpec {
  version: string;
  /** 模型根 URL（以 / 结尾）。 */
  baseUrl: string;
  assets: ModelAsset[];
}

export type DownloadPhase = "checking" | "downloading" | "verifying";

export interface ModelLoadProgress {
  phase: DownloadPhase;
  fileName: string | null;
  receivedBytes: number;
  totalBytes: number;
}

export const DEFAULT_MODEL_BASE_URL = "https://shuike.seanyan.store/models/zhixi/web/asr-zh-en-v1/";

export const OFFLINE_ASR_MODEL: OfflineModelSpec = {
  version: "sherpa-onnx-wasm-simd-v1.13.7-zh-en-asr-zipformer",
  get baseUrl(): string {
    return resolveModelBaseUrl();
  },
  // 哈希/字节数取自上游 v1.13.7 发布物（sha256sum 实测，官方 digest 一致性已验证）。
  // JS 胶水来自同一发布物，与 loader 版本锁定。
  assets: [
    {
      name: "sherpa-onnx-asr.js",
      sha256: "d51ae8e8b756ee5e53423ffada0c9702973f154f561aca7984fe0b12f4060178",
      size: 53867,
    },
    {
      name: "sherpa-onnx-wasm-main-asr.js",
      sha256: "864bd45b63586a752c2d26a02dfb3e40d4f2e15839aa85b7e84af0ccc1b5619e",
      size: 82690,
    },
    {
      name: "sherpa-onnx-wasm-main-asr.wasm",
      sha256: "d0c15c3042fd61ca2a158a1eeb8b8c2099201f7580945efc8f729d2830cf746d",
      size: 13150239,
    },
    {
      name: "sherpa-onnx-wasm-main-asr.data",
      sha256: "90b04a9403e4bae9b23a0a3c00dbac8603e183361105a52cc03f053217490863",
      size: 199059238,
    },
  ],
};

const MODEL_BASE_OVERRIDE_KEY = "zhixi.web.modelBaseUrl";

/** 允许用 localStorage 覆盖镜像根地址（本地联调/内网镜像）；空值用默认镜像。
 *  兜底必须是常量——不能回引 OFFLINE_ASR_MODEL.baseUrl（getter 会递归爆栈）。 */
export function resolveModelBaseUrl(): string {
  const override = localStorage.getItem(MODEL_BASE_OVERRIDE_KEY);
  if (override && override.trim()) return override.trim().replace(/\/+$/, "") + "/";
  return DEFAULT_MODEL_BASE_URL;
}

export function saveModelBaseUrlOverride(url: string): void {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (trimmed) localStorage.setItem(MODEL_BASE_OVERRIDE_KEY, trimmed);
  else localStorage.removeItem(MODEL_BASE_OVERRIDE_KEY);
}

export interface ModelStore {
  get(name: string): Promise<Response | undefined>;
  put(name: string, response: Response): Promise<void>;
  delete(name: string): Promise<void>;
}

export interface ModelManagerCallbacks {
  onProgress?(progress: ModelLoadProgress): void;
}

function requestFor(name: string): Request {
  return new Request(`https://zhixi-web-offline.internal/${name}`);
}

export function createCacheModelStore(cacheName = "zhixi-web-offline-model-v1"): ModelStore {
  return {
    async get(name: string) {
      const cache = await caches.open(cacheName);
      return cache.match(requestFor(name));
    },
    async put(name: string, response: Response) {
      const cache = await caches.open(cacheName);
      await cache.put(requestFor(name), response);
    },
    async delete(name: string) {
      const cache = await caches.open(cacheName);
      await cache.delete(requestFor(name));
    },
  };
}

export class ModelManager {
  private loading: Promise<void> | null = null;

  constructor(
    private readonly spec: OfflineModelSpec,
    private readonly store: ModelStore,
  ) {}

  /** 幂等加载：缓存命中且哈希一致直接就绪；否则逐文件下载（带进度与校验）。 */
  async ensureLoaded(callbacks: ModelManagerCallbacks = {}): Promise<void> {
    if (this.loading) return this.loading;
    const task = (async () => {
      for (const asset of this.spec.assets) {
        if (!asset.sha256) {
          throw new Error(`模型资产 ${asset.name} 尚未登记校验哈希，镜像产物未完成发布`);
        }
        callbacks.onProgress?.({ phase: "checking", fileName: asset.name, receivedBytes: 0, totalBytes: asset.size });
        const cached = await this.store.get(asset.name);
        if (cached) {
          const buffer = await cached.arrayBuffer();
          if (await verifyAsset(buffer, asset)) {
            continue;
          }
          await this.store.delete(asset.name);
        }
        const buffer = await this.downloadAsset(asset, callbacks);
        callbacks.onProgress?.({
          phase: "verifying",
          fileName: asset.name,
          receivedBytes: buffer.byteLength,
          totalBytes: buffer.byteLength,
        });
        if (!(await verifyAsset(buffer, asset))) {
          await this.store.delete(asset.name);
          throw new Error(`模型文件 ${asset.name} 校验失败，请重试或更换网络环境`);
        }
        await this.store.put(
          asset.name,
          new Response(buffer, {
            headers: {
              "Content-Type": contentTypeFor(asset.name),
              "Content-Length": String(buffer.byteLength),
            },
          }),
        );
      }
    })();
    this.loading = task.catch((error) => {
      this.loading = null;
      throw error;
    });
    return this.loading;
  }

  /** 引擎取用；未经 ensureLoaded 直接取用会抛错。 */
  async assetBuffer(name: string): Promise<ArrayBuffer> {
    const cached = await this.store.get(name);
    if (!cached) throw new Error(`模型资产 ${name} 未加载`);
    return cached.arrayBuffer();
  }

  private async downloadAsset(asset: ModelAsset, callbacks: ModelManagerCallbacks): Promise<ArrayBuffer> {
    const url = `${this.spec.baseUrl}${asset.name}`;
    callbacks.onProgress?.({ phase: "downloading", fileName: asset.name, receivedBytes: 0, totalBytes: asset.size });
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`模型下载失败（HTTP ${response.status}）：${url}`);
    }
    const total = asset.size || Number(response.headers.get("Content-Length") ?? 0) || 0;
    let received = 0;
    const reader = response.body?.getReader();
    if (!reader) {
      const buffer = await response.arrayBuffer();
      callbacks.onProgress?.({
        phase: "downloading",
        fileName: asset.name,
        receivedBytes: buffer.byteLength,
        totalBytes: buffer.byteLength,
      });
      return buffer;
    }
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        callbacks.onProgress?.({
          phase: "downloading",
          fileName: asset.name,
          receivedBytes: received,
          totalBytes: total || received,
        });
      }
    }
    return concatChunks(chunks, received);
  }
}

export async function verifyAsset(buffer: ArrayBuffer, asset: ModelAsset): Promise<boolean> {
  if (asset.size && buffer.byteLength !== asset.size) return false;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex === asset.sha256;
}

function contentTypeFor(name: string): string {
  if (name.endsWith(".js")) return "application/javascript";
  return "application/octet-stream";
}

function concatChunks(chunks: Uint8Array[], total: number): ArrayBuffer {
  const buffer = new ArrayBuffer(total);
  const view = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    view.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

/** 脚本注入：把已校验的 JS 资产作为经典脚本加载，返回加载完成信号。 */
export function injectScript(response: Response): Promise<void> {
  return response
    .text()
    .then((code) => {
      const blobUrl = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
      return new Promise<void>((resolve, reject) => {
        const element = document.createElement("script");
        element.src = blobUrl;
        element.onload = () => {
          URL.revokeObjectURL(blobUrl);
          resolve();
        };
        element.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          reject(new Error("离线识别脚本加载失败"));
        };
        document.head.appendChild(element);
      });
    });
}
