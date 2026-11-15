'use strict'

// Independent controller/core integration tests, NOT a WeChat renderer or simulator.
// Only wx platform I/O and shared/ui are replaced. Every persistence operation uses
// the production createStore, including validation, scheduling, merge and rollback.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createStore, STORAGE_KEY } = require('../lib/store')
const root = path.resolve(__dirname, '..')
const plain = value => JSON.parse(JSON.stringify(value))
const event = dataset => ({ currentTarget: { dataset }, detail: {} })
const input = (field, value) => ({ currentTarget: { dataset: { field } }, detail: { value } })
const submit = value => ({ detail: { value } })
const rejectedId = '00000000-0000-4000-8000-000000000000'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function harness(t, options = {}) {
  const calls = new Map()
  const errors = []
  const confirms = []
  const tabs = []
  const forbidden = []
  const disk = new Map()
  const faults = { read: false, write: false }
  let store
  let confirmResult = true
  const record = (name, value) => {
    if (!calls.has(name)) calls.set(name, [])
    calls.get(name).push(value)
  }
  const deny = name => () => {
    forbidden.push(name)
    throw new Error(`Offline tests forbid ${name}`)
  }
  const storage = {
    getStorageSync(key) {
      assert.equal(key, STORAGE_KEY)
      if (faults.read) throw new Error('synthetic storage read failure')
      return disk.has(key) ? disk.get(key) : ''
    },
    setStorageSync(key, value) {
      assert.equal(key, STORAGE_KEY)
      record('storageWrite', value)
      if (faults.write) throw new Error('synthetic storage write failure')
      disk.set(key, value)
    }
  }
  const fileSystem = {
    writeFile: value => record('writeFile', value),
    readFile: value => record('readFile', value)
  }
  const wx = {
    ...storage,
    env: { USER_DATA_PATH: '/synthetic-wechat-sandbox' },
    getFileSystemManager: () => fileSystem,
    navigateTo: value => record('navigateTo', value),
    navigateBack: value => record('navigateBack', value),
    redirectTo: value => record('redirectTo', value),
    switchTab: value => record('switchTab', value),
    showToast: value => record('showToast', value),
    shareFileMessage: value => record('shareFileMessage', value),
    chooseMessageFile: value => record('chooseMessageFile', value)
  }
  for (const name of ['request', 'uploadFile', 'downloadFile', 'connectSocket', 'sendSocketMessage', 'login', 'getRecorderManager', 'startRecord', 'createLivePusherContext']) {
    wx[name] = deny(`wx.${name}`)
  }
  Object.defineProperty(wx, 'cloud', { get: deny('wx.cloud') })
  const ui = {
    formatDate: value => `date:${value}`,
    notifyError: error => errors.push({ message: error && error.message, code: error && error.code }),
    confirm: value => {
      confirms.push(plain(value))
      return typeof confirmResult === 'function' ? confirmResult(value) : Promise.resolve(confirmResult)
    },
    syncTab: (_, index) => tabs.push(index)
  }
  const getStore = () => {
    if (!store) store = createStore(storage)
    return store
  }
  function load(name, component = false) {
    const file = path.join(root, component ? 'custom-tab-bar/index.js' : `pages/${name}/index.js`)
    let definition
    const context = {
      wx, Date, console,
      Page: value => { assert.equal(definition, undefined); definition = value },
      Component: value => { assert.equal(definition, undefined); definition = value },
      require: name => {
        if (name === '../../lib/repository') return { getStore }
        if (name === '../../shared/ui') return ui
        assert.fail(`Unexpected controller dependency: ${name}`)
      },
      fetch: deny('fetch'), XMLHttpRequest: deny('XMLHttpRequest'), WebSocket: deny('WebSocket')
    }
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file, timeout: 2000 })
    assert.ok(definition, `No ${component ? 'Component' : 'Page'} registered by ${file}`)
    const page = { ...definition, ...(component ? definition.methods : {}), data: plain(definition.data) }
    page.setData = function (patch, callback) {
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
        let target = this.data
        for (const part of parts.slice(0, -1)) {
          if (!target[part] || typeof target[part] !== 'object') target[part] = {}
          target = target[part]
        }
        target[parts.at(-1)] = plain(value)
      }
      if (callback) callback.call(this)
    }
    return page
  }
  t.after(() => assert.deepEqual(forbidden, [], 'No network, login, cloud or audio API may be used'))
  if (options.corrupt) disk.set(STORAGE_KEY, '{corrupt synthetic snapshot')
  return {
    wx, fileSystem, storage, disk, faults, errors, confirms, tabs, load,
    get store() { return getStore() },
    confirm(value) { confirmResult = value },
    calls(name) { return calls.get(name) || [] },
    last(name) { return (calls.get(name) || []).at(-1) },
    backup() { return disk.get(STORAGE_KEY) },
    seed() { return getStore().seedDemo() }
  }
}

