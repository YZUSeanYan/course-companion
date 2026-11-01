import { useEffect, useRef } from 'react'

/**
 * 顶部 2px 阅读进度线：用 transform 驱动，不触发重排。
 * 用 rAF 合帧，滚动时最多每帧写一次自定义属性。
 */
export default function ScrollRail() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let frame = 0
    const write = () => {
      frame = 0
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      el.style.setProperty('--progress', ratio.toFixed(4))
    }
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(write)
    }

    write()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <div className="scroll-rail" aria-hidden>
      <div ref={ref} className="scroll-rail__bar" />
    </div>
  )
}
