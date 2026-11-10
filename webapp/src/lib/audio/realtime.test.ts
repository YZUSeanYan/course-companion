import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRealtimeSocketTarget,
  RealtimeSession,
  closeReason,
  websocketUrlWithAccessToken,
} from "./realtime";
import type { RealtimeConfig } from "../api/types";

const CONFIG: RealtimeConfig = {
  transcribe: { languages: ["en", "zh"], displayMode: "sentence" },
  translate: { languages: ["en", "zh"] },
  store: false,
};

describe("buildRealtimeSocketTarget", () => {
  it("protocol 模式把 token 放在子协议里，URL 不带 token", () => {
    const target = buildRealtimeSocketTarget("wss://zhixi.example/v2/lecsync/realtime", "tok-abc", "protocol");
    expect(target.url).toBe("wss://zhixi.example/v2/lecsync/realtime");
    expect(target.url).not.toContain("tok-abc");
    expect(target.protocols).toEqual(["bearer", "tok-abc"]);
  });

  it("query 模式把 token 放在 access_token，且不带子协议（微信兼容）", () => {
    const target = buildRealtimeSocketTarget("wss://zhixi.example/v2/lecsync/realtime", "tok-abc", "query");
    expect(target.protocols).toBeUndefined();
    const parsed = new URL(target.url);
    expect(parsed.searchParams.get("access_token")).toBe("tok-abc");
    expect(parsed.pathname).toBe("/v2/lecsync/realtime");
    expect(parsed.protocol).toBe("wss:");
  });

  it("https 基址转 ws 后 query 编码特殊字符", () => {
    const url = websocketUrlWithAccessToken("ws://gateway.test/v2/lecsync/realtime", "a+b/c");
    expect(new URL(url).searchParams.get("access_token")).toBe("a+b/c");
  });
});

describe("closeReason", () => {
  it("语义性关闭码给出中文指引", () => {
    expect(closeReason(4401)).toContain("鉴权");
    expect(closeReason(4403)).toContain("激活");
    expect(closeReason(4429)).toContain("频繁");
    expect(closeReason(1006)).toBeNull();
  });
});

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  binaryType = "blob";
  url: string;
  protocols?: string | string[];
  onopen: ((event: { type: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: { type: string }) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sent: unknown[] = [];

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    FakeWebSocket.instances.push(this);
  }

  send(data: unknown) {
    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({ type: "open" });
  }

  message(data: unknown) {
    this.onmessage?.({ data });
  }
}

describe("RealtimeSession", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("protocol 模式以 bearer + token 作为子协议建立连接", () => {
    const session = new RealtimeSession("wss://g.test/v2/lecsync/realtime", "tok", CONFIG, {
      onEvent: () => undefined,
    });
    session.connect();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]?.protocols).toEqual(["bearer", "tok"]);
    expect(FakeWebSocket.instances[0]?.url).toBe("wss://g.test/v2/lecsync/realtime");
  });

  it("query 模式不传子协议，token 只出现在 URL", () => {
    const session = new RealtimeSession(
      "wss://g.test/v2/lecsync/realtime",
      "tok",
      CONFIG,
      { onEvent: () => undefined },
      { authMode: "query" },
    );
    session.connect();
    const socket = FakeWebSocket.instances[0];
    expect(socket?.protocols).toBeUndefined();
    expect(new URL(socket?.url ?? "").searchParams.get("access_token")).toBe("tok");
  });

  it("onopen 只发送 config，此时 isReady 仍为 false，不能推 PCM", () => {
    const events: string[] = [];
    const session = new RealtimeSession("wss://g.test/v2/lecsync/realtime", "tok", CONFIG, {
      onEvent: (event) => events.push(event.type),
      onOpen: () => events.push("open"),
    });
    session.connect();
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    expect(events).toEqual(["open"]);
    expect(session.didOpen).toBe(true);
    expect(session.isReady).toBe(false);
    expect(session.sendPcm(new Int16Array(4))).toBe(false);
    expect(socket.sent).toEqual([JSON.stringify({ config: CONFIG })]);
  });

  it("收到 session.ready 后才 isReady，并允许推 PCM", () => {
    const session = new RealtimeSession("wss://g.test/v2/lecsync/realtime", "tok", CONFIG, {
      onEvent: () => undefined,
    });
    session.connect();
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.message(JSON.stringify({ type: "session.ready", sessionId: "s1" }));
    expect(session.isReady).toBe(true);
    const frame = new Int16Array([1, 2, 3, 4]);
    expect(session.sendPcm(frame)).toBe(true);
    expect(socket.sent[1]).toBe(frame.buffer);
  });

  it("12 秒内没收到 session.ready 则报错并关闭", () => {
    const errors: string[] = [];
    const session = new RealtimeSession("wss://g.test/v2/lecsync/realtime", "tok", CONFIG, {
      onEvent: () => undefined,
      onError: (error) => errors.push(error.message),
    });
    session.connect();
    FakeWebSocket.instances[0]!.open();
    vi.advanceTimersByTime(11999);
    expect(errors).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(errors[0]).toContain("连接超时");
    expect(FakeWebSocket.instances[0]!.readyState).toBe(FakeWebSocket.CLOSED);
  });
});
