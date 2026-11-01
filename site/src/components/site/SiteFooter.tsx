import { Link } from 'react-router'
import LogoMark from './LogoMark'
import { CURRENT_RELEASE, WEB_APP_URL } from '../../lib/release'

export default function SiteFooter() {
  return (
    <footer className="band band--surface" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="container-x grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-3">
            <LogoMark size={30} />
            <span style={{ fontWeight: 800, fontSize: 17 }}>知习</span>
          </div>
          <p className="body-2 mt-4 max-w-md" style={{ fontSize: 14 }}>
            本地离线听课与可选云端听课，支持音频导入、AI 学习包和间隔复习。
            网页版免安装，iPhone / iPad 同样可用；离线模型按需下载，云端功能在你主动开启后处理相应音频、文本或页图。
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href={WEB_APP_URL} className="btn btn--ghost btn--sm">打开网页版</a>
            <Link to="/apply" className="btn btn--ghost btn--sm">申请试用</Link>
          </div>
          <p className="tiny mt-5" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
            V{CURRENT_RELEASE.version} · LISTEN · LEARN · REVIEW · LOCAL-FIRST
          </p>
        </div>

        <div>
          <p className="tagline mb-4" style={{ letterSpacing: '0.14em' }}>产品</p>
          <ul className="flex flex-col gap-2.5" style={{ fontSize: 14, fontWeight: 600 }}>
            <li><Link className="hover:text-[var(--brand-deep)]" to="/features">功能介绍</Link></li>
            <li><Link className="hover:text-[var(--brand-deep)]" to="/download">下载与安装</Link></li>
            <li><a className="hover:text-[var(--brand-deep)]" href={WEB_APP_URL}>网页版</a></li>
            <li><Link className="hover:text-[var(--brand-deep)]" to="/apply">试用额度</Link></li>
          </ul>
        </div>

        <div>
          <p className="tagline mb-4" style={{ letterSpacing: '0.14em' }}>协议与支持</p>
          <ul className="flex flex-col gap-2.5" style={{ fontSize: 14, fontWeight: 600 }}>
            <li><Link className="hover:text-[var(--brand-deep)]" to="/privacy">隐私政策</Link></li>
            <li><Link className="hover:text-[var(--brand-deep)]" to="/privacy#terms">使用条款</Link></li>
            <li><Link className="hover:text-[var(--brand-deep)]" to="/privacy#permissions">权限说明</Link></li>
            <li><Link className="hover:text-[var(--brand-deep)]" to="/feedback">问题反馈</Link></li>
          </ul>
        </div>
      </div>

      <div className="hairline-t">
        <div className="container-x flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--brand-deep)]"
              style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-3)' }}
            >
              苏ICP备2026057230号
            </a>
            <span style={{ color: 'var(--ink-3)', opacity: 0.4 }}>|</span>
            <a
              href="https://beian.mps.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-[var(--brand-deep)]"
              style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-3)' }}
            >
              <img src="/gongan-logo.png" alt="" style={{ height: 18, display: 'inline-block', verticalAlign: 'middle' }} />
              苏公网安备32100302011719号
            </a>
          </div>
          <p className="tiny">
            © 2026 知习 · 前身为「水课雷达」 · 课堂录音与转写仅供个人学习使用，请勿传播 · 当前试用免费
          </p>
        </div>
      </div>
    </footer>
  )
}
