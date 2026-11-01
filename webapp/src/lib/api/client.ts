// 知习网关 HTTP 客户端。
// - 设备 token 只保存在浏览器 localStorage；数据库侧与 Android 一致只存 HMAC 摘要。
// - 401 时自动重新注册设备并重试一次，与 Android LearningApiClient 行为一致。
// - 解析 X-Zhixi-Error-Code / X-Zhixi-Quota-Scope 等错误头，用于精确引导。

import type {
  AccountStatus,
  ActivationCodeResult,
  DeviceRegistration,
  DocumentAsset,
  LearningPackJob,
  LearningPackJobCreate,
  LearningPackRequest,
  LearningPackResponse,
  SyncChange,
  SyncEntity,
  SyncPullResponse,
  SyncPushResponse,
  TranslateResponse,
  TrialApplication,
  TrialCodeResult,
} from "./types";

export type ErrorCode =
  | "account_required"
  | "account_expired"
  | "account_disabled"
  | "account_not_found"
  | "device_limit_reached"
  | "quota_exceeded"
  | "sms_not_configured"
  | "phone_registered"
  | "cooldown"
  | "rate_limited"
  | "code_mismatch"
  | "code_expired"
  | "too_many_attempts"
  | "activation_code_required"
  | "unauthorized"
  | "network"
  | "server"
  | "unknown";

export class ZhixiApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly quotaScope: string | null;
  readonly quotaLimit: number | null;
  readonly quotaUsed: number | null;

  constructor(
    message: string,
    status: number,
    code: ErrorCode,
    quotaScope: string | null = null,
    quotaLimit: number | null = null,
    quotaUsed: number | null = null,
  ) {
    super(message);
    this.name = "ZhixiApiError";
    this.status = status;
    this.code = code;
    this.quotaScope = quotaScope;
    this.quotaLimit = quotaLimit;
    this.quotaUsed = quotaUsed;
  }

  /** 面向用户的可执行中文提示。 */
  get userMessage(): string {
    switch (this.code) {
      case "account_required":
        return "需要先激活试用额度：在「设置 → 试用额度」用手机号激活，一次短信即可完成。";
      case "account_expired":
        return "试用额度已到期，请联系管理员续期。";
      case "account_disabled":
        return "账号已停用，请联系管理员。";
      case "account_not_found":
        return "该手机号还没有试用额度，可在本页直接申请试用。";
      case "sms_not_configured":
        return "短信服务未配置，请联系管理员开通。";
      case "phone_registered":
        return "该手机号已有试用额度，改用激活验证码即可。";
      case "cooldown":
        return "验证码发送过于频繁，请稍等片刻再试。";
      case "rate_limited":
        return "操作过于频繁，请稍后再试。";
      case "code_mismatch":
        return this.message || "验证码不正确，请检查后重试。";
      case "code_expired":
        return "验证码已过期，请重新获取验证码。";
      case "too_many_attempts":
        return "验证码尝试次数过多，请重新获取验证码后再试。";
      case "activation_code_required":
        return "该账号需要短信验证码激活，请先获取验证码。";
      case "device_limit_reached":
        return `设备数量已达上限（${this.quotaLimit ?? "?"} 台），请先在后台解绑设备。`;
      case "quota_exceeded": {
        const scope = this.quotaScope ?? "";
        if (scope.includes("ai")) return "今日 AI 学习包额度已用完，明天再试或联系管理员调整。";
        if (scope.includes("audio")) return "今日云端音频额度已用完，可继续使用本机/离线功能。";
        if (scope.includes("text")) return "今日翻译字符额度已用完。";
        if (scope.includes("document")) return "今日文档解析次数已用完。";
        return "今日额度已用完，请明天再试。";
      }
      case "network":
        return `网络连接失败：${this.message}`;
      case "unauthorized":
        return "设备身份已失效，请重试。";
      default:
        return this.message || "请求失败，请稍后重试。";
    }
  }
}

