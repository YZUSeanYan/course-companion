export type Session = {
  authenticated: boolean
  adminEnabled: boolean
  expiresAt?: number | null
}

export type Limits = {
  aiPacksPerDay: number
  audioMinutesPerDay: number
  textCharactersPerDay: number
  documentsPerDay: number
  maxDevices: number
}

export type Usage = {
  date: string
  aiPacks: number
  audioMinutes: number
  textCharacters: number
  documents: number
}

export type Account = {
  id: string
  phone: string
  phoneMasked: string
  displayName: string
  note: string
  status: 'active' | 'disabled'
  state: 'active' | 'expired' | 'disabled' | 'none'
  validUntil: string | null
  limits: Limits
  usageToday: Usage
  deviceCount: number
  createdAt: string
  updatedAt: string
}

export type AccountWrite = {
  phone?: string
  displayName: string
  note: string
  status?: 'active' | 'disabled'
  validUntil: string | null
  aiPacksPerDay: number
  audioMinutesPerDay: number
  textCharactersPerDay: number
  documentsPerDay: number
  maxDevices: number
}

export type Device = {
  deviceId: string
  createdAt: string
  lastSeenAt: string | null
  accountId: string | null
  phone: string
  phoneMasked: string
}

export type RequestRow = {
  id: number
  deviceId: string | null
  accountId: string | null
  phone: string
  phoneMasked: string
  method: string
  route: string
  status: number
  durationMs: number
  createdAt: string
}

export type Overview = {
  rangeDays: number
  generatedAt: string
  totals: {
    requests: number
    errors: number
    errorRate: number
    aiPacks: number
    audioMinutes: number
    textCharacters: number
    activeDevices: number
    activeAccounts: number
    accounts: number
    /**
     * 设备数。不同网关版本口径不同：线上 r20 返回的是「已绑定数」，
     * 仓库 main 返回的是「设备总数」，所以界面上用 deviceSummary() 统一折算。
     */
    devices: number
    /** 已绑定到账号的设备数（新版本网关才返回）。 */
    boundDevices?: number
    /** 未绑定账号的匿名设备数（r20 起返回）。 */
    unboundDevices?: number
  }
  series: Array<{
    date: string
    requests: number
    errors: number
    aiPacks: number
    audioMinutes: number
    textCharacters: number
  }>
  endpoints: Array<{
    route: string
    requests: number
    errors: number
    avgDurationMs: number
  }>
  models: Array<{ model: string; count: number }>
  service: {
    status: string
    providerConfigured: boolean
    adminEnabled: boolean
    databaseSizeBytes: number
  }
}

export type AppConfig = {
  announcementEnabled: boolean
  announcementTitle: string
  announcementBody: string
  taglines: string[]
  updatedAt: string | null
}
