import Reveal from './Reveal'
import SectionHead from './SectionHead'

// 云端引擎（LecSync）官方基准与质量评测数据。
// 数字与口径来自上游引擎的公开基准页；知习经自有网关接入，客户端不内嵌任何密钥。

const NOTE = '基于 LecSync 引擎官方基准测试；实际表现会因音质、口音、语言和专业词汇而有所不同。'

const TRANSLATION_CARDS = [
  {
    tag: '4B 对比 1.7B',
    stat: '4.21',
    unit: '/5',
    label: '严重错误减半',
    body: '998 段线上转写盲评（1–5 分）：4B 平均 4.21，1.7B 为 3.72；严重错误率从 18.2% 降到 9.9%。被评为最好的有 485 段，1.7B 只有 58 段。',
  },
  {
    tag: '此前的云端链路',
    stat: '51.9',
    unit: '%',
    label: '统计上打平',
    body: '对 407 条课堂/会议段落，相对此前生产栈（云端草稿 + 可选改写）的胜率为 51.9%，p = 0.69。只对裸云端草稿时点估计为 55.7%，仍不显著。',
  },
  {
    tag: '腾讯混元 Hy-MT 1.8B',
    stat: '71.9',
    unit: '%',
    label: '课堂 ASR 上领先',
    body: '通用课堂段胜率 71.9%。带上文：74.3%。带术语表：69.3%。混元在 WMT24 书面/新闻上更好——LecSync-MT 是口语专家，不是通用文学翻译模型。',
  },
  {
    tag: 'Qwen3.5-2B',
    stat: '6',
    unit: '/6',
    label: '六套冻结试卷全胜',
    body: '与混元对比使用同一套六组冻结题目，覆盖课堂、上文、术语、无上文、WMT24 和多语言目标。',
  },
]

const WIN_RATE_ROWS = [
  { group: '课堂段落', rate: '71.9%' },
  { group: '需要上文', rate: '74.3%' },
  { group: '术语表', rate: '69.3%' },
]

/** 功能页完整评测区：转写性能 + 翻译质量评测（含方法论与口径说明）。 */
export function BenchmarksSection() {
  return (
    <section id="benchmarks" className="band band--dark radar-bg-dark">
      <div className="container-x section">
        <SectionHead
          eyebrow="BENCHMARKS"
          title={<>快到可以跟读，<br />准到可以直接使用。</>}
          lead="低延迟让文字紧跟说话节奏，行业领先的识别准确率让你少返工，把注意力留给正在发生的内容。"
        />

        <Reveal delay={0.08}>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {[
              { v: '<200', unit: 'ms', label: '实时转录延迟 —— 快到可以跟读' },
              { v: '1.25', unit: '%WER', label: '行业领先词错误率 —— 准到可以直接使用' },
            ].map((s) => (
              <div key={s.label} className="card card--dark">
                <div className="stat">
                  <p className="stat__value" style={{ color: 'var(--brand)', fontSize: 'clamp(34px, 4vw, 48px)' }}>
                    {s.v}
                    <span className="stat__unit">{s.unit}</span>
                  </p>
                  <p className="stat__label">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="tiny mt-3">{NOTE}</p>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="card card--dark mt-14" style={{ padding: 28 }}>
            <p className="eyebrow eyebrow--plain" style={{ color: 'var(--brand)' }}>TRANSLATION QUALITY · 云端翻译质量</p>
            <h3 className="h3 mt-4">质量结论以成对 AI 裁判为准</h3>
            <p className="body-2 mt-3" style={{ fontSize: 13.5 }}>
              裁判：Gemini 3.8 Flash，正反双判，冻结的课堂与会议试卷；生产对比取自 LecSync 线上流量的 407 段。
              除特别注明外，以下结果均为 1.7B 模型。
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {TRANSLATION_CARDS.map((card) => (
                <div
                  key={card.tag}
                  className="rounded-[var(--r-md)] p-5"
                  style={{ background: 'var(--dark)', border: '1px solid var(--dark-line)' }}
                >
                  <p className="tiny" style={{ fontWeight: 700 }}>{card.tag}</p>
                  <p className="num" style={{ fontSize: 32, fontWeight: 800, color: 'var(--brand)', marginTop: 10, lineHeight: 1.05 }}>
                    {card.stat}
                    <span style={{ fontSize: '0.5em', color: 'var(--on-dark-3)', marginLeft: 2 }}>{card.unit}</span>
                  </p>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#e8e8e8', marginTop: 8 }}>{card.label}</p>
                  <p className="tiny mt-2" style={{ lineHeight: 1.8 }}>{card.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 overflow-hidden rounded-[var(--r-md)]" style={{ border: '1px solid var(--dark-line)' }}>
              <div className="grid grid-cols-2 px-5 py-3" style={{ background: 'rgba(255,255,255,.04)' }}>
                <p className="tiny" style={{ fontWeight: 700 }}>题组</p>
                <p className="tiny" style={{ fontWeight: 700 }}>LecSync-MT 胜率</p>
              </div>
              {WIN_RATE_ROWS.map((row) => (
                <div key={row.group} className="grid grid-cols-2 px-5 py-3.5" style={{ borderTop: '1px solid var(--dark-line)' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--on-dark-2)' }}>{row.group}</p>
                  <p className="num" style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{row.rate}</p>
                </div>
              ))}
            </div>
            <p className="tiny mt-4" style={{ lineHeight: 1.8 }}>
              官方 BLEU 只作对外可引用的参考数字——它曾在三套冻结试卷上与裁判方向相反，因此质量结论以成对 AI 裁判为准。
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.16}>
          <p className="tiny mt-6 max-w-3xl" style={{ lineHeight: 1.9 }}>
            以上为知习云端链路（云端听课与云端翻译）所用 LecSync 引擎的官方基准与质量评测数据；
            知习经自有网关接入该引擎，客户端不内嵌任何密钥。本地离线识别为独立模型，
            实际课堂体验会因音质、口音、语言和专业词汇而有所不同。
          </p>
        </Reveal>
      </div>
    </section>
  )
}

export default BenchmarksSection