function openEditor(h, query) {
  const page = h.load('editor')
  page.onLoad(query)
  page.onShow()
  return page
}
function finishFile(options, outcome, result = {}) {
  if (options[outcome]) options[outcome](result)
  if (options.complete) options.complete(result)
}
function assertUnchanged(h, before) {
  assert.equal(h.store.exportBackup(), before)
  if (h.disk.has(STORAGE_KEY)) assert.equal(h.backup(), before)
}

// HOME / DEMO ---------------------------------------------------------------
test('home reads real stats, synchronizes tab and preserves reduceMotion', t => {
  const h = harness(t)
  const home = h.load('home')
  home.onShow()
  assert.deepEqual(h.tabs, [0])
  assert.equal(home.data.courses.length, 0)
  assert.equal(home.data.dueCount, 0)
  assert.equal(h.calls('storageWrite').length, 0, 'reading an empty library must not initialize disk')
  const data = h.seed()
  h.store.updateSettings({ reduceMotion: true })
  h.store.archive('cards', data.cards[0].id)
  home.onShow()
  assert.equal(home.data.courses.length, 1)
  assert.equal(home.data.courses[0].name, data.courses[0].name)
  assert.equal(home.data.courses[0].sessionCount, 1)
  assert.equal(home.data.courses[0].cardCount, 1)
  assert.equal(home.data.sessionCount, h.store.stats().sessions)
  assert.equal(home.data.cardCount, h.store.stats().cards)
  assert.equal(home.data.dueCount, h.store.stats().dueCards)
  assert.equal(home.data.reduceMotion, true)
  home.addCourse()
  assert.equal(h.last('navigateTo').url, '/pages/editor/index?kind=course')
  home.openCourse(event({ id: data.courses[0].id }))
  assert.equal(h.last('navigateTo').url, `/pages/course/index?id=${data.courses[0].id}`)
  home.openReview()
  assert.equal(h.last('switchTab').url, '/pages/review/index')
})

test('home demo requires confirmation, is synthetic, and never overwrites populated data', async t => {
  const h = harness(t)
  const home = h.load('home')
  h.confirm(false)
  await home.seedDemo()
  assert.equal(h.calls('storageWrite').length, 0)
  h.confirm(true)
  await home.seedDemo()
  const snapshot = h.store.getSnapshot()
  assert.equal(snapshot.courses.length, 1)
  assert.match(snapshot.courses[0].name, /合成/)
  assert.equal(snapshot.sessions[0].inputMode, 'MANUAL_TEXT')
  assert.ok(snapshot.cards.every(card => card.origin === 'DEMO'))
  assert.equal(snapshot.doubts[0].status, 'OPEN')
  assert.equal(snapshot.doubts[0].answer, '', 'the demo must not fabricate an AI answer')
  assert.equal(home.data.dueCount, 2)
  const before = h.store.exportBackup()
  await home.seedDemo()
  assert.equal(h.errors.at(-1).code, 'DEMO_REQUIRES_EMPTY')
  assertUnchanged(h, before)
})

test('home storage corruption stays visible and does not silently erase disk', t => {
  const h = harness(t, { corrupt: true })
  const original = h.backup()
  const home = h.load('home')
  home.onShow()
  assert.ok(home.data.error)
  assert.equal(h.calls('storageWrite').length, 0)
  assert.equal(h.backup(), original)
})

// REVIEW --------------------------------------------------------------------
test('review requires reveal, validates rating, prevents double click, and completes its real queue', t => {
  const h = harness(t)
  const seeded = h.seed()
  h.store.updateSettings({ reduceMotion: true })
  const page = h.load('review')
  page.onShow()
  assert.deepEqual(h.tabs, [1])
  assert.equal(page.data.total, 2)
  assert.equal(page.data.reduceMotion, true)
  const firstId = page.data.current.id
  page.rate(event({ rating: 'good' }))
  assert.equal(h.store.getSnapshot().logs.length, 0)
  page.reveal()
  page.rate(event({ rating: 'invented' }))
  assert.equal(h.store.getSnapshot().logs.length, 0)
  page.rate(event({ rating: 'good' }))
  page.rate(event({ rating: 'good' }))
  let snapshot = h.store.getSnapshot()
  assert.equal(snapshot.logs.length, 1, 'second tap must not rate the next unrevealed card')
  assert.equal(snapshot.logs[0].cardId, firstId)
  assert.equal(snapshot.cards.find(card => card.id === firstId).intervalMillis, 86400000)
  assert.equal(page.data.completed, 1)
  assert.equal(page.data.progress, 50)
  assert.equal(page.data.revealed, false)
  assert.notEqual(page.data.current.id, firstId)
  page.reveal()
  page.rate(event({ rating: 'again' }))
  snapshot = h.store.getSnapshot()
  assert.equal(snapshot.logs.length, seeded.cards.length)
  assert.equal(snapshot.logs[1].intervalMillis, 60000)
  assert.equal(page.data.current, null)
  assert.equal(page.data.completed, 2)
  assert.equal(page.data.progress, 100)
  assert.equal(page.data.busy, false)
  page.rate(event({ rating: 'easy' }))
  assert.equal(h.store.getSnapshot().logs.length, 2)
  page.startSession()
  assert.equal(page.data.total, 0)
  assert.equal(page.data.completed, 0)
})

