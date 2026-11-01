import { Link } from 'react-router'
import type { ReactNode } from 'react'
import Reveal from './Reveal'
import { CURRENT_RELEASE, WEB_APP_URL } from '../../lib/release'

/**
 * 页面收尾的统一行动区。默认给出「网页版（免安装）」与「下载 App」两条路径，
 * 网页版对 iPhone / iPad 同样可用，不依赖 Android 安装包。
 */
export default function CtaBand({
  eyebrow = 'START NOW',
  title = <>下节课，带上知习。</>,
  lead = <>浏览器打开即可用：云端听课、讲义导入、AI 学习包与复习计划在网页版里完整可用。Android 用户也可以下载 App，获得本地离线听课。</>,
  children,
}: {
  eyebrow?: string
  title?: ReactNode
  lead?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="cta-band">
      <div className="container-x section--tight relative text-center" style={{ zIndex: 1 }}>
        <Reveal>
          <p className="eyebrow eyebrow--plain justify-center">{eyebrow}</p>
          <h2 className="display mt-4">{title}</h2>
          <p className="lead mx-auto mt-4 max-w-xl">{lead}</p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {children ?? (
              <>
                <a href={WEB_APP_URL} className="btn btn--light btn--lg">
                  打开网页版（免安装）
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 3h7v7M13 3 7.5 8.5M9 13H3V7" /></svg>
                </a>
                <Link to="/download" className="btn btn--on-dark btn--lg">
                  下载 App v{CURRENT_RELEASE.version}
                </Link>
              </>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
