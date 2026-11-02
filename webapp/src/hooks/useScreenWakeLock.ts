// 听课期间保持屏幕常亮（Screen Wake Lock）。
//
// 浏览器没有「后台保活权限」，但可以在页面可见时申请屏幕常亮，避免手机放桌上
// 自动息屏后麦克风被系统挂起。页面切到后台/息屏时锁会被浏览器自动释放，
// 回到前台再重新申请。不支持或用省电模式拒绝时静默降级，不影响录音。

import { useEffect } from "react";

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
}

interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!wakeLock) return;

    let disposed = false;
    let sentinel: WakeLockSentinelLike | null = null;

    const acquire = async () => {
      if (disposed || document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      try {
        sentinel = await wakeLock.request("screen");
        // 申请过程中用户可能已经停止课堂：拿到后立即归还，避免常亮泄漏。
        if (disposed) {
          void sentinel.release().catch(() => undefined);
          sentinel = null;
        }
      } catch {
        // NotAllowedError：省电模式、权限策略或页面不可见；静默降级。
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && (!sentinel || sentinel.released)) {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active]);
}
