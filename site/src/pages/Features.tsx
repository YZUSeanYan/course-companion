import type { ReactNode } from 'react'
import Reveal from '../components/site/Reveal'
import Waveform from '../components/site/Waveform'
import PageHero from '../components/site/PageHero'
import SectionHead from '../components/site/SectionHead'
import CtaBand from '../components/site/CtaBand'
import BenchmarksSection from '../components/site/BenchmarksSection'
import { Link } from 'react-router'
import { WEB_APP_URL } from '../lib/release'

/* ---------- 统一的插图容器：所有功能插图共用同一套内边距与标题样式 ---------- */
function MiniPanel({
  label,
  dark = false,
  children,
}: {
  label: string
  dark?: boolean
  children: ReactNode
}) {
  return (
    <div className={`card ${dark ? 'card--dark' : 'card--soft'}`} style={{ padding: 24 }}>
      <p className="eyebrow eyebrow--plain" style={dark ? { color: 'var(--brand)' } : undefined}>
        {label}
      </p>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </div>
  )
}

const miniLine = {
  border: '1px solid var(--line)',
  borderRadius: 'var(--r-md)',
  background: '#fff',
  padding: '12px 14px',
} as const

const miniLineDark = {
  border: '1px solid var(--dark-line)',
  borderRadius: 'var(--r-md)',
  background: 'var(--dark)',
  padding: '12px 14px',
} as const

/* ---------- 设备端识别 ---------- */
function AsrIllustration() {
  return (
    <MiniPanel label="ON-DEVICE ASR" dark>
      <div className="flex items-center gap-3 rounded-[var(--r-md)] px-4 py-3" style={{ background: 'var(--dark)', border: '1px solid var(--dark-line)' }}>
        <span className="rec-dot" />
        <Waveform color="var(--brand)" />
        <span className="tiny" style={{ fontFamily: 'var(--font-mono)' }}>16kHz · mono</span>
      </div>
      <div style={miniLineDark}>
        <p style={{ fontSize: 12.5, color: '#e8e8e8', lineHeight: 1.8, fontWeight: 600 }}>
          Good morning everyone, let's start with a quick review of last week's lecture……
        </p>
        <p className="tiny mt-2" style={{ fontFamily: 'var(--font-mono)' }}>流式 Zipformer → Paraformer 定稿 · 设备端推理</p>
      </div>
      <div className="flex items-center justify-between gap-3" style={miniLineDark}>
        <p style={{ fontSize: 12, color: 'var(--on-dark-2)', fontWeight: 600 }}>离线识别模型</p>
        <span className="pill" style={{ background: 'rgba(255,103,13,.16)', borderColor: 'rgba(255,103,13,.3)', color: 'var(--brand)' }}>
          设置中按需下载
        </span>
      </div>
    </MiniPanel>
  )
}

/* ---------- 云端听课与音频导入 ---------- */
function CloudAudioIllustration() {
  return (
    <MiniPanel label="CLOUD LISTENING & AUDIO">
      <div className="flex flex-wrap gap-2">
        {['云端听课', '导入音频', 'Voice Typing'].map((item) => (
          <span key={item} className="pill pill--brand">{item}</span>
        ))}
      </div>
      <div className="audio-route">
        <div className="flex items-center gap-3">
          <span className="audio-route-icon"><Waveform color="var(--brand)" /></span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700 }}>你选择的课堂音频</p>
            <p className="tiny" style={{ marginTop: 2 }}>主动开启或导入并确认</p>
          </div>
        </div>
        <div className="audio-route-line" aria-hidden />
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <div style={miniLine}>
            <p style={{ fontSize: 12, fontWeight: 700 }}>知习服务器</p>
            <p className="tiny" style={{ marginTop: 2 }}>安全转发</p>
          </div>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 9h11M10 5l4 4-4 4" /></svg>
          <div style={miniLine}>
            <p style={{ fontSize: 12, fontWeight: 700 }}>Lecsync</p>
            <p className="tiny" style={{ marginTop: 2 }}>转写与音频智能</p>
          </div>
        </div>
      </div>
      <p className="tiny" style={{ lineHeight: 1.8 }}>
        云端录音默认不保存；只有主动开启云端保留后，音频与转写才保留 30 天，可通过云端任务删除。
      </p>
    </MiniPanel>
  )
}

