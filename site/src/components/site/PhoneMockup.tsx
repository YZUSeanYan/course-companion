import Waveform from './Waveform'

export type PhoneScreen = 'live' | 'timeline' | 'history'

const statusBar = (
  <div
    className="flex items-center justify-between px-6"
    style={{ paddingTop: 14, fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}
  >
    <span>16:10</span>
    <span className="flex items-center gap-1.5" style={{ fontSize: 10 }}>
      <svg width="13" height="10" viewBox="0 0 14 10" fill="currentColor"><rect x="0" y="6" width="2.5" height="4" rx="0.5"/><rect x="4" y="4" width="2.5" height="6" rx="0.5"/><rect x="8" y="2" width="2.5" height="8" rx="0.5"/><rect x="12" y="0" width="2.5" height="10" rx="0.5" opacity="0.35"/></svg>
      <span
        className="inline-flex items-center rounded-md px-1"
        style={{ border: '1px solid currentColor', fontSize: 9, fontWeight: 800 }}
      >
        78
      </span>
    </span>
  </div>
)

const recCapsule = (
  <div
    className="mx-4 mt-3 flex items-center gap-2 rounded-full px-3.5 py-2"
    style={{ background: 'var(--alert-soft)' }}
  >
    <span className="rec-dot" />
    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--alert)' }}>正在录音</span>
    <Waveform color="var(--alert)" />
    <span className="ml-auto" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
      00:23
    </span>
  </div>
)

const onDeviceTag = (
  <span
    className="inline-flex items-center gap-1 mt-1.5"
    style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600 }}
  >
    <svg width="11" height="12" viewBox="0 0 12 14" fill="none">
      <rect x="1.5" y="5.5" width="9" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M4 5.5V4a2 2 0 1 1 4 0v1.5" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
    设备端识别 · 原文优先保存
  </span>
)

function LiveScreen() {
  return (
    <>
      {statusBar}
      <div className="px-5 pt-4">
        <p style={{ fontSize: 15, fontWeight: 800 }}>实时课堂记录</p>
      </div>
      {recCapsule}
      <div className="px-5 mt-3">
        <p style={{ fontSize: 12, lineHeight: 1.65, fontWeight: 600 }}>
          Remember,
          <mark style={{ background: 'var(--warn-soft)', color: 'var(--brand-deep)', borderRadius: 3, padding: '0 2px' }}>
            {' '}convolution in time{' '}
          </mark>
          becomes multiplication in frequency.
        </p>
        <p style={{ fontSize: 11.5, lineHeight: 1.65, fontWeight: 600, color: '#3d6fa8', marginTop: 4 }}>
          记住，时域卷积对应频域相乘。
        </p>
        {onDeviceTag}
      </div>

      <div className="mx-4 mt-3 rounded-2xl p-3.5" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
        <p className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 800 }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="var(--brand)"><path d="M8 1.5a3.5 3.5 0 0 1 3.5 3.5c0 1.5-.8 2.4-1.5 3.2-.5.6-.8 1-.8 1.8H6.8c0-.8-.3-1.2-.8-1.8C5.3 7.4 4.5 6.5 4.5 5A3.5 3.5 0 0 1 8 1.5Z"/><path d="M6.6 11.5h2.8v.8a1.4 1.4 0 1 1-2.8 0v-.8Z"/></svg>
          AI 课堂纪要
        </p>
        <div className="mt-2.5 rounded-xl px-3 py-2.5" style={{ background: 'rgba(229,72,77,.08)', border: '1px dashed rgba(229,72,77,.4)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--alert)' }}>
            ✦ 时域到频域
          </p>
          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--alert)', opacity: .75, marginTop: 2 }}>
            傅里叶变换揭示信号的频率成分
          </p>
        </div>
        <div className="mt-2 rounded-xl px-3 py-2.5" style={{ background: 'rgba(229,72,77,.08)', border: '1px dashed rgba(229,72,77,.4)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--alert)' }}>
            ✦ 采样定理
          </p>
          <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--alert)', opacity: .75, marginTop: 2 }}>
            采样率需高于最高频率的两倍
          </p>
        </div>
      </div>

      <div className="mt-auto px-6 pb-5 pt-3 flex items-center justify-between">
        <span className="flex items-center justify-center rounded-full" style={{ width: 46, height: 46, background: 'var(--alert)' }}>
          <svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" rx="3" fill="#fff"/></svg>
        </span>
        <span className="flex items-center justify-center rounded-full" style={{ width: 42, height: 42, background: 'var(--surface)', border: '1px solid var(--line)' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--brand)"><path d="M8 1.5a3.5 3.5 0 0 1 3.5 3.5c0 1.5-.8 2.4-1.5 3.2-.5.6-.8 1-.8 1.8H6.8c0-.8-.3-1.2-.8-1.8C5.3 7.4 4.5 6.5 4.5 5A3.5 3.5 0 0 1 8 1.5Z"/><path d="M6.6 11.5h2.8v.8a1.4 1.4 0 1 1-2.8 0v-.8Z"/></svg>
        </span>
        <span className="flex items-center justify-center rounded-full" style={{ width: 42, height: 42, background: 'var(--surface)', border: '1px solid var(--line)' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round"><path d="M4.5 2.5v9M9.5 2.5v9"/></svg>
        </span>
        <span className="flex items-center justify-center rounded-full" style={{ width: 42, height: 42, background: 'var(--surface)', border: '1px solid var(--line)' }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--ink-2)" strokeWidth="1.6"><path d="M2.5 4h11M6.5 4V2.8a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V4M4 4l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-9"/></svg>
        </span>
      </div>
    </>
  )
}

function TimelineScreen() {
  const items = [
    { t: '09:50', n: '第 7 讲 · 傅里叶变换', tag: '课堂纪要', hot: false },
    { t: '10:05', n: 'convolution · 卷积', tag: '词汇 · 5 项', hot: false },
    { t: '10:12', n: '混叠为什么会让高频变成低频？', tag: '我的疑问 · 已附参考解答', hot: true },
    { t: '10:28', n: '自测问答 · 2 题', tag: '练习', hot: false },
  ]
  return (
    <>
      {statusBar}
      <div className="px-5 pt-4 pb-1 flex items-end justify-between">
        <div>
          <p style={{ fontSize: 15, fontWeight: 800 }}>学习纪要与疑问</p>
          <p style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 2 }}>信号与系统 · 本节课 1 个疑问 · 4 项产出</p>
        </div>
        <span className="rounded-full px-2.5 py-1" style={{ fontSize: 10, fontWeight: 800, background: 'var(--brand-soft)', color: 'var(--brand-deep)' }}>
          学习包
        </span>
      </div>
      <div className="px-5 mt-3 flex flex-col gap-2.5">
        {items.map((it, i) => (
          <div
            key={i}
            className="rounded-2xl p-3"
            style={{
              background: 'var(--surface)',
              border: `1px solid ${it.hot ? 'var(--brand)' : 'var(--line)'}`,
              boxShadow: it.hot ? '0 8px 22px -10px rgba(224,78,0,.35)' : 'none',
            }}
          >
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>{it.t}</span>
              <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--brand-deep)', background: 'var(--brand-soft)', borderRadius: 99, padding: '1px 6px' }}>
                {it.tag}
              </span>
            </div>
            <p style={{ fontSize: 12.5, fontWeight: 700, marginTop: 4, lineHeight: 1.55 }}>{it.n}</p>
          </div>
        ))}
      </div>
      <div className="mt-auto px-6 pb-5 pt-3">
        <div className="rounded-full py-2.5 text-center" style={{ background: 'var(--ink)', color: '#fff', fontSize: 12, fontWeight: 700 }}>
          导出 AI 学习包（Markdown）
        </div>
      </div>
    </>
  )
}

