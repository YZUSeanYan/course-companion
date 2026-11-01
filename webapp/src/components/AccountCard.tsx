// 试用额度卡片：网页版自助「申请 / 激活」一体化，对齐 Android AccountSettingsCard。
// 流程：
//   1. 输入手机号 → 发送验证码
//      · 手机号已开通试用额度 → 走激活通道（/v1/accounts/activate/request-code）
//      · 手机号还没有额度     → 走自助申请（/v1/trial/request-code），验证码通过后开卡并绑定当前浏览器
//   2. 输入 6 位验证码 → 激活成功
// 一次短信即可完成，不需要安装 Android App（iOS 用户同样可用）。

import { useEffect, useState } from "react";
import { zhixi, ZhixiApiError, loadGatewayUrl, describeError } from "../lib/api/client";
import type { AccountStatus } from "../lib/api/types";

type Flow = "activate" | "apply";

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
  const [nickname, setNickname] = useState("");
  const [realName, setRealName] = useState("");
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState<"phone" | "code">("phone"); // 是否已进入验证码步骤
  const [flow, setFlow] = useState<Flow>("activate");
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0); // 重发倒计时（秒）
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setError(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (loadGatewayUrl()) void refresh();
    // 仅挂载时拉取一次账号状态，避免父组件回调身份变化导致重复请求。
  }, []);

  const phoneReady = phone.trim().length === 11;
  const nicknameReady = nickname.trim().length > 0;

  const resetInputs = () => {
    setCode("");
    setStep("phone");
    setPhoneMasked(null);
    setCooldown(0);
  };

  const requestActivationCode = async (phoneValue: string) => {
    const result = await zhixi.requestActivationCode(phoneValue);
    setFlow("activate");
    setPhoneMasked(result.phoneMasked);
    setCooldown(result.cooldownSeconds > 0 ? result.cooldownSeconds : 60);
    setStep("code");
    setMessage(`验证码已发送至 ${result.phoneMasked}，请查收短信`);
  };

  const requestTrialCode = async (phoneValue: string) => {
    const result = await zhixi.requestTrialCode(phoneValue);
    setFlow("apply");
    setPhoneMasked(result.phoneMasked);
    setCooldown(result.resendAfterSeconds > 0 ? result.resendAfterSeconds : 60);
    setStep("code");
    setMessage(
      `验证码已发送至 ${result.phoneMasked}。这个手机号还没有试用额度，验证通过后会自动开通并激活当前浏览器。`,
    );
  };

  const sendCode = async () => {
    if (!phoneReady) {
      setError("请输入 11 位手机号");
      return;
    }
    const phoneValue = phone.trim();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      try {
        // 优先按「已开通」处理：绝大多数回访用户走这条路径。
        await requestActivationCode(phoneValue);
      } catch (err) {
        if (err instanceof ZhixiApiError && err.code === "account_not_found") {
          await requestTrialCode(phoneValue);
          return;
        }
        throw err;
      }
    } catch (err) {
      // 自助申请通道返回 phone_registered 时说明账号已存在（可能是并发申请），退回激活流程。
      if (err instanceof ZhixiApiError && err.code === "phone_registered") {
        try {
          await requestActivationCode(phone.trim());
          return;
        } catch (retryError) {
          setError(describeError(retryError));
          return;
        }
      }
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const applyForTrial = async () => {
    if (!nicknameReady) {
      setError("请填写昵称，方便管理员在后台识别");
      return;
    }
    if (!consent) {
      setError("请先阅读并同意隐私政策与试用规则");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const applied = await zhixi.applyTrial({
        phone: phone.trim(),
        code: code.trim(),
        name: realName.trim() || nickname.trim(),
        nickname: nickname.trim(),
        consent: true,
      });
      if (!applied.deviceBound) {
        setFlow("activate");
        setMessage("试用额度已开通。请再获取一次激活验证码，把当前浏览器绑定到该手机号。");
        setCode("");
        return;
      }
      const next = await zhixi.accountStatus();
      setStatus(next);
      onChanged?.(next);
      onActivated?.(next);
      resetInputs();
      setMessage(`已开通试用额度，有效期至 ${applied.validUntil}，当前浏览器已激活`);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    if (!phoneReady) {
      setError("请输入 11 位手机号");
      return;
    }
    if (code.trim().length !== 6) {
      setError("请输入 6 位短信验证码");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await zhixi.activateAccountWithCode(phone.trim(), code.trim());
      setStatus(next);
      resetInputs();
      onChanged?.(next);
      onActivated?.(next);
      setMessage("激活成功");
    } catch (err) {
      if (err instanceof ZhixiApiError && err.code === "account_not_found") {
        // 之前的判断有误或账号被删除：转到自助申请。
        setFlow("apply");
        setMessage("该手机号还没有试用额度，验证通过后会自动开通并激活当前浏览器。");
        return;
      }
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const activated = status?.activated === true;
  const expired = status != null && status.activated === false && status.status === "expired";
  const resendLabel = cooldown > 0 ? `重新发送（${cooldown}s）` : "重新发送验证码";
  const applying = flow === "apply";

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
            手机号仅用于额度管理，不用于登录或营销。还没有试用额度？在本卡片直接申请，一次短信完成开通与激活，
            不需要安装 App。
          </p>
          <input
            className="text-input"
            inputMode="numeric"
            placeholder="请输入手机号"
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))}
            disabled={busy || step === "code"}
          />
          {step === "code" && (
            <>
              <p className="card-desc" style={{ marginBottom: 0 }}>
                {applying && !phoneMasked
                  ? "验证码已发送，请查收短信"
                  : `验证码已发送至 ${phoneMasked ?? "你的手机号"}，5 分钟内有效。`}
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
              {applying && (
                <>
                  <input
                    className="text-input"
                    placeholder="昵称（App / 网页版内显示，后台识别用）"
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value.slice(0, 30))}
                    disabled={busy}
                  />
                  <input
                    className="text-input"
                    placeholder="姓名（选填，仅管理员可见）"
                    value={realName}
                    onChange={(event) => setRealName(event.target.value.slice(0, 30))}
                    disabled={busy}
                  />
                  <label
                    className="card-desc"
                    style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 0 }}
                  >
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                      style={{ marginTop: 4 }}
                      disabled={busy}
                    />
                    <span>
                      我已阅读并同意{" "}
                      <a href="#/privacy" style={{ color: "var(--accent-deep)", fontWeight: 700 }}>
                        隐私政策
                      </a>
                      与试用规则，确认该手机号由本人使用。验证通过后自动开通试用额度并激活当前浏览器。
                    </span>
                  </label>
                </>
              )}
            </>
          )}
          <div className="btn-row">
            {step === "phone" ? (
              <button
                className="btn btn-primary"
                onClick={() => void sendCode()}
                disabled={busy || !phoneReady || cooldown > 0}
              >
                {cooldown > 0 ? `发送验证码（${cooldown}s）` : expired ? "发送验证码续期" : "发送验证码"}
              </button>
            ) : (
              <>
                <button
                  className="btn btn-primary"
                  onClick={() => void (applying ? applyForTrial() : activate())}
                  disabled={busy || (applying && (!consent || !nicknameReady))}
                >
                  {applying ? "开通并激活" : expired ? "续期激活" : "激活试用额度"}
                </button>
                <button className="btn" onClick={() => void sendCode()} disabled={busy || cooldown > 0}>
                  {resendLabel}
                </button>
                <button className="btn" onClick={resetInputs} disabled={busy}>
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
      {message && !activated && <p className="muted" style={{ marginBottom: 0 }}>{message}</p>}
      {error && (
        <p className="muted" style={{ marginBottom: 0, color: "var(--danger)" }}>
          {error}
        </p>
      )}
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
