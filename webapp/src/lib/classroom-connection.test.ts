// 课堂启动相位：云端模式必须等到 session.ready 才能标成「听课中」。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeSession = {
  authMode?: string;
  credential?: string;
  didOpen: boolean;
  isReady: boolean;
  isActive: boolean;
  callbacks: {
    onEvent: (event: { type: string }) => void;
    onOpen?: () => void;
    onClose?: (code: number, reason: string) => void;
    onError?: (error: Error) => void;
  };
  connect: () => void;
  sendPcm: (frame: Int16Array) => boolean;
  finalize: () => boolean;
  stop: () => Promise<void>;
  closeAfterEnded: () => void;
  clientClosed: boolean;
  open: () => void;
  ready: () => void;
  close: (code?: number, reason?: string) => void;
  fail: (message?: string) => void;
};

const { fakeRealtime, fakeCapture, fakeClient } = vi.hoisted(() => {
  const instances: FakeSession[] = [];

  class RealtimeSession {
    didOpen = false;
    isReady = false;
    isActive = false;
    clientClosed = false;
    callbacks: FakeSession["callbacks"];
    authMode?: string;
    credential?: string;
    constructor(
      _url: string,
      credential: string,
      _config: unknown,
      callbacks: FakeSession["callbacks"],
      options: { authMode?: string } = {},
    ) {
      this.callbacks = callbacks;
      this.authMode = options.authMode;
      this.credential = credential;
      instances.push(this);
    }
    connect() {
      // 默认保持 CONNECTING，由测试显式打开。
    }
    sendPcm() {
      return this.isReady;
    }
    finalize() {
      return false;
    }
    async stop() {
      return undefined;
    }
    closeAfterEnded() {
      return undefined;
    }
    open() {
      this.didOpen = true;
      this.isActive = true;
      this.callbacks.onOpen?.();
    }
    ready() {
      this.isReady = true;
      this.callbacks.onEvent({ type: "session.ready" });
    }
    close(code = 1006, reason = "") {
      this.isActive = false;
      this.isReady = false;
      this.callbacks.onClose?.(code, reason);
    }
    fail(message = "云端课堂连接失败，请检查网络后重试。") {
      this.callbacks.onError?.(new Error(message));
      this.close(1006);
    }
  }

  return {
    fakeRealtime: { RealtimeSession, instances },
    fakeCapture: {
      requestMicrophone: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
      startPcmCapture: vi.fn(async (_stream: unknown, _options: { onFrame: (frame: Int16Array) => void }) => ({
        backend: "worklet" as const,
        paused: false,
        setPaused: vi.fn(),
        stop: vi.fn(async () => undefined),
      })),
      createClassroomAudioContext: vi.fn(() => ({
        state: "running",
        close: vi.fn(async () => undefined),
        resume: vi.fn(async () => undefined),
      })),
    },
    fakeClient: {
      deviceToken: vi.fn(async () => "test-token"),
      realtimeTicket: vi.fn(async () => "test-ticket"),
      accountStatus: vi.fn(async () => ({ activated: true })),
      realtimeUrl: () => "wss://gateway.test/v2/lecsync/realtime",
    },
  };
});

vi.mock("./audio/realtime", () => ({
  RealtimeSession: fakeRealtime.RealtimeSession,
  closeReason: (code: number) => (code === 4401 ? "云端课堂鉴权失败，请刷新页面后重试。" : null),
}));

vi.mock("./audio/capture", () => fakeCapture);

vi.mock("./api/client", async () => {
  const actual = await vi.importActual<typeof import("./api/client")>("./api/client");
  return {
    ...actual,
    zhixi: fakeClient,
    sleep: vi.fn(async () => undefined),
  };
});

vi.mock("./offline/engine", () => ({
  getOfflineEngine: () => ({
    isReady: true,
    ensureReady: async () => undefined,
    start: () => undefined,
    feed: () => undefined,
    stop: () => null,
  }),
}));

import { ClassroomController } from "./classroom";
import { db } from "./db/db";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const controllers: ClassroomController[] = [];
function createController() {
  const controller = new ClassroomController();
  controllers.push(controller);
  return controller;
}

const START_OPTIONS = {
  courseId: null,
  courseName: "测试课",
  sourceLanguages: ["en", "zh"],
  translateDirection: ["en", "zh"] as [string, string],
  speakerAttribution: false,
  glossaryTerms: [],
  liveMinutes: false,
  mode: "cloud" as const,
};

const IOS_WECHAT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50 NetType/WIFI Language/zh_CN";

