// 课堂启动相位：云端模式必须等到 session.ready 才能标成「听课中」。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeSession = {
  authMode?: string;
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
    constructor(
      _url: string,
      _token: string,
      _config: unknown,
      callbacks: FakeSession["callbacks"],
      options: { authMode?: string } = {},
    ) {
      this.callbacks = callbacks;
      this.authMode = options.authMode;
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
      startPcmCapture: vi.fn(async () => ({
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
  beforeEach(() => {
    fakeRealtime.instances.length = 0;
    fakeClient.deviceToken.mockClear();
    fakeClient.accountStatus.mockClear();
    fakeCapture.requestMicrophone.mockClear();
    fakeCapture.startPcmCapture.mockClear();
    fakeCapture.createClassroomAudioContext.mockClear();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Chrome/131.0.0.0" });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
  });

  it("麦克风就绪后仍保持 connecting，直到 session.ready 才进入 listening", async () => {
    const controller = new ClassroomController();
    const phases: string[] = [];
    controller.subscribe({ onSnapshot: (snapshot) => phases.push(snapshot.phase) });

    await controller.start(START_OPTIONS);

    expect(controller.getSnapshot().phase).toBe("connecting");
    expect(controller.getSnapshot().statusMessage).toContain("正在连接");
    expect(fakeRealtime.instances).toHaveLength(1);
    expect(fakeRealtime.instances[0]?.authMode).toBe("protocol");

    fakeRealtime.instances[0]!.open();
    expect(controller.getSnapshot().phase).toBe("connecting");

    fakeRealtime.instances[0]!.ready();
    await Promise.resolve();
    expect(controller.getSnapshot().phase).toBe("listening");
    expect(controller.getSnapshot().statusMessage).toBeNull();
    expect(phases).toContain("connecting");
  });

  it("iOS 微信 UA 首次连接就走 query 鉴权", async () => {
    vi.stubGlobal("navigator", { userAgent: IOS_WECHAT });
    const controller = new ClassroomController();
    await controller.start(START_OPTIONS);
    expect(fakeRealtime.instances[0]?.authMode).toBe("query");
  });

  it("子协议握手从未打开时立即改用 query 兼容模式，且不把 UI 标成听课中", async () => {
    const controller = new ClassroomController();
    await controller.start(START_OPTIONS);
    expect(fakeRealtime.instances[0]?.authMode).toBe("protocol");

    fakeRealtime.instances[0]!.fail();
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.getSnapshot().phase).toBe("connecting");
    expect(controller.getSnapshot().statusMessage).toContain("兼容模式");
    expect(fakeRealtime.instances).toHaveLength(2);
    expect(fakeRealtime.instances[1]?.authMode).toBe("query");
  });
});
