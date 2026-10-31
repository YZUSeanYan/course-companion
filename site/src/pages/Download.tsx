import { useEffect, useState } from 'react'
import Reveal from '../components/site/Reveal'
import LogoMark from '../components/site/LogoMark'
import { APK_SHA256, CURRENT_RELEASE, LEGACY_RELEASE } from '../lib/release'

const LEGACY_COUNT_URL = '/api/downloads/count'
const LEGACY_INCREMENT_URL = '/api/downloads/increment'

const STORES = [
  { name: '知习官网直链', status: `v${CURRENT_RELEASE.version} ${CURRENT_RELEASE.channel}` },
  { name: '小米应用商店', status: '审核筹备中' },
  { name: '华为应用市场', status: '计划中' },
]

const SPECS = [
  { k: '当前版本', v: `${CURRENT_RELEASE.productName} v${CURRENT_RELEASE.version}（${CURRENT_RELEASE.channel}）` },
  { k: '系统要求', v: CURRENT_RELEASE.minAndroid },
  { k: '设备架构', v: CURRENT_RELEASE.abi },
  { k: '安装包体积', v: CURRENT_RELEASE.sizeLabel },
  { k: '账号要求', v: '无需注册或登录；云端服务使用匿名设备令牌鉴权' },
  { k: '离线模型', v: 'release 版不内置模型；首次离线听课前需在设置中联网下载' },
  { k: '联网说明', v: '模型下载、云端听课 / 音频转写、Voice Typing、翻译、文档解析与 AI 学习包需联网' },
  { k: '所需权限', v: '麦克风 · 通知 · 前台服务 · 网络 · 震动；文件通过系统选择器导入' },
  { k: '数据存储', v: '课堂记录默认保存在本机；云端录音默认不保存，可选 30 天云端保留' },
  { k: 'APK SHA-256', v: APK_SHA256 },
]

const LEGACY_SPECS = [
  { k: '版本', v: `${LEGACY_RELEASE.productName} v${LEGACY_RELEASE.version}（${LEGACY_RELEASE.releasedAt}）` },
  { k: '定位', v: '前代纯离线版：课堂转写 + 提问捕捉提醒' },
  { k: '安装包体积', v: `${LEGACY_RELEASE.sizeLabel}（含离线语音模型）` },
  { k: '网络要求', v: '无。该版本不申请网络权限' },
]

