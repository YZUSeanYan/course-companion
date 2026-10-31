import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../lib/api'
import { formatBytes, formatNumber, formatPercent } from '../lib/format'
import type { Overview } from '../lib/types'
import StatCard from '../components/StatCard'

const RANGES = [7, 30, 90]

export default function OverviewPage() {
  const [days, setDays] = useState(7)
  const [data, setData] = useState<Overview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load(range = days) {
    setBusy(true)
    setError('')
    try {
      setData(await api.overview(range))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load(days)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  const chartData =
    data?.series.map((item) => ({
      ...item,
      label: item.date.slice(5).replace('-', '/'),
    })) ?? []

  return (
    <div className="page-stack">
      <div className="toolbar">
        <div className="range-tabs">
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              className={range === days ? 'range-tab active' : 'range-tab'}
              onClick={() => setDays(range)}
            >
              近 {range} 天
            </button>
          ))}
        </div>
        <button className="ghost-button" type="button" onClick={() => void load()} disabled={busy}>
          {busy ? '刷新中…' : '刷新数据'}
        </button>
      </div>

      {error ? <div className="notice warning">{error}</div> : null}

      <div className="stat-grid">
        <StatCard
          label="接口请求"
          value={formatNumber(data?.totals.requests ?? 0)}
          hint={`${formatNumber(data?.totals.errors ?? 0)} 次失败`}
          tone="accent"
        />
        <StatCard
          label="AI 学习包"
          value={formatNumber(data?.totals.aiPacks ?? 0)}
          hint="成功生成次数"
        />
        <StatCard
          label="云端音频"
          value={`${formatNumber(data?.totals.audioMinutes ?? 0)} 分钟`}
          hint="已结算音频时长"
        />
        <StatCard
          label="翻译字符"
          value={formatNumber(data?.totals.textCharacters ?? 0)}
          hint="按源字符统计"
        />
        <StatCard
          label="活跃设备"
          value={formatNumber(data?.totals.activeDevices ?? 0)}
          hint={`${formatNumber(data?.totals.activeAccounts ?? 0)} 个账号有调用`}
        />
        <StatCard
          label="错误率"
          value={formatPercent(data?.totals.errorRate ?? 0)}
          hint="4xx / 5xx 占比"
          tone={(data?.totals.errorRate ?? 0) > 0.05 ? 'warn' : 'good'}
        />
        <StatCard
          label="试用账号"
          value={formatNumber(data?.totals.accounts ?? 0)}
          hint="后台已添加"
        />
        <StatCard
          label="注册设备"
          value={formatNumber(data?.totals.devices ?? 0)}
          hint="历史累计"
        />
      </div>

      <section className="panel chart-panel">
        <header className="panel-head">
          <div>
            <h2>每日使用趋势</h2>
            <p>请求量与 AI 学习包生成量，按北京时间自然日统计</p>
          </div>
          <span className="panel-meta">{busy ? '更新中' : `近 ${days} 天`}</span>
        </header>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="requestsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff670d" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ff670d" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="packsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2f6fed" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#2f6fed" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 6" stroke="rgba(23,23,23,0.08)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: 14,
                  border: '1px solid rgba(23,23,23,0.08)',
                  boxShadow: '0 12px 30px rgba(23,23,23,0.08)',
                }}
                labelFormatter={(label) => `日期 ${label}`}
              />
              <Area
                type="monotone"
                dataKey="requests"
                name="接口请求"
                stroke="#ff670d"
                strokeWidth={2.4}
                fill="url(#requestsFill)"
              />
              <Area
                type="monotone"
                dataKey="aiPacks"
                name="AI 学习包"
                stroke="#2f6fed"
                strokeWidth={2.2}
                fill="url(#packsFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="two-column">
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>接口分布</h2>
              <p>按调用次数排序</p>
            </div>
          </header>
          <div className="table-wrap compact">
            <table>
              <thead>
                <tr>
                  <th>接口</th>
                  <th>请求</th>
                  <th>错误</th>
                  <th>平均耗时</th>
                </tr>
              </thead>
              <tbody>
                {(data?.endpoints ?? []).map((item) => (
                  <tr key={item.route}>
                    <td className="mono">{item.route}</td>
                    <td>{formatNumber(item.requests)}</td>
                    <td>{formatNumber(item.errors)}</td>
                    <td>{item.avgDurationMs} ms</td>
                  </tr>
                ))}
                {!data?.endpoints.length ? (
                  <tr>
                    <td colSpan={4} className="empty-cell">
                      还没有请求记录
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <div className="side-stack">
          <section className="panel">
            <header className="panel-head">
              <div>
                <h2>模型使用</h2>
                <p>成功生成学习包所用模型</p>
              </div>
            </header>
            <div className="model-list">
              {(data?.models ?? []).map((item) => {
                const max = Math.max(1, ...(data?.models ?? []).map((m) => m.count))
                return (
                  <div className="model-row" key={item.model}>
                    <span>{item.model}</span>
                    <div className="model-bar">
                      <i style={{ width: `${Math.max(6, (item.count / max) * 100)}%` }} />
                    </div>
                    <strong>{formatNumber(item.count)}</strong>
                  </div>
                )
              })}
              {!data?.models.length ? <p className="muted">还没有模型调用</p> : null}
            </div>
          </section>

          <section className="panel service-panel">
            <header className="panel-head">
              <div>
                <h2>服务状态</h2>
                <p>网关与数据库概况</p>
              </div>
              <span className="status-pill good">
                <i />
                {data?.service.status === 'ok' ? '在线' : '检查中'}
              </span>
            </header>
            <dl className="service-list">
              <div>
                <dt>AI 模型配置</dt>
                <dd>{data?.service.providerConfigured ? '已配置' : '未配置'}</dd>
              </div>
              <div>
                <dt>数据库大小</dt>
                <dd>{formatBytes(data?.service.databaseSizeBytes ?? 0)}</dd>
              </div>
              <div>
                <dt>生成时间</dt>
                <dd>{data ? new Date(data.generatedAt).toLocaleString('zh-CN') : '—'}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}