test('review routes BOTH doubt and direct session sources to the real session page', t => {
  const h = harness(t)
  const seeded = h.seed()
  const review = h.load('review')
  review.onShow()
  for (let index = 0; index < 2; index += 1) {
    const current = review.data.current
    assert.ok(current.sourceId)
    review.openSource()
    const url = h.last('navigateTo').url
    assert.equal(url, `/pages/session/index?id=${seeded.sessions[0].id}`)
    const session = h.load('session')
    session.onLoad({ id: new URL(url, 'https://unit.invalid').searchParams.get('id') })
    session.onShow()
    assert.equal(session.data.session.id, seeded.sessions[0].id)
    review.reveal()
    review.rate(event({ rating: 'good' }))
  }
  const count = h.calls('navigateTo').length
  review.openSource()
  assert.equal(h.calls('navigateTo').length, count)
})

test('review save failure rolls back memory/disk, keeps answer visible, and permits one retry', t => {
  const h = harness(t)
  h.seed()
  const page = h.load('review')
  page.onShow()
  page.reveal()
  const id = page.data.current.id
  const before = h.store.exportBackup()
  h.faults.write = true
  page.rate(event({ rating: 'hard' }))
  assert.equal(h.errors.at(-1).code, 'STORAGE_WRITE_FAILED')
  assertUnchanged(h, before)
  assert.equal(page.data.busy, false)
  assert.equal(page.data.revealed, true)
  assert.equal(page.data.current.id, id)
  assert.equal(page.data.completed, 0)
  h.faults.write = false
  page.rate(event({ rating: 'hard' }))
  assert.equal(h.store.getSnapshot().logs.length, 1)
  assert.equal(h.store.getSnapshot().logs[0].intervalMillis, 600000)
})

test('review stale/archived cards cannot be rated or create duplicate logs', t => {
  const h = harness(t)
  h.seed()
  const page = h.load('review')
  page.onShow()
  page.reveal()
  const id = page.data.current.id
  h.store.rateCard(id, 'good')
  page.rate(event({ rating: 'good' }))
  assert.equal(h.errors.at(-1).code, 'CARD_NOT_DUE')
  assert.equal(page.data.completed, 0)
  assert.equal(page.data.busy, false)
  assert.equal(h.store.getSnapshot().logs.length, 1)
  h.store.archive('cards', id)
  page.rate(event({ rating: 'easy' }))
  assert.equal(h.errors.at(-1).code, 'ARCHIVED')
  page.startSession()
  assert.notEqual(page.data.current.id, id)
})

test('review storage-read failure leaves no playable card or successful progress', t => {
  const h = harness(t)
  h.faults.read = true
  const page = h.load('review')
  page.onShow()
  assert.ok(page.data.error)
  assert.equal(page.data.current, null)
  page.reveal()
  page.rate(event({ rating: 'good' }))
  assert.equal(h.calls('storageWrite').length, 0)
})

// SETTINGS / FILE BACKUPS ----------------------------------------------------
for (const method of ['exportBackup', 'importBackup']) {
  test(`settings ${method} locks before confirmation, rejects double taps and releases on cancel`, async t => {
    const h = harness(t)
    h.seed()
    const page = h.load('settings')
    const gate = deferred()
    h.confirm(() => gate.promise)
    const first = page[method]()
    const second = page[method]()
    const busyWhileConfirming = page.data.busy
    gate.resolve(false)
    await Promise.all([first, second])
    assert.equal(busyWhileConfirming, true)
    assert.equal(h.confirms.length, 1)
    assert.equal(page.data.busy, false)
    assert.equal(h.calls('writeFile').length, 0)
    assert.equal(h.calls('chooseMessageFile').length, 0)
    assert.equal(h.calls('shareFileMessage').length, 0)
  })
}

test('settings export writes a valid full backup but shares ONLY on another user action', async t => {
  const h = harness(t)
  const seeded = h.seed()
  h.store.rateCard(seeded.cards[0].id, 'good')
  h.store.archive('cards', seeded.cards[1].id)
  const page = h.load('settings')
  page.onShow()
  assert.deepEqual(h.tabs, [2])
  assert.equal(page.data.trash.length, 1)
  await page.exportBackup()
  assert.equal(page.data.busy, true)
  assert.match(h.confirms[0].content, /未加密|课程|回收站/)
  const write = h.last('writeFile')
  assert.equal(write.encoding, 'utf8')
  assert.match(write.filePath, /^\/synthetic-wechat-sandbox\/zhixi-backup-\d+\.json$/)
  assert.equal(write.data, h.store.exportBackup())
  const receiver = harness(t)
  receiver.store.importBackup(write.data)
  assert.equal(receiver.store.getSnapshot().logs.length, 1)
  assert.notEqual(receiver.store.getSnapshot().cards[1].deletedAtMillis, null)
  assert.equal(h.calls('shareFileMessage').length, 0)
  finishFile(write, 'success')
  assert.equal(page.data.busy, false)
  assert.equal(page.data.backupReady, true)
  assert.equal(h.calls('shareFileMessage').length, 0, 'file creation callback must not invoke shareFileMessage')
  page.shareBackup()
  page.shareBackup()
  assert.equal(h.calls('shareFileMessage').length, 1)
  assert.equal(h.last('shareFileMessage').filePath, write.filePath)
  assert.equal(page.data.busy, true)
  finishFile(h.last('shareFileMessage'), 'success')
  assert.equal(page.data.busy, false)
})

