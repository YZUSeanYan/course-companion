const { getStore } = require('../../lib/repository')
const { formatDate, notifyError, confirm, syncTab } = require('../../shared/ui')
const kinds = { courses: '课程', sessions: '学习资料', doubts: '疑问', cards: '复习卡' }

Page({
  data: { reduceMotion: true, trash: [], busy: false, backupReady: false, error: '', version: '0.1.0-local' },
  onShow() { syncTab(this, 2); this.refresh() },
  refresh() {
    try {
      const state = getStore().getSnapshot()
      const trash = []
      Object.keys(kinds).forEach(kind => state[kind].filter(item => item.deletedAtMillis !== null).forEach(item => {
        trash.push({ id: item.id, kind, label: kinds[kind], title: item.name || item.title || item.note || item.front || '未命名条目', date: formatDate(item.deletedAtMillis) })
      }))
      this.setData({ reduceMotion: state.settings.reduceMotion, trash, error: '' })
    } catch (error) { this.setData({ error: error.message }) }
  },
  toggleMotion(event) {
    try { getStore().updateSettings({ reduceMotion: event.detail.value }); this.refresh() } catch (error) { this.refresh(); notifyError(error) }
  },
  async exportBackup() {
    if (this.data.busy) return
    if (typeof wx.shareFileMessage !== 'function') return notifyError(new Error('当前微信不支持文件备份分享，请升级微信后重试。'))
    this.setData({ busy: true })
    try {
      if (!await confirm({ title: '导出未加密的备份？', content: '备份包含课程、资料、疑问、答案及回收站。文件仅在你选择分享后发送给目标会话，请勿发到群聊或不可信联系人。' })) {
        this.setData({ busy: false }); return
      }
      const text = getStore().exportBackup()
      const path = `${wx.env.USER_DATA_PATH}/zhixi-backup-${Date.now()}.json`
      wx.getFileSystemManager().writeFile({
        filePath: path, data: text, encoding: 'utf8',
        success: () => {
          this.backupPath = path
          this.setData({ busy: false, backupReady: true })
          wx.showToast({ title: '已生成，请点保存', icon: 'none' })
        },
        fail: () => { this.setData({ busy: false }); notifyError(new Error('备份文件写入失败，请检查可用空间。')) }
      })
    } catch (_) { this.setData({ busy: false }); notifyError(new Error('无法生成备份，现有学习资料未更改。请检查本机存储后重试。')) }
  },
  shareBackup() {
    if (!this.backupPath || this.data.busy) return
    this.setData({ busy: true })
    try {
      wx.shareFileMessage({
        filePath: this.backupPath,
        fileName: '知习学习备份.json',
        fail: error => { if (!/cancel/i.test(error.errMsg || '')) notifyError(new Error('未能打开分享窗口，备份未发送。')) },
        complete: () => this.setData({ busy: false })
      })
    } catch (_) { this.setData({ busy: false }); notifyError(new Error('无法打开文件分享，备份未发送。')) }
  },
  async importBackup() {
    if (this.data.busy) return
    if (typeof wx.chooseMessageFile !== 'function') return notifyError(new Error('当前微信不支持从会话选择备份，请升级后重试。'))
    this.setData({ busy: true })
    try {
      if (!await confirm({ title: '导入知习小程序备份？', content: '从你选择的微信会话 JSON 文件读取并合并到本机，不上传。不是 Android/网页数据库导入；同一 ID 内容冲突会拒绝，不会覆盖已有资料。请只选可信备份。' })) {
        this.setData({ busy: false }); return
      }
      wx.chooseMessageFile({ count: 1, type: 'file', extension: ['json'],
        success: result => this.readBackupFile(result),
        fail: error => {
          this.setData({ busy: false })
          if (!/cancel/i.test(error.errMsg || '')) notifyError(new Error('文件选择失败，原有资料未更改。'))
        }
      })
    } catch (_) { this.setData({ busy: false }); notifyError(new Error('无法选择备份文件，原有资料未更改。')) }
  },
  readBackupFile(result) {
    const file = result.tempFiles && result.tempFiles[0]
    if (!file || !Number.isFinite(file.size) || file.size < 0 || file.size > 1024 * 1024 || typeof file.path !== 'string') {
      this.setData({ busy: false }); return notifyError(new Error('请选择不超过 1MB 的知习 JSON 备份。'))
    }
    try {
      wx.getFileSystemManager().readFile({ filePath: file.path, encoding: 'utf8',
        success: data => {
          try {
            getStore().importBackup(data.data)
            this.refresh()
            wx.showToast({ title: '备份已合并', icon: 'success' })
          } catch (error) { notifyError(error) }
          finally { this.setData({ busy: false }) }
        },
        fail: () => { this.setData({ busy: false }); notifyError(new Error('无法读取所选文件，原有资料未更改。')) },
        complete: () => this.setData({ busy: false })
      })
    } catch (_) { this.setData({ busy: false }); notifyError(new Error('无法读取备份，原有资料未更改。')) }
  },
  async restore(event) {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      if (!await confirm({ title: '恢复这个条目？', content: '恢复后会重新出现在学习或复习页面。若所属课程或资料仍在回收站，请先恢复它们。' })) return
      getStore().restore(event.currentTarget.dataset.kind, event.currentTarget.dataset.id)
      this.refresh()
    } catch (error) { notifyError(error) }
    finally { this.setData({ busy: false }) }
  },
  openPrivacy() { wx.navigateTo({ url: '/pages/privacy/index' }) }
})
