// 试用额度卡片：两步验证码激活、状态、今日用量与刷新，对齐 Android AccountSettingsCard。
// 流程：输入手机号 → 发送验证码（60 秒倒计时禁用）→ 输入 6 位验证码 → 激活试用额度。

import { useEffect, useState } from "react";
import { zhixi, ZhixiApiError, loadGatewayUrl } from "../lib/api/client";
import type { AccountStatus } from "../lib/api/types";

function maskMessage(error: unknown): string {
  if (error instanceof ZhixiApiError) return error.userMessage;
  if (error instanceof Error) return error.message;
  return String(error);
}

export default function AccountCard({
  onChanged,
  onActivated,
}: {
  onChanged?: (status: AccountStatus | null) => void;
  /** 仅在激活刚刚成功时触发（与例行刷新区分），用于挂接自动云同步等后续动作。 */
  onActivated?: (status: AccountStatus) => void;
}) {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false); // 是否已进入验证码步骤
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0); // 重发倒计时（秒）
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 倒计时：每秒递减到 0。
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const refresh = async () => {
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
  };

  useEffect(() => {
    if (loadGatewayUrl()) void refresh();
    // 仅挂载时拉取一次账号状态，避免父组件回调身份变化导致重复请求。
  }, []);

  const phoneReady = phone.trim().length === 11;

  const sendCode = async () => {
    if (!phoneReady) {
      setMessage("请输入 11 位手机号");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await zhixi.requestActivationCode(phone.trim());
      setPhoneMasked(result.phoneMasked);
      setCooldown(result.cooldownSeconds > 0 ? result.cooldownSeconds : 60);
      setCodeSent(true);
      setMessage(`验证码已发送至 ${result.phoneMasked}，请查收短信`);
    } catch (error) {
      setMessage(maskMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    if (!phoneReady) {
      setMessage("请输入 11 位手机号");
      return;
    }
    if (code.trim().length !== 6) {
      setMessage("请输入 6 位短信验证码");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const next = await zhixi.activateAccountWithCode(phone.trim(), code.trim());
      setStatus(next);
      setPhone("");
      setCode("");
      setCodeSent(false);
      setPhoneMasked(null);
      onChanged?.(next);
      onActivated?.(next);
      setMessage("激活成功");
    } catch (error) {
      setMessage(maskMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const activated = status?.activated === true;
  const expired = status != null && status.activated === false && status.status === "expired";
  const resendLabel = cooldown > 0 ? `重新发送（${cooldown}s）` : "重新发送验证码";

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
          {codeSent && (
            <>
              <p className="card-desc" style={{ marginBottom: 0 }}>
                验证码已发送至 {phoneMasked ?? "你的手机号"}，10 分钟内有效。
              </p>
              <input
                className="text-input"
                inputMode="numeric"
                maxLength={6}
                placeholder="请输入 6 位验证码"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={busy}
              />
            </>
          )}
          <div className="btn-row">
            {!codeSent ? (
              <button className="btn btn-primary" onClick={() => void sendCode()} disabled={busy || !phoneReady || cooldown > 0}>
                {cooldown > 0 ? `发送验证码（${cooldown}s）` : expired ? "发送验证码续期" : "发送验证码"}
              </button>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => void activate()} disabled={busy}>
                  {expired ? "续期激活" : "激活试用额度"}
                </button>
                <button className="btn" onClick={() => void sendCode()} disabled={busy || cooldown > 0}>
                  {resendLabel}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setCodeSent(false);
                    setCode("");
                    setMessage(null);
                  }}
                  disabled={busy}
                >
                  更换手机号
                </button>
              </>
            )}
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
