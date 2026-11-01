import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import Reveal from '../components/site/Reveal'
import PageHero from '../components/site/PageHero'
import SectionHead from '../components/site/SectionHead'
import CtaBand from '../components/site/CtaBand'
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

const STEPS = [
  { n: '01', t: '在网页版里直接申请（推荐）', d: '打开网页版 →「设置 → 试用额度」→ 输入手机号获取验证码。手机号还没有额度时会自动开通，验证通过即完成激活，一次短信搞定，iPhone 也能用。' },
  { n: '02', t: '或在这里填写姓名与手机号', d: '验证码由阿里云号码认证短信发送，5 分钟内有效。受国内备案个人主体限制，短信签名开头显示【恒创联众】，请正常接收。' },
  { n: '03', t: '回到网页版 / App 激活', d: '已提交过申请的手机号，在「设置 → 试用额度」获取激活验证码即可。同一手机号在 App 与网页版共用额度。' },
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

  let formCard: ReactNode
  if (result) {
    formCard = (
      <div className="card" style={{ padding: 28 }}>
        <span className="card__icon" style={{ width: 52, height: 52, fontSize: 24, fontWeight: 800, color: 'var(--brand-deep)' }}>✓</span>
        <h2 className="h3 mt-5" style={{ fontSize: 24 }}>申请成功</h2>
        <p className="body-2 mt-2">
          <span className="num">{result.phoneMasked}</span> 已加入试用名单，有效期至 {result.validUntil}。
        </p>
        <div className="rows mt-5">
          <div className="rows__row">
            <p className="rows__key">AI 学习包</p>
            <p className="rows__val">{result.limits.aiPacksPerDay} 次 / 天</p>
          </div>
          <div className="rows__row">
            <p className="rows__key">云端音频</p>
            <p className="rows__val">{result.limits.audioMinutesPerDay} 分钟 / 天</p>
          </div>
          <div className="rows__row">
            <p className="rows__key">翻译字符</p>
            <p className="rows__val num">{result.limits.textCharactersPerDay.toLocaleString()} / 天</p>
          </div>
          <div className="rows__row">
            <p className="rows__key">文档解析</p>
            <p className="rows__val">{result.limits.documentsPerDay} 次 / 天 · 最多 {result.limits.maxDevices} 台设备</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <a href={WEB_APP_URL} className="btn btn--primary btn--block">
            第 1 步 · 打开网页版激活
          </a>
          <Link to="/download" className="btn btn--ghost btn--block">
            或下载知习 App v{CURRENT_RELEASE.version}
          </Link>
        </div>
        <p className="small mt-5">
          网页版：进入「设置 → 试用额度」，用刚才的手机号获取激活验证码即可，免安装。
          App：安装后在同样的入口激活。一个手机号可在多台设备与网页版共用同一份额度。
        </p>
      </div>
    )
  } else {
    formCard = (
      <div className="card" style={{ padding: 28 }}>
        <form onSubmit={submit}>
          <h2 className="h3" style={{ fontSize: 20 }}>填写申请信息</h2>
          <p className="small mt-2">预计 1 分钟完成。验证码只发送一次，请确认手机号填写正确。</p>
          <div className="notice notice--muted mt-4">
            受国内备案个人主体限制，验证码短信签名开头显示为<strong>【恒创联众】</strong>，
            请正常接收，不要当作营销短信拦截。
          </div>
          {status && !status.smsConfigured ? (
            <div className="notice notice--brand mt-4">
              自助申请通道正在配置短信服务，暂时请联系管理员添加手机号；已有手机号可直接在网页版「设置 → 试用额度」激活。
            </div>
          ) : null}
          <div className="mt-5 grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
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
                  placeholder="App / 网页版内显示"
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
                  className="btn btn--ghost btn--sm"
                  onClick={() => void sendCode()}
                  disabled={!canSend}
                  style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {countdown > 0 ? `${countdown}s` : sending ? '发送中…' : smsReady ? '获取验证码' : '通道配置中'}
                </button>
              </div>
            </label>
            <label className="flex items-start gap-2.5" style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.75 }}>
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
            {error ? <p style={{ fontSize: 13, color: 'var(--alert)' }}>{error}</p> : null}
            {smsUnavailable || alreadyRegistered ? (
              <p className="small">
                {alreadyRegistered
                  ? '该手机号已在试用名单中，可以直接在网页版「设置 → 试用额度」获取激活验证码。'
                  : '自助申请通道正在配置，暂时请联系管理员添加手机号。'}
              </p>
            ) : null}
            {notice ? <p style={{ fontSize: 13, color: 'var(--ok)' }}>{notice}</p> : null}
            <button type="submit" className="btn btn--primary btn--block" disabled={!canSubmit}>
              {submitting ? '提交中…' : smsReady ? '提交申请' : '短信通道配置中'}
            </button>
            <p className="tiny text-center">提交即表示你同意将手机号、姓名和昵称用于试用额度管理。</p>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="page-enter">
      <PageHero
        eyebrow="APPLY"
        title={<>拿到试用额度，<br /><span className="accent">网页版也能直接开通</span></>}
        lead="验证手机号后自动开通，不需要等待人工审核。默认每天 5 个 AI 学习包、30 分钟云端音频，有效期 2 个月。"
        media={formCard}
      >
        <div className="mt-8 flex flex-col gap-5">
          {STEPS.map((step) => (
            <div key={step.n} className="flex gap-4">
              <span className="num-card__index" style={{ minWidth: 26, paddingTop: 3 }}>{step.n}</span>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700 }}>{step.t}</p>
                <p className="small mt-1">{step.d}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="notice notice--muted mt-8 max-w-xl">
          手机号仅用于短信验证和试用额度管理，不用于登录、营销或课堂内容关联；服务端加密保存，只有管理员可查看。
          名额仅供本人使用，请勿转借。
        </div>
        <div className="mt-6">
          <a href={WEB_APP_URL} className="btn btn--primary">
            去网页版直接申请
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 3h7v7M13 3 7.5 8.5M9 13H3V7" /></svg>
          </a>
        </div>
      </PageHero>

      {/* ============ 试用规则 ============ */}
      <section className="band band--surface">
        <div className="container-x section">
          <SectionHead
            eyebrow="TRIAL RULES"
            title="试用规则"
            lead="额度按每日次数与有效期管理，多台设备与网页版共用同一份额度。"
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {RULES.map((rule, index) => (
              <Reveal key={rule.t} delay={index * 0.05} className="h-full">
                <div className="card card--soft card--hover h-full">
                  <p className="h3" style={{ fontSize: 17 }}>{rule.t}</p>
                  <p className="body-2 mt-2" style={{ fontSize: 14 }}>{rule.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand
        eyebrow="ALREADY HAVE A CODE"
        title={<>额度已经到手？<br />两分钟就能开始。</>}
        lead="打开网页版，在「设置 → 试用额度」用手机号激活；想要本地离线听课，再装 Android App 即可。"
      />
    </div>
  )
}
