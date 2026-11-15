const { getStore } = require('../../lib/repository')
const { formatDate, notifyError, confirm } = require('../../shared/ui')

function isActive(entity) {
  return entity && entity.deletedAtMillis == null
}

Page({
  data: {
    loading: true,
    reducedMotion: true,
    session: null,
    course: null,
    doubts: [],
    resolvedCount: 0,
    dateLabel: '',
    errorMessage: '',
    archiving: false
  },

  onLoad(options = {}) {
    this.sessionId = typeof options.id === 'string' ? options.id : ''
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    try {
      const snapshot = getStore().getSnapshot()
      const session = snapshot.sessions.find(item => item.id === this.sessionId && isActive(item))
      const course = session && snapshot.courses.find(item => item.id === session.courseId && isActive(item))
      const doubts = session && course ? snapshot.doubts
        .filter(item => item.sessionId === this.sessionId && isActive(item))
        .sort((a, b) => a.createdAtMillis - b.createdAtMillis)
        .map(item => Object.assign({}, item, {
          hasAnswer: Boolean(item.answer && item.answer.trim()),
          dateLabel: formatDate(item.createdAtMillis)
        })) : []
      this.setData({
        loading: false,
        reducedMotion: Boolean(snapshot.settings.reduceMotion),
        session: course ? session : null,
        course: course || null,
        doubts,
        resolvedCount: doubts.filter(item => item.hasAnswer).length,
        dateLabel: session ? formatDate(session.createdAtMillis) : '',
        errorMessage: ''
      })
    } catch (error) {
      this.setData({ loading: false, session: null, course: null, doubts: [], errorMessage: '课堂记录暂时无法读取，请重试。' })
      notifyError(error)
    }
  },

  navigate(url) {
    wx.navigateTo({ url, fail: () => notifyError(new Error('暂时无法打开页面，请稍后重试。')) })
  },

  addDoubt() {
    if (!this.data.session || this.data.archiving) return
    this.navigate(`/pages/editor/index?kind=doubt&sessionId=${encodeURIComponent(this.sessionId)}`)
  },

  resolveDoubt(event) {
    const doubt = this.data.doubts.find(item => item.id === event.currentTarget.dataset.id)
    if (!doubt || this.data.archiving) return
    this.navigate(`/pages/editor/index?kind=answer&doubtId=${encodeURIComponent(doubt.id)}`)
  },

  addCard() {
    if (!this.data.session || this.data.archiving) return
    const session = this.data.session
    this.navigate(`/pages/editor/index?kind=card&courseId=${encodeURIComponent(session.courseId)}&sourceId=${encodeURIComponent(session.id)}`)
  },

  openCourse() {
    if (!this.data.course) return
    this.navigate(`/pages/course/index?id=${encodeURIComponent(this.data.course.id)}`)
  },

  async archiveDoubt(event) {
    if (this.data.archiving) return
    const id = event.currentTarget.dataset.id
    if (!this.data.doubts.some(item => item.id === id)) return
    this.setData({ archiving: true })
    try {
      const accepted = await confirm({ title: '归档这个疑问？', content: '疑问及手动填写的解答将一起归档。资料不会永久删除，可在「我的」的回收站恢复。' })
      if (!accepted) return
      getStore().archive('doubts', id)
      this.refresh()
    } catch (error) {
      notifyError(error)
    } finally {
      this.setData({ archiving: false })
    }
  },

  async archiveSession() {
    if (!this.data.session || this.data.archiving) return
    this.setData({ archiving: true })
    try {
      const accepted = await confirm({
        title: '归档这节课堂？',
        content: '归档不会永久删除资料。若课堂仍有关联内容，系统会提示需要先处理的项目。归档后可在「我的」的回收站恢复。'
      })
      if (!accepted) return
      getStore().archive('sessions', this.sessionId)
      this.setData({ session: null, doubts: [] })
      this.goBack()
    } catch (error) {
      notifyError(error)
    } finally {
      this.setData({ archiving: false })
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1, fail: () => this.goHome() })
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index', fail: () => notifyError(new Error('暂时无法返回课程列表，请稍后重试。')) })
  }
})
