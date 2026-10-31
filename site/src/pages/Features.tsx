import Reveal from '../components/site/Reveal'
import Waveform from '../components/site/Waveform'

/* ---------- 小插图：设备端识别 ---------- */
function AsrIllustration() {
  return (
    <div className="rounded-3xl p-6" style={{ background: 'var(--dark)', border: '1px solid var(--dark-line)' }}>
      <p className="mono-label mb-5" style={{ color: '#888' }}>ON-DEVICE ASR</p>
      <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'var(--dark-2)', border: '1px solid var(--dark-line)' }}>
        <span className="rec-dot" />
        <Waveform color="var(--brand)" />
        <span style={{ fontSize: 11, color: '#999', fontFamily: 'var(--font-mono)' }}>16kHz · mono</span>
      </div>
      <div className="mt-3 rounded-xl px-4 py-3" style={{ background: 'var(--dark-2)', border: '1px solid var(--dark-line)' }}>
        <p style={{ fontSize: 12.5, color: '#e8e8e8', lineHeight: 1.8, fontWeight: 600 }}>
          Good morning everyone, let's start with a quick review of last week's lecture……
        </p>
        <p style={{ fontSize: 10, color: '#666', marginTop: 6, fontFamily: 'var(--font-mono)' }}>流式 Zipformer → Paraformer 定稿 · 设备端推理</p>
      </div>
      <div className="mt-3 rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: 'var(--dark-2)', border: '1px solid var(--dark-line)' }}>
        <p style={{ fontSize: 11, color: '#bbb', fontWeight: 700 }}>离线识别模型</p>
        <span className="rounded-full px-2.5 py-1" style={{ fontSize: 10, fontWeight: 800, background: 'rgba(255,103,13,.15)', color: 'var(--brand)' }}>
          设置中按需下载
        </span>
      </div>
    </div>
  )
}

/* ---------- 小插图：云端听课与音频导入 ---------- */
function CloudAudioIllustration() {
  return (
    <div className="illustration-card rounded-3xl p-6">
      <p className="mono-label mb-5">CLOUD LISTENING & AUDIO</p>
      <div className="flex flex-wrap gap-2">
        {['云端听课', '导入音频', 'Voice Typing'].map((item) => (
          <span key={item} className="rounded-full px-3 py-1.5" style={{ fontSize: 11, fontWeight: 800, background: 'var(--brand-soft)', color: 'var(--brand-deep)' }}>
            {item}
          </span>
        ))}
      </div>
      <div className="audio-route mt-4 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <span className="audio-route-icon"><Waveform color="var(--brand)" /></span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 800 }}>你选择的课堂音频</p>
            <p style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 2 }}>主动开启或导入并确认</p>
          </div>
        </div>
        <div className="audio-route-line" aria-hidden />
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
            <p style={{ fontSize: 11.5, fontWeight: 800 }}>知习服务器</p>
            <p style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>安全转发</p>
          </div>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="var(--brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 9h11M10 5l4 4-4 4" /></svg>
          <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
            <p style={{ fontSize: 11.5, fontWeight: 800 }}>Lecsync</p>
            <p style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>转写与音频智能</p>
          </div>
        </div>
      </div>
      <p className="body-2 mt-4" style={{ fontSize: 11.5 }}>
        云端录音默认不保存；只有主动开启云端保留后，音频与转写才保留 30 天，可通过云端任务删除。
      </p>
    </div>
  )
}

/* ---------- 小插图：翻译队列 ---------- */
function TranslateIllustration() {
  return (
    <div className="rounded-3xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <p className="mono-label mb-5">TRANSLATION QUEUE</p>
      <div className="flex flex-col gap-3">
        <div className="rounded-xl px-4 py-3" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--ink-3)' }}>原文 · 16:10:48</p>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginTop: 3, lineHeight: 1.6 }}>
            So the displacement current is not a real current, but it explains the gap……
          </p>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(61,111,168,.08)', border: '1px solid rgba(61,111,168,.35)' }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: '#3d6fa8' }}>AI 翻译 · 已生成</p>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: '#2d5378', marginTop: 3, lineHeight: 1.6 }}>
            所以位移电流并不是真实的电流，但它解释了这段空隙……
          </p>
        </div>
        <div className="rounded-xl px-4 py-2.5 flex items-center gap-2" style={{ background: 'var(--bg)', border: '1px dashed var(--line)' }}>
          <span style={{ fontSize: 11 }}>🛡️</span>
          <p style={{ fontSize: 11, color: 'var(--ink-2)', fontWeight: 600 }}>网络中断时：翻译排队等待，录音与原文落库照常进行</p>
        </div>
      </div>
    </div>
  )
}