for (const mode of ['unsupported', 'write-fail', 'write-throw', 'share-fail', 'share-cancel', 'share-throw']) {
  test(`settings export/share ${mode} reports safely and clears busy`, async t => {
    const h = harness(t)
    h.seed()
    const before = h.store.exportBackup()
    const page = h.load('settings')
    if (mode === 'unsupported') h.wx.shareFileMessage = undefined
    if (mode === 'write-throw') h.fileSystem.writeFile = () => { throw new Error('synthetic file secret') }
    await page.exportBackup()
    if (mode === 'write-fail') finishFile(h.last('writeFile'), 'fail', { errMsg: 'synthetic file secret' })
    if (mode.startsWith('share-')) {
      finishFile(h.last('writeFile'), 'success')
      if (mode === 'share-throw') h.wx.shareFileMessage = () => { throw new Error('synthetic file secret') }
      assert.doesNotThrow(() => page.shareBackup())
      if (mode !== 'share-throw') finishFile(h.last('shareFileMessage'), 'fail', { errMsg: mode === 'share-cancel' ? 'shareFileMessage:fail cancel' : 'synthetic file secret' })
    }
    assert.equal(page.data.busy, false)
    if (mode === 'share-cancel') assert.equal(h.errors.length, 0)
    else assert.equal(h.errors.length, 1)
    assert.ok(h.errors.every(error => !error.message.includes('synthetic file secret')))
    if (!mode.startsWith('share-')) assert.equal(page.data.backupReady, false)
    assertUnchanged(h, before)
  })
}

test('settings import merges actual backups idempotently without overwriting local preferences', async t => {
  const donor = harness(t)
  donor.seed()
  donor.store.updateSettings({ reduceMotion: true })
  const text = donor.store.exportBackup()
  const h = harness(t)
  h.store.addCourse({ name: '合成本机保留课程' })
  const page = h.load('settings')
  for (let pass = 0; pass < 2; pass += 1) {
    await page.importBackup()
    assert.equal(page.data.busy, true)
    const choose = h.last('chooseMessageFile')
    assert.equal(choose.count, 1)
    assert.deepEqual(plain(choose.extension), ['json'])
    choose.success({ tempFiles: [{ size: Buffer.byteLength(text), path: '/synthetic-selected.json' }] })
    const read = h.last('readFile')
    assert.equal(read.filePath, '/synthetic-selected.json')
    assert.equal(page.data.busy, true)
    finishFile(read, 'success', { data: text })
    assert.equal(page.data.busy, false)
    assert.equal(h.store.getSnapshot().courses.length, 2)
    assert.equal(h.store.getSnapshot().cards.length, 2)
    assert.equal(h.store.getSnapshot().settings.reduceMotion, false)
  }
  assert.equal(h.errors.length, 0)
})

for (const mode of ['unsupported', 'choose-cancel', 'choose-fail', 'choose-throw', 'read-fail', 'read-throw', 'invalid-json', 'storage-fail', 'id-conflict']) {
  test(`settings import ${mode} preserves data and releases busy`, async t => {
    const h = harness(t)
    h.seed()
    const before = h.store.exportBackup()
    const donor = harness(t)
    donor.seed()
    let text = donor.store.exportBackup()
    const page = h.load('settings')
    if (mode === 'unsupported') h.wx.chooseMessageFile = undefined
    if (mode === 'choose-throw') h.wx.chooseMessageFile = () => { throw new Error('synthetic private file') }
    if (mode === 'read-throw') h.fileSystem.readFile = () => { throw new Error('synthetic private file') }
    if (mode === 'invalid-json') text = '{broken'
    if (mode === 'id-conflict') {
      const conflicting = JSON.parse(before)
      conflicting.courses[0].name = '合成冲突课程'
      text = JSON.stringify(conflicting)
    }
    await assert.doesNotReject(() => page.importBackup())
    const choose = h.last('chooseMessageFile')
    if (mode === 'choose-cancel' || mode === 'choose-fail') {
      finishFile(choose, 'fail', { errMsg: mode === 'choose-cancel' ? 'chooseMessageFile:fail cancel' : 'synthetic private file' })
    } else if (choose) {
      assert.doesNotThrow(() => choose.success({ tempFiles: [{ size: Buffer.byteLength(text), path: '/synthetic-selected.json' }] }))
      const read = h.last('readFile')
      if (mode === 'read-fail') finishFile(read, 'fail', { errMsg: 'synthetic private file' })
      else if (read) {
        if (mode === 'storage-fail') h.faults.write = true
        finishFile(read, 'success', { data: text })
      }
    }
    assert.equal(page.data.busy, false)
    if (mode === 'choose-cancel') assert.equal(h.errors.length, 0)
    else assert.equal(h.errors.length, 1)
    assert.ok(h.errors.every(error => !error.message.includes('synthetic private file')))
    assert.equal(h.calls('showToast').length, 0)
    assertUnchanged(h, before)
  })
}

