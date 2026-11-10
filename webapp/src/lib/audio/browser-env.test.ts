import { describe, expect, it } from "vitest";
import {
  isIOS,
  isWeChatBrowser,
  shouldFallbackFromProtocolAuth,
  shouldUseQueryWebSocketAuth,
  weChatOpenInSafariHint,
} from "./browser-env";

const IOS_WECHAT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x1800323d) NetType/WIFI Language/zh_CN";
const ANDROID_WECHAT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.64 Mobile Safari/537.36 MicroMessenger/8.0.49.2600(0x2800315A)";
const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const DESKTOP_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const WXWORK =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 wxwork/4.1.20";

describe("isWeChatBrowser / isIOS", () => {
  it("识别 iOS / Android 微信和企业微信", () => {
    expect(isWeChatBrowser(IOS_WECHAT)).toBe(true);
    expect(isWeChatBrowser(ANDROID_WECHAT)).toBe(true);
    expect(isWeChatBrowser(WXWORK)).toBe(true);
    expect(isWeChatBrowser(IOS_SAFARI)).toBe(false);
    expect(isWeChatBrowser(DESKTOP_CHROME)).toBe(false);
    expect(isIOS(IOS_WECHAT)).toBe(true);
    expect(isIOS(IOS_SAFARI)).toBe(true);
    expect(isIOS(ANDROID_WECHAT)).toBe(false);
  });
});

describe("shouldUseQueryWebSocketAuth", () => {
  it("微信内置浏览器优先走 query token，避免 Sec-WebSocket-Protocol 被丢弃", () => {
    expect(shouldUseQueryWebSocketAuth(IOS_WECHAT)).toBe(true);
    expect(shouldUseQueryWebSocketAuth(ANDROID_WECHAT)).toBe(true);
    expect(shouldUseQueryWebSocketAuth(WXWORK)).toBe(true);
  });

  it("系统 Safari / 桌面 Chrome 仍走标准子协议", () => {
    expect(shouldUseQueryWebSocketAuth(IOS_SAFARI)).toBe(false);
    expect(shouldUseQueryWebSocketAuth(DESKTOP_CHROME)).toBe(false);
  });
});

describe("shouldFallbackFromProtocolAuth", () => {
  it("子协议握手从未打开时改走 query", () => {
    expect(shouldFallbackFromProtocolAuth({ didOpen: false, alreadyUsedQuery: false })).toBe(true);
  });

  it("已经打开过，或已经用过 query，不再降级", () => {
    expect(shouldFallbackFromProtocolAuth({ didOpen: true, alreadyUsedQuery: false })).toBe(false);
    expect(shouldFallbackFromProtocolAuth({ didOpen: false, alreadyUsedQuery: true })).toBe(false);
  });
});

describe("weChatOpenInSafariHint", () => {
  it("只给微信环境附加「在 Safari 中打开」的指引", () => {
    expect(weChatOpenInSafariHint(IOS_WECHAT)).toContain("Safari");
    expect(weChatOpenInSafariHint(DESKTOP_CHROME)).toBe("");
  });
});
