import type { ReactNode } from 'react'
import Reveal from './Reveal'

/** 分区标题：全站统一的小标签 + 标题 + 说明（+ 右侧行动位）。 */
export default function SectionHead({
  eyebrow,
  title,
  lead,
  action,
  align = 'left',
}: {
  eyebrow: string
  title: ReactNode
  lead?: ReactNode
  action?: ReactNode
  align?: 'left' | 'center'
}) {
  const centered = align === 'center'
  return (
    <Reveal>
      <div
        className={
          centered
            ? 'text-center'
            : 'flex flex-wrap items-end justify-between gap-6'
        }
      >
        <div className={centered ? 'mx-auto max-w-2xl' : 'max-w-2xl'}>
          <p className={`eyebrow eyebrow--brand ${centered ? 'eyebrow--plain justify-center' : ''}`}>
            {eyebrow}
          </p>
          <h2 className="h2 mt-4">{title}</h2>
          {lead ? <p className="lead mt-4">{lead}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </Reveal>
  )
}
