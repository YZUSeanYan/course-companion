import { Link } from 'react-router'
import Reveal from '../components/site/Reveal'
import Waveform from '../components/site/Waveform'
import AppScreenshot from '../components/site/AppScreenshot'
import ClassroomDemo from '../components/site/ClassroomDemo'
import PageHero from '../components/site/PageHero'
import SectionHead from '../components/site/SectionHead'
import CtaBand from '../components/site/CtaBand'
import DarkBand from '../components/site/DarkBand'
import Ribbon from '../components/site/Ribbon'
import { useCountUp } from '../hooks/use-count-up'
import { WEB_APP_URL } from '../lib/release'

/* ---------- 内联 SVG 图标 ---------- */
const iconProps = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'var(--brand)',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const IconEar = (
  <svg {...iconProps}>
    <path d="M6 10a6 6 0 1 1 12 0c0 3-1.5 4.5-3 6s-2.5 3.5-2.5 5" />
    <path d="M9 10a3 3 0 0 1 6 0c0 1.8-1 2.6-2 3.6" />
    <path d="M3.5 13.5c.5 1 1.2 1.8 2 2.4" opacity=".5" />
  </svg>
)
const IconGlobe = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9Z" />
  </svg>
)
const IconBack = (
  <svg {...iconProps}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h9a7 7 0 0 1 7 7v3" />
  </svg>
)
const IconNotes = (
  <svg {...iconProps}>
    <path d="M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M9.5 8h5M9.5 12h5M9.5 16h3" />
  </svg>
)
const IconDoc = (
  <svg {...iconProps}>
    <path d="M9 2.5h6.5L20 7v13a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8 20V4a1.5 1.5 0 0 1 1-1.5Z" transform="translate(-1 0)" />
    <path d="M14.5 2.5V7H19" transform="translate(-1 0)" />
    <path d="M6.5 12.5h7M6.5 16h5" transform="translate(-1 0)" />
  </svg>
)
const IconCards = (
  <svg {...iconProps}>
    <rect x="3" y="7" width="13" height="14" rx="2" />
    <path d="M7.5 3.5H19a2 2 0 0 1 2 2V18" />
  </svg>
)

