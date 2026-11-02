// 云端实时课堂 WebSocket 客户端（/v2/lecsync/realtime）。
// 握手：连接后先发送 {config}；音频为二进制 Int16 PCM；控制消息为 JSON 文本。
// 事件类型与 Android LecsyncRealtimeEngine.handleEvent 一致：
// session.ready / transcript.partial / transcript.final / translation.final /
// digest.update / usage.update / session.ended / session.error / result。

import type { RealtimeConfig, RealtimeEvent } from "../api/types";

export interface RealtimeCallbacks {
  onEvent(event: RealtimeEvent): void;
  onOpen?(): void;
  onClose?(code: number, reason: string): void;
  onError?(error: Error): void;
}

const STOP_WAIT_MS = 3000;
const READY_TIMEOUT_MS = 12000;

export class RealtimeSession {
  private socket: WebSocket | null = null;
  private closedByClient = false;
  private ended = false;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly config: RealtimeConfig,
    private readonly callbacks: RealtimeCallbacks,
  ) {}

  connect(): void {
    // 浏览器无法设置 Authorization 头，token 通过 Sec-WebSocket-Protocol
    // 以 ["bearer", token] 形式传递；网关在 proxy_socket 中解析并回显 bearer。
    const socket = new WebSocket(this.url, ["bearer", this.token]);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    this.readyTimer = setTimeout(() => {
      if (!this.ended && this.socket === socket) {
        this.callbacks.onError?.(new Error("云端课堂连接超时，请检查网络或稍后重试。"));
        try {
          socket.close();
        } catch {
          // ignore
        }
      }
    }, READY_TIMEOUT_MS);
    socket.onopen = () => {
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
      this.socket = null;
      this.callbacks.onClose?.(event.code, event.reason);
    };
  }

  sendPcm(frame: Int16Array): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
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

  get clientClosed(): boolean {
    return this.closedByClient;
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
