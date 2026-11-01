import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

const MAX_TAGLINES = 8
const MAX_TAGLINE_LENGTH = 40
const DEFAULT_TAGLINES = '知行合一\n学而时习之，不亦说乎'

export default function AppConfigPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const [enabled, setEnabled] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [taglinesText, setTaglinesText] = useState(DEFAULT_TAGLINES)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await api.appConfig()
      setEnabled(next.announcementEnabled)
      setTitle(next.announcementTitle)
      setBody(next.announcementBody)
      setTaglinesText(next.taglines.length > 0 ? next.taglines.join('\n') : DEFAULT_TAGLINES)
      setMessage('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const taglines = taglinesText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const invalidTagline = taglines.find((line) => line.length > MAX_TAGLINE_LENGTH)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (invalidTagline) {
      setError(`标语每条不超过 ${MAX_TAGLINE_LENGTH} 字：${invalidTagline}`)
      return
    }
    if (taglines.length > MAX_TAGLINES) {
      setError(`标语最多 ${MAX_TAGLINES} 条，当前 ${taglines.length} 条`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const next = await api.updateAppConfig({
        announcementEnabled: enabled,
        announcementTitle: title,
        announcementBody: body,
        taglines,
      })
      setEnabled(next.announcementEnabled)
      setTitle(next.announcementTitle)
      setBody(next.announcementBody)
      setTaglinesText(next.taglines.length > 0 ? next.taglines.join('\n') : DEFAULT_TAGLINES)
      setMessage('已保存，App 下次启动生效')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-stack">
      {error ? <div className="notice warning">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <form className="page-stack" onSubmit={submit}>
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>启动公告</h2>
              <p>启用后每次打开 App 都会联网检查并弹出；关闭立即停止展示</p>
            </div>
          </header>
          <div className="form-grid">
            <label className="checkbox" htmlFor="announcement-enabled">
              <input
                id="announcement-enabled"
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              启用启动公告
            </label>
            <label>
              公告标题
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={80}
                placeholder="例如：知习 V2.0.5 上线"
              />
            </label>
            <label className="span-two">
              公告正文
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={2000}
                rows={5}
                placeholder="面向所有试用用户的公告内容"
              />
            </label>
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>首页轮播标语</h2>
              <p>一行一条，最多 {MAX_TAGLINES} 条、每条不超过 {MAX_TAGLINE_LENGTH} 字；留空则用默认两句</p>
            </div>
          </header>
          <div className="form-grid">
            <label className="span-two">
              标语（{taglines.length} 条）
              <textarea
                value={taglinesText}
                onChange={(event) => setTaglinesText(event.target.value)}
                rows={4}
                placeholder={DEFAULT_TAGLINES}
              />
            </label>
          </div>
        </section>

        <div className="toolbar-actions">
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? '保存中…' : '保存配置'}
          </button>
          <button className="ghost-button" type="button" onClick={() => void load()} disabled={loading || saving}>
            {loading ? '加载中…' : '放弃修改并刷新'}
          </button>
        </div>
      </form>
    </div>
  )
}
