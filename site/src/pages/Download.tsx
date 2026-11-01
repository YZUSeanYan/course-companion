import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import Reveal from '../components/site/Reveal'
import LogoMark from '../components/site/LogoMark'
import PageHero from '../components/site/PageHero'
import SectionHead from '../components/site/SectionHead'
import CtaBand from '../components/site/CtaBand'
import { APK_SHA256, CURRENT_RELEASE, LEGACY_RELEASE, WEB_APP_URL } from '../lib/release'

const LEGACY_COUNT_URL = '/api/downloads/count'
const LEGACY_INCREMENT_URL = '/api/downloads/increment'

const STORES = [
  { name: '知习官网直链', status: `v${CURRENT_RELEASE.version} ${CURRENT_RELEASE.channel}`, live: true },
  { name: '小米应用商店', status: '审核筹备中', live: false },
  { name: '华为应用市场', status: '计划中', live: false },
]

const SPECS = [
  { k: '当前版本', v: `${CURRENT_RELEASE.productName} v${CURRENT_RELEASE.version}（${CURRENT_RELEASE.channel}）` },
  { k: '系统要求', v: CURRENT_RELEASE.minAndroid },
  { k: '设备架构', v: CURRENT_RELEASE.abi },
  { k: '安装包体积', v: CURRENT_RELEASE.sizeLabel },
  { k: '账号要求', v: '无需注册账号；AI 学习包、翻译、云端听课与文档解析需在「设置 → 试用额度」激活手机号试用额度，离线听课不受影响' },
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
      <PageHero
        align="center"
        top={<div className="wiggle inline-block"><LogoMark size={76} /></div>}
        eyebrow="DOWNLOAD"
        title="选择你的使用方式"
        lead="不想装 App？网页版在电脑、Android 与 iPhone / iPad 的浏览器里都能用，云端听课、讲义导入、AI 学习包与复习计划完整可用。"
        actions={
          <>
            <a href={WEB_APP_URL} className="btn btn--primary btn--lg">
              打开网页版（免安装）
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 3h7v7M13 3 7.5 8.5M9 13H3V7" /></svg>
            </a>
            <a href={CURRENT_RELEASE.apkUrl} download={`zhixi-v${CURRENT_RELEASE.version}.apk`} className="btn btn--ghost btn--lg">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 20h16" /></svg>
              下载 Android 版
            </a>
          </>
        }
      >
        <p className="tiny mt-5">同一手机号可在 App 与网页版共用额度；网页版不需要激活以外任何安装步骤。</p>
      </PageHero>

      {/* ============ App 下载面板 ============ */}
      <section className="band band--surface">
        <div className="container-x section">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <Reveal>
              <SectionHead
                index="01"
                eyebrow="ANDROID APP"
                title={`知习 App v${CURRENT_RELEASE.version}`}
                lead="需要离线听课、课堂录音与本地识别时使用 App；模型按需下载，识别在设备端完成。"
              />
              <div className="card mt-8">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="release-pill">V{CURRENT_RELEASE.version} · {CURRENT_RELEASE.channel}</span>
                  <span className="pill">{CURRENT_RELEASE.sizeLabel}</span>
                  <span className="pill">{CURRENT_RELEASE.minAndroidShort}</span>
                  <span className="pill">{CURRENT_RELEASE.abi}</span>
                </div>
                <a
                  className="btn btn--primary btn--lg btn--block mt-6"
                  href={CURRENT_RELEASE.apkUrl}
                  download={`zhixi-v${CURRENT_RELEASE.version}.apk`}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 20h16" />
                  </svg>
                  下载知习 v{CURRENT_RELEASE.version}
                </a>
                <p className="tiny mt-4">安装包需在系统设置中允许「安装未知来源应用」；SHA-256 见右侧安装须知。</p>
                <div className="notice notice--warn mt-4">
                  <strong>首次离线听课前：</strong>release 版不内置离线识别模型，请先联网进入「设置」下载模型；
                  也可以主动开启云端听课。
                </div>
                <p className="small mt-4">
                  AI 学习包、翻译、云端听课和文档解析需要激活手机号试用额度；App 与网页版都支持激活，
                  网页版还能直接自助申请，一次短信完成。额度按每日次数/时长和有效期管理，多台设备共用；
                  离线听课和本机识别不需要账号。
                </p>
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
                  <Link to="/apply" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--brand-deep)' }}>试用额度怎么获得 →</Link>
                  <a href={WEB_APP_URL} style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--brand-deep)' }}>先用网页版试试 →</a>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              <SectionHead index="02" eyebrow="SPECIFICATIONS" title="安装须知" />
              <div className="rows mt-8">
                {SPECS.map((s) => (
                  <div key={s.k} className="rows__row">
                    <p className="rows__key">{s.k}</p>
                    <p className="rows__val">{s.v}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============ 渠道 + 前代版本 ============ */}
      <section className="band">
        <div className="container-x section">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <SectionHead index="03" eyebrow="WHERE TO GET IT" title="获取渠道" />
              <div className="mt-8 flex flex-col gap-3">
                {STORES.map((s) => (
                  <div key={s.name} className="card flex flex-wrap items-center gap-4" style={{ padding: '16px 20px' }}>
                    <span className="card__icon" style={{ width: 40, height: 40 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 20h16" /></svg>
                    </span>
                    <p style={{ fontSize: 15, fontWeight: 700 }}>{s.name}</p>
                    <span className={`pill ml-auto ${s.live ? 'pill--ok' : ''}`}>{s.status}</span>
                  </div>
                ))}
              </div>
              <p className="small mt-5">
                官网当前提供知习 v{CURRENT_RELEASE.version} {CURRENT_RELEASE.channel} APK 直链。
                应用商店仍在筹备；前代「{LEGACY_RELEASE.productName}」作为独立旧版本保留，不与知习新版混计。
              </p>
            </Reveal>

            <Reveal delay={0.08}>
              <SectionHead index="04" eyebrow="LEGACY" title={`前代「${LEGACY_RELEASE.productName}」`} />
              <div className="card mt-8">
                <p className="body-2" style={{ fontSize: 14 }}>
                  前代纯离线版：内置离线模型，只做课堂转写与提问捕捉，不申请网络权限。
                  它作为独立版本保留，计数不与知习新版混计。
                </p>
                <div className="rows mt-5">
                  {LEGACY_SPECS.map((s) => (
                    <div key={s.k} className="rows__row">
                      <p className="rows__key">{s.k}</p>
                      <p className="rows__val">{s.v}</p>
                    </div>
                  ))}
                </div>
                <a
                  className="btn btn--ghost btn--block mt-5"
                  href={LEGACY_RELEASE.apkUrl}
                  onClick={trackLegacyDownload}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 20h16" />
                  </svg>
                  下载前代 v{LEGACY_RELEASE.version}
                </a>
                {legacyCount !== null && (
                  <p className="tiny mt-3" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="rec-dot" style={{ background: 'var(--brand)' }} />
                    仅前代「{LEGACY_RELEASE.productName}」累计下载 <span className="num">{legacyCount.toLocaleString()}</span> 次
                  </p>
                )}
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <div className="notice notice--warn mt-10">
              <strong>温馨提示：</strong>长时间录音受系统后台策略影响，请按 App 内引导设置自启动与电池优化，并在正式上课前做一次短时测试。
              课堂录音请先取得任课教师许可，不要在禁止录音或涉密场所使用。
            </div>
          </Reveal>
        </div>
      </section>

      <CtaBand
        eyebrow="NO INSTALL NEEDED"
        title={<>不装 App，<br />也能把课上完。</>}
        lead="网页版在浏览器里运行，iPhone / iPad 同样可用；AI 与云端功能在「设置 → 试用额度」自助申请并激活，一次短信完成。"
      >
        <a href={WEB_APP_URL} className="btn btn--light btn--lg">打开网页版</a>
        <Link to="/apply" className="btn btn--on-dark btn--lg">了解试用额度</Link>
      </CtaBand>
    </div>
  )
}
