import { Link } from 'react-router'
import Reveal from './Reveal'

// 云端引擎（LecSync）官方基准与质量评测数据。
// 数字与口径来自上游引擎的公开基准页；知习经自有网关接入，客户端不内嵌任何密钥。

const NOTE = '基于 LecSync 引擎官方基准测试；实际表现会因音质、口音、语言和专业词汇而有所不同。'

function StatNumber({ value, unit, label, accent }: { value: string; unit?: string; label: string; accent?: string }) {
  return (
    <div className="rounded-2xl px-6 py-7" style={{ background: 'var(--dark-2)', border: '1px solid var(--dark-line)' }}>
      <p style={{ fontSize: 'clamp(38px, 4.6vw, 56px)', fontWeight: 800, letterSpacing: '-0.02em', color: accent ?? '#fff', lineHeight: 1.05 }}>
        {value}
        {unit && <span style={{ fontSize: '0.42em', fontWeight: 700, color: '#777', marginLeft: 4 }}>{unit}</span>}
      </p>
      <p style={{ fontSize: 12.5, fontWeight: 700, color: '#aaa', marginTop: 10 }}>{label}</p>
    </div>
  )
}

/** 首页显眼数据带：两个核心数字 + 完整评测入口。 */
export function LatencyStrip() {
  return (
    <section style={{ background: 'var(--dark)' }}>
      <div className="container-x py-14">
        <Reveal>
          <p className="mono-label" style={{ color: '#888' }}>ENGINE BENCHMARKS · 云端引擎实测</p>
          <div className="grid gap-4 sm:grid-cols-2 mt-6">
            <StatNumber value="<200" unit="ms" label="实时转录延迟 —— 快到可以跟读" accent="var(--brand)" />
            <StatNumber value="1.25" unit="%WER" label="行业领先词错误率 —— 准到可以直接使用" accent="var(--brand)" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
            <p style={{ fontSize: 11.5, color: '#666' }}>{NOTE}</p>
            <Link
              to="/features"
              style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)', whiteSpace: 'nowrap' }}
            >
              看完整评测数据 →
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

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
    <section id="benchmarks" style={{ background: 'var(--dark)' }} className="hairline-t">
      <div className="container-x py-20">
        <Reveal>
          <p className="mono-label" style={{ color: '#888' }}>BENCHMARKS · 云端引擎实测</p>
          <h2 className="display mt-4" style={{ fontSize: 'clamp(30px, 4.4vw, 50px)', color: '#fff' }}>
            快到可以跟读，
            <br />
            准到可以直接使用。
          </h2>
          <p className="mt-5 max-w-xl" style={{ fontSize: 15.5, lineHeight: 1.8, color: '#aaa' }}>
            低延迟让文字紧跟说话节奏，行业领先的识别准确率让你少返工，把注意力留给正在发生的内容。
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="grid gap-4 sm:grid-cols-2 mt-10">
            <StatNumber value="<200" unit="ms" label="实时转录延迟" accent="var(--brand)" />
            <StatNumber value="1.25" unit="%WER" label="行业领先词错误率" accent="var(--brand)" />
          </div>
          <p style={{ fontSize: 11.5, color: '#666', marginTop: 12 }}>{NOTE}</p>
        </Reveal>

        <Reveal delay={0.14}>
          <div className="mt-16 rounded-3xl p-7" style={{ background: 'var(--dark-2)', border: '1px solid var(--dark-line)' }}>
            <p className="mono-label" style={{ color: '#888' }}>TRANSLATION QUALITY · 云端翻译质量</p>
            <h3 className="display mt-4" style={{ fontSize: 'clamp(22px, 3vw, 32px)', color: '#fff' }}>
              质量结论以成对 AI 裁判为准
            </h3>
            <p className="mt-4" style={{ fontSize: 13.5, lineHeight: 1.9, color: '#aaa' }}>
              裁判：Gemini 3.8 Flash，正反双判，冻结的课堂与会议试卷；生产对比取自 LecSync 线上流量的 407 段。
              除特别注明外，以下结果均为 1.7B 模型。
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mt-7">
              {TRANSLATION_CARDS.map((card) => (
                <div key={card.tag} className="rounded-2xl p-5" style={{ background: 'var(--dark)', border: '1px solid var(--dark-line)' }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: '#888' }}>{card.tag}</p>
                  <p style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--brand)', marginTop: 10, lineHeight: 1.05 }}>
                    {card.stat}
                    <span style={{ fontSize: '0.5em', color: '#777', marginLeft: 2 }}>{card.unit}</span>
                  </p>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#e8e8e8', marginTop: 8 }}>{card.label}</p>
                  <p style={{ fontSize: 11.5, lineHeight: 1.8, color: '#999', marginTop: 8 }}>{card.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-7 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--dark-line)' }}>
              <div className="grid grid-cols-2 px-5 py-3" style={{ background: 'rgba(255,255,255,.04)' }}>
                <p style={{ fontSize: 11.5, fontWeight: 800, color: '#888' }}>题组</p>
                <p style={{ fontSize: 11.5, fontWeight: 800, color: '#888' }}>LecSync-MT 胜率</p>
              </div>
              {WIN_RATE_ROWS.map((row) => (
                <div key={row.group} className="grid grid-cols-2 px-5 py-3.5" style={{ borderTop: '1px solid var(--dark-line)' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#ddd' }}>{row.group}</p>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{row.rate}</p>
                </div>
              ))}
            </div>
            <p className="mt-5" style={{ fontSize: 11.5, lineHeight: 1.8, color: '#666' }}>
              官方 BLEU 只作对外可引用的参考数字——它曾在三套冻结试卷上与裁判方向相反，因此质量结论以成对 AI 裁判为准。
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.18}>
          <p className="mt-8 max-w-3xl" style={{ fontSize: 12, lineHeight: 1.9, color: '#666' }}>
            以上为知习云端链路（云端听课与云端翻译）所用 LecSync 引擎的官方基准与质量评测数据；
            知习经自有网关接入该引擎，客户端不内嵌任何密钥。本地离线识别为独立模型，
            实际课堂体验会因音质、口音、语言和专业词汇而有所不同。
          </p>
        </Reveal>
      </div>
    </section>
  )
}
