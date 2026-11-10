const { getStore } = require('../../lib/repository')
const { notifyError, syncTab } = require('../../shared/ui')

Page({
  data: { current: null, revealed: false, completed: 0, total: 0, progress: 0, reduceMotion: true, busy: false, error: '', courseName: '' },
  onShow() { syncTab(this, 1); this.startSession() },
  startSession() {
    try {
      const store = getStore()
      const state = store.getSnapshot()
      this.queue = store.dueCards(Date.now()).map(card => card.id)
      this.setData({ completed: 0, total: this.queue.length, progress: 0, reduceMotion: state.settings.reduceMotion, error: '', busy: false })
      this.showNext()
    } catch (error) { this.setData({ error: error.message, current: null }) }
  },
  showNext() {
    const state = getStore().getSnapshot()
    let current = null
    while (this.queue.length && !current) {
      const id = this.queue.shift()
      current = state.cards.find(card => card.id === id && card.deletedAtMillis === null) || null
    }
    const course = current && state.courses.find(item => item.id === current.courseId)
    this.setData({ current, courseName: course ? course.name : '', revealed: false, busy: false })
  },
  reveal() { if (this.data.current && !this.data.busy) this.setData({ revealed: true }) },
  rate(event) {
    if (!this.data.current || !this.data.revealed || this.data.busy) return
    const rating = event.currentTarget.dataset.rating
    if (!['again', 'hard', 'good', 'easy'].includes(rating)) return
    this.setData({ busy: true })
    try {
      getStore().rateCard(this.data.current.id, rating, Date.now())
      const completed = this.data.completed + 1
      this.setData({ completed, progress: Math.round(completed / this.data.total * 100) })
      this.showNext()
    } catch (error) { this.setData({ busy: false }); notifyError(error) }
  },
  openSource() {
    const card = this.data.current
    if (!card || !card.sourceId) return
    const state = getStore().getSnapshot()
    const doubt = state.doubts.find(item => item.id === card.sourceId)
    const sourceId = doubt ? doubt.sessionId : card.sourceId
    wx.navigateTo({ url: `/pages/session/index?id=${encodeURIComponent(sourceId)}` })
  },
  goLearn() { wx.switchTab({ url: '/pages/home/index' }) }
})
