export const APK_SHA256 = '6e5c4710d13ec222255abdd565e57112ba87805cf51202a4499139c1fd4976bc'

/** 网页版入口（与网关同源部署，无需配置即可使用） */
export const WEB_APP_URL = 'https://zhixi.seanyan.store/web/'

export const CURRENT_RELEASE = {
  productName: '知习',
  version: '2.0.5',
  channel: '正式版',
  apkUrl: '/downloads/zhixi-v2.0.5.apk',
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
