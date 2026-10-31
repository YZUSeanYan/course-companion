import { useEffect, useRef, useState } from 'react'
import Waveform from './Waveform'

const PHASES = ['实时转写', 'AI 翻译', '标记疑问', '生成学习纪要']

// 时间线：外教课堂里的 10 秒
const SCRIPT: { at: number; step: number }[] = [
  { at: 400, step: 1 },   // 第一句英文转写
  { at: 1800, step: 2 },  // 中文翻译出现
  { at: 3000, step: 3 },  // 一键标记疑问
  { at: 4400, step: 4 },  // AI 纪要与自测卡生成
  { at: 5800, step: 5 },  // 通知横幅
  { at: 10200, step: 6 }, // 淡出
]

export default function ClassroomDemo() {
  const [step, setStep] = useState(0)
  const timers = useRef<number[]>([])

  useEffect(() => {
    let cancelled = false
    const run = () => {
      timers.current.forEach((t) => window.clearTimeout(t))
      timers.current = []
      setStep(0)
      SCRIPT.forEach(({ at, step }) => {
        timers.current.push(window.setTimeout(() => !cancelled && setStep(step), at))
      })
      timers.current.push(window.setTimeout(() => !cancelled && run(), 11000))
    }
    run()
    return () => {
      cancelled = true
      timers.current.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  // 根据 step 推导当前阶段
  const phase = step >= 4 ? 3 : step === 3 ? 2 : step === 2 ? 1 : 0

  return (
    <div className="relative mx-auto" style={{ maxWidth: 380 }}>
      {/* 阶段指示 */}
      <div className="flex items-center justify-center gap-0 mb-8">
        {PHASES.map((p, i) => (
          <div key={p} className="flex items-center">
            <div className="flex flex-col items-center gap-2">
              <span
                className="rounded-full transition-all duration-500"
                style={{
                  width: i === phase ? 12 : 8,
                  height: i === phase ? 12 : 8,
                  background: i <= phase ? 'var(--brand)' : 'var(--dark-line)',
                  boxShadow: i === phase ? '0 0 0 5px rgba(255,103,13,.18)' : 'none',
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: i <= phase ? '#fff' : '#666',
                  transition: 'color .4s ease',
                }}
              >
                {p}
              </span>
            </div>
            {i < PHASES.length - 1 && (
              <span
                className="mx-3 mb-6"
                style={{
                  width: 34,
                  height: 1,
                  background: i < phase ? 'var(--brand)' : 'var(--dark-line)',
                  transition: 'background .4s ease',
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* 手机舞台 */}
      <div
        className="relative mx-auto overflow-hidden"
        style={{
          width: 320,
          borderRadius: 40,
          background: '#161616',
          border: '1px solid var(--dark-line)',
          padding: '52px 16px 18px',
          animation: step === 5 ? 'wiggle 0.3s steps(2, end) 6' : undefined,
          opacity: step === 6 ? 0.25 : 1,
          transition: 'opacity .6s ease',
        }}
      >
        {/* 锁屏通知横幅 */}
        {step >= 5 && (
          <div
            className="banner-drop absolute left-3 right-3 top-3 z-10 rounded-2xl p-3"
            style={{ background: 'rgba(250,250,250,.97)', boxShadow: '0 18px 40px -10px rgba(0,0,0,.55)' }}
          >
            <div className="flex items-center gap-2">
              <Waveform color="var(--brand)" />
              <p style={{ fontSize: 11.5, fontWeight: 800, color: '#171717' }}>
                知习 · 学习包已更新
              </p>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9b9b9b' }}>现在</span>
            </div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#171717', marginTop: 6 }}>
              「位移电流」疑问已附参考解答，并加入复习计划
            </p>
          </div>
        )}

        {/* App 内界面 */}
        <div className="rounded-2xl p-3" style={{ background: '#0d0d0d', border: '1px solid var(--dark-line)' }}>
          <div className="flex items-center gap-2">
            <span className="rec-dot" />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#ff7a7f' }}>正在录音</span>
            <Waveform color="#ff7a7f" />
            <span className="ml-auto" style={{ fontSize: 11, color: '#777', fontFamily: 'var(--font-mono)' }}>
              00:10
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-2" style={{ minHeight: 96 }}>
            {step >= 1 && (
              <p className="demo-line-in" style={{ fontSize: 12.5, fontWeight: 600, color: '#e8e8e8', lineHeight: 1.7 }}>
                Alright, let's continue. Who can explain what
                <mark style={{ background: 'rgba(255,176,32,.25)', color: 'var(--warn)', borderRadius: 3, padding: '0 2px' }}>
                  {' '}displacement current{' '}
                </mark>
                means?
              </p>
            )}
            {step >= 2 && (
              <div className="demo-line-in">
                <p style={{ fontSize: 12, fontWeight: 600, color: '#9ecbff', lineHeight: 1.7 }}>
                  好的我们继续，谁能解释一下「位移电流」是什么意思？
                </p>
                <span style={{ fontSize: 10, color: '#666', fontWeight: 600 }}>AI 翻译 · 定稿后自动生成</span>
              </div>
            )}
            {step >= 1 && (
              <span style={{ fontSize: 10, color: '#666', fontWeight: 600 }}>设备端识别 · 原文优先保存</span>
            )}
          </div>

          <div className="flex flex-col gap-2" style={{ minHeight: 108 }}>
            {step >= 3 && (
              <div className="demo-pop rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,176,32,.14)', border: '1px solid rgba(255,176,32,.4)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--warn)' }}>
                  ❓ [16:10:52] 已标记疑问 · 附课堂原文与译文
                </p>
              </div>
            )}
            {step >= 4 && (
              <div className="demo-pop rounded-xl px-3 py-2.5" style={{ background: 'rgba(229,72,77,.16)', border: '1px solid rgba(229,72,77,.45)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#ff8589' }}>
                  ✦ AI 学习纪要：位移电流 · 重难点 + 3 张自测卡
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="text-center mt-3" style={{ fontSize: 10.5, color: '#666', fontFamily: 'var(--font-mono)', letterSpacing: '.08em' }}>
          SIMULATION · 循环演示
        </p>
      </div>
    </div>
  )
}
