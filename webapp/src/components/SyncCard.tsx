// 云空间同步卡片：上次同步时间、立即同步与结果提示。
// 同步内容仅学习元数据与文本（课程/学习条目/复习卡/复习记录/课堂元数据/转写文本/疑问/讲义文本），
// 不包含课堂音频，也不包含任何密钥；合并规则为账号级 LWW。

import { useCallback, useEffect, useState } from "react";
import { fullSync, loadLastSyncAt, SYNC_EVENT_NAME } from "../lib/sync/sync";

export default function SyncCard() {
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(() => loadLastSyncAt());

  const refresh = useCallback(() => {
    setLastSyncAt(loadLastSyncAt());
  }, []);

  // 激活成功后的自动同步、学习包落库后的静默同步都会广播该事件，卡片随之刷新。
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    window.addEventListener(SYNC_EVENT_NAME, refresh);
    return () => window.removeEventListener(SYNC_EVENT_NAME, refresh);
  }, [refresh]);

  const runSync = async () => {
    setSyncing(true);
    setStatus("正在同步…");
    const outcome = await fullSync((progress) => setStatus(progress));
    setSyncing(false);
    refresh();
    setStatus(
      outcome.ok
        ? `同步完成：推送 ${outcome.pushed} 条，合并 ${outcome.pulled} 条。`
        : `同步失败：${outcome.message ?? "请稍后重试。"}`,
    );
  };

  return (
    <div className="glass-card">
      <div className="card-title">云空间同步</div>
      <p className="card-desc">
        将课程、学习内容与复习记录同步到你的账号云空间，重装浏览器或换设备后可找回。
        仅同步学习元数据与文本，不包含课堂音频，也不包含任何密钥。
      </p>
      <div className="list-item">
        <span className="muted">上次同步</span>
        <span>{lastSyncAt ? new Date(lastSyncAt).toLocaleString("zh-CN") : "从未同步"}</span>
      </div>
      <div className="btn-row">
        <button className="btn btn-primary" onClick={() => void runSync()} disabled={syncing}>
          {syncing ? "同步中…" : "立即同步"}
        </button>
      </div>
      {status && <p className="muted" style={{ marginBottom: 0 }}>{status}</p>}
    </div>
  );
}
