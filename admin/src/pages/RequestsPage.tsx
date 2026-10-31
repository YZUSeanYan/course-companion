import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatDateTime, shortId } from '../lib/format'
import type { RequestRow } from '../lib/types'

export default function RequestsPage() {
  const [rows, setRows] = useState<RequestRow[]>([])
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(onlyErrors = errorsOnly) {
    setLoading(true)
    setError('')
    try {
      const result = await api.requests(onlyErrors)
      setRows(result.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(errorsOnly)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorsOnly])

  return (
    <div className="page-stack">
      <div className="toolbar">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(event) => setErrorsOnly(event.target.checked)}
          />
          只看失败请求
        </label>
        <button className="ghost-button" type="button" onClick={() => void load()} disabled={loading}>
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>

      {error ? <div className="notice warning">{error}</div> : null}

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>最近请求</h2>
            <p>只记录方法、路由、状态与耗时，不保存请求正文和手机号明文</p>
          </div>
          <span className="panel-meta">{rows.length} 条</span>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>方法</th>
                <th>接口</th>
                <th>状态</th>
                <th>耗时</th>
                <th>手机号</th>
                <th>设备</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td className="mono">{row.method}</td>
                  <td className="mono">{row.route}</td>
                  <td>
                    <span className={`http-status ${row.status >= 400 ? 'bad' : 'good'}`}>
                      {row.status}
                    </span>
                  </td>
                  <td>{row.durationMs} ms</td>
                  <td>{row.phoneMasked}</td>
                  <td className="mono" title={row.deviceId ?? ''}>
                    {shortId(row.deviceId)}
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    {loading ? '正在加载…' : '还没有请求记录'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
