Component({
  data: {
    selected: 0,
    tabs: [
      { label: '学习', icon: 'learn', path: '/pages/home/index' },
      { label: '复习', icon: 'review', path: '/pages/review/index' },
      { label: '我的', icon: 'mine', path: '/pages/settings/index' }
    ]
  },
  methods: {
    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index)
      const tab = this.data.tabs[index]
      if (tab && index !== this.data.selected) wx.switchTab({ url: tab.path })
    }
  }
})
