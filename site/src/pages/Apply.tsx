import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import Reveal from '../components/site/Reveal'
import { CURRENT_RELEASE, WEB_APP_URL } from '../lib/release'

type TrialLimits = {
  aiPacksPerDay: number
  audioMinutesPerDay: number
  textCharactersPerDay: number
  documentsPerDay: number
  maxDevices: number
}

type TrialResult = {
  applied: boolean
  phoneMasked: string
  validUntil: string
  limits: TrialLimits
  message: string
}

type TrialStatus = {
  smsConfigured: boolean
  defaults: TrialLimits
}

const RULES = [
  {
    t: '默认额度',
    d: '每天 5 个 AI 学习包、30 分钟云端音频；翻译字符、文档解析和设备数沿用默认配置。',
  },
  {
    t: '有效期',
    d: '申请成功后 2 个月，按自然月计算；到期后 AI/云端功能会暂停，可联系管理员续期。',
  },
  {
    t: '多设备',
    d: '一个手机号默认可在 3 台设备上激活，共用同一份每日额度，额度每天按北京时间 0 点重置。',
  },
  {
    t: '离线优先',
    d: '离线听课、本机识别和已有学习记录不需要账号；只有 AI 学习包、翻译、云端听课和文档解析需要激活额度。',
  },
]

async function responseMessage(response: Response): Promise<string> {
  const data = await response.json().catch(() => null)
  if (typeof data?.detail === 'string') return data.detail
  return '请求失败，请稍后重试'
}

