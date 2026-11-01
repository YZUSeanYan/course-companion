import { Link } from 'react-router'
import Reveal from '../components/site/Reveal'
import Waveform from '../components/site/Waveform'
import PhoneMockup from '../components/site/PhoneMockup'
import ClassroomDemo from '../components/site/ClassroomDemo'
import { CURRENT_RELEASE } from '../lib/release'

/* ---------- 内联 SVG 图标 ---------- */
const IconEar = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round">
    <path d="M6 10a6 6 0 1 1 12 0c0 3-1.5 4.5-3 6s-2.5 3.5-2.5 5" />
    <path d="M9 10a3 3 0 0 1 6 0c0 1.8-1 2.6-2 3.6" />
    <path d="M3.5 13.5c.5 1 1.2 1.8 2 2.4" opacity=".5" />
  </svg>
)
const IconGlobe = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9Z" />
  </svg>
)
const IconBack = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h9a7 7 0 0 1 7 7v3" />
  </svg>
)
const IconNotes = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M9.5 8h5M9.5 12h5M9.5 16h3" />
  </svg>
)
const IconDoc = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 2.5h6.5L20 7v13a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8 20V4a1.5 1.5 0 0 1 1-1.5Z" transform="translate(-1 0)" />
    <path d="M14.5 2.5V7H19" transform="translate(-1 0)" />
    <path d="M6.5 12.5h7M6.5 16h5" transform="translate(-1 0)" />
  </svg>
)
const IconCards = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="7" width="13" height="14" rx="2" />
    <path d="M7.5 3.5H19a2 2 0 0 1 2 2V18" />
  </svg>
)

const PAIN_POINTS = [
  { n: '01', t: '外教语速太快', d: '重点还没反应过来，下一页 PPT 已经翻过去了，整节课都在追赶。' },
  { n: '02', t: '疑问一闪而过', d: '这里有处没听懂，想先标记一下——等下课再回想，已经忘了要问什么。' },
  { n: '03', t: '复习没有头绪', d: '90 分钟的课堂录音和零散笔记，考前根本不知道该从哪里看起。' },
]

const FEATURES = [
  { icon: IconEar, t: '本地 / 云端听课', d: '离线识别在手机本地完成，模型按需下载；也可主动开启云端听课，按课堂环境选择合适方式。' },
  { icon: IconGlobe, t: 'AI 实时翻译', d: '转写定稿后进入独立翻译队列，中英双语对照；网络失败不打断录音，课堂原文优先保存到本机。' },
  { icon: IconBack, t: '一键标记疑问', d: '听课中随时标记没听懂的地方，自动附上课堂原文，可补充备注；来不及写时，一键也能先把疑问留住。' },
  { icon: IconNotes, t: 'AI 学习包', d: '课后按课堂、讲义或备考场景生成纪要、词汇短语、重难点与自测卡；生成后按类型归档，标记的疑问附参考解答。' },
  { icon: IconDoc, t: '音频与讲义导入', d: '导入已有音频整理成课堂记录；PDF / JPG / PNG 讲义可逐页提取文本、保留页图并进行视觉解析。' },
  { icon: IconCards, t: '备考间隔复习', d: '六级等标准词表确定性导入，按资料语境提取词汇，FSRS 安排复习节奏；复习页按词汇、短语、自测和练习分类。' },
]

const MANIFESTO = [
  { n: '01', t: '本地优先，云端可选', d: '离线听课的语音识别在设备端完成；云端听课或音频转写只在你主动开启并确认后处理所选音频。' },
  { n: '02', t: '联网功能清晰可知', d: '模型下载、云端听课、Voice Typing、翻译、文档解析与 AI 学习包需要联网，会按功能处理相应文本、页图或音频。' },
  { n: '03', t: '密钥仅留在服务端', d: 'AI 模型密钥只保存在服务端环境变量中，应用通过匿名设备令牌访问，密钥不会进入安装包。' },
]