for (const file of [null, { path: '/x', size: -1 }, { path: '/x', size: Infinity }, { path: '/x', size: 1048577 }, { path: '/x' }, { size: 20, path: 123 }]) {
  test(`settings rejects malformed/oversized selected file ${JSON.stringify(file)}`, async t => {
    const h = harness(t)
    const page = h.load('settings')
    await page.importBackup()
    h.last('chooseMessageFile').success({ tempFiles: file ? [file] : [] })
    assert.equal(page.data.busy, false)
    assert.equal(h.calls('readFile').length, 0)
    assert.equal(h.calls('storageWrite').length, 0)
    assert.equal(h.errors.length, 1)
  })
}

test('settings reduceMotion persists and reverts UI after storage failure', t => {
  const h = harness(t)
  const page = h.load('settings')
  page.onShow()
  page.toggleMotion({ detail: { value: true } })
  assert.equal(page.data.reduceMotion, true)
  assert.equal(h.store.getSnapshot().settings.reduceMotion, true)
  const before = h.store.exportBackup()
  h.faults.write = true
  page.toggleMotion({ detail: { value: false } })
  assert.equal(page.data.reduceMotion, true)
  assert.equal(h.errors.at(-1).code, 'STORAGE_WRITE_FAILED')
  assertUnchanged(h, before)
})

test('settings restore respects cancellation, parent order, storage rollback and double tap guard', async t => {
  const h = harness(t)
  const data = h.seed()
  for (const card of data.cards) h.store.archive('cards', card.id)
  h.store.archive('doubts', data.doubts[0].id)
  h.store.archive('sessions', data.sessions[0].id)
  h.store.archive('courses', data.courses[0].id)
  const page = h.load('settings')
  page.onShow()
  assert.equal(page.data.trash.length, 5)
  const restoreCourse = event({ kind: 'courses', id: data.courses[0].id })
  const before = h.store.exportBackup()
  const gate = deferred()
  h.confirm(() => gate.promise)
  const first = page.restore(restoreCourse)
  const second = page.restore(restoreCourse)
  const wasBusy = page.data.busy
  gate.resolve(false)
  await Promise.all([first, second])
  assert.equal(wasBusy, true)
  assert.equal(h.confirms.length, 1)
  assert.equal(page.data.busy, false)
  assertUnchanged(h, before)
  h.confirm(true)
  await page.restore(event({ kind: 'cards', id: data.cards[0].id }))
  assert.equal(h.errors.at(-1).code, 'PARENT_ARCHIVED')
  assert.equal(page.data.busy, false)
  assertUnchanged(h, before)
  h.faults.write = true
  await page.restore(restoreCourse)
  assert.equal(h.errors.at(-1).code, 'STORAGE_WRITE_FAILED')
  assertUnchanged(h, before)
  h.faults.write = false
  for (const [kind, id] of [['courses', data.courses[0].id], ['sessions', data.sessions[0].id], ['doubts', data.doubts[0].id], ...data.cards.map(card => ['cards', card.id])]) {
    await page.restore(event({ kind, id }))
    assert.equal(page.data.busy, false)
  }
  assert.equal(page.data.trash.length, 0)
  assert.equal(h.store.dueCards().length, 2)
  page.openPrivacy()
  assert.equal(h.last('navigateTo').url, '/pages/privacy/index')
})

// COURSE / SESSION / EDITOR --------------------------------------------------
test('course shows actual counts, links doubt sources correctly and rejects forged entry ids', t => {
  const h = harness(t)
  const data = h.seed()
  h.store.updateSettings({ reduceMotion: true })
  const page = h.load('course')
  page.onLoad({ id: data.courses[0].id })
  page.onShow()
  assert.equal(page.data.reducedMotion, true)
  assert.equal(page.data.sessions[0].doubtCount, 1)
  assert.equal(page.data.sessions[0].characterCount, data.sessions[0].transcript.length)
  assert.equal(page.data.cards.length, 2)
  for (const card of page.data.cards) {
    assert.equal(card.sourceSessionId, data.sessions[0].id)
    assert.equal(card.originLabel, '示例卡片')
    page.openCardSource(event({ id: card.id }))
    assert.equal(h.last('navigateTo').url, `/pages/session/index?id=${data.sessions[0].id}`)
  }
  const before = h.calls('navigateTo').length
  page.openCardSource(event({ id: rejectedId }))
  page.openSession(event({ id: rejectedId }))
  assert.equal(h.calls('navigateTo').length, before)
  page.addSession()
  assert.equal(h.last('navigateTo').url, `/pages/editor/index?kind=session&courseId=${data.courses[0].id}`)
  page.addCard()
  assert.equal(h.last('navigateTo').url, `/pages/editor/index?kind=card&courseId=${data.courses[0].id}`)
})

