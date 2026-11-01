import type { ReactNode } from 'react'
import { useSpotlight } from '../../hooks/use-spotlight'

/**
 * 深色分区：背景随指针浮起一团暖光（仅精细指针、非减少动效时启用）。
 * 内容层由 .band--dark > .container-x 的 z-index 兜住，不需要每个页面单独处理。
 */
export default function DarkBand({
  children,
  className = '',
  id,
}: {
  children: ReactNode
  className?: string
  id?: string
}) {
  const ref = useSpotlight<HTMLElement>()

  return (
    <section ref={ref} id={id} className={`band band--dark ${className}`}>
      <span className="spotlight" aria-hidden />
      {children}
    </section>
  )
}
