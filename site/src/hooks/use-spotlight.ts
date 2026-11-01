import { useEffect, useRef } from 'react'

/**
 * 深色分区的指针聚光：把指针位置写成百分比的自定义属性，交给 CSS 画径向渐变。
 * 只在支持悬停的精细指针上启用；离开区域后淡出。
 */
export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let pending: { x: number; y: number } | null = null

    const flush = () => {
      frame = 0
      if (!pending) return
      const rect = el.getBoundingClientRect()
      el.style.setProperty('--spot-x', `${((pending.x - rect.left) / rect.width) * 100}%`)
      el.style.setProperty('--spot-y', `${((pending.y - rect.top) / rect.height) * 100}%`)
      pending = null
    }

    const onMove = (event: PointerEvent) => {
      pending = { x: event.clientX, y: event.clientY }
      el.classList.add('is-lit')
      if (!frame) frame = window.requestAnimationFrame(flush)
    }
    const onLeave = () => {
      pending = null
      if (frame) {
        window.cancelAnimationFrame(frame)
        frame = 0
      }
      el.classList.remove('is-lit')
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return ref
}