test('course/session archives honor children, cancel, save failure, and parent-last order', async t => {
  const h = harness(t)
  const data = h.seed()
  const course = h.load('course')
  course.onLoad({ id: data.courses[0].id }); course.onShow()
  const session = h.load('session')
  session.onLoad({ id: data.sessions[0].id }); session.onShow()
  const before = h.store.exportBackup()
  await course.archiveCourse()
  assert.equal(h.errors.at(-1).code, 'ACTIVE_CHILDREN')
  await session.archiveSession()
  assert.equal(h.errors.at(-1).code, 'ACTIVE_CHILDREN')
  await session.archiveDoubt(event({ id: data.doubts[0].id }))
  assert.equal(h.errors.at(-1).code, 'ACTIVE_CHILDREN')
  assertUnchanged(h, before)
  h.confirm(false)
  await course.archiveCard(event({ id: data.cards[0].id }))
  assertUnchanged(h, before)
  h.confirm(true)
  h.faults.write = true
  await course.archiveCard(event({ id: data.cards[0].id }))
  assert.equal(course.data.archiving, false)
  assert.equal(h.errors.at(-1).code, 'STORAGE_WRITE_FAILED')
  assertUnchanged(h, before)
  h.faults.write = false
  for (const card of data.cards) await course.archiveCard(event({ id: card.id }))
  await session.archiveDoubt(event({ id: data.doubts[0].id }))
  await session.archiveSession()
  await course.archiveCourse()
  assert.equal(h.store.stats().courses, 0)
  assert.equal(h.store.stats().sessions, 0)
  assert.equal(h.store.stats().cards, 0)
  assert.equal(course.data.archiving, false)
  assert.equal(session.data.archiving, false)
  assert.equal(h.calls('navigateBack').length, 2)
})

test('session manual doubt/answer flow remains source-linked and never synthesizes an answer', t => {
  const h = harness(t)
  const data = h.seed()
  const session = h.load('session')
  session.onLoad({ id: data.sessions[0].id }); session.onShow()
  assert.equal(session.data.session.transcript, data.sessions[0].transcript)
  assert.equal(session.data.resolvedCount, 0)
  session.addDoubt()
  assert.equal(h.last('navigateTo').url, `/pages/editor/index?kind=doubt&sessionId=${data.sessions[0].id}`)
  session.resolveDoubt(event({ id: data.doubts[0].id }))
  assert.equal(h.last('navigateTo').url, `/pages/editor/index?kind=answer&doubtId=${data.doubts[0].id}`)
  const editor = openEditor(h, { kind: 'answer', doubtId: data.doubts[0].id })
  assert.equal(editor.data.values.answer, '')
  assert.equal(editor.data.sourceText, data.doubts[0].sourceText)
  editor.onSubmit(submit({ answer: '  合成手动解答：按间隔回顾。  ' }))
  assert.equal(h.store.getSnapshot().doubts[0].answer, '合成手动解答：按间隔回顾。')
  session.onShow()
  assert.equal(session.data.resolvedCount, 1)
  assert.equal(session.data.doubts[0].hasAnswer, true)
  session.addCard()
  const params = new URL(h.last('navigateTo').url, 'https://unit.invalid').searchParams
  assert.equal(params.get('sourceId'), data.sessions[0].id)
  assert.equal(params.get('courseId'), data.courses[0].id)
})

test('editor uses native form payload over stale input state and prevents repeat creation', t => {
  const h = harness(t)
  const page = openEditor(h, { kind: 'course' })
  page.onInput(input('name', '过时输入（合成）'))
  page.onSubmit(submit({ name: ' 最新表单课程（合成） ', teacher: '', language: '中文' }))
  page.onSubmit(submit({ name: '不应重复创建', teacher: '', language: '' }))
  assert.equal(h.store.getSnapshot().courses.length, 1)
  assert.equal(h.store.getSnapshot().courses[0].name, '最新表单课程（合成）')
  assert.equal(page.data.saved, true)
  assert.equal(page.data.submitting, false)
  h.last('navigateBack').fail()
  assert.equal(h.last('redirectTo').url, `/pages/course/index?id=${h.store.getSnapshot().courses[0].id}`)
  page.finish()
  assert.equal(h.store.getSnapshot().courses.length, 1)
})

for (const kind of ['session', 'doubt', 'card']) {
  test(`editor ${kind} writes valid real-core entities and preserves plain text provenance`, t => {
    const h = harness(t)
    const data = h.seed()
    const query = { kind, courseId: data.courses[0].id, sessionId: data.sessions[0].id, sourceId: data.doubts[0].id }
    const page = openEditor(h, query)
    const values = {
      session: { title: '合成课堂', transcript: '<script>not executable</script>\n纯文本 & 合成资料' },
      doubt: { sourceText: '合成原文', note: '手动疑问' },
      card: { front: '合成问题', back: '人工答案' }
    }[kind]
    page.onSubmit(submit(values))
    assert.equal(page.data.saved, true)
    const snapshot = h.store.getSnapshot()
    const entity = snapshot[{ session: 'sessions', doubt: 'doubts', card: 'cards' }[kind]].at(-1)
    for (const [key, value] of Object.entries(values)) assert.equal(entity[key], value)
    if (kind === 'session') assert.equal(entity.inputMode, 'MANUAL_TEXT')
    if (kind === 'doubt') {
      assert.equal(entity.answer, '')
      assert.equal(entity.status, 'OPEN')
    }
    if (kind === 'card') {
      assert.equal(entity.origin, 'MANUAL')
      assert.equal(entity.sourceId, data.doubts[0].id)
      assert.equal(entity.reps, 0)
    }
    assert.equal(h.errors.length, 0)
  })
}

