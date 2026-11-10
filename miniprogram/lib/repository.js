'use strict';

const { createStore } = require('./store');
let singleton;

// Lazy initialization keeps module imports side-effect free. Failures propagate
// to the UI: never silently replace unreadable local data with a fresh store.
function getStore() {
  if (!singleton) {
    if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function' || typeof wx.setStorageSync !== 'function') {
      const error = new Error('微信本地存储不可用，请在小程序中打开此页面。');
      error.code = 'WX_UNAVAILABLE';
      throw error;
    }
    const api = wx;
    singleton = createStore({
      getStorageSync(key) { return api.getStorageSync(key); },
      setStorageSync(key, value) { api.setStorageSync(key, value); },
    });
  }
  return singleton;
}

module.exports = { getStore };