export default function Apply() {
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [consent, setConsent] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [smsUnavailable, setSmsUnavailable] = useState(false)
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  const [result, setResult] = useState<TrialResult | null>(null)
  const [status, setStatus] = useState<TrialStatus | null>(null)

  useEffect(() => {
    fetch('/api/trial/status')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setStatus(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setInterval(() => {
      setCountdown((value) => (value > 0 ? value - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [countdown])

  const normalizedPhone = phone.replace(/\D/g, '').slice(0, 11)
  const phoneValid = /^1[3-9]\d{9}$/.test(normalizedPhone)
  const codeValid = /^\d{6}$/.test(code)
  const smsReady = status?.smsConfigured ?? true
  const canSend = smsReady && phoneValid && countdown === 0 && !sending
  const canSubmit =
    smsReady &&
    phoneValid &&
    codeValid &&
    name.trim().length > 0 &&
    nickname.trim().length > 0 &&
    consent &&
    !submitting

  async function sendCode() {
    if (!phoneValid) {
      setError('请输入 11 位中国大陆手机号')
      return
    }
    setSending(true)
    setError('')
    setNotice('')
    setSmsUnavailable(false)
    setAlreadyRegistered(false)
    try {
      const response = await fetch('/api/trial/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone }),
      })
      if (!response.ok) {
        if (response.headers.get('X-Zhixi-Error-Code') === 'sms_not_configured') {
          setSmsUnavailable(true)
        }
        if (response.status === 409) setAlreadyRegistered(true)
        setError(await responseMessage(response))
        return
      }
      const data = await response.json()
      setCountdown(Number(data.resendAfterSeconds) || 60)
      setNotice(`验证码已发送至 ${data.phoneMasked}，${Math.round((data.expiresInSeconds || 300) / 60)} 分钟内有效`)
    } catch {
      setError('网络连接失败，请检查网络后重试')
    } finally {
      setSending(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!consent) {
      setError('请先阅读并同意隐私政策与试用规则')
      return
    }
    if (!canSubmit) {
      setError('请完整填写姓名、昵称、手机号和 6 位验证码')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/trial/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalizedPhone,
          code,
          name: name.trim(),
          nickname: nickname.trim(),
          consent: true,
        }),
      })
      if (!response.ok) {
        if (response.headers.get('X-Zhixi-Error-Code') === 'phone_registered') {
          setAlreadyRegistered(true)
        }
        setError(await responseMessage(response))
        return
      }
      setResult(await response.json())
    } catch {
      setError('网络连接失败，请检查网络后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-enter">
      <section className="radar-bg">
        <div className="container-x grid gap-12 lg:grid-cols-[1fr_520px] items-start pt-16 pb-20 lg:pt-24">
          <Reveal>
            <p className="mono-label mono-label--brand">APPLY FOR TRIAL</p>
            <h1 className="display mt-5" style={{ fontSize: 'clamp(36px, 5vw, 60px)' }}>
              申请知习
              <br />
              <span style={{ color: 'var(--brand)' }}>试用名额</span>
            </h1>
            <p className="body-2 mt-6 max-w-lg" style={{ fontSize: 16 }}>
              验证手机号后自动开通，不需要等待人工审核。默认每天 5 个 AI 学习包、30 分钟云端音频，有效期 2 个月。
            </p>
            <div className="mt-8 flex flex-col gap-4">
              {[
                { n: '01', t: '填写姓名、昵称和手机号', d: '姓名与昵称只用于管理员识别和 App 内显示。' },
                { n: '02', t: '获取并输入短信验证码', d: '验证码由阿里云号码认证短信发送，5 分钟内有效。受国内备案个人主体限制，短信签名开头显示【恒创联众】，请正常接收。' },
                { n: '03', t: '自动加入试用名单', d: '申请成功后，用同一手机号在 App 设置中激活即可。' },
              ].map((step) => (
                <div key={step.n} className="flex gap-4">
                  <span className="mono-label mono-label--brand" style={{ minWidth: 28 }}>{step.n}</span>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 800 }}>{step.t}</p>
                    <p className="body-2 mt-1" style={{ fontSize: 13 }}>{step.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-8" style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.8 }}>
              手机号仅用于短信验证和试用额度管理，不用于登录、营销或课堂内容关联；服务端加密保存，只有管理员可查看。
              名额仅供本人使用，请勿转借。
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="glass-card rounded-3xl p-6 sm:p-7">
              {result ? (
                <div>
                  <div
                    className="mx-auto flex items-center justify-center rounded-full"
                    style={{ width: 56, height: 56, background: 'var(--brand-soft)', color: 'var(--brand-deep)', fontSize: 26, fontWeight: 900 }}
                  >
                    ✓
                  </div>
                  <h2 className="display mt-5 text-center" style={{ fontSize: 26 }}>申请成功</h2>
                  <p className="body-2 mt-2 text-center" style={{ fontSize: 14 }}>
                    {result.phoneMasked} 已加入试用名单
                  </p>
                  <div className="mt-5 rounded-2xl px-5 py-4" style={{ background: 'var(--brand-soft)', border: '1px solid rgba(255,103,13,.18)' }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand-deep)' }}>
                      有效期至 {result.validUntil}
                    </p>
                    <p className="body-2 mt-2" style={{ fontSize: 12.5 }}>
                      AI 学习包 {result.limits.aiPacksPerDay} 次/天 · 云端音频 {result.limits.audioMinutesPerDay} 分钟/天
                      <br />
                      翻译字符 {result.limits.textCharactersPerDay.toLocaleString()}/天 · 文档解析 {result.limits.documentsPerDay} 次/天 · 最多 {result.limits.maxDevices} 台设备
                    </p>
                  </div>
                  <div className="mt-5 flex flex-col gap-2">
                    <a href={WEB_APP_URL} className="btn btn-primary justify-center">
                      第 1 步 · 打开网页版直接使用
                    </a>
                    <Link to="/download" className="btn btn-ghost justify-center">
                      或下载知习 App v{CURRENT_RELEASE.version}
                    </Link>
                    <Link to="/features" className="btn btn-ghost justify-center">
                      查看使用说明
                    </Link>
                  </div>
                  <p className="body-2 mt-5" style={{ fontSize: 12, lineHeight: 1.8 }}>
                    网页版：在电脑或手机浏览器打开，进入「设置 → 试用额度」用刚才的手机号激活即可，免安装。
                    App：安装后同样在「设置 → 试用额度」激活。一个手机号可在多台设备与网页版共用同一份额度。
                  </p>
                </div>
              ) : (
                <form onSubmit={submit}>
                  <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>填写申请信息</h2>
                  <p className="body-2 mt-2" style={{ fontSize: 13 }}>
                    预计 1 分钟完成。验证码只发送一次，请确认手机号填写正确。
                  </p>
                  <div
                    className="mt-3 rounded-2xl px-4 py-3"
                    style={{ background: 'rgba(255,255,255,.55)', border: '1px solid rgba(20,20,19,.08)' }}
                  >
                    <p style={{ fontSize: 12.5, lineHeight: 1.8, color: 'var(--ink-3)' }}>
                      受国内备案个人主体限制，验证码短信签名开头显示为
                      <strong style={{ color: 'var(--ink)' }}>【恒创联众】</strong>
                      ，请正常接收，不要当作营销短信拦截。
                    </p>
                  </div>
                  {status && !status.smsConfigured ? (
                    <div className="mt-4 rounded-2xl px-4 py-3" style={{ background: 'var(--brand-soft)', border: '1px solid rgba(255,103,13,.18)' }}>
                      <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-deep)', lineHeight: 1.8 }}>
                        自助申请通道正在配置短信服务，暂时请联系管理员添加手机号；已有手机号可直接在 App 的「设置 → 试用额度」激活。
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-5 grid gap-4">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <label>
                        <span className="apply-label">姓名</span>
                        <input
                          className="apply-field"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder="用于管理员识别"
                          maxLength={30}
                          autoComplete="name"
                        />
                      </label>
                      <label>
                        <span className="apply-label">昵称</span>
                        <input
                          className="apply-field"
                          value={nickname}
                          onChange={(event) => setNickname(event.target.value)}
                          placeholder="App 内显示"
                          maxLength={30}
                        />
                      </label>
                    </div>
                    <label>
                      <span className="apply-label">手机号</span>
                      <input
                        className="apply-field"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 11))}
                        placeholder="11 位中国大陆手机号"
                        inputMode="tel"
                        autoComplete="tel"
                        maxLength={11}
                      />
                    </label>
                    <label>
                      <span className="apply-label">短信验证码</span>
                      <div className="flex gap-2">
                        <input
                          className="apply-field"
                          value={code}
                          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="6 位数字"
                          inputMode="numeric"
                          maxLength={6}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => void sendCode()}
                          disabled={!canSend}
                          style={{ whiteSpace: 'nowrap', padding: '12px 14px', opacity: canSend ? 1 : 0.55 }}
                        >
                          {countdown > 0 ? `${countdown}s` : sending ? '发送中…' : smsReady ? '获取验证码' : '通道配置中'}
                        </button>
                      </div>
                    </label>
                    <label className="flex items-start gap-2.5" style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.7 }}>
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(event) => setConsent(event.target.checked)}
                        style={{ marginTop: 4, accentColor: 'var(--brand)' }}
                      />
                      <span>
                        我已阅读并同意 <Link to="/privacy" style={{ color: 'var(--brand-deep)', fontWeight: 700 }}>隐私政策</Link>
                        与试用规则，并确认手机号由本人使用。
                      </span>
                    </label>
                    {error ? (
                      <p style={{ fontSize: 12.5, color: 'var(--alert)', lineHeight: 1.7 }}>{error}</p>
                    ) : null}
                    {smsUnavailable || alreadyRegistered ? (
                      <p className="body-2" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                        {alreadyRegistered
                          ? '该手机号已在试用名单中，可以直接下载 App 并激活。'
                          : '自助申请通道正在配置，暂时请联系管理员添加手机号。'}
                      </p>
                    ) : null}
                    {notice ? (
                      <p style={{ fontSize: 12.5, color: 'var(--ok)', lineHeight: 1.7 }}>{notice}</p>
                    ) : null}
                    <button
                      type="submit"
                      className="btn btn-primary justify-center"
                      disabled={!canSubmit}
                      style={{ opacity: canSubmit ? 1 : 0.55 }}
                    >
                      {submitting ? '提交中…' : smsReady ? '提交申请' : '短信通道配置中'}
                    </button>
                    <p className="text-center" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                      提交即表示你同意将手机号、姓名和昵称用于试用额度管理。
                    </p>
                  </div>
                </form>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="hairline-t" style={{ background: 'var(--surface)' }}>
        <div className="container-x py-16">
          <Reveal>
            <p className="mono-label">TRIAL RULES</p>
            <h2 className="display mt-4" style={{ fontSize: 'clamp(26px, 3.2vw, 36px)' }}>试用规则</h2>
          </Reveal>
          <div className="grid sm:grid-cols-2 gap-4 mt-8">
            {RULES.map((rule, index) => (
              <Reveal key={rule.t} delay={index * 0.05}>
                <div className="feature-cell h-full rounded-3xl">
                  <p style={{ fontSize: 16, fontWeight: 800 }}>{rule.t}</p>
                  <p className="body-2 mt-2" style={{ fontSize: 13.5 }}>{rule.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
