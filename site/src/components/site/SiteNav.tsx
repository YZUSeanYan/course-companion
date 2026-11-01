import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router'
import LogoMark from './LogoMark'

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
      <div className="container-x flex items-center justify-between" style={{ height: 68 }}>
        <Link to="/" className="wiggle flex items-center gap-3" aria-label="知习首页" onClick={() => setOpen(false)}>
          <LogoMark />
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.01em' }}>
            知习
          </span>
          <span
            className="mono-label mono-label--brand hidden sm:inline"
            style={{ marginTop: 4 }}
          >
            听课 · 学习 · 复习
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              end={l.to === '/'}
              className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden md:block">
          <Link to="/download" className="btn btn-primary" style={{ padding: '10px 22px', fontSize: 14 }}>
            下载 App
          </Link>
        </div>

        <button
          type="button"
          className="md:hidden flex flex-col gap-1.5 p-2"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? '关闭菜单' : '打开菜单'}
          aria-expanded={open}
        >
          <span
            className="block h-0.5 w-6 bg-current transition-transform"
            style={{ transform: open ? 'translateY(4px) rotate(45deg)' : 'none' }}
          />
          <span
            className="block h-0.5 w-6 bg-current transition-transform"
            style={{ transform: open ? 'translateY(-4px) rotate(-45deg)' : 'none' }}
          />
        </button>
      </div>

      {open && (
        <nav className="md:hidden hairline-t bg-[var(--bg)]">
          <div className="container-x py-4 flex flex-col gap-1">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
              onClick={() => setOpen(false)}
                end={l.to === '/'}
                className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}
              >
                {l.label}
              </NavLink>
            ))}
            <Link to="/download" className="btn btn-primary mt-2 justify-center" onClick={() => setOpen(false)}>
              下载 App
            </Link>
          </div>
        </nav>
      )}
    </header>
  )
}
