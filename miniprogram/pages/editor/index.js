const { getStore } = require('../../lib/repository')
const { notifyError } = require('../../shared/ui')

const FORMS = {
  course: { title: '新建课程', caption: '为一门课，留一个整理知识的地方。', fields: ['name', 'teacher', 'language'] },
  session: { title: '新增课堂记录', caption: '手动输入或粘贴文字，保留你想回顾的课堂内容。', fields: ['title', 'transcript'] },
  doubt: { title: '标记疑问', caption: '留下原文片段，再记下你想弄明白的问题。', fields: ['sourceText', 'note'] },
  card: { title: '手动添加卡片', caption: '一张卡片，一个值得记住的知识点。', fields: ['front', 'back'] },
  answer: { title: '填写解答', caption: '用自己的话整理答案，记得核对课堂原文。', fields: ['answer'] }
}
const RULES = {
  name: { label: '课程名称', max: 80, required: true },
  teacher: { label: '教师', max: 80 },
  language: { label: '授课语言', max: 80 },
  title: { label: '课堂标题', max: 120, required: true },
  transcript: { label: '课堂原文', max: 30000, required: true },
  sourceText: { label: '原文片段', max: 2000, required: true },
  note: { label: '我的疑问', max: 2000 },
  front: { label: '卡片正面', max: 2000, required: true },
  back: { label: '卡片背面', max: 4000, required: true },
  answer: { label: '我的解答', max: 4000, required: true }
}

function activeRecord(items, id, message) {
  const record = items.find(item => item.id === id && item.deletedAtMillis == null)
  if (!record) throw new Error(message)
  return record
}

