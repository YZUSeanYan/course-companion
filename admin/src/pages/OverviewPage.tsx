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

/** 趋势图可选指标。series 里四个维度都有，早先只画了请求与学习包两条线。 */
const METRICS = [
  { key: 'requests', label: '接口请求', color: '#ff670d', unit: ' 次' },
  { key: 'aiPacks', label: 'AI 学习包', color: '#2f6fed', unit: ' 个' },
  { key: 'audioMinutes', label: '云端音频', color: '#2f9e6e', unit: ' 分钟' },
  { key: 'textCharacters', label: '翻译字符', color: '#8b5cf6', unit: ' 字' },
] as const

type MetricKey = (typeof METRICS)[number]['key']

/**
 * 设备数口径在不同网关版本间不一致：
 *   - 线上 r20 / 早期代码：devices = 已绑定数，另有 unboundDevices；
 *   - 仓库 main 及以后：devices = 设备总数，另有 boundDevices / unboundDevices。
 * 这里统一折算成「总数 / 已绑定 / 匿名」，界面就不用关心服务端是哪一版。
 */
function deviceSummary(totals: Overview['totals'] | undefined) {
  const raw = totals?.devices ?? 0
  const unbound = totals?.unboundDevices ?? 0
  if (totals?.boundDevices != null) {
    return { total: raw, bound: totals.boundDevices, unbound }
  }
  if (totals?.unboundDevices != null) {
    return { total: raw + unbound, bound: raw, unbound }
  }
  return { total: raw, bound: raw, unbound: 0 }
}

export default function OverviewPage() {
  const [days, setDays] = useState(7)
  const [metric, setMetric] = useState<MetricKey>('requests')
  const [data, setData] = useState<Overview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const activeMetric = METRICS.find((item) => item.key === metric) ?? METRICS[0]
  const devices = deviceSummary(data?.totals)

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
        {/* 请求与错误率合并：分母相同，分开看反而要来回对照 */}
        <StatCard
          label="接口请求"
          value={formatNumber(data?.totals.requests ?? 0)}
          hint={`失败 ${formatNumber(data?.totals.errors ?? 0)} 次 · 错误率 ${formatPercent(data?.totals.errorRate ?? 0)}`}
          tone={(data?.totals.errorRate ?? 0) > 0.05 ? 'warn' : 'accent'}
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
        {/* 账号与设备合成一张：都是存量口径，拆成两张时并列在区间指标里容易被误读 */}
        <StatCard
          label="账号 / 设备"
          value={`${formatNumber(data?.totals.accounts ?? 0)} / ${formatNumber(devices.total)}`}
          hint={`设备 ${formatNumber(devices.bound)} 台已绑定 · ${formatNumber(devices.unbound)} 台匿名`}
        />
      </div>

      <section className="panel chart-panel">
        <header className="panel-head">
          <div>
            <h2>每日使用趋势</h2>
            <p>按北京时间自然日统计，可切换指标查看不同用量</p>
          </div>
          <div className="range-tabs">
            {METRICS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={item.key === metric ? 'range-tab active' : 'range-tab'}
                onClick={() => setMetric(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={activeMetric.color} stopOpacity={0.34} />
                  <stop offset="100%" stopColor={activeMetric.color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 6" stroke="rgba(23,23,23,0.08)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={12}
                allowDecimals={metric === 'audioMinutes'}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 14,
                  border: '1px solid rgba(23,23,23,0.08)',
                  boxShadow: '0 12px 30px rgba(23,23,23,0.08)',
                }}
                labelFormatter={(label) => `日期 ${label}`}
                formatter={(value) => [`${value}${activeMetric.unit}`, activeMetric.label]}
              />
              <Area
                type="monotone"
                dataKey={activeMetric.key}
                name={activeMetric.label}
                stroke={activeMetric.color}
                strokeWidth={2.4}
                fill="url(#metricFill)"
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
