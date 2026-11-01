import type {
  Account,
  AccountWrite,
  AppConfig,
  Device,
  Overview,
  RequestRow,
  Session,
} from './types'

const BASE = '/admin/api'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'zhixi-admin',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new Event('zhixi-admin-auth-expired'))
    }
    const detail =
      typeof data?.detail === 'string'
        ? data.detail
        : data?.detail
          ? JSON.stringify(data.detail)
          : '请求失败'
    throw new Error(detail)
  }
  return data as T
}

export const api = {
  session: () => request<Session>('/session'),
  login: (password: string) =>
    request<{ authenticated: boolean; expiresAt: number }>('/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  logout: () => request<{ authenticated: boolean }>('/logout', { method: 'POST' }),
  overview: (days: number) => request<Overview>(`/overview?days=${days}`),
  accounts: (query = '') =>
    request<{ items: Account[]; total: number }>(
      `/accounts${query ? `?query=${encodeURIComponent(query)}` : ''}`,
    ),
  createAccount: (payload: AccountWrite) =>
    request<Account>('/accounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createAccountsBatch: (payload: {
    phones: string[]
    validUntil: string | null
    aiPacksPerDay: number
    audioMinutesPerDay: number
    textCharactersPerDay: number
    documentsPerDay: number
    maxDevices: number
    note: string
  }) =>
    request<{ created: number; skipped: number; invalid: string[] }>(
      '/accounts/batch',
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  updateAccount: (id: string, payload: AccountWrite) =>
    request<Account>(`/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteAccount: (id: string) =>
    request<{ deleted: boolean }>(`/accounts/${id}`, { method: 'DELETE' }),
  unbindAccount: (id: string) =>
    request<{ unbound: number }>(`/accounts/${id}/unbind`, { method: 'POST' }),
  devices: () => request<{ items: Device[]; total: number }>('/devices'),
  requests: (errorsOnly = false) =>
    request<{ items: RequestRow[]; total: number }>(
      `/requests?limit=300${errorsOnly ? '&errorsOnly=true' : ''}`,
    ),
  appConfig: () => request<AppConfig>('/app-config'),
  updateAppConfig: (payload: {
    announcementEnabled: boolean
    announcementTitle: string
    announcementBody: string
    taglines: string[]
  }) =>
    request<AppConfig>('/app-config', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
}