/* ---------- 小插图：标记疑问 ---------- */
function MarkIllustration() {
  return (
    <div className="rounded-3xl p-6" style={{ background: 'var(--dark)', border: '1px solid var(--dark-line)' }}>
      <p className="mono-label mb-5" style={{ color: '#888' }}>MARK A QUESTION</p>
      <div className="flex flex-col gap-3">
        <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: 'var(--brand)' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="#fff"><path d="M8 1.5a3.5 3.5 0 0 1 3.5 3.5c0 1.5-.8 2.4-1.5 3.2-.5.6-.8 1-.8 1.8H6.8c0-.8-.3-1.2-.8-1.8C5.3 7.4 4.5 6.5 4.5 5A3.5 3.5 0 0 1 8 1.5Z"/><path d="M6.6 11.5h2.8v.8a1.4 1.4 0 1 1-2.8 0v-.8Z"/></svg>
          <p style={{ fontSize: 12.5, fontWeight: 800, color: '#fff' }}>标记疑问 · 一键按下</p>
          <span className="ml-auto" style={{ fontSize: 10, color: 'rgba(255,255,255,.8)', fontFamily: 'var(--font-mono)' }}>16:10:52</span>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ background: 'var(--dark-2)', border: '1px solid var(--dark-line)' }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: '#888' }}>自动关联课堂原文</p>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#e8e8e8', marginTop: 3, lineHeight: 1.7 }}>
            Who can explain what displacement current means?
          </p>
        </div>
        <div className="rounded-xl px-4 py-3" style={{ background: 'var(--dark-2)', border: '1px dashed rgba(255,103,13,.45)' }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--brand)' }}>备注（可选）</p>
          <p style={{ fontSize: 11.5, color: '#999', marginTop: 3, lineHeight: 1.7 }}>来不及写备注也没关系——先存下来，课后补。</p>
        </div>
      </div>
    </div>
  )
}

/* ---------- 小插图：AI 学习包 ---------- */
function PackageIllustration() {
  return (
    <div className="rounded-3xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <p className="mono-label mb-5">AI STUDY PACKAGE</p>
      <div className="rounded-xl p-4" style={{ background: 'var(--dark)', fontFamily: 'var(--font-mono)' }}>
        <p style={{ fontSize: 11, color: '#888' }}># 电磁场与波 · 10-29 学习包</p>
        <p style={{ fontSize: 11, color: '#e8e8e8', marginTop: 8 }}>## 重难点 · 位移电流</p>
        <p style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>定义 / 物理意义 / 与传导电流的区别</p>
        <p style={{ fontSize: 11, color: '#e8e8e8', marginTop: 8 }}>## 疑问解答（你标记于 16:10）</p>
        <p style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>Q: 位移电流是什么意思？</p>
        <p style={{ fontSize: 11, color: '#e8e8e8', marginTop: 8 }}>## 自测卡 ×5</p>
        <p style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>「位移电流」 → 已进入明天复习计划</p>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        {['课堂纪要', '讲义纪要', '备考纪要', 'Markdown 导出'].map((f) => (
          <span key={f} className="rounded-full px-3 py-1.5" style={{ fontSize: 11, fontWeight: 800, background: 'var(--brand-soft)', color: 'var(--brand-deep)' }}>{f}</span>
        ))}
      </div>
    </div>
  )
}

/* ---------- 小插图：文档解析 ---------- */
function DocIllustration() {
  return (
    <div className="rounded-3xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <p className="mono-label mb-5">DOCUMENT PARSING</p>
      <div className="flex flex-col gap-3">
        {[
          { p: '第 1 页 · 文字版讲义', s: '原生文本直接提取', ok: true },
          { p: '第 2 页 · 公式截图', s: '原图保留 + 视觉模型解析', ok: true },
          { p: '第 3 页 · 手写推导', s: '原图保留，标记待视觉解析', ok: false },
        ].map((r) => (
          <div key={r.p} className="flex items-center gap-4 rounded-xl px-4 py-3" style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
            <div className="flex-1">
              <p style={{ fontSize: 13, fontWeight: 800 }}>{r.p}</p>
              <p style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 2 }}>{r.s}</p>
            </div>
            <span
              className="rounded-full px-2.5 py-1"
              style={{
                fontSize: 10, fontWeight: 800,
                background: r.ok ? 'var(--brand-soft)' : 'var(--section)',
                color: r.ok ? 'var(--brand-deep)' : 'var(--ink-3)',
              }}
            >
              {r.ok ? '已解析' : '原图兜底'}
            </span>
          </div>
        ))}
        <p style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.7 }}>
          OCR 提取不到结构时，保留页面原图而不是伪造内容——解析不上的部分，宁可让你亲眼看到原题。
        </p>
      </div>
    </div>
  )
}

