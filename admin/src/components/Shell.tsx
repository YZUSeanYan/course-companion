import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { api } from '../lib/api'

const NAV = [
  { to: '/', label: '运营概览', end: true },
  { to: '/accounts', label: '试用账号' },
  { to: '/devices', label: '设备' },
  { to: '/requests', label: '请求记录' },
]

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: '运营概览', subtitle: '今天有多少人用、用了多少、哪里出错' },
  '/accounts': { title: '试用账号', subtitle: '添加手机号、配置每日额度与有效期' },
  '/devices': { title: '设备', subtitle: '已注册设备与绑定的试用账号' },
  '/requests': { title: '请求记录', subtitle: '接口调用、状态码与耗时，不记录请求正文' },
}

export default function Shell({ onLogout }: { onLogout: () => void }) {
  const location = useLocation()
  const meta = TITLES[location.pathname] ?? TITLES['/']

  async function handleLogout() {
    try {
      await api.logout()
    } finally {
      onLogout()
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">知</span>
          <div>
            <strong>知习</strong>
            <span>运营后台</span>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              <span className="nav-dot" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <a className="quiet-link" href="https://shuike.seanyan.store" target="_blank" rel="noreferrer">
            打开官网
          </a>
          <button className="ghost-button" type="button" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">ZHI XI · OPERATIONS</p>
            <h1>{meta.title}</h1>
            <p className="topbar-subtitle">{meta.subtitle}</p>
          </div>
          <div className="topbar-badge">
            <span className="live-dot" />
            管理员已登录
          </div>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
