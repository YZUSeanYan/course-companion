const { getStore } = require('../../lib/repository')
const { formatDate, notifyError, confirm, syncTab } = require('../../shared/ui')

Page({
  data: { courses: [], dueCount: 0, sessionCount: 0, cardCount: 0, reduceMotion: true, error: '' },
  onShow() {
    syncTab(this, 0)
    this.refresh()
  },
  refresh() {
    try {
      const store = getStore()
      const state = store.getSnapshot()
      const sessions = state.sessions.filter(item => item.deletedAtMillis === null)
      const cards = state.cards.filter(item => item.deletedAtMillis === null)
      this.setData({
        courses: state.courses.filter(item => item.deletedAtMillis === null).map(course => Object.assign({}, course, {
          initial: course.name.slice(0, 1),
          sessionCount: sessions.filter(item => item.courseId === course.id).length,
          cardCount: cards.filter(item => item.courseId === course.id).length,
          dateLabel: formatDate(course.createdAtMillis)
        })),
        dueCount: store.dueCards(Date.now()).length,
        sessionCount: sessions.length,
        cardCount: cards.length,
        reduceMotion: state.settings.reduceMotion,
        error: ''
      })
    } catch (error) { this.setData({ error: error.message }) }
  },
  addCourse() { wx.navigateTo({ url: '/pages/editor/index?kind=course' }) },
  openCourse(event) { wx.navigateTo({ url: `/pages/course/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` }) },
  openReview() { wx.switchTab({ url: '/pages/review/index' }) },
  async seedDemo() {
    if (!await confirm({ title: '添加一份演示课程？', content: '仅添加本机合成示例，不调用 AI、不上传数据。示例可移入回收站。' })) return
    try { getStore().seedDemo(); this.refresh() } catch (error) { notifyError(error) }
  }
})
