const { getStore } = require('../../lib/repository')
Page({
  data: { reduceMotion: true },
  onShow() {
    try { this.setData({ reduceMotion: getStore().getSnapshot().settings.reduceMotion }) } catch (_) { /* 隐私说明在存储损坏时也可阅读。 */ }
  }
})
