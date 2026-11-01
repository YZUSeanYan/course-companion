import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router'
import SiteNav from './components/site/SiteNav'
import SiteFooter from './components/site/SiteFooter'
import Home from './pages/Home'
import Features from './pages/Features'
import Download from './pages/Download'
import Apply from './pages/Apply'
import Feedback from './pages/Feedback'
import Privacy from './pages/Privacy'

function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      // 等待页面渲染后滚动到锚点
      const t = window.setTimeout(() => {
        const el = document.querySelector(hash)
        if (el) {
          const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
          el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
          return
        }
        window.scrollTo({ top: 0 })
      }, 80)
      return () => window.clearTimeout(t)
    }
    window.scrollTo({ top: 0 })
  }, [pathname, hash])
  return null
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <ScrollManager />
      <SiteNav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/features" element={<Features />} />
          <Route path="/download" element={<Download />} />
          <Route path="/apply" element={<Apply />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <SiteFooter />
    </div>
  )
}