export default function Download() {
  const [legacyCount, setLegacyCount] = useState<number | null>(null)

  useEffect(() => {
    fetch(LEGACY_COUNT_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('counter unavailable'))))
      .then((d) => setLegacyCount(Number(d.count) || 0))
      .catch(() => {})
  }, [])

  const trackLegacyDownload = () => {
    fetch(LEGACY_INCREMENT_URL, { method: 'POST', keepalive: true }).catch(() => {})
  }

  return (
    <div className="page-enter">
      <section className="radar-bg">
        <div className="container-x pt-16 pb-16 lg:pt-24 text-center">
          <Reveal className="flex justify-center">
            <div className="wiggle inline-block">
              <LogoMark size={88} />
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="release-pill mt-7">ZHIXI V{CURRENT_RELEASE.version} · {CURRENT_RELEASE.channel}</p>
            <h1 className="display mt-5" style={{ fontSize: 'clamp(36px, 5vw, 58px)' }}>
              获取知习
            </h1>
            <p className="body-2 mt-5 mx-auto max-w-xl" style={{ fontSize: 16 }}>
              本地离线听课与可选云端听课并行，支持音频导入、AI 学习包与间隔复习。
              无需账号，安装后即可按自己的学习方式选择功能。
            </p>
          </Reveal>
          <Reveal delay={0.16}>
            <div className="download-panel glass-card mt-9 mx-auto">
              <a
                className="btn btn-primary"
                href={CURRENT_RELEASE.apkUrl}
                download={`zhixi-v${CURRENT_RELEASE.version}.apk`}
                style={{ padding: '16px 34px', fontSize: 17 }}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 20h16" />
                </svg>
                下载知习 v{CURRENT_RELEASE.version}
              </a>
              <p className="mt-4" style={{ fontSize: 13.5, fontWeight: 750, color: 'var(--ink-2)' }}>
                {CURRENT_RELEASE.channel} · {CURRENT_RELEASE.sizeLabel} · {CURRENT_RELEASE.minAndroidShort} · {CURRENT_RELEASE.abi} · 无需账号
              </p>
              <div className="model-notice mt-5">
                <strong>首次离线听课前：</strong>release 版不内置离线识别模型，请先联网进入「设置」下载模型；
                也可以主动开启云端听课。
              </div>
              <p className="body-2 mt-4" style={{ fontSize: 13, lineHeight: 1.7 }}>
                本版将学习包改为后台生成，网络短暂中断后可继续等待结果，且同一讲义不会重复创建任务；同时保留此前课程列表与复杂图示修复。
              </p>
            </div>

            <div className="mt-7 flex flex-col items-center gap-3">
              <a
                className="btn btn-ghost"
                href={LEGACY_RELEASE.apkUrl}
                onClick={trackLegacyDownload}
                style={{ padding: '12px 26px', fontSize: 14 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 20h16" />
                </svg>
                下载前代「{LEGACY_RELEASE.productName}」v{LEGACY_RELEASE.version}
              </a>
              <p className="body-2" style={{ fontSize: 13 }}>
                前代独立版本 · {LEGACY_RELEASE.sizeLabel} · 内置离线模型 · 纯离线课堂转写与提问捕捉
              </p>
              {legacyCount !== null && (
                <p className="inline-flex items-center gap-2 rounded-full px-4 py-1.5" style={{ fontSize: 12.5, fontWeight: 800, background: 'var(--brand-soft)', color: 'var(--brand-deep)' }}>
                  <span className="rec-dot" style={{ background: 'var(--brand)' }} />
                  仅前代「{LEGACY_RELEASE.productName}」累计下载 {legacyCount.toLocaleString()} 次
                </p>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="hairline-t" style={{ background: 'var(--surface)' }}>
        <div className="container-x py-16 grid gap-12 lg:grid-cols-2">
          <Reveal>
            <p className="mono-label">WHERE TO GET IT</p>
            <h2 className="display mt-4" style={{ fontSize: 'clamp(26px, 3.2vw, 36px)' }}>获取渠道</h2>
            <div className="flex flex-col gap-3 mt-8">
              {STORES.map((s, i) => (
                <Reveal key={s.name} delay={i * 0.06}>
                  <div className="channel-row flex flex-wrap items-center gap-4 rounded-2xl px-5 py-4">
                    <span className="flex shrink-0 items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: 'var(--brand-soft)' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 20h16" /></svg>
                    </span>
                    <p style={{ fontSize: 15, fontWeight: 800 }}>{s.name}</p>
                    <span className="ml-auto rounded-full px-3 py-1" style={{ fontSize: 11, fontWeight: 800, background: 'var(--section)', color: 'var(--ink-2)' }}>
                      {s.status}
                    </span>
                  </div>
                </Reveal>
              ))}
            </div>
            <p className="body-2 mt-6" style={{ fontSize: 13.5 }}>
              官网当前提供知习 v{CURRENT_RELEASE.version} {CURRENT_RELEASE.channel} APK 直链。
              应用商店仍在筹备；前代「{LEGACY_RELEASE.productName}」作为独立旧版本保留，不与知习新版混计。
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <p className="mono-label">SPECIFICATIONS</p>
            <h2 className="display mt-4" style={{ fontSize: 'clamp(26px, 3.2vw, 36px)' }}>安装须知（知习）</h2>
            <div className="spec-card mt-8 rounded-3xl overflow-hidden">
              {SPECS.map((s, i) => (
                <div
                  key={s.k}
                  className="grid sm:grid-cols-[132px_1fr] gap-1.5 sm:gap-4 px-5 sm:px-6 py-4"
                  style={{ background: i % 2 === 0 ? 'var(--bg)' : 'var(--surface)', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
                >
                  <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-2)' }}>{s.k}</p>
                  <p style={{ fontSize: 13.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{s.v}</p>
                </div>
              ))}
            </div>
            <div className="spec-card mt-6 rounded-3xl overflow-hidden">
              <p className="px-5 sm:px-6 py-3" style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)', background: 'var(--section)', letterSpacing: '.06em' }}>
                LEGACY · 前代离线版（独立下载与计数）
              </p>
              {LEGACY_SPECS.map((s) => (
                <div
                  key={s.k}
                  className="grid sm:grid-cols-[132px_1fr] gap-1.5 sm:gap-4 px-5 sm:px-6 py-4"
                  style={{ background: 'var(--bg)', borderTop: '1px solid var(--line)' }}
                >
                  <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-2)' }}>{s.k}</p>
                  <p style={{ fontSize: 13.5, fontWeight: 600 }}>{s.v}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-2xl p-5" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn-line)' }}>
              <p style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--warn-ink)', lineHeight: 1.75 }}>
                <strong>温馨提示：</strong>长时间录音受系统后台策略影响，请按 App 内引导设置自启动与电池优化，并在正式上课前做一次短时测试。
                课堂录音请先取得任课教师许可，不要在禁止录音或涉密场所使用。
              </p>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
