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
    devices: number
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
