import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { api } from './lib/api'
import type { Session } from './lib/types'
import Shell from './components/Shell'
import LoginPage from './pages/LoginPage'
import OverviewPage from './pages/OverviewPage'
import AccountsPage from './pages/AccountsPage'
import DevicesPage from './pages/DevicesPage'
import RequestsPage from './pages/RequestsPage'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .session()
      .then(setSession)
      .catch(() => setSession({ authenticated: false, adminEnabled: false }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const handler = () =>
      setSession({ authenticated: false, adminEnabled: true })
    window.addEventListener('zhixi-admin-auth-expired', handler)
    return () => window.removeEventListener('zhixi-admin-auth-expired', handler)
  }, [])

  if (loading) {
    return (
      <div className="splash">
        <div className="splash-mark">知</div>
        <p>正在连接知习运营后台…</p>
      </div>
    )
  }

  const authenticated = Boolean(session?.authenticated)

  return (
    <HashRouter>
      <Routes>
        <Route
          path="/login"
          element={
            authenticated ? (
              <Navigate to="/" replace />
            ) : (
              <LoginPage session={session} onLogin={setSession} />
            )
          }
        />
        <Route
          element={
            authenticated ? (
              <Shell
                onLogout={() => setSession({ authenticated: false, adminEnabled: true })}
              />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route index element={<OverviewPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="requests" element={<RequestsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