describe("ClassroomController 云端连接相位", () => {
  beforeEach(async () => {
    await db.sessions.clear();
    fakeRealtime.instances.length = 0;
    fakeClient.deviceToken.mockClear();
    fakeClient.realtimeTicket.mockClear();
    fakeClient.accountStatus.mockClear();
    fakeCapture.requestMicrophone.mockClear();
    fakeCapture.startPcmCapture.mockClear();
    fakeCapture.createClassroomAudioContext.mockClear();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Chrome/131.0.0.0" });
  });

  afterEach(async () => {
    for (const controller of controllers.splice(0)) await controller.stop();
    vi.unstubAllGlobals();
  });

  it("等待首张 ticket 时停止，不再建连或启动采集且关闭本地会话", async () => {
    vi.stubGlobal("navigator", { userAgent: IOS_WECHAT });
    const ticket = deferred<string>();
    fakeClient.realtimeTicket.mockImplementationOnce(() => ticket.promise);
    const controller = createController();
    const start = controller.start(START_OPTIONS);
    await vi.waitFor(() => expect(fakeClient.realtimeTicket).toHaveBeenCalledOnce());
    expect(fakeCapture.requestMicrophone.mock.invocationCallOrder[0]).toBeLessThan(
      fakeClient.realtimeTicket.mock.invocationCallOrder[0]!,
    );
    await controller.stop();
    ticket.resolve("late-ticket");
    await start;
    expect(fakeRealtime.instances).toHaveLength(0);
    expect(fakeCapture.startPcmCapture).not.toHaveBeenCalled();
    expect(controller.getSnapshot().phase).toBe("ended");
    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.endedAtMillis).not.toBeNull();
  });

  it("采集器还在初始化时暂停，返回后仍静音且不发送音频", async () => {
    const capture = deferred<Awaited<ReturnType<typeof fakeCapture.startPcmCapture>>>();
    fakeCapture.startPcmCapture.mockImplementationOnce(() => capture.promise);
    const controller = createController();
    const start = controller.start(START_OPTIONS);
    await vi.waitFor(() => expect(fakeCapture.startPcmCapture).toHaveBeenCalledOnce());
    const realtime = fakeRealtime.instances[0]!;
    const send = vi.spyOn(realtime, "sendPcm");
    realtime.open();
    realtime.ready();
    await controller.pause();
    const handle = { backend: "worklet" as const, paused: false, setPaused: vi.fn(), stop: vi.fn(async () => undefined) };
    capture.resolve(handle);
    await start;
    expect(handle.setPaused).toHaveBeenCalledWith(true);
    expect(controller.getSnapshot().phase).toBe("paused");
    fakeCapture.startPcmCapture.mock.calls[0]![1].onFrame(new Int16Array([1, 2]));
    expect(send).not.toHaveBeenCalled();
    await controller.resume();
    fakeCapture.startPcmCapture.mock.calls[0]![1].onFrame(new Int16Array([1, 2]));
    expect(send).toHaveBeenCalledOnce();
  });

  it("账号检查尚未返回时停止，也立即释放已授权的麦克风", async () => {
    const status = deferred<{ activated: boolean }>();
    const trackStop = vi.fn();
    fakeCapture.requestMicrophone.mockResolvedValueOnce({ getTracks: () => [{ stop: trackStop }] });
    fakeClient.accountStatus.mockImplementationOnce(() => status.promise);
    const controller = createController();
    const start = controller.start(START_OPTIONS);
    await vi.waitFor(() => expect(fakeClient.accountStatus).toHaveBeenCalledOnce());
    await controller.stop();
    expect(trackStop).toHaveBeenCalled();
    status.resolve({ activated: true });
    await start;
    expect(fakeRealtime.instances).toHaveLength(0);
    expect(await db.sessions.count()).toBe(0);
  });

  it("旧 ticket 请求失败时不能结束后来启动的新课", async () => {
    vi.stubGlobal("navigator", { userAgent: IOS_WECHAT });
    const ticket = deferred<string>();
    fakeClient.realtimeTicket.mockImplementationOnce(() => ticket.promise);
    const controller = createController();
    const firstStart = controller.start(START_OPTIONS);
    await vi.waitFor(() => expect(fakeClient.realtimeTicket).toHaveBeenCalledOnce());
    await controller.stop();
    await controller.start(START_OPTIONS);
    const sessionId = controller.getSnapshot().sessionId;
    ticket.reject(new Error("late failure"));
    await firstStart;
    expect(controller.getSnapshot().sessionId).toBe(sessionId);
    expect(controller.getSnapshot().phase).toBe("connecting");
    expect(fakeRealtime.instances).toHaveLength(1);
  });

  it("ticket 签发失败时释放麦克风并关闭未完成会话", async () => {
    vi.stubGlobal("navigator", { userAgent: IOS_WECHAT });
    const trackStop = vi.fn();
    fakeCapture.requestMicrophone.mockResolvedValueOnce({ getTracks: () => [{ stop: trackStop }] });
    fakeClient.realtimeTicket.mockRejectedValueOnce(new Error("ticket unavailable"));
    const controller = createController();
    await expect(controller.start(START_OPTIONS)).rejects.toThrow("ticket unavailable");
    expect(trackStop).toHaveBeenCalled();
    expect(fakeRealtime.instances).toHaveLength(0);
    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.endedAtMillis).not.toBeNull();
  });

  it("降级取 ticket 期间停止后开新课，旧响应不能重连或覆盖新课", async () => {
    const controller = createController();
    await controller.start(START_OPTIONS);
    const ticket = deferred<string>();
    fakeClient.realtimeTicket.mockImplementationOnce(() => ticket.promise);
    const oldConnection = fakeRealtime.instances[0]!;
    oldConnection.fail();
    await vi.waitFor(() => expect(fakeClient.realtimeTicket).toHaveBeenCalledOnce());
    await controller.stop();
    await controller.start(START_OPTIONS);
    const newSessionId = controller.getSnapshot().sessionId;
    ticket.resolve("old-ticket");
    await new Promise((resolve) => setTimeout(resolve, 0));
    oldConnection.ready();
    expect(fakeRealtime.instances).toHaveLength(2);
    expect(controller.getSnapshot().phase).toBe("connecting");
    expect(controller.getSnapshot().sessionId).toBe(newSessionId);
  });

  it("query 断线重连重新签发 ticket，不能复用前一张", async () => {
    vi.stubGlobal("navigator", { userAgent: IOS_WECHAT });
    fakeClient.realtimeTicket.mockResolvedValueOnce("first-ticket").mockResolvedValueOnce("second-ticket");
    const controller = createController();
    await controller.start(START_OPTIONS);
    fakeRealtime.instances[0]!.open();
    fakeRealtime.instances[0]!.ready();
    fakeRealtime.instances[0]!.close();
    await vi.waitFor(() => expect(fakeRealtime.instances).toHaveLength(2));
    expect(fakeRealtime.instances.map((session) => session.credential)).toEqual(["first-ticket", "second-ticket"]);
  });

  it("重连等待 ticket 时停止，不会再建连接", async () => {
    vi.stubGlobal("navigator", { userAgent: IOS_WECHAT });
    const controller = createController();
    await controller.start(START_OPTIONS);
    const ticket = deferred<string>();
    fakeClient.realtimeTicket.mockImplementationOnce(() => ticket.promise);
    fakeRealtime.instances[0]!.open();
    fakeRealtime.instances[0]!.ready();
    fakeRealtime.instances[0]!.close();
    await vi.waitFor(() => expect(fakeClient.realtimeTicket).toHaveBeenCalledTimes(2));
    await controller.stop();
    ticket.resolve("late-reconnect-ticket");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fakeRealtime.instances).toHaveLength(1);
    expect(controller.getSnapshot().phase).toBe("ended");
  });

  it("麦克风就绪后仍保持 connecting，直到 session.ready 才进入 listening", async () => {
    const controller = createController();
    const phases: string[] = [];
    controller.subscribe({ onSnapshot: (snapshot) => phases.push(snapshot.phase) });

    await controller.start(START_OPTIONS);

    expect(controller.getSnapshot().phase).toBe("connecting");
    expect(controller.getSnapshot().statusMessage).toContain("正在连接");
    expect(fakeRealtime.instances).toHaveLength(1);
    expect(fakeRealtime.instances[0]?.authMode).toBe("protocol");
    // 走子协议时仍是长期设备 token，但不会出现在 URL 里。
    expect(fakeRealtime.instances[0]?.credential).toBe("test-token");
    expect(fakeClient.realtimeTicket).not.toHaveBeenCalled();

    fakeRealtime.instances[0]!.open();
    expect(controller.getSnapshot().phase).toBe("connecting");

    fakeRealtime.instances[0]!.ready();
    await Promise.resolve();
    expect(controller.getSnapshot().phase).toBe("listening");
    expect(controller.getSnapshot().statusMessage).toBeNull();
    expect(phases).toContain("connecting");
  });

  it("iOS 微信 UA 首次连接就走 query 鉴权，且 URL 凭据是一次性 ticket", async () => {
    vi.stubGlobal("navigator", { userAgent: IOS_WECHAT });
    const controller = createController();
    await controller.start(START_OPTIONS);
    expect(fakeRealtime.instances[0]?.authMode).toBe("query");
    // 设备 token 绝不能进 URL：query 通道必须换成 ticket 接口签发的短时效凭据。
    expect(fakeRealtime.instances[0]?.credential).toBe("test-ticket");
    expect(fakeClient.realtimeTicket).toHaveBeenCalledTimes(1);
  });

  it("子协议握手从未打开时立即改用 query 兼容模式，且不把 UI 标成听课中", async () => {
    const controller = createController();
    await controller.start(START_OPTIONS);
    expect(fakeRealtime.instances[0]?.authMode).toBe("protocol");

    fakeRealtime.instances[0]!.fail();
    // 降级要重新签发 ticket（异步），等第二条连接建起来再断言。
    await vi.waitFor(() => expect(fakeRealtime.instances).toHaveLength(2));
    expect(controller.getSnapshot().phase).toBe("connecting");
    expect(controller.getSnapshot().statusMessage).toContain("兼容模式");
    expect(fakeRealtime.instances).toHaveLength(2);
    expect(fakeRealtime.instances[1]?.authMode).toBe("query");
    // 降级重连必须重新签发 ticket，不能复用设备 token 或上一张已消费的 ticket。
    expect(fakeRealtime.instances[1]?.credential).toBe("test-ticket");
    expect(fakeClient.realtimeTicket).toHaveBeenCalledTimes(1);
  });
});
