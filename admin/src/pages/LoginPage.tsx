import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Session } from '../lib/types'

export default function LoginPage({
  session,
  onLogin,
}: {
  session: Session | null
  onLogin: (session: Session) => void
}) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api.login(password)
      onLogin({ authenticated: true, adminEnabled: true, expiresAt: result.expiresAt })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  const disabled = session?.adminEnabled === false

  return (
    <div className="login-page">
      <div className="login-orb orb-one" />
      <div className="login-orb orb-two" />
      <section className="login-card">
        <div className="login-brand">
          <span className="brand-mark large">知</span>
          <div>
            <h1>知习 · 运营后台</h1>
            <p>试用额度、API 用量与服务运营</p>
          </div>
        </div>

        {disabled ? (
          <div className="notice warning">
            服务端尚未配置 <code>ADMIN_PASSWORD</code>，管理后台当前不可用。请在服务器
            <code>/opt/zhixi-gateway/.env</code> 中设置管理员密码与
            <code>ADMIN_SESSION_SECRET</code> 后重启网关。
          </div>
        ) : (
          <form onSubmit={submit} className="login-form">
            <label htmlFor="admin-password">管理员密码</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入服务器 .env 中配置的管理员密码"
              autoFocus
            />
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-button full" type="submit" disabled={busy || !password}>
              {busy ? '正在验证…' : '进入后台'}
            </button>
          </form>
        )}

        <footer className="login-foot">
          <span>仅限项目管理员</span>
          <a href="https://shuike.seanyan.store" target="_blank" rel="noreferrer">
            知习官网
          </a>
        </footer>
      </section>
    </div>
  )
}
