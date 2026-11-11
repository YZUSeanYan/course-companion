export const APK_SHA256 = 'f1794c85bcbaa28805a8b7e1603095e21e15fffd9222df2fa34bfd720d2fd866'

/** 网页版入口（与网关同源部署，无需配置即可使用） */
export const WEB_APP_URL = 'https://zhixi.seanyan.store/web/'

export const CURRENT_RELEASE = {
  productName: '知习',
  version: '2.0.11',
  channel: '正式版',
  // 默认走 Gitee 分发；备用地址直连官网，不经过加速重定向。
  apkUrl: 'https://gitee.com/seanyan-dev/zhixi-apk/releases/download/v2.0.11/zhixi-v2.0.11.apk',
  backupApkUrl: 'https://shuike.seanyan.store/downloads/backup/zhixi-v2.0.11.apk',
  minAndroid: 'Android 10（API 29）及以上',
  minAndroidShort: 'Android 10+',
  abi: 'arm64',
  sizeLabel: '50.9 MB',
  includesOfflineModel: false,
} as const

export const LEGACY_RELEASE = {
  productName: '水课雷达',
  version: '0.4.1',
  releasedAt: '2026-08-14',
  apkUrl: '/downloads/shuike-radar-v0.4.1.apk',
  sizeLabel: '约 132MB',
} as const
