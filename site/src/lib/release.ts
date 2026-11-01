export const APK_SHA256 = 'c8997c12fcfc60200d95865d39f75d0b06ea925ab9eb253f795e376241d642c5'

/** 网页版入口（与网关同源部署，无需配置即可使用） */
export const WEB_APP_URL = 'https://zhixi.seanyan.store/web/'

export const CURRENT_RELEASE = {
  productName: '知习',
  version: '2.0.6',
  channel: '正式版',
  // 自 2.0.6 起安装包直接走 Gitee（国内约 2MB/s，ECS 仅 3M 带宽）。
  apkUrl: 'https://gitee.com/seanyan-dev/zhixi-apk/releases/download/v2.0.6/zhixi-v2.0.6.apk',
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