test('editor validation rejects empty, overlong, control and non-string values without writing', t => {
  const h = harness(t)
  const page = openEditor(h, { kind: 'course' })
  for (const name of ['  ', 'x'.repeat(81), 'abc\u0000def', 42]) {
    page.onSubmit(submit({ name, teacher: '', language: '' }))
    assert.ok(page.data.errors.name)
    assert.equal(page.data.saved, false)
  }
  page.onInput(input('__proto__', { polluted: true }))
  assert.equal({}.polluted, undefined)
  assert.equal(h.calls('storageWrite').length, 0)
})

test('editor storage failure retains draft and retry saves once', t => {
  const h = harness(t)
  const page = openEditor(h, { kind: 'course' })
  page.onInput(input('name', '待重试合成课程'))
  page.onInput(input('teacher', '虚构教师'))
  const before = h.store.exportBackup()
  h.faults.write = true
  page.onSubmit(submit({}))
  assert.equal(h.errors.at(-1).code, 'STORAGE_WRITE_FAILED')
  assert.equal(page.data.values.name, '待重试合成课程')
  assert.equal(page.data.saved, false)
  assert.equal(page.data.submitting, false)
  assert.ok(page.data.formError)
  assertUnchanged(h, before)
  h.faults.write = false
  page.onSubmit(submit({}))
  assert.equal(h.store.getSnapshot().courses.length, 1)
})

test('editor keeps the latest native submit values after a failed save even when bindinput lagged', t => {
  const h = harness(t)
  const page = openEditor(h, { kind: 'course' })
  page.onInput(input('name', '旧值（合成）'))
  h.faults.write = true
  page.onSubmit(submit({ name: '最新输入（合成）', teacher: '虚构备注', language: '中文' }))
  assert.equal(page.data.saved, false)
  assert.equal(page.data.submitting, false)
  assert.equal(page.data.values.name, '最新输入（合成）', 'a rerender/retry must not replace the authoritative form payload with stale data')
  assert.equal(page.data.values.teacher, '虚构备注')
})

test('answer editor does not clobber unsaved text onShow and rechecks archived context on submit', t => {
  const h = harness(t)
  const data = h.seed()
  h.store.resolveDoubt(data.doubts[0].id, '已保存的合成解答')
  const page = openEditor(h, { kind: 'answer', doubtId: data.doubts[0].id })
  assert.equal(page.data.values.answer, '已保存的合成解答')
  page.onInput(input('answer', '尚未保存的手动解答'))
  page.onShow()
  assert.equal(page.data.values.answer, '尚未保存的手动解答')
  h.store.archive('cards', data.cards[0].id)
  h.store.archive('doubts', data.doubts[0].id)
  const before = h.store.exportBackup()
  page.onSubmit(submit({ answer: '不应写入已归档疑问' }))
  assert.equal(page.data.saved, false)
  assert.equal(page.data.submitting, false)
  assert.ok(page.data.formError)
  assertUnchanged(h, before)
})

test('editor rejects bad kinds, missing parents, and cross-course card sources', t => {
  const h = harness(t)
  const data = h.seed()
  const other = h.store.addCourse({ name: '合成另一门课' })
  for (const query of [{ kind: '__proto__' }, { kind: 'session', courseId: rejectedId }, { kind: 'card', courseId: other.id, sourceId: data.doubts[0].id }]) {
    const before = h.store.exportBackup()
    const page = openEditor(h, query)
    assert.equal(page.data.ready, false)
    assert.ok(page.data.errorMessage)
    page.onSubmit(submit({ name: 'not allowed', front: 'question', back: 'answer' }))
    assertUnchanged(h, before)
  }
})

for (const name of ['course', 'session']) {
  test(`${name} handles unknown routes and corrupt storage without exposing a writable context`, t => {
    const h = harness(t)
    const page = h.load(name)
    page.onLoad({ id: rejectedId }); page.onShow()
    assert.equal(page.data[name], null)
    assert.equal(page.data.loading, false)
    const broken = harness(t, { corrupt: true })
    const unreadable = broken.load(name)
    unreadable.onLoad({ id: rejectedId }); unreadable.onShow()
    assert.equal(unreadable.data[name], null)
    assert.ok(unreadable.data.errorMessage)
    assert.equal(broken.calls('storageWrite').length, 0)
  })
}

