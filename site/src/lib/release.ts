export const APK_SHA256 = 'c908bdc68b0f17238b9d05381a2e94b04425c61a3ee21654e755fad8f184ed92'

export const CURRENT_RELEASE = {
  productName: '知习',
  version: '2.0.4',
  channel: '正式版',
  apkUrl: '/downloads/zhixi-v2.0.4.apk',
  minAndroid: 'Android 10（API 29）及以上',
  minAndroidShort: 'Android 10+',
  abi: 'arm64',
  sizeLabel: '50.5 MB',
  includesOfflineModel: false,
} as const

export const LEGACY_RELEASE = {
  productName: '水课雷达',
  version: '0.4.1',
  releasedAt: '2026-08-14',
  apkUrl: '/downloads/shuike-radar-v0.4.1.apk',
  sizeLabel: '约 132MB',
} as const
