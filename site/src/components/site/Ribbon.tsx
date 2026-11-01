const DEFAULT_ITEMS = [
  '本地离线听课',
  '云端实时转写',
  'AI 双语对照',
  '标记疑问',
  'AI 学习包',
  '讲义解析',
  'FSRS 间隔复习',
  '网页版免安装',
  '本地优先',
  '密钥只在服务端',
]

/**
 * 一条慢速滚动的词汇丝带，用来给长页面分段，也承担“声波”的节奏感。
 * 内容复制一份做无缝循环；悬停暂停，减少动效时静止。
 */
export default function Ribbon({ items = DEFAULT_ITEMS }: { items?: string[] }) {
  // 复制两份，配合 translate3d(-50%) 实现无缝循环
  const loop = [...items, ...items]

  return (
    <div className="ribbon" aria-hidden>
      <div className="ribbon__track">
        {loop.map((item, i) => (
          <span className="ribbon__item" key={`${item}-${i}`}>
            <span className="ribbon__dot" />
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
