import type { ReactNode } from 'react'
import Reveal from './Reveal'

/** 分区标题：全站统一的小标签 + 标题 + 说明（+ 右侧行动位），可选编辑式分区编号。 */
export default function SectionHead({
  eyebrow,
  title,
  lead,
  action,
  align = 'left',
  index,
}: {
  eyebrow: string
  title: ReactNode
  lead?: ReactNode
  action?: ReactNode
  align?: 'left' | 'center'
  /** 分区编号（如 "02"），以大号描边数字压在标题左上角 */
  index?: string
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
          {/* 编号与眉毛标签同一基线：编号大、标签小，像杂志的章节页脚码 */}
          <div className={`head-index${index ? ' head-index--numbered' : ''} ${centered ? 'justify-center' : ''}`}>
            {index ? <span className="head-index__num" aria-hidden>{index}</span> : null}
            <p className={`eyebrow eyebrow--brand ${centered ? 'eyebrow--plain' : ''}`}>
              {eyebrow}
            </p>
          </div>
          <h2 className="h2 mt-4">{title}</h2>
          {lead ? <p className="lead mt-4">{lead}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </Reveal>
  )
}
