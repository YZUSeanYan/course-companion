import type { ReactNode } from 'react'
import Reveal from './Reveal'

/**
 * 全站统一的首屏结构：小标签 + 标题 + 说明 + 行动按钮，可选配图或居中排版。
 * 所有页面共用同一套留白与字号刻度，避免每页各写一套。
 */
export default function PageHero({
  eyebrow,
  title,
  lead,
  actions,
  media,
  top,
  align = 'left',
  children,
}: {
  eyebrow: string
  title: ReactNode
  lead?: ReactNode
  actions?: ReactNode
  media?: ReactNode
  /** 居中排版时显示在标题上方的徽标 / 图形 */
  top?: ReactNode
  align?: 'left' | 'center'
  children?: ReactNode
}) {
  const centered = align === 'center'

  return (
    <section className="page-hero radar-bg">
      <div className="container-x hero-inner">
        <div
          className={
            centered
              ? 'mx-auto max-w-3xl text-center'
              : media
                ? 'grid items-center gap-12 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16'
                : 'max-w-3xl'
          }
        >
          <div>
            {top ? <Reveal className={centered ? 'flex justify-center' : ''}>{top}</Reveal> : null}
            <Reveal delay={0.04}>
              <p className={`eyebrow eyebrow--brand ${centered ? 'eyebrow--plain justify-center mt-7' : ''}`}>
                {eyebrow}
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <h1 className="display mt-5">{title}</h1>
            </Reveal>
            {lead ? (
              <Reveal delay={0.14}>
                <p className={`lead mt-5 ${centered ? 'mx-auto max-w-xl' : 'max-w-xl'}`}>{lead}</p>
              </Reveal>
            ) : null}
            {actions ? (
              <Reveal delay={0.18}>
                <div className={`mt-8 flex flex-wrap items-center gap-3 ${centered ? 'justify-center' : ''}`}>
                  {actions}
                </div>
              </Reveal>
            ) : null}
            {children}
          </div>
          {media ? (
            <Reveal delay={0.16} className="flex justify-center lg:justify-end">
              {media}
            </Reveal>
          ) : null}
        </div>
      </div>
    </section>
  )
}
