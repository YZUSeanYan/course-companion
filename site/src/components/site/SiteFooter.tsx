import { Link } from 'react-router'
import LogoMark from './LogoMark'
import { CURRENT_RELEASE } from '../../lib/release'

export default function SiteFooter() {
  return (
    <footer className="hairline-t" style={{ background: 'var(--surface)' }}>
      <div className="container-x py-14 grid gap-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-3">
            <LogoMark size={30} />
            <span style={{ fontWeight: 800, fontSize: 17 }}>知习</span>
          </div>
          <p className="body-2 mt-4 max-w-md" style={{ fontSize: 14 }}>
            本地离线听课与可选云端听课，支持音频导入、AI 学习包和间隔复习。
            离线模型按需下载；云端功能在你主动开启后处理相应音频、文本或页图。
          </p>
          <p className="mono-label mt-6">V{CURRENT_RELEASE.version} · LISTEN · LEARN · REVIEW · LOCAL-FIRST</p>
        </div>

        <div>
          <p className="mono-label mb-4">网站</p>
          <ul className="flex flex-col gap-2.5" style={{ fontSize: 14, fontWeight: 600 }}>
            <li><Link className="hover:text-[var(--brand)]" to="/features">功能介绍</Link></li>
            <li><Link className="hover:text-[var(--brand)]" to="/download">下载</Link></li>
            <li><Link className="hover:text-[var(--brand)]" to="/feedback">问题反馈</Link></li>
          </ul>
        </div>

        <div>
          <p className="mono-label mb-4">协议</p>
          <ul className="flex flex-col gap-2.5" style={{ fontSize: 14, fontWeight: 600 }}>
            <li><Link className="hover:text-[var(--brand)]" to="/privacy">隐私政策</Link></li>
            <li><Link className="hover:text-[var(--brand)]" to="/privacy#terms">使用条款</Link></li>
            <li><Link className="hover:text-[var(--brand)]" to="/privacy#permissions">权限说明</Link></li>
          </ul>
        </div>
      </div>

      <div className="hairline-t">
        <div className="container-x py-6 flex flex-col gap-4 items-center text-center">
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-3)' }}>
            © 2026 知习 · 前身为「水课雷达」 · 课堂录音与转写仅供个人学习使用，请勿传播
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-[var(--brand)]"
              style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-3)' }}
            >
              苏ICP备2026057230号
            </a>
            <span style={{ color: 'var(--ink-3)', opacity: 0.35 }}>|</span>
            <a
              href="https://beian.mps.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-[var(--brand)]"
              style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-3)' }}
            >
              <img src="/gongan-logo.png" alt="" style={{ height: 20, display: 'inline-block', verticalAlign: 'middle' }} />
              苏公网安备32100302011719号
            </a>
          </div>
          <p className="mono-label" style={{ color: 'var(--ink-3)' }}>
            当前试用免费 · 仅供个人学习使用 · 无商业许可
          </p>
        </div>
      </div>
    </footer>
  )
}
