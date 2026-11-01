// 云课堂断线自动重连的决策测试（线上「几秒后自动结束」的加固）。
import { describe, expect, it } from "vitest";
import { MAX_RECONNECT_ATTEMPTS, reconnectDelayMs, shouldReconnectAfterClose } from "./classroom";

describe("shouldReconnectAfterClose", () => {
  it("瞬时异常关闭（1005/1006）触发重连", () => {
    expect(shouldReconnectAfterClose({ code: 1005, livedMs: 4200, userStopped: false, attempts: 0 })).toBe(true);
    expect(shouldReconnectAfterClose({ code: 1006, livedMs: 4200, userStopped: false, attempts: 2 })).toBe(true);
  });

  it("语义性拒绝不重连（鉴权/额度/限流/时长上限）", () => {
    expect(shouldReconnectAfterClose({ code: 4401, livedMs: 4200, userStopped: false, attempts: 0 })).toBe(false);
    expect(shouldReconnectAfterClose({ code: 4403, livedMs: 4200, userStopped: false, attempts: 0 })).toBe(false);
    expect(shouldReconnectAfterClose({ code: 4429, livedMs: 4200, userStopped: false, attempts: 0 })).toBe(false);
    expect(shouldReconnectAfterClose({ code: 4408, livedMs: 14_400_000, userStopped: false, attempts: 0 })).toBe(false);
  });

  it("用户主动停止不重连", () => {
    expect(shouldReconnectAfterClose({ code: 1005, livedMs: 4200, userStopped: true, attempts: 0 })).toBe(false);
  });

  it("正常关闭且课堂已持续较久视为真实结束", () => {
    expect(shouldReconnectAfterClose({ code: 1000, livedMs: 45 * 60_000, userStopped: false, attempts: 0 })).toBe(false);
    expect(shouldReconnectAfterClose({ code: 1000, livedMs: 4000, userStopped: false, attempts: 0 })).toBe(true);
  });

  it("重连次数达到上限后不再重试", () => {
    expect(
      shouldReconnectAfterClose({ code: 1005, livedMs: 4200, userStopped: false, attempts: MAX_RECONNECT_ATTEMPTS }),
    ).toBe(false);
    expect(
      shouldReconnectAfterClose({ code: 1005, livedMs: 4200, userStopped: false, attempts: MAX_RECONNECT_ATTEMPTS - 1 }),
    ).toBe(true);
  });
});

describe("reconnectDelayMs", () => {
  it("指数退避：1s/2s/4s", () => {
    expect(reconnectDelayMs(1)).toBe(1000);
    expect(reconnectDelayMs(2)).toBe(2000);
    expect(reconnectDelayMs(3)).toBe(4000);
  });
});