const DEVICE_STORAGE_KEY = "zhixi.web.device";
const GATEWAY_STORAGE_KEY = "zhixi.web.gateway";

export interface DeviceCredential {
  deviceId: string;
  token: string;
}

export function loadGatewayUrl(): string {
  const stored = localStorage.getItem(GATEWAY_STORAGE_KEY);
  if (stored && stored.trim()) return stored.trim().replace(/\/+$/, "");
  const injected = import.meta.env.VITE_ZHIXI_GATEWAY_URL as string | undefined;
  if (injected && injected.trim()) return injected.trim().replace(/\/+$/, "");
  return window.location.origin;
}

export function saveGatewayUrl(url: string): void {
  localStorage.setItem(GATEWAY_STORAGE_KEY, url.trim().replace(/\/+$/, ""));
}

export function loadDeviceCredential(): DeviceCredential | null {
  const raw = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DeviceCredential;
    if (parsed && typeof parsed.deviceId === "string" && typeof parsed.token === "string") {
      return parsed;
    }
  } catch {
    // fallthrough
  }
  return null;
}

export function saveDeviceCredential(credential: DeviceCredential): void {
  localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(credential));
}

export function clearDeviceCredential(): void {
  localStorage.removeItem(DEVICE_STORAGE_KEY);
}

async function errorFromResponse(response: Response): Promise<ZhixiApiError> {
  let message = `请求失败（HTTP ${response.status}）`;
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string" && body.detail.trim()) {
      message = body.detail;
    } else if (body.detail && Array.isArray(body.detail)) {
      // FastAPI 422 校验错误数组：取第一项的 msg。
      const first = body.detail[0] as { msg?: string } | undefined;
      if (first?.msg) message = `请求参数不正确：${first.msg}`;
    }
  } catch {
    // 忽略非 JSON 响应体。
  }
  const rawCode = response.headers.get("X-Zhixi-Error-Code");
  const code: ErrorCode =
    (rawCode as ErrorCode | null) ??
    (response.status === 401 ? "unauthorized" : response.status >= 500 ? "server" : "unknown");
  const scope = response.headers.get("X-Zhixi-Quota-Scope");
  const limit = response.headers.get("X-Zhixi-Quota-Limit");
  const used = response.headers.get("X-Zhixi-Quota-Used");
  return new ZhixiApiError(
    message,
    response.status,
    code,
    scope,
    limit === null ? null : Number(limit),
    used === null ? null : Number(used),
  );
}

export class ZhixiClient {
  private reRegistering: Promise<DeviceCredential> | null = null;

  get baseUrl(): string {
    return loadGatewayUrl();
  }

  private credential(): DeviceCredential | null {
    return loadDeviceCredential();
  }

  private async ensureDevice(): Promise<DeviceCredential> {
    const existing = this.credential();
    if (existing) return existing;
    return this.registerDevice();
  }

  async registerDevice(): Promise<DeviceCredential> {
    const response = await fetch(`${this.baseUrl}/v1/devices/register`, { method: "POST" });
    if (!response.ok) {
      throw await errorFromResponse(response);
    }
    const registration = (await response.json()) as DeviceRegistration;
    const credential: DeviceCredential = {
      deviceId: registration.deviceId,
      token: registration.token,
    };
    saveDeviceCredential(credential);
    return credential;
  }

