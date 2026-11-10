const { getStore } = require('../../lib/repository')
const { formatDate, notifyError, confirm } = require('../../shared/ui')

function isActive(entity) {
  return entity && entity.deletedAtMillis == null
}

function newestFirst(a, b) {
  return (b.updatedAtMillis || b.createdAtMillis) - (a.updatedAtMillis || a.createdAtMillis)
}

Page({
  data: {
    loading: true,
    reducedMotion: true,
    course: null,
    sessions: [],
    cards: [],
    errorMessage: '',
    archiving: false
  },

  onLoad(options = {}) {
    this.courseId = typeof options.id === 'string' ? options.id : ''
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    try {
      const snapshot = getStore().getSnapshot()
      const course = snapshot.courses.find(item => item.id === this.courseId && isActive(item))
      const sessions = snapshot.sessions.filter(item => item.courseId === this.courseId && isActive(item))
      const cards = snapshot.cards.filter(item => item.courseId === this.courseId && isActive(item))
      const activeDoubts = snapshot.doubts.filter(isActive)
      this.setData({
        loading: false,
        reducedMotion: Boolean(snapshot.settings.reduceMotion),
        course: course || null,
        sessions: course ? sessions.sort(newestFirst).map(item => ({
          id: item.id,
          title: item.title,
          dateLabel: formatDate(item.createdAtMillis),
          characterCount: item.transcript.length,
          doubtCount: activeDoubts.filter(doubt => doubt.sessionId === item.id).length
        })) : [],
        cards: course ? cards.sort(newestFirst).map(item => {
          const sourceDoubt = activeDoubts.find(doubt => doubt.id === item.sourceId)
          const source = sessions.find(session => session.id === (sourceDoubt ? sourceDoubt.sessionId : item.sourceId))
          return Object.assign({}, item, {
            originLabel: item.origin === 'DEMO' ? '示例卡片' : '手动整理',
            dueLabel: item.dueAtMillis <= Date.now() ? '待复习' : `${formatDate(item.dueAtMillis)}复习`,
            sourceSessionId: source ? source.id : '',
            sourceLabel: source ? source.title : (item.sourceId ? '来源课堂已归档或不可用' : '独立手动卡片')
          })
        }) : [],
        errorMessage: ''
      })
    } catch (error) {
      this.setData({ loading: false, course: null, sessions: [], cards: [], errorMessage: '课程暂时无法读取，请重试。' })
      notifyError(error)
    }
  },

  navigate(url) {
    wx.navigateTo({ url, fail: () => notifyError(new Error('暂时无法打开页面，请稍后重试。')) })
  },

  addSession() {
    if (!this.data.course || this.data.archiving) return
    this.navigate(`/pages/editor/index?kind=session&courseId=${encodeURIComponent(this.courseId)}`)
  },

  addCard() {
    if (!this.data.course || this.data.archiving) return
    this.navigate(`/pages/editor/index?kind=card&courseId=${encodeURIComponent(this.courseId)}`)
  },

  openSession(event) {
    const id = event.currentTarget.dataset.id
    if (!this.data.sessions.some(item => item.id === id)) return
    this.navigate(`/pages/session/index?id=${encodeURIComponent(id)}`)
  },

  openCardSource(event) {
    const card = this.data.cards.find(item => item.id === event.currentTarget.dataset.id)
    if (!card || !card.sourceSessionId) return
    this.navigate(`/pages/session/index?id=${encodeURIComponent(card.sourceSessionId)}`)
  },

  async archiveCard(event) {
    if (this.data.archiving) return
    const id = event.currentTarget.dataset.id
    if (!this.data.cards.some(item => item.id === id)) return
    this.setData({ archiving: true })
    try {
      const accepted = await confirm({ title: '归档这张卡片？', content: '归档后不再参与复习。资料不会永久删除，可在「我的」的回收站恢复。' })
      if (!accepted) return
      getStore().archive('cards', id)
      this.refresh()
    } catch (error) {
      notifyError(error)
    } finally {
      this.setData({ archiving: false })
    }
  },

  async archiveCourse() {
    if (!this.data.course || this.data.archiving) return
    this.setData({ archiving: true })
    try {
      const accepted = await confirm({
        title: '归档这门课程？',
        content: '归档不会永久删除资料。若课程仍有关联内容，系统会提示需要先处理的项目。归档后可在「我的」的回收站恢复。'
      })
      if (!accepted) return
      getStore().archive('courses', this.courseId)
      this.setData({ course: null, sessions: [], cards: [] })
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
