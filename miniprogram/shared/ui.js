function formatDate(value) {
  if (!Number.isFinite(value)) return '尚未复习'
  const date = new Date(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function notifyError(error) {
  wx.showModal({
    title: '暂时无法完成',
    content: error && error.message ? error.message : '请稍后重试，你的已有资料不会被清空。',
    showCancel: false
  })
}

function confirm(options) {
  return new Promise(resolve => {
    wx.showModal(Object.assign({}, options, {
      confirmColor: '#E04E00',
      success: result => resolve(Boolean(result.confirm)),
      fail: () => resolve(false)
    }))
  })
}

function syncTab(page, selected) {
  if (typeof page.getTabBar === 'function') {
    const tab = page.getTabBar()
    if (tab) tab.setData({ selected })
  }
}

module.exports = { formatDate, notifyError, confirm, syncTab }