function HistoryScreen() {
  const rows = [
    { d: '10-30 周三', n: '信号与系统 · 第 7 讲', q: 1, len: '90 分钟' },
    { d: '10-25 周五', n: '信号与系统 · 第 6 讲', q: 0, len: '45 分钟' },
    { d: '10-19 周六', n: '六级备考 · 真题讲义', q: 2, len: '学习包' },
  ]
  return (
    <>
      {statusBar}
      <div className="px-5 pt-4">
        <p style={{ fontSize: 15, fontWeight: 800 }}>历史记录</p>
        <p style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 2 }}>保存在本机 · 卸载即清除</p>
      </div>
      <div className="px-5 mt-3 flex flex-col gap-2.5">
        {rows.map((r, i) => (
          <div key={i} className="rounded-2xl p-3.5 flex items-center gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
            <span className="flex items-center justify-center rounded-xl" style={{ width: 38, height: 38, background: 'var(--brand-soft)', color: 'var(--brand-deep)', fontSize: 11, fontWeight: 900 }}>
              {r.q}疑
            </span>
            <div className="flex-1">
              <p style={{ fontSize: 12.5, fontWeight: 700 }}>{r.n}</p>
              <p style={{ fontSize: 10.5, color: 'var(--ink-2)', marginTop: 2 }}>{r.d} · {r.len}</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--ink-3)" strokeWidth="1.8"><path d="M5 2.5 9.5 7 5 11.5"/></svg>
          </div>
        ))}
      </div>
      <div className="mx-4 mt-3 rounded-2xl p-3.5" style={{ background: 'var(--section)' }}>
        <p style={{ fontSize: 11, fontWeight: 700 }}>导出格式</p>
        <div className="flex gap-2 mt-2">
          {['双语记录', '学习包 Markdown', 'TXT'].map((f) => (
            <span key={f} className="rounded-full px-2.5 py-1" style={{ fontSize: 10, fontWeight: 700, background: 'var(--surface)', border: '1px solid var(--line)' }}>
              {f}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-auto" />
    </>
  )
}

export default function PhoneMockup({
  screen = 'live',
  width = 300,
  shadow = true,
}: {
  screen?: PhoneScreen
  width?: number
  shadow?: boolean
}) {
  return (
    <div className="phone" style={{ width, boxShadow: shadow ? undefined : 'none' }}>
      <div className="phone-screen">
        <div className="phone-notch">
          <span className="rec-dot" />
        </div>
        {screen === 'live' && <LiveScreen />}
        {screen === 'timeline' && <TimelineScreen />}
        {screen === 'history' && <HistoryScreen />}
      </div>
    </div>
  )
}