/* ---------- 小插图：间隔复习 ---------- */
function ReviewIllustration() {
  const rows = [
    { t: '位移电流 · 定义', d: '今天', hot: true },
    { t: 'Maxwell 方程组 · 自测', d: '明天', hot: false },
    { t: '边界条件 · 易错点', d: '3 天后', hot: false },
    { t: 'CET-6 高频词 · Unit 4', d: '5 天后', hot: false },
  ]
  return (
    <div className="rounded-3xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <p className="mono-label mb-5">FSRS REVIEW PLAN</p>
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.t} className="flex items-center gap-4 rounded-xl px-4 py-3" style={{ background: 'var(--bg)', border: `1px solid ${r.hot ? 'var(--brand)' : 'var(--line)'}` }}>
            <div className="flex-1">
              <p style={{ fontSize: 13.5, fontWeight: 800 }}>{r.t}</p>
            </div>
            <span
              className="rounded-full px-2.5 py-1"
              style={{
                fontSize: 10, fontWeight: 800,
                background: r.hot ? 'var(--brand)' : 'var(--section)',
                color: r.hot ? '#fff' : 'var(--ink-3)',
              }}
            >
              {r.d}
            </span>
          </div>
        ))}
        <p style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.7 }}>
          按 FSRS 间隔重复算法安排复习节奏，支持 TTS 跟读；词汇按讲义语境提取，不脱离课堂。
        </p>
      </div>
    </div>
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
    title: '外教讲到哪，中文就跟到哪',
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
    points: ['课堂 / 讲义 / 备考三种纪要场景', '疑问自动附参考解答', '学习包 Markdown 一键导出'],
    illustration: <PackageIllustration />,
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
    body: '导入六级等标准词表可确定性去重建卡，也可以按你自己的讲义语境提取词汇。复习排期由 FSRS 间隔重复算法安排，支持 TTS 跟读——备考材料不再是「存了就看不动」的收藏夹。',
    points: ['CET-6 标准词表确定性导入', '按资料语境提取词汇短语', 'FSRS 复习排期 + TTS 跟读'],
    illustration: <ReviewIllustration />,
  },
]

export default function Features() {
  return (
    <div className="page-enter">
      <section className="radar-bg">
        <div className="container-x pt-16 pb-14 lg:pt-24">
          <Reveal>
            <p className="mono-label mono-label--brand">FEATURES</p>
            <h1 className="display mt-5 max-w-3xl" style={{ fontSize: 'clamp(36px, 5vw, 60px)' }}>
              听课、学习、复习，
              <span style={{ color: 'var(--brand)' }}>一条链路走完</span>
            </h1>
          </Reveal>
        </div>
      </section>

      {SECTIONS.map((s, i) => (
        <section
          key={s.label}
          className="hairline-t"
          style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--section)' }}
        >
          <div className={`container-x py-20 grid gap-12 lg:grid-cols-2 items-center`}>
            <Reveal className={i % 2 === 1 ? 'lg:order-2' : ''}>
              <p className="mono-label mono-label--brand">{s.label}</p>
              <h2 className="display mt-4" style={{ fontSize: 'clamp(26px, 3.4vw, 38px)' }}>{s.title}</h2>
              <p className="body-2 mt-5" style={{ fontSize: 15.5 }}>{s.body}</p>
              <ul className="mt-6 flex flex-col gap-2.5">
                {s.points.map((p) => (
                  <li key={p} className="flex items-center gap-2.5" style={{ fontSize: 14, fontWeight: 600 }}>
                    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m2.5 7.5 3 3 6-6.5"/></svg>
                    {p}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={0.12} className={i % 2 === 1 ? 'lg:order-1' : ''}>
              {s.illustration}
            </Reveal>
          </div>
        </section>
      ))}
    </div>
  )
}