Page({
  data: {
    kind: '',
    title: '手动整理',
    caption: '',
    reducedMotion: true,
    ready: false,
    loading: true,
    submitting: false,
    saved: false,
    contextLabel: '',
    contextDetail: '',
    sourceText: '',
    doubtNote: '',
    errorMessage: '',
    formError: '',
    errors: {},
    values: { name: '', teacher: '', language: '中英双语', title: '', transcript: '', sourceText: '', note: '', front: '', back: '', answer: '' }
  },

  onLoad(options = {}) {
    this.query = {
      courseId: typeof options.courseId === 'string' ? options.courseId : '',
      sessionId: typeof options.sessionId === 'string' ? options.sessionId : '',
      doubtId: typeof options.doubtId === 'string' ? options.doubtId : '',
      sourceId: typeof options.sourceId === 'string' ? options.sourceId : ''
    }
    const kind = options.kind
    if (!Object.prototype.hasOwnProperty.call(FORMS, kind)) {
      this.setData({ loading: false, errorMessage: '无法识别这个编辑入口，请返回后重试。' })
      return
    }
    this.setData({ kind, title: FORMS[kind].title, caption: FORMS[kind].caption })
  },

  onShow() {
    if (!this.data.kind || this.data.saved) return
    this.refreshContext()
  },

  getContext(snapshot) {
    const kind = this.data.kind
    const query = this.query
    if (kind === 'course') return { label: '课程档案', detail: '课程与学习资料只保存在本机，不会自动同步。' }
    if (kind === 'session' || kind === 'card') {
      const course = activeRecord(snapshot.courses, query.courseId, '课程不存在或已归档，请返回课程列表后重试。')
      if (kind === 'session' || !query.sourceId) {
        return { courseId: course.id, label: course.name, detail: kind === 'card' ? '独立卡片 · 本次不关联课堂来源' : '手动记录 · 不录音、不自动转写' }
      }
      const doubt = snapshot.doubts.find(item => item.id === query.sourceId && item.deletedAtMillis == null)
      const session = activeRecord(snapshot.sessions, doubt ? doubt.sessionId : query.sourceId, '卡片来源不存在或已归档，请返回后重试。')
      if (session.courseId !== course.id) throw new Error('卡片来源与课程不一致，请从所属课堂重新创建。')
      return { courseId: course.id, sourceId: query.sourceId, label: course.name, detail: `来源${doubt ? '疑问所属' : ''}课堂：${session.title}` }
    }
    const doubt = kind === 'answer'
      ? activeRecord(snapshot.doubts, query.doubtId, '疑问不存在或已归档，请返回课堂后重试。') : null
    const session = activeRecord(snapshot.sessions, doubt ? doubt.sessionId : query.sessionId, '课堂不存在或已归档，请返回课程后重试。')
    const course = activeRecord(snapshot.courses, session.courseId, '所属课程不存在或已归档，请先恢复课程。')
    return { sessionId: session.id, courseId: course.id, doubt, label: session.title, detail: course.name }
  },

  refreshContext() {
    try {
      const snapshot = getStore().getSnapshot()
      this.setData({ reducedMotion: Boolean(snapshot.settings.reduceMotion) })
      const context = this.getContext(snapshot)
      const update = {
        loading: false,
        ready: true,
        errorMessage: '',
        contextLabel: context.label,
        contextDetail: context.detail,
        sourceText: context.doubt ? context.doubt.sourceText : '',
        doubtNote: context.doubt ? context.doubt.note : ''
      }
      if (this.data.kind === 'answer' && !this.answerInitialized) {
        update['values.answer'] = context.doubt.answer || ''
        this.answerInitialized = true
      }
      this.setData(update)
    } catch (error) {
      this.setData({ loading: false, ready: false, errorMessage: '暂时无法编辑。请确认相关资料仍在本机且未归档，再重新读取。' })
      notifyError(error)
    }
  },

  onInput(event) {
    if (this.data.submitting || this.data.saved) return
    const field = event.currentTarget.dataset.field
    const config = FORMS[this.data.kind]
    if (!config || !config.fields.includes(field)) return
    this.setData({ [`values.${field}`]: event.detail.value, [`errors.${field}`]: '', formError: '' })
  },

  onSubmit(event) {
    if (this.data.submitting || this.data.saved || !this.data.ready) return
    const config = FORMS[this.data.kind]
    if (!config) return
    const submitted = event && event.detail && event.detail.value ? event.detail.value : {}
    const values = {}
    const errors = {}
    const retainedValues = {}
    config.fields.forEach(field => {
      const value = Object.prototype.hasOwnProperty.call(submitted, field) ? submitted[field] : this.data.values[field]
      const rule = RULES[field]
      if (typeof value === 'string') retainedValues[`values.${field}`] = value
      if (typeof value !== 'string') errors[field] = `请填写有效的${rule.label}。`
      else if (value.length > rule.max) errors[field] = `${rule.label}不能超过 ${rule.max} 字。`
      else if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) errors[field] = `${rule.label}含不可见控制字符，请删除后重试。`
      else if (rule.required && !value.trim()) errors[field] = `请填写${rule.label}。`
      values[field] = typeof value === 'string' ? value.trim() : ''
    })
    // Native form submission can be newer than the last input event.
    this.setData(retainedValues)
    if (Object.keys(errors).length) {
      this.setData({ errors, formError: '还不能保存，请检查下方标出的内容。' })
      return
    }
    this.setData({ submitting: true, errors: {}, formError: '' })
    try {
      const store = getStore()
      // Recheck parent/source visibility immediately before writing, not just on entry.
      const context = this.getContext(store.getSnapshot())
      let entity
      switch (this.data.kind) {
        case 'course':
          entity = store.addCourse({ name: values.name, teacher: values.teacher, language: values.language })
          break
        case 'session':
          entity = store.addSession({ courseId: context.courseId, title: values.title, transcript: values.transcript })
          break
        case 'doubt':
          entity = store.addDoubt({ sessionId: context.sessionId, sourceText: values.sourceText, note: values.note })
          break
        case 'card':
          entity = store.addCard({ courseId: context.courseId, front: values.front, back: values.back, sourceId: context.sourceId || null })
          break
        case 'answer':
          entity = store.resolveDoubt(context.doubt.id, values.answer)
          break
      }
      this.savedUrl = this.data.kind === 'course' ? `/pages/course/index?id=${encodeURIComponent(entity.id)}`
        : this.data.kind === 'session' ? `/pages/session/index?id=${encodeURIComponent(entity.id)}`
          : this.data.kind === 'card' ? `/pages/course/index?id=${encodeURIComponent(context.courseId)}`
            : `/pages/session/index?id=${encodeURIComponent(context.sessionId)}`
      this.setData({ saved: true, submitting: false })
      this.finish()
    } catch (error) {
      this.setData({ formError: '保存未完成，填写内容仍保留在此页。请根据提示处理后重试。' })
      notifyError(error)
    } finally {
      this.setData({ submitting: false })
    }
  },

  finish() {
    if (!this.data.saved || !this.savedUrl) return
    wx.navigateBack({
      delta: 1,
      fail: () => wx.redirectTo({
        url: this.savedUrl,
        fail: () => notifyError(new Error('资料已保存，但暂时无法返回详情。请点击「查看已保存内容」重试，不要重复创建。'))
      })
    })
  },

  cancel() {
    if (this.data.submitting) return
    wx.navigateBack({
      delta: 1,
      fail: () => wx.switchTab({ url: '/pages/home/index', fail: () => notifyError(new Error('暂时无法返回课程列表，请稍后重试。')) })
    })
  }
})
