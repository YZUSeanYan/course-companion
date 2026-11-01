import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

type Variant = 'up' | 'mask' | 'scale' | 'left'

type Props = {
  children: ReactNode
  delay?: number
  className?: string
  /** 入场语法：up 位移淡入（默认）、mask 遮罩揭开、scale 放大落定、left 横向滑入 */
  variant?: Variant
}

/**
 * 全站统一入场：元素进入视口时“升起并停稳”，只播一次。
 *
 * 被观察的外层永远不裁剪、不隐藏几何——遮罩变体把 clip 放在内层，
 * 否则 IntersectionObserver 会因为自裁剪算出 0 交叉比，动画永远不会触发。
 * 首屏元素在挂载后立刻入场，不等观察器回调。
 */
export default function Reveal({ children, delay = 0, className = '', variant = 'up' }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const play = () => el.classList.add('is-in')

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      play()
      return
    }

    // 已在首屏内的元素直接播放，避免遮罩/缩放元素等一次异步回调才出现
    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) {
      window.requestAnimationFrame(play)
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            play()
            io.disconnect()
          }
        })
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`reveal${variant === 'up' ? '' : ` reveal--${variant}`} ${className}`}
      style={{ '--reveal-delay': `${delay}s` } as CSSProperties}
    >
      {variant === 'mask' ? <div className="reveal-mask-inner">{children}</div> : children}
    </div>
  )
}
