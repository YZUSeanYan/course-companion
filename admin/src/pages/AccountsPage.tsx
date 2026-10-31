import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { formatDate, formatNumber, stateLabel } from '../lib/format'
import type { Account, AccountWrite } from '../lib/types'
import Modal from '../components/Modal'

const EMPTY_FORM: AccountWrite = {
  phone: '',
  displayName: '',
  note: '',
  status: 'active',
  validUntil: null,
  aiPacksPerDay: 5,
  audioMinutesPerDay: 60,
  textCharactersPerDay: 20000,
  documentsPerDay: 5,
  maxDevices: 3,
}

const EMPTY_BATCH = {
  phones: '',
  note: '',
  validUntil: null as string | null,
  aiPacksPerDay: 5,
  audioMinutesPerDay: 60,
  textCharactersPerDay: 20000,
  documentsPerDay: 5,
  maxDevices: 3,
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [form, setForm] = useState<AccountWrite>(EMPTY_FORM)
  const [batch, setBatch] = useState(EMPTY_BATCH)
  const [saving, setSaving] = useState(false)

  async function load(search = query) {
    setLoading(true)
    setError('')
    try {
      const result = await api.accounts(search)
      setAccounts(result.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreate() {
    setForm({ ...EMPTY_FORM })
    setEditing('new')
  }

  function openEdit(account: Account) {
    setForm({
      phone: account.phone,
      displayName: account.displayName,
      note: account.note,
      status: account.status,
      validUntil: account.validUntil,
      aiPacksPerDay: account.limits.aiPacksPerDay,
      audioMinutesPerDay: account.limits.audioMinutesPerDay,
      textCharactersPerDay: account.limits.textCharactersPerDay,
      documentsPerDay: account.limits.documentsPerDay,
      maxDevices: account.limits.maxDevices,
    })
    setEditing(account)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    setSaving(true)
    setError('')
    try {
      if (editing === 'new') {
        await api.createAccount(form)
        setMessage(`已添加 ${form.phone}`)
      } else {
        await api.updateAccount(editing.id, form)
        setMessage(`已更新 ${form.phone || editing.phoneMasked}`)
      }
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function submitBatch(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const phones = batch.phones
        .split(/[\s,，;；]+/)
        .map((item) => item.trim())
        .filter(Boolean)
      const result = await api.createAccountsBatch({ ...batch, phones })
      setMessage(
        `批量添加完成：新增 ${result.created}，跳过重复 ${result.skipped}${
          result.invalid.length ? `，无效 ${result.invalid.length}` : ''
        }`,
      )
      setBatchOpen(false)
      setBatch(EMPTY_BATCH)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量添加失败')
    } finally {
      setSaving(false)
    }
  }

  async function remove(account: Account) {
    if (!window.confirm(`删除 ${account.phoneMasked} 的试用账号？手机号和绑定关系会被删除。`)) return
    try {
      await api.deleteAccount(account.id)
      setMessage('账号已删除')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  async function unbind(account: Account) {
    if (!window.confirm(`解绑 ${account.phoneMasked} 的全部 ${account.deviceCount} 台设备？`)) return
    try {
      const result = await api.unbindAccount(account.id)
      setMessage(`已解绑 ${result.unbound} 台设备`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '解绑失败')
    }
  }

  function toggleReveal(id: string) {
    setRevealed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const total = accounts.length

  return (
    <div className="page-stack">
      <div className="toolbar toolbar-wrap">
        <form
          className="search-row"
          onSubmit={(event) => {
            event.preventDefault()
            void load(query)
          }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索手机号、姓名或备注"
          />
          <button className="ghost-button" type="submit">
            搜索
          </button>
        </form>
        <div className="toolbar-actions">
          <button className="ghost-button" type="button" onClick={() => setBatchOpen(true)}>
            批量添加
          </button>
          <button className="primary-button" type="button" onClick={openCreate}>
            新增试用账号
          </button>
        </div>
      </div>

      {error ? <div className="notice warning">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}

      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>账号列表</h2>
            <p>共 {formatNumber(total)} 个账号，多台设备共用同一份每日额度</p>
          </div>
          <button className="ghost-button" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? '加载中…' : '刷新'}
          </button>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>手机号</th>
                <th>姓名 / 备注</th>
                <th>状态</th>
                <th>有效期</th>
                <th>今日用量</th>
                <th>设备</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const show = revealed.has(account.id)
                return (
                  <tr key={account.id}>
                    <td>
                      <div className="phone-cell">
                        <strong>{show && account.phone ? account.phone : account.phoneMasked}</strong>
                        {account.phone ? (
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => toggleReveal(account.id)}
                          >
                            {show ? '隐藏' : '显示'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="stacked-cell">
                        <span>{account.displayName || '未命名'}</span>
                        {account.note ? <small>{account.note}</small> : null}
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill ${account.state}`}>
                        <i />
                        {stateLabel(account.state)}
                      </span>
                    </td>
                    <td>{formatDate(account.validUntil)}</td>
                    <td>
                      <div className="usage-cell">
                        <span>
                          AI {account.usageToday.aiPacks}/{account.limits.aiPacksPerDay}
                        </span>
                        <span>
                          音频 {account.usageToday.audioMinutes}/{account.limits.audioMinutesPerDay} 分
                        </span>
                        <span>
                          字符 {formatNumber(account.usageToday.textCharacters)}/
                          {formatNumber(account.limits.textCharactersPerDay)}
                        </span>
                        <span>
                          文档 {account.usageToday.documents}/{account.limits.documentsPerDay}
                        </span>
                      </div>
                    </td>
                    <td>{account.deviceCount}</td>
                    <td>
                      <div className="row-actions">
                        <button className="link-button" type="button" onClick={() => openEdit(account)}>
                          编辑
                        </button>
                        <button className="link-button" type="button" onClick={() => void unbind(account)}>
                          解绑
                        </button>
                        <button className="link-button danger" type="button" onClick={() => void remove(account)}>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!accounts.length ? (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    {loading ? '正在加载…' : '还没有试用账号，先添加同学手机号'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {editing ? (
        <Modal
          title={editing === 'new' ? '新增试用账号' : '编辑试用账号'}
          description="手机号只用于额度管理；额度每天按北京时间重置，多台设备共用。"
          onClose={() => setEditing(null)}
          wide
          footer={
            <>
              <button className="ghost-button" type="button" onClick={() => setEditing(null)}>
                取消
              </button>
              <button className="primary-button" type="submit" form="account-form" disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </button>
            </>
          }
        >
          <form id="account-form" className="form-grid" onSubmit={submit}>
            <label>
              手机号
              <input
                value={form.phone ?? ''}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="11 位中国大陆手机号"
                inputMode="numeric"
                required
              />
            </label>
            <label>
              姓名 / 昵称
              <input
                value={form.displayName}
                onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                placeholder="例如：张同学"
              />
            </label>
            <label>
              有效期至
              <input
                type="date"
                value={form.validUntil ?? ''}
                onChange={(event) =>
                  setForm({ ...form, validUntil: event.target.value || null })
                }
              />
            </label>
            {editing !== 'new' ? (
              <label>
                状态
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as 'active' | 'disabled',
                    })
                  }
                >
                  <option value="active">正常</option>
                  <option value="disabled">停用</option>
                </select>
              </label>
            ) : null}
            <label>
              每日 AI 学习包
              <input
                type="number"
                min={0}
                value={form.aiPacksPerDay}
                onChange={(event) =>
                  setForm({ ...form, aiPacksPerDay: Number(event.target.value) })
                }
              />
            </label>
            <label>
              每日云端音频（分钟）
              <input
                type="number"
                min={0}
                value={form.audioMinutesPerDay}
                onChange={(event) =>
                  setForm({ ...form, audioMinutesPerDay: Number(event.target.value) })
                }
              />
            </label>
            <label>
              每日翻译字符
              <input
                type="number"
                min={0}
                value={form.textCharactersPerDay}
                onChange={(event) =>
                  setForm({ ...form, textCharactersPerDay: Number(event.target.value) })
                }
              />
            </label>
            <label>
              每日文档解析
              <input
                type="number"
                min={0}
                value={form.documentsPerDay}
                onChange={(event) =>
                  setForm({ ...form, documentsPerDay: Number(event.target.value) })
                }
              />
            </label>
            <label>
              最多设备数（0 为不限）
              <input
                type="number"
                min={0}
                value={form.maxDevices}
                onChange={(event) =>
                  setForm({ ...form, maxDevices: Number(event.target.value) })
                }
              />
            </label>
            <label className="span-two">
              备注
              <textarea
                rows={2}
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
                placeholder="例如：2026 秋季外教班，试用至 11 月 20 日"
              />
            </label>
          </form>
        </Modal>
      ) : null}

      {batchOpen ? (
        <Modal
          title="批量添加手机号"
          description="一行一个手机号，也可以粘贴逗号分隔的号码；统一套用下面的额度。"
          onClose={() => setBatchOpen(false)}
          wide
          footer={
            <>
              <button className="ghost-button" type="button" onClick={() => setBatchOpen(false)}>
                取消
              </button>
              <button className="primary-button" type="submit" form="batch-form" disabled={saving}>
                {saving ? '添加中…' : '批量添加'}
              </button>
            </>
          }
        >
          <form id="batch-form" className="form-grid" onSubmit={submitBatch}>
            <label className="span-two">
              手机号列表
              <textarea
                rows={5}
                value={batch.phones}
                onChange={(event) => setBatch({ ...batch, phones: event.target.value })}
                placeholder={'13900000001\n13900000002\n13900000003'}
                required
              />
            </label>
            <label>
              有效期至
              <input
                type="date"
                value={batch.validUntil ?? ''}
                onChange={(event) =>
                  setBatch({ ...batch, validUntil: event.target.value || null })
                }
              />
            </label>
            <label>
              每日 AI 学习包
              <input
                type="number"
                min={0}
                value={batch.aiPacksPerDay}
                onChange={(event) =>
                  setBatch({ ...batch, aiPacksPerDay: Number(event.target.value) })
                }
              />
            </label>
            <label>
              每日云端音频（分钟）
              <input
                type="number"
                min={0}
                value={batch.audioMinutesPerDay}
                onChange={(event) =>
                  setBatch({ ...batch, audioMinutesPerDay: Number(event.target.value) })
                }
              />
            </label>
            <label>
              每日翻译字符
              <input
                type="number"
                min={0}
                value={batch.textCharactersPerDay}
                onChange={(event) =>
                  setBatch({ ...batch, textCharactersPerDay: Number(event.target.value) })
                }
              />
            </label>
            <label>
              每日文档解析
              <input
                type="number"
                min={0}
                value={batch.documentsPerDay}
                onChange={(event) =>
                  setBatch({ ...batch, documentsPerDay: Number(event.target.value) })
                }
              />
            </label>
            <label>
              最多设备数（0 为不限）
              <input
                type="number"
                min={0}
                value={batch.maxDevices}
                onChange={(event) =>
                  setBatch({ ...batch, maxDevices: Number(event.target.value) })
                }
              />
            </label>
            <label className="span-two">
              备注
              <input
                value={batch.note}
                onChange={(event) => setBatch({ ...batch, note: event.target.value })}
                placeholder="统一备注，可留空"
              />
            </label>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
