// 云端实时课堂 WebSocket 客户端（/v2/lecsync/realtime）。
// 握手：连接后先发送 {config}；音频为二进制 Int16 PCM；控制消息为 JSON 文本。
// 事件类型与 Android LecsyncRealtimeEngine.handleEvent 一致：
// session.ready / transcript.partial / transcript.final / translation.final /
// digest.update / usage.update / session.ended / session.error / result。
//
// 鉴权：桌面浏览器用 Sec-WebSocket-Protocol: bearer, <token>（网关回显 bearer）。
// iOS 微信等 WKWebView 经常丢弃或拒绝该子协议，改为 URL query ticket，不带子协议；
// ticket 由网关签发、60 秒内有效且只能用一次，长期设备 token 不进入 URL，
// 也就不会被写进 Uvicorn/nginx 访问日志。

import type { RealtimeConfig, RealtimeEvent } from "../api/types";

export interface RealtimeCallbacks {
  onEvent(event: RealtimeEvent): void;
  onOpen?(): void;
  onClose?(code: number, reason: string): void;
  onError?(error: Error): void;
}

export type RealtimeAuthMode = "protocol" | "query";

export interface RealtimeSessionOptions {
  authMode?: RealtimeAuthMode;
}

const STOP_WAIT_MS = 3000;
const READY_TIMEOUT_MS = 12000;

/** 把一次性 ticket 放到 WebSocket URL 的 ticket 查询参数里（微信兼容通道）。 */
export function websocketUrlWithTicket(url: string, ticket: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("ticket", ticket);
  return parsed.toString();
}

/** 按鉴权模式构造 WebSocket 的 url 与子协议，便于单测且避免凭据误进 protocol 模式的 URL。 */
export function buildRealtimeSocketTarget(
  url: string,
  token: string,
  mode: RealtimeAuthMode,
): { url: string; protocols?: [string, string] } {
  // query 模式下 token 参数是一次性 ticket，不是设备 token。
  if (mode === "query") {
    return { url: websocketUrlWithTicket(url, token) };
  }
  return { url, protocols: ["bearer", token] };
}

export class RealtimeSession {
  private socket: WebSocket | null = null;
  private closedByClient = false;
  private ended = false;
  private ready = false;
  private opened = false;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly authMode: RealtimeAuthMode;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly config: RealtimeConfig,
    private readonly callbacks: RealtimeCallbacks,
    options: RealtimeSessionOptions = {},
  ) {
    this.authMode = options.authMode ?? "protocol";
  }

  connect(): void {
    const target = buildRealtimeSocketTarget(this.url, this.token, this.authMode);
    const socket = target.protocols
      ? new WebSocket(target.url, target.protocols)
      : new WebSocket(target.url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    this.ready = false;
    this.opened = false;
    this.readyTimer = setTimeout(() => {
      if (!this.ended && !this.ready && this.socket === socket) {
        this.callbacks.onError?.(new Error("云端课堂连接超时，请检查网络或稍后重试。"));
        try {
          socket.close();
        } catch {
          // ignore
        }
      }
    }, READY_TIMEOUT_MS);
    socket.onopen = () => {
      this.opened = true;
      socket.send(JSON.stringify({ config: this.config }));
      this.callbacks.onOpen?.();
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      let parsed: RealtimeEvent;
      try {
        parsed = JSON.parse(event.data) as RealtimeEvent;
      } catch {
        return;
      }
      if (parsed.type === "session.ready") {
        this.ready = true;
        if (this.readyTimer !== null) {
          clearTimeout(this.readyTimer);
          this.readyTimer = null;
        }
      }
      if (parsed.type === "session.ended") {
        this.ended = true;
      }
      this.callbacks.onEvent(parsed);
    };
    socket.onerror = () => {
      this.callbacks.onError?.(new Error("云端课堂连接失败，请检查网络后重试。"));
    };
    socket.onclose = (event) => {
      if (this.readyTimer !== null) {
        clearTimeout(this.readyTimer);
        this.readyTimer = null;
      }
      this.ready = false;
      this.socket = null;
      this.callbacks.onClose?.(event.code, event.reason);
    };
  }

  sendPcm(frame: Int16Array): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || !this.ready) return false;
    socket.send(frame.buffer as ArrayBuffer);
    return true;
  }

  /** 请求上游立即收尾当前半句（官方 session.finalize）。暂停/停止前调用，避免丢最后一句。 */
  finalize(): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify({ type: "session.finalize" }));
      return true;
    } catch {
      return false;
    }
  }

  /** 发送结束控制并等待 session.ended；超时后直接关闭。 */
  async stop(): Promise<void> {
    if (this.readyTimer !== null) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    this.closedByClient = true;
    // 先 finalize 再 stop（与 App 一致）：让上游把最后半句及其译文推完。
    this.finalize();
    socket.send(JSON.stringify({ type: "session.stop" }));
    const deadline = Date.now() + STOP_WAIT_MS;
    while (!this.ended && Date.now() < deadline && socket.readyState === WebSocket.OPEN) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    try {
      socket.close();
    } catch {
      // ignore
    }
  }

  /** 上游已 ended 时直接关闭连接。 */
  closeAfterEnded(): void {
    try {
      this.socket?.close();
    } catch {
      // ignore
    }
  }

  get isActive(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  /** 已收到 session.ready，此时才应开始推 PCM、并把 UI 标成听课中。 */
  get isReady(): boolean {
    return this.ready && this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  /** 套接字是否曾经打开过（用于判断子协议握手是否根本没建立）。 */
  get didOpen(): boolean {
    return this.opened;
  }

  get clientClosed(): boolean {
    return this.closedByClient;
  }

  get mode(): RealtimeAuthMode {
    return this.authMode;
  }
}

/** 关闭码 → 可读提示。 */
export function closeReason(code: number): string | null {
  switch (code) {
    case 4401:
      return "云端课堂鉴权失败，请刷新页面后重试。";
    case 4403:
      return "需要激活试用额度后才能云端听课。";
    case 4429:
      return "请求过于频繁，请稍后再试。";
    case 4408:
      return "单节课堂时长已达上限，请开始新的一节课。";
    case 4013:
      return "暂停时间过长，连接已断开，请重新开始。";
    default:
      return null;
  }
}