  private async reRegister(): Promise<DeviceCredential> {
    if (!this.reRegistering) {
      const pending = (async () => {
        clearDeviceCredential();
        return this.registerDevice();
      })();
      this.reRegistering = pending;
      try {
        return await pending;
      } finally {
        if (this.reRegistering === pending) {
          this.reRegistering = null;
        }
      }
    }
    return this.reRegistering;
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit,
    options: { auth?: boolean; retryOn401?: boolean } = {},
  ): Promise<T> {
    const auth = options.auth ?? true;
    const headers = new Headers(init.headers);
    if (auth) {
      const credential = await this.ensureDevice();
      headers.set("Authorization", `Bearer ${credential.token}`);
    }
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    } catch (cause) {
      throw new ZhixiApiError(cause instanceof Error ? cause.message : String(cause), 0, "network");
    }
    if (response.status === 401 && auth && (options.retryOn401 ?? true)) {
      await this.reRegister();
      return this.requestJson<T>(path, init, { ...options, retryOn401: false });
    }
    if (!response.ok) {
      throw await errorFromResponse(response);
    }
    return (await response.json()) as T;
  }

  async health(): Promise<{ status: string; providerConfigured: boolean }> {
    return this.requestJson("/health", { method: "GET" }, { auth: false });
  }

  async accountStatus(): Promise<AccountStatus> {
    return this.requestJson("/v1/accounts/me", { method: "GET" });
  }

  async activateAccount(phone: string): Promise<AccountStatus> {
    return this.requestJson("/v1/accounts/activate", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
  }

  /** 两步激活第 1 步：请求短信验证码。429 时读 X-Zhixi-Error-Code（cooldown/限流）。 */
  async requestActivationCode(phone: string): Promise<ActivationCodeResult> {
    return this.requestJson("/v1/accounts/activate/request-code", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
  }

  /** 两步激活第 2 步：凭 6 位验证码激活。code_mismatch 的 detail 含剩余尝试次数。 */
  async activateAccountWithCode(phone: string, code: string): Promise<AccountStatus> {
    return this.requestJson("/v1/accounts/activate", {
      method: "POST",
      body: JSON.stringify({ phone, code }),
    });
  }

  /**
   * 自助申请试用第 1 步：请求申请验证码。
   * 手机号已在试用名单时服务端返回 409（phone_registered），此时应改用激活通道。
   */
  async requestTrialCode(phone: string): Promise<TrialCodeResult> {
    return this.requestJson("/v1/trial/request-code", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
  }

  /**
   * 自助申请试用第 2 步：验证码通过后开通试用额度。
   * 请求带设备令牌时服务端会把当前浏览器绑定到新账号（deviceBound=true），
   * 因此网页版（含 iOS/Safari）不需要安装 App，也不需要第二次短信。
   */
  async applyTrial(payload: {
    phone: string;
    code: string;
    name: string;
    nickname: string;
    consent: boolean;
  }): Promise<TrialApplication> {
    return this.requestJson("/v1/trial/apply", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /** 云空间同步：推送一批本地变更（服务端限 ≤500 条/批，调用方负责分批）。 */
  async syncPush(changes: SyncChange[]): Promise<SyncPushResponse> {
    return this.requestJson("/v1/sync/push", {
      method: "POST",
      body: JSON.stringify({ changes }),
    });
  }

  /** 云空间同步：拉取远端记录；entities 为空数组表示全部实体。 */
  async syncPull(entities: SyncEntity[]): Promise<SyncPullResponse> {
    return this.requestJson("/v1/sync/pull", {
      method: "POST",
      body: JSON.stringify({ entities }),
    });
  }

  async translate(
    lineId: number,
    sourceText: string,
    targetLang: "zh-CN" | "en-US",
  ): Promise<TranslateResponse> {
    const sourceHash = await sha256Hex(sourceText);
    return this.requestJson("/v2/translate", {
      method: "POST",
      body: JSON.stringify({ lineId, sourceText, sourceHash, targetLang }),
    });
  }

  async createLearningPackJob(payload: LearningPackRequest): Promise<LearningPackJobCreate> {
    return this.requestJson("/v2/learning-pack/jobs", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getLearningPackJob(jobId: string): Promise<LearningPackJob> {
    return this.requestJson(`/v2/learning-pack/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
    });
  }

  /** 轮询学习包任务直到完成。返回最终响应；抛出最后一个已知错误。 */
  async pollLearningPackJob(
    jobId: string,
    callbacks: { onStatus?: (status: LearningPackJob["status"]) => void } = {},
    timeoutMs = 360_000,
    intervalMs = 3_000,
  ): Promise<LearningPackResponse> {
    const deadline = Date.now() + timeoutMs;
    let lastStatus: LearningPackJob["status"] = "queued";
    while (Date.now() < deadline) {
      const job = await this.getLearningPackJob(jobId);
      if (job.status !== lastStatus) {
        lastStatus = job.status;
        callbacks.onStatus?.(job.status);
      }
      if (job.status === "succeeded" && job.result) return job.result;
      if (job.status === "failed" && job.error) {
        throw new ZhixiApiError(job.error.message, 502, mapJobErrorCode(job.error.code));
      }
      await sleep(intervalMs);
    }
    throw new ZhixiApiError("学习包生成超时，请稍后在课程页重试。", 504, "server");
  }

  async analyzeDocument(file: File): Promise<DocumentAsset> {
    const form = new FormData();
    form.append("file", file);
    return this.requestJson("/v2/documents/analyze", { method: "POST", body: form });
  }

  /** 带鉴权获取文档页面图片并返回 blob URL，供 <img> 使用。 */
  async fetchDocumentPageBlobUrl(documentId: string, filename: string): Promise<string> {
    const credential = await this.ensureDevice();
    const response = await fetch(
      `${this.baseUrl}/v2/documents/${encodeURIComponent(documentId)}/pages/${encodeURIComponent(filename)}`,
      { headers: { Authorization: `Bearer ${credential.token}` } },
    );
    if (!response.ok) throw await errorFromResponse(response);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  /** 云端音频补转写：上传音频创建任务（result 为 normalize 后的 camelCase JSON）。 */
  async createAudioJob(
    audio: Blob,
    options: { language?: string; timestamps?: "none" | "segment" | "word"; hotwords?: string[] } = {},
  ): Promise<{ jobId?: string; requestId?: string; id?: string; status?: string; [key: string]: unknown }> {
    const form = new FormData();
    form.append("file", audio, "classroom.wav");
    form.append("options", JSON.stringify(options));
    return this.requestJson("/v2/lecsync/audio/jobs", { method: "POST", body: form });
  }

  async getAudioJob(jobId: string): Promise<{ status?: string; [key: string]: unknown }> {
    return this.requestJson(`/v2/lecsync/audio/jobs/${encodeURIComponent(jobId)}`, { method: "GET" });
  }

  async getAudioJobResult(jobId: string): Promise<unknown> {
    return this.requestJson(`/v2/lecsync/audio/jobs/${encodeURIComponent(jobId)}/result`, {
      method: "GET",
    });
  }

  /** 实时课堂 WebSocket 地址；浏览器无法自定义请求头，token 走 Sec-WebSocket-Protocol。 */
  realtimeUrl(): string {
    return `${this.baseUrl.replace(/^http/, "ws")}/v2/lecsync/realtime`;
  }

  async deviceToken(): Promise<string> {
    const credential = await this.ensureDevice();
    return credential.token;
  }
}

function mapJobErrorCode(code: string): ErrorCode {
  switch (code) {
    case "quota_exceeded":
      return "quota_exceeded";
    case "account_required":
      return "account_required";
    case "account_expired":
      return "account_expired";
    case "account_disabled":
      return "account_disabled";
    case "provider_unavailable":
    case "invalid_response":
      return "server";
    default:
      return "unknown";
  }
}

/** 面向用户的错误文案：优先用按错误码映射的可执行提示，而不是服务端原文。 */
export function describeError(error: unknown): string {
  if (error instanceof ZhixiApiError) return error.userMessage;
  if (error instanceof Error) return error.message;
  return String(error);
}

/** 该错误是否属于「需要激活试用额度」这类可由账户卡片解决的问题。 */
export function isActivationError(error: unknown): boolean {
  if (!(error instanceof ZhixiApiError)) return false;
  return (
    error.code === "account_required" ||
    error.code === "account_not_found" ||
    error.code === "account_expired" ||
    error.code === "account_disabled" ||
    error.code === "device_limit_reached"
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const zhixi = new ZhixiClient();
