import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatDateTime, shortId } from '../lib/format'
import type { Device } from '../lib/types'

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const result = await api.devices()
      setDevices(result.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="page-stack">
      {error ? <div className="notice warning">{error}</div> : null}
      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>已注册设备</h2>
            <p>每台手机注册后会生成匿名设备 ID，激活手机号后绑定到试用账号</p>
          </div>
          <button className="ghost-button" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? '加载中…' : '刷新'}
          </button>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>设备 ID</th>
                <th>绑定手机号</th>
                <th>首次注册</th>
                <th>最近请求</th>
                <th>账号 ID</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.deviceId}>
                  <td className="mono" title={device.deviceId}>
                    {shortId(device.deviceId)}
                  </td>
                  <td>{device.phoneMasked}</td>
                  <td>{formatDateTime(device.createdAt)}</td>
                  <td>{formatDateTime(device.lastSeenAt)}</td>
                  <td className="mono">{shortId(device.accountId)}</td>
                </tr>
              ))}
              {!devices.length ? (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    {loading ? '正在加载…' : '还没有设备注册'}
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