const PAIN_POINTS = [
  { n: '01', t: '课堂节奏太快', d: '重点还没反应过来，下一页 PPT 已经翻过去了，整节课都在追赶。' },
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

const STATS = [
  { v: 200, prefix: '<', unit: 'ms', decimals: 0, label: '云端实时转写延迟（引擎实测）' },
  { v: 1.25, prefix: '', unit: '%WER', decimals: 2, label: '词错误率，行业领先水平' },
  { v: 71.9, prefix: '', unit: '%', decimals: 1, label: '课堂段落翻译胜率（AI 成对裁判）' },
]

/** 单个实测数字：进入视口后从 0 计到目标值，保留原本的小数位 */
function StatValue({
  value,
  prefix,
  unit,
  decimals,
}: {
  value: number
  prefix: string
  unit: string
  decimals: number
}) {
  const { ref, formatted } = useCountUp(value, decimals)
  return (
    <p className="stat__value accent">
      {prefix}
      <span ref={ref} className="num">{formatted}</span>
      <span className="stat__unit">{unit}</span>
    </p>
  )
}

const SCREENS = [
  { key: 'live-class', label: '实时听课 · 转写与翻译' },
  { key: 'course-detail', label: '学习纪要与疑问' },
  { key: 'vocab', label: '词汇与短语学习' },
  { key: 'review-card', label: '间隔复习' },
] as const

export default function Home() {
  return (
    <div className="page-enter">
      <PageHero
        eyebrow="ZHIXI · CLASSROOM COMPANION"
        title={
          <>
            课上听得懂，
            <br />
            <span className="accent">复习有抓手。</span>
          </>
        }
        lead={
          <>
            知习支持本地离线听课，也可按需开启云端听课；课堂音频或讲义导入后，
            可结合实时翻译、疑问标记与 AI 学习包，把一节课整理成能继续复习的内容。
          </>
        }
        actions={
          <>
            <Link to="/download" className="btn btn--primary">
              获取知习
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M3 8h10M9 4l4 4-4 4" /></svg>
            </Link>
            <a href={WEB_APP_URL} className="btn btn--ghost">
              直接打开网页版
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 3h7v7M13 3 7.5 8.5M9 13H3V7" /></svg>
            </a>
            <a href="#how" className="btn btn--ghost">看看它怎么工作</a>
          </>
        }
        media={
          <div className="relative">
            <AppScreenshot screenshot="live-class" width={318} />
            <div className="float-chip hidden sm:block" style={{ top: -24, left: -104, ['--chip-rot' as string]: '-4deg', maxWidth: 204 }}>
              <div className="flex items-center gap-2">
                <Waveform />
                <p style={{ fontSize: 11, fontWeight: 700 }}>AI 课堂纪要</p>
              </div>
              <p style={{ fontSize: 12.5, fontWeight: 700, marginTop: 5 }}>时域到频域 · 采样定理</p>
            </div>
            <div className="float-chip hidden sm:flex items-center gap-2" style={{ bottom: 40, right: -96, ['--chip-rot' as string]: '3deg', animationDelay: '1.6s' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--ok)" strokeWidth="1.6" aria-hidden><circle cx="7" cy="7" r="5.5" /><path d="M4.5 7.2 6.3 9l3.2-3.6" /></svg>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ok)' }}>AI 翻译 · 双语对照</span>
            </div>
          </div>
        }
      >
        <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2">
          {['本地 / 云端听课', '网页版免安装 · iPhone 也能用', '听课 · 学习 · 复习一体'].map((s) => (
            <span key={s} className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m2.5 7.5 3 3 6-6.5" /></svg>
              {s}
            </span>
          ))}
        </div>
      </PageHero>

      {/* ============ 引擎实测数据 ============ */}
      <section className="band band--surface">
        <div className="container-x">
          <div className="grid gap-6 border-b border-[var(--line)] py-8 sm:grid-cols-3">
            {STATS.map((s, i) => (
              <Reveal key={s.label} delay={i * 0.08}>
                <div className="stat">
                  <StatValue value={s.v} prefix={s.prefix} unit={s.unit} decimals={s.decimals} />
                  <p className="stat__label">{s.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-5">
            <p className="tiny">基于云端引擎官方基准测试；实际表现会因音质、口音、语言与专业词汇而有所不同。</p>
            <Link to="/features#benchmarks" className="small" style={{ color: 'var(--brand-deep)', fontWeight: 700 }}>
              查看完整评测数据 →
            </Link>
          </div>
        </div>
      </section>

      <Ribbon />

      {/* ============ 痛点 ============ */}
      <section className="band band--section">
        <div className="container-x section">
          <SectionHead
            index="01"
            eyebrow="THE PROBLEM"
            title={<>课堂上的三道坎，<br className="hidden sm:block" />卡在每个认真学习的人身上</>}
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {PAIN_POINTS.map((p, i) => (
              <Reveal key={p.n} delay={i * 0.07} className="h-full">
                <div className="card card--hover card--sheen h-full">
                  <p className="num-card__index">{p.n}</p>
                  <p className="h3 mt-4">{p.t}</p>
                  <p className="body-2 mt-3" style={{ fontSize: 14.5 }}>{p.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 工作原理 ============ */}
      <DarkBand id="how" className="radar-bg-dark">
        <div className="container-x section">
          <SectionHead
            index="02"
            eyebrow="HOW IT WORKS"
            align="center"
            title="一节课，从听到复习的完整闭环"
            lead="从老师开口，到复习卡片进入计划——看一遍就懂。"
          />
          <div className="rule-scan mt-10 mb-2" aria-hidden />
          <Reveal delay={0.1} variant="scale" className="mt-10">
            <ClassroomDemo />
          </Reveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-3">
            {[
              { n: '第 1 步', t: '开始听课', d: '首次离线听课前在设置中下载模型，也可主动开启云端听课；录音时边说边出字，可按需开启中文翻译。' },
              { n: '第 2 步', t: '随手标记疑问', d: '没听懂的地方一键标记，自动关联课堂原文与译文；来不及备注时，先存下疑问再说。' },
              { n: '第 3 步', t: '课后生成学习包', d: '按需生成主题化纪要、词汇短语与自测卡，疑问附参考解答，并可进入 FSRS 间隔复习计划。' },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 0.07} className="h-full">
                <div className="card card--dark h-full">
                  <p className="eyebrow eyebrow--plain" style={{ color: 'var(--brand)' }}>{s.n}</p>
                  <p className="h3 mt-3">{s.t}</p>
                  <p className="body-2 mt-3" style={{ fontSize: 14 }}>{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </DarkBand>

      {/* ============ 核心功能 ============ */}
      <section className="band">
        <div className="container-x section">
          <SectionHead
            index="03"
            eyebrow="FEATURES"
            title={<>为课堂而生，<br className="hidden sm:block" />为隐私而设计</>}
            lead="六个能力串成一条链路：听课、整理、复习都在同一个应用里完成。"
            action={<Link to="/features" className="btn btn--ghost btn--sm">全部功能</Link>}
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.t} delay={(i % 3) * 0.07} className="h-full">
                <div className="card card--soft card--hover card--sheen h-full">
                  <span className="card__icon wiggle">
                    <span className="wiggle-target">{f.icon}</span>
                  </span>
                  <p className="h3 mt-5" style={{ fontSize: 18 }}>{f.t}</p>
                  <p className="body-2 mt-2" style={{ fontSize: 14 }}>{f.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.1}>
            <div className="notice notice--brand mt-8">
              <p style={{ fontWeight: 700 }}>
                怎么开始：浏览器打开网页版即可用，无需安装；AI 与云端功能在「设置 → 试用额度」用手机号自助申请并激活，
                一次短信完成，iPhone 用户同样适用。Android 用户也可以下载 App，离线听课在本机完成。
              </p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                <Link to="/apply" style={{ fontWeight: 700, color: 'var(--brand-deep)' }}>了解试用额度 →</Link>
                <a href={WEB_APP_URL} style={{ fontWeight: 700, color: 'var(--brand-deep)' }}>打开网页版 →</a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 界面速览 ============ */}
      <section className="band band--surface">
        <div className="section">
          <div className="container-x">
            <SectionHead
              index="04"
              eyebrow="SCREENS"
              title="界面速览"
              lead="真实产品截图，不是示意图。"
            />
          </div>
          <Reveal delay={0.1} variant="mask">
            <div className="h-scroll mt-10">
              <div className="mx-auto flex items-start gap-6 px-6 pb-4" style={{ width: 'max-content' }}>
                {SCREENS.map((s) => (
                  <div key={s.key} className="flex w-[268px] flex-col items-center gap-4">
                    <AppScreenshot screenshot={s.key} width={268} shadow={false} />
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 隐私原则 ============ */}
      <DarkBand>
        <div className="container-x section">
          <SectionHead
            index="05"
            eyebrow="PRIVACY PRINCIPLES"
            title={<>数据先落地，<br />联网你说了算。</>}
          />
          <div className="mt-10">
            {MANIFESTO.map((m, i) => (
              <Reveal key={m.n} delay={i * 0.05}>
                <div
                  className="grid items-baseline gap-3 py-8 md:grid-cols-[110px_1fr_1.3fr] md:gap-10 privacy-row"
                >
                  <p className="num" style={{ fontSize: 30, fontWeight: 800, color: 'var(--brand)', lineHeight: 1 }}>{m.n}</p>
                  <p className="h3">{m.t}</p>
                  <p className="body-2" style={{ fontSize: 14.5 }}>{m.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.1}>
            <Link to="/privacy" className="btn btn--on-dark mt-8">
              阅读完整隐私政策
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M3 8h10M9 4l4 4-4 4" /></svg>
            </Link>
          </Reveal>
        </div>
      </DarkBand>

      <CtaBand />
    </div>
  )
}
