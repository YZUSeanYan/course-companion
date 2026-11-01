import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router'
import LogoMark from './LogoMark'
import ScrollRail from './ScrollRail'
import { WEB_APP_URL } from '../../lib/release'

const LINKS = [
  { to: '/', label: '首页' },
  { to: '/features', label: '功能' },
  { to: '/download', label: '下载' },
  { to: '/apply', label: '申请试用' },
  { to: '/feedback', label: '反馈' },
]

export default function SiteNav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`nav-shell ${scrolled ? 'is-scrolled' : ''}`}>
      <ScrollRail />
      <div className="container-x flex items-center justify-between" style={{ height: 66 }}>
        <Link to="/" className="wiggle flex items-center gap-3" aria-label="知习首页" onClick={() => setOpen(false)}>
          <LogoMark size={32} />
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: 0 }}>知习</span>
          <span className="tagline hidden sm:inline" style={{ marginTop: 2 }}>听课 · 学习 · 复习</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <a href={WEB_APP_URL} className="btn btn--primary btn--sm">
            打开网页版
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 3h7v7M13 3 7.5 8.5M9 13H3V7" /></svg>
          </a>
        </div>

        <button
          type="button"
          className="flex flex-col gap-1.5 p-2 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? '关闭菜单' : '打开菜单'}
          aria-expanded={open}
        >
          <span className="block h-0.5 w-6 bg-current transition-transform" style={{ transform: open ? 'translateY(4px) rotate(45deg)' : 'none' }} />
          <span className="block h-0.5 w-6 bg-current transition-transform" style={{ transform: open ? 'translateY(-4px) rotate(-45deg)' : 'none' }} />
        </button>
      </div>

      {open && (
        <nav className="md:hidden hairline-t nav-drawer" style={{ background: 'var(--bg)' }}>
          <div className="container-x flex flex-col gap-1 py-4">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}
              >
                {l.label}
              </NavLink>
            ))}
            <a href={WEB_APP_URL} className="btn btn--primary mt-2" onClick={() => setOpen(false)}>
              打开网页版（免安装）
            </a>
          </div>
        </nav>
      )}
    </header>
  )
}