/* ---------- 翻译队列 ---------- */
function TranslateIllustration() {
  return (
    <MiniPanel label="TRANSLATION QUEUE">
      <div style={miniLine}>
        <p className="tiny" style={{ fontWeight: 700 }}>原文 · 16:10:48</p>
        <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginTop: 3, lineHeight: 1.7 }}>
          So the displacement current is not a real current, but it explains the gap……
        </p>
      </div>
      <div style={{ ...miniLine, background: 'rgba(61,111,168,.08)', border: '1px solid rgba(61,111,168,.3)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#3d6fa8' }}>AI 翻译 · 已生成</p>
        <p style={{ fontSize: 12.5, fontWeight: 600, color: '#2d5378', marginTop: 3, lineHeight: 1.7 }}>
          所以位移电流并不是真实的电流，但它解释了这段空隙……
        </p>
      </div>
      <div className="flex items-center gap-2" style={{ ...miniLine, border: '1px dashed var(--line-2)', background: 'var(--bg)' }}>
        <span aria-hidden>🛡️</span>
        <p className="tiny" style={{ fontWeight: 600 }}>网络中断时：翻译排队等待，录音与原文落库照常进行</p>
      </div>
    </MiniPanel>
  )
}

/* ---------- 标记疑问 ---------- */
function MarkIllustration() {
  return (
    <MiniPanel label="MARK A QUESTION" dark>
      <div className="flex items-center gap-3 rounded-[var(--r-md)] px-4 py-3" style={{ background: 'var(--brand)' }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="#fff" aria-hidden><path d="M8 1.5a3.5 3.5 0 0 1 3.5 3.5c0 1.5-.8 2.4-1.5 3.2-.5.6-.8 1-.8 1.8H6.8c0-.8-.3-1.2-.8-1.8C5.3 7.4 4.5 6.5 4.5 5A3.5 3.5 0 0 1 8 1.5Z" /><path d="M6.6 11.5h2.8v.8a1.4 1.4 0 1 1-2.8 0v-.8Z" /></svg>
        <p style={{ fontSize: 12.5, fontWeight: 700, color: '#fff' }}>标记疑问 · 一键按下</p>
        <span className="tiny ml-auto" style={{ fontFamily: 'var(--font-mono)' }}>16:10:52</span>
      </div>
      <div style={miniLineDark}>
        <p className="tiny" style={{ fontWeight: 700 }}>自动关联课堂原文</p>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#e8e8e8', marginTop: 3, lineHeight: 1.7 }}>
          Who can explain what displacement current means?
        </p>
      </div>
      <div style={{ ...miniLineDark, border: '1px dashed rgba(255,103,13,.45)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)' }}>备注（可选）</p>
        <p style={{ fontSize: 12, color: 'var(--on-dark-2)', marginTop: 3, lineHeight: 1.7 }}>来不及写备注也没关系——先存下来，课后补。</p>
      </div>
    </MiniPanel>
  )
}

/* ---------- AI 学习包 ---------- */
function PackageIllustration() {
  return (
    <MiniPanel label="AI STUDY PACKAGE">
      <div style={{ background: 'var(--dark)', borderRadius: 'var(--r-md)', padding: 16, fontFamily: 'var(--font-mono)' }}>
        <p style={{ fontSize: 11, color: 'var(--on-dark-3)' }}># 电磁场与波 · 10-29 学习包</p>
        <p style={{ fontSize: 11, color: '#e8e8e8', marginTop: 10 }}>## 重难点 · 位移电流</p>
        <p style={{ fontSize: 11, color: 'var(--on-dark-2)', marginTop: 4 }}>定义 / 物理意义 / 与传导电流的区别</p>
        <p style={{ fontSize: 11, color: '#e8e8e8', marginTop: 10 }}>## 疑问解答（你标记于 16:10）</p>
        <p style={{ fontSize: 11, color: 'var(--on-dark-2)', marginTop: 4 }}>Q: 位移电流是什么意思？</p>
        <p style={{ fontSize: 11, color: '#e8e8e8', marginTop: 10 }}>## 自测卡 ×5</p>
        <p style={{ fontSize: 11, color: 'var(--on-dark-2)', marginTop: 4 }}>「位移电流」→ 已进入明天复习计划</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {['课堂纪要', '讲义纪要', '备考纪要', 'Markdown 导出'].map((f) => (
          <span key={f} className="pill pill--brand">{f}</span>
        ))}
      </div>
    </MiniPanel>
  )
}

/* ---------- 文档解析 ---------- */
function DocIllustration() {
  const rows = [
    { p: '第 1 页 · 文字版讲义', s: '原生文本直接提取', ok: true },
    { p: '第 2 页 · 公式截图', s: '原图保留 + 视觉模型解析', ok: true },
    { p: '第 3 页 · 手写推导', s: '原图保留，标记待视觉解析', ok: false },
  ]
  return (
    <MiniPanel label="DOCUMENT PARSING">
      {rows.map((r) => (
        <div key={r.p} className="flex items-center gap-4" style={miniLine}>
          <div className="flex-1">
            <p style={{ fontSize: 13, fontWeight: 700 }}>{r.p}</p>
            <p className="tiny" style={{ marginTop: 2 }}>{r.s}</p>
          </div>
          <span className={`pill ${r.ok ? 'pill--brand' : ''}`}>{r.ok ? '已解析' : '原图兜底'}</span>
        </div>
      ))}
      <p className="tiny" style={{ lineHeight: 1.8 }}>
        OCR 提取不到结构时，保留页面原图而不是伪造内容——解析不上的部分，宁可让你亲眼看到原题。
      </p>
    </MiniPanel>
  )
}

/* ---------- 间隔复习 ---------- */
function ReviewIllustration() {
  const rows = [
    { t: '位移电流 · 定义', d: '今天', hot: true },
    { t: 'Maxwell 方程组 · 自测', d: '明天', hot: false },
    { t: '边界条件 · 易错点', d: '3 天后', hot: false },
    { t: 'CET-6 高频词 · Unit 4', d: '5 天后', hot: false },
  ]
  return (
    <MiniPanel label="FSRS REVIEW PLAN">
      {rows.map((r) => (
        <div key={r.t} className="flex items-center gap-4" style={miniLine}>
          <p className="flex-1" style={{ fontSize: 13.5, fontWeight: 700 }}>{r.t}</p>
          <span className={`pill ${r.hot ? '' : ''}`} style={r.hot ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff' } : undefined}>
            {r.d}
          </span>
        </div>
      ))}
      <p className="tiny" style={{ lineHeight: 1.8 }}>
        按 FSRS 间隔重复算法安排复习节奏，支持 TTS 跟读；词汇按讲义语境提取，不脱离课堂。
      </p>
    </MiniPanel>
  )
}

/* ---------- 分类归档 ---------- */
const CATEGORY_GROUPS = [
  { t: '课堂纪要', n: 1 },
  { t: '我的疑问', n: 2 },
  { t: '重点与摘要', n: 4 },
  { t: '词汇', n: 12 },
  { t: '短语', n: 5 },
  { t: '自测问答', n: 6 },
  { t: '练习', n: 8 },
]

function CategoryIllustration() {
  return (
    <MiniPanel label="ORGANIZED BY TYPE">
      <div className="grid grid-cols-2 gap-2">
        {CATEGORY_GROUPS.map((g) => (
          <div key={g.t} className="flex items-center justify-between gap-2" style={{ ...miniLine, padding: '10px 12px' }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{g.t}</span>
            <span className="num" style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-deep)' }}>{g.n} 项</span>
          </div>
        ))}
      </div>
      <div className="notice notice--brand">
        <p style={{ fontWeight: 700 }}>复习 · 今日到期 5</p>
        <p style={{ marginTop: 3, color: 'var(--ink-2)', fontWeight: 500 }}>词汇 2 · 短语 1 · 自测 1 · 练习 1</p>
      </div>
    </MiniPanel>
  )
}

const SECTIONS = [
  {
    label: 'ON-DEVICE ASR',
    title: '离线模型按需下载，装好即可本地听课',
    body: 'release 安装包不内置离线识别模型。首次使用离线听课前，在设置中联网下载并校验模型；之后识别在设备端完成，无需持续联网。模型可卸载并移入应用内回收站，需要时恢复或重新下载，不影响已有学习数据。',
    points: ['流式识别，边说边出字', '模型下载完成后可离线转写', '模型可卸载、恢复或重新下载'],
    illustration: <AsrIllustration />,
  },
  {
    label: 'CLOUD & AUDIO',
    title: '云端听课与音频导入，都由你主动选择',
    body: '主动开启云端听课，或导入已有音频后，所选音频会经知习服务器转发给 Lecsync，用于转写、翻译、说话人区分、术语、AI 润色或实时纪要。Voice Typing 也可将短语音整理为文本，并及时保存到本机。',
    points: ['本地与云端听课方式可按需选择', '已有音频可整理成课堂记录', '云端录音默认不保存，可选 30 天保留'],
    illustration: <CloudAudioIllustration />,
  },
  {
    label: 'AI TRANSLATION',
    title: '老师讲到哪，中文就跟到哪',
    body: '转写定稿后自动进入独立翻译队列，中英双语对照展示。网络波动时翻译排队等待，录音与原文落库照常进行——你不会因为一次断网丢掉课堂内容，也不会为了等翻译停下听课。',
    points: ['原文优先落库，译文随后补齐', '翻译失败自动重试，不打断录音', '中英双语对照回看'],
    illustration: <TranslateIllustration />,
  },
  {
    label: 'MARK A QUESTION',
    title: '没听懂的地方，一按就留住',
    body: '听课中随时按下「标记疑问」：自动关联当时的课堂原文与译文，可以补充备注，也可以什么都不写先存下来。课后在纪要里，每个标记的疑问都会附上参考解答——你当时没问出口的问题，知习替你记着。',
    points: ['录音中与课堂详情均可标记', '自动关联原文与译文', '支持无备注快速标记，课后补充'],
    illustration: <MarkIllustration />,
  },
  {
    label: 'STUDY PACKAGE',
    title: '课后一键生成，把课堂变成学习包',
    body: '按课堂、讲义、备考三种场景，按需生成主题化 AI 学习包：重点内容、词汇短语、重难点、自测卡，以及你标记疑问的参考解答。整个学习包可以导出 Markdown，放进你自己的笔记体系。',
    points: ['课堂 / 讲义 / 备考三种纪要场景', '生成后按类型归档', '疑问自动附参考解答', '学习包 Markdown 一键导出'],
    illustration: <PackageIllustration />,
  },
  {
    label: 'ORGANIZED BY TYPE',
    title: '学习内容自动归档，复习不再翻长列表',
    body: '课程详情页把学习内容分为课堂纪要、我的疑问、重点与摘要、词汇、短语、自测问答和练习；每类显示数量与预览，点开二级页查看带来源的具体内容。复习页按类型汇总今日到期与卡片总数，进入分类后逐张复习，也能浏览该分类全部卡片。',
    points: ['课程页 7 类归档，空分类不显示', '复习页显示每类今日到期与总数', '二级页查看来源和全部卡片'],
    illustration: <CategoryIllustration />,
  },
  {
    label: 'DOCUMENT PARSING',
    title: '工科讲义里的公式和图，也不放过',
    body: 'PDF、JPG、PNG 讲义导入后逐页处理：文字页直接提取原生文本，公式图、手写推导等复杂页面保留原图，并可调用视觉模型解析。OCR 提取不到结构时，宁可保留原页也不伪造内容。',
    points: ['逐页生成原图与结构化文本', '复杂页面可插拔视觉模型', '解析失败时原图兜底，不冒充理解'],
    illustration: <DocIllustration />,
  },
  {
    label: 'EXAM & REVIEW',
    title: '从备考六级，到期末冲刺',
    body: '导入六级等标准词表可确定性去重建卡，也可以按你自己的讲义语境提取词汇。复习排期由 FSRS 间隔重复算法安排，复习页按词汇、短语、自测问答和练习分类；支持 TTS 跟读——备考材料不再是「存了就看不动」的收藏夹。',
    points: ['CET-6 标准词表确定性导入', '按资料语境提取词汇短语', '按类型查看今日到期与全部卡片', 'FSRS 复习排期 + TTS 跟读'],
    illustration: <ReviewIllustration />,
  },
]

export default function Features() {
  return (
    <div className="page-enter">
      <PageHero
        eyebrow="FEATURES"
        title={<>听课、学习、复习，<br /><span className="accent">一条链路走完</span></>}
        lead="从课堂转写到复习卡片，知习把中间最容易丢东西的环节接了起来。以下 8 个能力都可以在网页版与 Android App 里用。"
        actions={
          <>
            <a href={WEB_APP_URL} className="btn btn--primary">打开网页版试用</a>
            <Link to="/download" className="btn btn--ghost">下载 App</Link>
          </>
        }
      >
        <div className="notice notice--brand mt-8 max-w-2xl">
          <strong>关于激活：</strong>离线听课不需要注册账号；AI 学习包、翻译、云端听课和文档解析需要在「设置 → 试用额度」
          用手机号激活。网页版可自助申请，一次短信完成开通与激活，不需要安装 App。
        </div>
      </PageHero>

      <BenchmarksSection />

      {SECTIONS.map((s, i) => (
        <section
          key={s.label}
          className={`band ${i % 2 === 1 ? 'band--section' : ''}`}
        >
          <div className="container-x section">
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <Reveal className={i % 2 === 1 ? 'lg:order-2' : ''}>
                <p className="eyebrow eyebrow--brand">{s.label}</p>
                <h2 className="h2 mt-4">{s.title}</h2>
                <p className="body-2 mt-4">{s.body}</p>
                <ul className="mt-6 flex flex-col gap-2.5">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5" style={{ fontSize: 14.5, fontWeight: 600 }}>
                      <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 4, flexShrink: 0 }} aria-hidden><path d="m2.5 7.5 3 3 6-6.5" /></svg>
                      {p}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={0.1} className={i % 2 === 1 ? 'lg:order-1' : ''}>
                {s.illustration}
              </Reveal>
            </div>
          </div>
        </section>
      ))}

      <section className="band band--surface">
        <div className="container-x section--tight">
          <SectionHead
            eyebrow="NEXT"
            align="center"
            title="想知道这些功能长什么样？"
            lead="看真实产品截图，或直接打开网页版试一节课。"
          />
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/#how" className="btn btn--ghost">看工作原理</Link>
            <Link to="/feedback" className="btn btn--ghost">常见问题</Link>
          </div>
        </div>
      </section>

      <CtaBand eyebrow="USE IT NOW" />
    </div>
  )
}