// PRIVACY / CUSTOM TAB -------------------------------------------------------
test('privacy remains readable on corrupt storage and honors a readable motion preference', t => {
  const broken = harness(t, { corrupt: true })
  const page = broken.load('privacy')
  assert.doesNotThrow(() => page.onShow())
  assert.equal(page.data.reduceMotion, true)
  assert.equal(broken.calls('storageWrite').length, 0)
  const h = harness(t)
  h.store.updateSettings({ reduceMotion: false })
  const readable = h.load('privacy')
  readable.onShow()
  assert.equal(readable.data.reduceMotion, false)
})

test('custom tab only routes to registered tabs and ignores current/invalid indices', t => {
  const h = harness(t)
  const tab = h.load(null, true)
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  assert.deepEqual(tab.data.tabs.map(item => item.path), config.tabBar.list.map(item => `/${item.pagePath}`))
  tab.switchTab(event({ index: 0 }))
  for (const index of [-1, 3, 1.5, 'constructor', '__proto__', 'https://unit.invalid', undefined]) tab.switchTab(event({ index }))
  assert.equal(h.calls('switchTab').length, 0)
  tab.switchTab(event({ index: '1' }))
  assert.equal(h.last('switchTab').url, '/pages/review/index')
  tab.setData({ selected: 1 })
  tab.switchTab(event({ index: 1 }))
  assert.equal(h.calls('switchTab').length, 1)
  tab.switchTab(event({ index: 2 }))
  assert.equal(h.last('switchTab').url, '/pages/settings/index')
})

// Structural checks complement controller tests; these do not establish WXML
// layout, accessibility, native component behavior, or simulator parity.
test('native manifest assets exist and every literal WXML event names a real controller method', t => {
  const h = harness(t)
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const entries = [...config.pages, 'custom-tab-bar/index']
  for (const entry of entries) {
    for (const extension of ['js', 'json', 'wxml', 'wxss']) {
      assert.equal(fs.existsSync(path.join(root, `${entry}.${extension}`)), true, `Missing ${entry}.${extension}`)
    }
    JSON.parse(fs.readFileSync(path.join(root, `${entry}.json`), 'utf8'))
    const component = entry === 'custom-tab-bar/index'
    const controller = h.load(component ? null : entry.split('/')[1], component)
    const markup = fs.readFileSync(path.join(root, `${entry}.wxml`), 'utf8')
    assert.doesNotMatch(markup, /<(?:rich-text|web-view|script|iframe)\b/i, `${entry}: user content must stay plain text`)
    for (const match of markup.matchAll(/\b(?:capture-)?(?:bind|catch):?[\w-]+\s*=\s*["']([^"']+)["']/g)) {
      assert.match(match[1], /^[A-Za-z_$][\w$]*$/, `${entry}: event handler must be a literal method name`)
      assert.equal(typeof controller[match[1]], 'function', `${entry}: missing WXML handler ${match[1]}`)
    }
  }
  const editorMarkup = fs.readFileSync(path.join(root, 'pages/editor/index.wxml'), 'utf8')
  for (const match of editorMarkup.matchAll(/<(?:input|textarea)\b[^>]*>/g)) {
    assert.match(match[0], /\bname="[A-Za-z]+"/, 'native form submission requires named fields')
    assert.match(match[0], /bindinput="onInput"/)
    assert.match(match[0], /value="\{\{values\.[A-Za-z]+\}\}"/)
  }
  assert.match(editorMarkup, /<form\s+bindsubmit="onSubmit"/)
  assert.match(editorMarkup, /form-type="submit"/)
})

test('offline production sources contain no network/audio/cloud calls or external executable dependencies', () => {
  const files = []
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['tests', 'tools', 'artifacts', 'node_modules'].includes(entry.name)) continue
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.name.endsWith('.js')) files.push(file)
    }
  }
  visit(root)
  assert.ok(files.length >= 12)
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    new vm.Script(source, { filename: file })
    assert.doesNotMatch(source, /\bwx\s*(?:\.\s*|\[\s*['"])(?:request|uploadFile|downloadFile|connectSocket|sendSocketMessage|login|getRecorderManager|startRecord|createLivePusherContext|cloud)\b/, file)
    assert.doesNotMatch(source, /\b(?:fetch\s*\(|new\s+(?:XMLHttpRequest|WebSocket)\b)/, file)
    for (const match of source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      assert.match(match[1], /^\.\.?\//, `${file}: only local mini-program modules are allowed`)
      const target = path.resolve(path.dirname(file), `${match[1]}.js`)
      assert.equal(fs.existsSync(target), true, `${file}: missing required module ${match[1]}`)
    }
  }
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8')
  assert.match(app, /networkEnabled:\s*false/)
  const review = fs.readFileSync(path.join(root, 'pages/review/index.wxml'), 'utf8')
  assert.match(review, /不是 AI 生成/)
  assert.match(review, /合成示例/)
  const session = fs.readFileSync(path.join(root, 'pages/session/index.wxml'), 'utf8')
  assert.match(session, /不是AI生成/)
  assert.match(session, /手动填写/)
})
