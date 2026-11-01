// 试用额度卡片：激活、状态、今日用量与刷新，对齐 Android AccountSettingsCard。

import { useCallback, useEffect, useState } from "react";
import { zhixi, ZhixiApiError, loadGatewayUrl } from "../lib/api/client";
import type { AccountStatus } from "../lib/api/types";

function maskMessage(error: unknown): string {
  if (error instanceof ZhixiApiError) return error.userMessage;
  if (error instanceof Error) return error.message;
  return String(error);
}

export default function AccountCard({ onChanged }: { onChanged?: (status: AccountStatus | null) => void }) {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setBusy(true);
      const next = await zhixi.accountStatus();
      setStatus(next);
      onChanged?.(next);
      setMessage(null);
    } catch (error) {
      setMessage(maskMessage(error));
    } finally {
      setBusy(false);
    }
  }, [onChanged]);

  useEffect(() => {
    if (loadGatewayUrl()) void refresh();
  }, [refresh]);

  const activate = async () => {
    if (!phone.trim()) {
      setMessage("请输入手机号");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const next = await zhixi.activateAccount(phone.trim());
      setStatus(next);
      setPhone("");
      onChanged?.(next);
      setMessage("激活成功");
    } catch (error) {
      setMessage(maskMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const activated = status?.activated === true;
  const expired = status != null && status.activated === false && status.status === "expired";

  return (
    <div className="glass-card">
      <div className="card-title">
        试用额度
        <button className="btn btn-sm" onClick={() => void refresh()} disabled={busy}>
          刷新
        </button>
      </div>
      {!activated && (
        <>
          <p className="card-desc">
            手机号仅用于额度管理，不用于登录或营销；离线功能无需激活。管理员添加后即可激活。
            <br />
            还没有名额？<a href="https://shuike.seanyan.store/#/apply" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-deep)', fontWeight: 700 }}>去官网申请试用 →</a>
          </p>
          <input
            className="text-input"
            inputMode="numeric"
            placeholder="请输入手机号"
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))}
            disabled={busy}
          />
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => void activate()} disabled={busy}>
              {expired ? "续期激活" : "激活试用额度"}
            </button>
          </div>
        </>
      )}
      {activated && status && (
        <>
          <div className="list-item">
            <span className="muted">手机号</span>
            <span>{status.phoneMasked || "—"}</span>
          </div>
          <div className="list-item">
            <span className="muted">有效期至</span>
            <span>{status.validUntil ?? "—"}</span>
          </div>
          <div className="quota-grid">
            <QuotaCell label="AI 学习包" used={status.usage.aiPacks} limit={status.limits.aiPacksPerDay} />
            <QuotaCell label="云端音频(分)" used={status.usage.audioMinutes} limit={status.limits.audioMinutesPerDay} />
            <QuotaCell label="翻译字符" used={status.usage.textCharacters} limit={status.limits.textCharactersPerDay} />
            <QuotaCell label="文档解析" used={status.usage.documents} limit={status.limits.documentsPerDay} />
          </div>
        </>
      )}
      {message && <p className="muted" style={{ marginBottom: 0 }}>{message}</p>}
    </div>
  );
}

function QuotaCell({ label, used, limit }: { label: string; used: number; limit: number }) {
  const exhausted = used >= limit;
  return (
    <div className="quota-cell">
      <div className={`value ${exhausted ? "pill-warn" : ""}`} style={exhausted ? { color: "var(--danger)" } : undefined}>
        {used}/{limit}
      </div>
      <div className="label">{label}</div>
    </div>
  );
}