export default function Home() {
  return (
    <div className="page-enter">
      {/* ============ HERO ============ */}
      <section className="radar-bg relative overflow-hidden">
        <div
          className="absolute pointer-events-none"
          style={{
            top: -160, right: -120, width: 520, height: 520, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,103,13,.16), transparent 65%)',
          }}
        />
        <div className="container-x grid gap-14 lg:grid-cols-2 items-center pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div>
            <Reveal>
              <p className="mono-label mono-label--brand flex items-center gap-3">
                <Waveform />
                ZHIXI · CLASSROOM LEARNING COMPANION
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="display mt-6" style={{ fontSize: 'clamp(42px, 6vw, 74px)' }}>
                课上听得懂，
                <br />
                <span style={{ color: 'var(--brand)' }}>复习有抓手。</span>
              </h1>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="body-2 mt-6 max-w-md" style={{ fontSize: 17 }}>
                知习支持本地离线听课，也可按需开启云端听课；课堂音频导入后，
                可结合实时翻译、疑问标记与 AI 学习包，把一节课整理成能继续复习的内容。
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="flex flex-wrap items-center gap-4 mt-9">
                <Link to="/download" className="btn btn-primary">
                  获取知习
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
                </Link>
                <a href="#how" className="btn btn-ghost">看看它怎么工作</a>
              </div>
            </Reveal>
            <Reveal delay={0.32}>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-9">
                {['本地 / 云端听课', '音频导入 · AI 学习包', '听课 · 学习 · 复习一体'].map((s) => (
                  <span key={s} className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m2.5 7.5 3 3 6-6.5"/></svg>
                    {s}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.18} className="relative flex justify-center">
            <div className="relative">
              <PhoneMockup screen="live" />
              {/* 浮动徽章 */}
              <div className="float-chip hidden sm:block" style={{ top: -16, left: -132, ['--chip-rot' as string]: '-4deg', padding: '12px 16px', maxWidth: 210 }}>
                <div className="flex items-center gap-2">
                  <Waveform />
                  <p style={{ fontSize: 11, fontWeight: 800 }}>知习 · 课堂有疑问</p>
                </div>
                <p style={{ fontSize: 12.5, fontWeight: 700, marginTop: 5 }}>位移电流是什么意思？</p>
              </div>
              <div className="float-chip hidden sm:flex items-center gap-2" style={{ bottom: 96, right: -72, ['--chip-rot' as string]: '3deg', padding: '10px 14px', animationDelay: '1.2s' }}>
                <span className="rec-dot" />
                <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--alert)' }}>正在录音</span>
                <span style={{ fontSize: 11, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>00:23</span>
              </div>
              <div className="float-chip hidden sm:flex items-center gap-2" style={{ bottom: 24, left: -64, ['--chip-rot' as string]: '-2deg', padding: '10px 14px', animationDelay: '2.1s' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--ok)" strokeWidth="1.6"><circle cx="7" cy="7" r="5.5"/><path d="M4.5 7.2 6.3 9l3.2-3.6"/></svg>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ok)' }}>AI 翻译 · 双语对照</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 痛点 ============ */}
      <section className="hairline-t" style={{ background: 'var(--surface)' }}>
        <div className="container-x py-20">
          <Reveal>
            <p className="mono-label">THE PROBLEM</p>
            <h2 className="display mt-4" style={{ fontSize: 'clamp(30px, 4vw, 46px)' }}>
              外教课的三道坎，卡在每个留学生身上
            </h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-px mt-12" style={{ background: 'var(--line)', border: '1px solid var(--line)' }}>
            {PAIN_POINTS.map((p, i) => (
              <Reveal key={p.n} delay={i * 0.08} className="h-full">
                <div className="h-full p-8" style={{ background: 'var(--bg)' }}>
                  <p className="mono-label mono-label--brand">{p.n}</p>
                  <p className="mt-5" style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em' }}>{p.t}</p>
                  <p className="body-2 mt-3" style={{ fontSize: 14.5 }}>{p.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 工作原理（深色演示） ============ */}
      <section id="how" className="radar-bg-dark" style={{ background: 'var(--dark)' }}>
        <div className="container-x py-24">
          <Reveal className="text-center">
            <p className="mono-label" style={{ color: 'var(--brand)' }}>HOW IT WORKS</p>
            <h2 className="display mt-4" style={{ fontSize: 'clamp(30px, 4vw, 46px)', color: '#fff' }}>
              一节课，从听到复习的完整闭环
            </h2>
            <p className="mt-5 mx-auto max-w-xl" style={{ color: '#999', fontSize: 15.5, lineHeight: 1.8 }}>
              从外教开口，到复习卡片进入计划——看一遍就懂。
            </p>
          </Reveal>
          <Reveal delay={0.12} className="mt-14">
            <ClassroomDemo />
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-6 mt-16 max-w-4xl mx-auto">
            {[
              { n: '第 1 步', t: '开始听课', d: '首次离线听课前在设置中下载模型，也可主动开启云端听课；录音时边说边出字，可按需开启中文翻译。' },
              { n: '第 2 步', t: '随手标记疑问', d: '没听懂的地方一键标记，自动关联课堂原文与译文；来不及备注时，先存下疑问再说。' },
              { n: '第 3 步', t: '课后生成学习包', d: '按需生成主题化纪要、词汇短语与自测卡，疑问附参考解答，并可进入 FSRS 间隔复习计划。' },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 0.08}>
                <div className="rounded-3xl p-7 h-full" style={{ background: 'var(--dark-2)', border: '1px solid var(--dark-line)' }}>
                  <p className="mono-label" style={{ color: 'var(--brand)' }}>{s.n}</p>
                  <p className="mt-4" style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{s.t}</p>
                  <p className="mt-3" style={{ fontSize: 14, color: '#999', lineHeight: 1.75 }}>{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 核心卖点 ============ */}
      <section className="hairline-t" style={{ background: 'var(--section)' }}>
        <div className="container-x py-20">
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="mono-label">FEATURES</p>
              <h2 className="display mt-4" style={{ fontSize: 'clamp(30px, 4vw, 46px)' }}>
                为课堂而生，为隐私而设计
              </h2>
            </div>
            <Link to="/features" className="btn btn-ghost">全部功能</Link>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
            {FEATURES.map((f, i) => (
              <Reveal key={f.t} delay={(i % 3) * 0.08} className="h-full">
                <div className="feature-cell h-full rounded-3xl">
                  <div className="wiggle inline-block">{f.icon}</div>
                  <p className="mt-5" style={{ fontSize: 18, fontWeight: 800 }}>{f.t}</p>
                  <p className="body-2 mt-3" style={{ fontSize: 14 }}>{f.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.1}>
            <div
              className="mt-8 rounded-2xl px-5 py-4"
              style={{ background: 'var(--brand-soft)', border: '1px solid rgba(255,103,13,.18)' }}
            >
              <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--brand-deep)', lineHeight: 1.8 }}>
                <strong>试用说明：</strong>离线听课不需要注册账号；AI 学习包、翻译、云端听课和文档解析需要在「设置 → 试用额度」激活管理员发放的手机号。额度按每日次数/时长和有效期管理，多台设备共用，离线功能不受影响。
              </p>
              <Link to="/apply" className="inline-block mt-2" style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand-deep)' }}>
                没有试用名额？申请试用 →
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 隐私宣言（深色） ============ */}
      <section style={{ background: 'var(--dark)' }}>
        <div className="container-x py-24">
          <Reveal>
            <p className="mono-label" style={{ color: 'var(--brand)' }}>PRIVACY PRINCIPLES</p>
            <h2 className="display mt-4 max-w-2xl" style={{ fontSize: 'clamp(30px, 4vw, 46px)', color: '#fff' }}>
              数据先落地，
              <br />
              联网你说了算。
            </h2>
          </Reveal>
          <div className="mt-14 flex flex-col">
            {MANIFESTO.map((m, i) => (
              <Reveal key={m.n} delay={i * 0.06}>
                <div
                  className="grid md:grid-cols-[120px_1fr_1.2fr] gap-4 md:gap-10 items-baseline py-9"
                  style={{ borderTop: '1px solid var(--dark-line)' }}
                >
                  <p className="display" style={{ fontSize: 40, color: 'var(--brand)' }}>{m.n}</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{m.t}</p>
                  <p style={{ fontSize: 15, color: '#999', lineHeight: 1.8 }}>{m.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.1}>
            <Link to="/privacy" className="btn btn-light mt-8">
              阅读完整隐私政策
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ============ 界面速览 ============ */}
      <section className="hairline-t" style={{ background: 'var(--surface)' }}>
        <div className="py-20">
          <Reveal className="container-x">
            <p className="mono-label">SCREENS</p>
            <h2 className="display mt-4" style={{ fontSize: 'clamp(30px, 4vw, 46px)' }}>界面速览</h2>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="h-scroll mt-12">
              <div className="flex gap-8 px-6 pb-6" style={{ width: 'max-content' }}>
                <div className="flex flex-col items-center gap-4">
                  <PhoneMockup screen="live" width={264} shadow={false} />
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>实时听课 · 转写与翻译</p>
                </div>
                <div className="flex flex-col items-center gap-4 pt-10">
                  <PhoneMockup screen="timeline" width={264} shadow={false} />
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>学习纪要与疑问</p>
                </div>
                <div className="flex flex-col items-center gap-4">
                  <PhoneMockup screen="history" width={264} shadow={false} />
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>历史记录与导出</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 下载 CTA ============ */}
      <section style={{ background: 'var(--brand)' }}>
        <div className="container-x py-20 text-center">
          <Reveal>
            <p className="mono-label" style={{ color: 'rgba(255,255,255,.75)' }}>GET THE APP</p>
            <h2 className="display mt-4" style={{ fontSize: 'clamp(32px, 4.6vw, 52px)', color: '#fff' }}>
              下节课，带上知习。
            </h2>
            <p className="mx-auto mt-5 max-w-md" style={{ color: 'rgba(255,255,255,.85)', fontSize: 15.5, lineHeight: 1.8 }}>
              知习 v{CURRENT_RELEASE.version} {CURRENT_RELEASE.channel} · {CURRENT_RELEASE.minAndroidShort} · {CURRENT_RELEASE.abi} · 离线无需账号 · AI/云端需激活额度
            </p>
            <div className="flex flex-wrap justify-center gap-4 mt-9">
              <Link to="/download" className="btn btn-light" style={{ fontWeight: 800 }}>
                前往下载页
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
