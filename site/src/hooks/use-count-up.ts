import { useEffect, useRef, useState } from 'react'

/**
 * 数字计数：元素进入视口后从 0 递增到目标值，只播一次。
 *
 * 初值就是目标值——观察器没触发、脚本报错、减少动效时，页面显示的都是正确数字；
 * 只有确认元素在视口内，才从 0 开始动画。宁可不动，也不能停在 0。
 */
export function useCountUp(target: number, decimals = 0, duration = 1400) {
  const ref = useRef<HTMLSpanElement>(null)
  const [value, setValue] = useState(target)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let settle = 0
    let started = 0
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

    const finish = () => {
      setValue(target)
      if (settle) window.clearTimeout(settle)
      if (frame) window.cancelAnimationFrame(frame)
      settle = 0
      frame = 0
    }

    const tick = (now: number) => {
      if (!started) started = now
      const t = Math.min(1, (now - started) / duration)
      setValue(target * easeOut(t))
      if (t < 1) frame = window.requestAnimationFrame(tick)
    }

    /** rAF 在后台标签页、低电量模式或某些内嵌浏览器里会被节流到几乎不触发，
     *  这里再挂一个定时器兜底，保证最终一定落在目标值上。 */
    const start = () => {
      setValue(0)
      frame = window.requestAnimationFrame(tick)
      settle = window.setTimeout(finish, duration + 250)
    }

    // 已经在首屏内的直接播放；否则等滚动到可视区再开始
    const rect = el.getBoundingClientRect()
    const inView = rect.top < window.innerHeight * 0.9 && rect.bottom > 0

    if (inView) {
      start()
      return finish
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          start()
          io.disconnect()
        }
      },
      { threshold: 0.4 }
    )
    io.observe(el)

    return () => {
      io.disconnect()
      finish()
    }
  }, [target, duration])

  const formatted = value.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return { ref, formatted }
}
