export const APK_SHA256 = '184b7ab5b7543f7b09401064478aa45b73ea31fe0b65e95eff3f81117e91be93'

export const CURRENT_RELEASE = {
  productName: '知习',
  version: '2.0.2',
  channel: '正式版',
  apkUrl: '/downloads/zhixi-v2.0.2.apk',
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
