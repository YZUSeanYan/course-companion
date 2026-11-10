// 课堂连接相关的浏览器环境判断。
// iOS 微信内置浏览器（WKWebView / MicroMessenger）对 WebSocket 子协议、
// AudioWorklet 的 blob URL、以及用户手势过期后的 getUserMedia / AudioContext.resume()
// 都不完全遵循桌面 Chromium 的行为。

/** 是否为微信内核（含手机微信、企业微信）。Windows 微信同样带 MicroMessenger。 */
export function isWeChatBrowser(userAgent: string): boolean {
  return /MicroMessenger/i.test(userAgent) || /wxwork/i.test(userAgent);
}

/** 是否为 iOS（含 iPadOS 桌面 UA 伪装成 Mac 的情况无法可靠判断，只认明确的 iOS 标记）。 */
export function isIOS(userAgent: string): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent);
}

/**
 * 这类环境经常丢弃或拒绝 `new WebSocket(url, ["bearer", token])` 的
 * Sec-WebSocket-Protocol，导致握手在 CONNECTING 里失败或一直挂起。
 * 网页版应改为把一次性 ticket 放在 query `ticket`、不带子协议：
 * 设备 token 放 URL 会被写进网关和反代的访问日志。
 */
export function shouldUseQueryWebSocketAuth(userAgent: string): boolean {
  return isWeChatBrowser(userAgent);
}

/** 标准子协议握手从未打开过，且还没用过 query 兼容通道时，应立刻改用 query 重试。 */
export function shouldFallbackFromProtocolAuth(input: {
  didOpen: boolean;
  alreadyUsedQuery: boolean;
}): boolean {
  return !input.didOpen && !input.alreadyUsedQuery;
}

/** 连接失败时给微信用户的可执行提示（在系统 Safari 打开通常能绕过内置浏览器限制）。 */
export function weChatOpenInSafariHint(userAgent: string): string {
  if (!isWeChatBrowser(userAgent)) return "";
  return " 若仍失败，可点击右上角「…」选择在 Safari 中打开再试。";
}
