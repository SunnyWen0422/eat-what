// pages/settings/settings.js
const { getUserStorageKey } = require('../../utils/util')

Page({
  data: {
    preferences: {
      lowCalorie: false,
      preferChuan: false,
      preferYue: false,
      preferLu: false,
      preferHuaiyang: false,
      preferZhe: false,
      preferHu: false
    },
    cuisineLabels: {
      preferChuan: '川菜（麻辣鲜香）',
      preferYue: '粤菜（清淡鲜美）',
      preferLu: '鲁菜（咸鲜为主）',
      preferHuaiyang: '淮扬菜（清鲜平和）',
      preferZhe: '浙菜（鲜嫩脆爽）',
      preferHu: '上海本帮（浓油赤酱）'
    }
  },

  onLoad() {
    this.loadPreferences()
  },

  loadPreferences() {
    const key = getUserStorageKey('userPreferences')
    const saved = wx.getStorageSync(key)
    if (saved) {
      this.setData({ preferences: { ...this.data.preferences, ...saved } })
    }
  },

  savePreferences() {
    const key = getUserStorageKey('userPreferences')
    wx.setStorageSync(key, this.data.preferences)
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  onToggle(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [`preferences.${field}`]: value })
    this.savePreferences()
  },

  onShareAppMessage() {
    return { title: '吃什么？个性化推荐设置', path: '/pages/settings/settings' }
  }
})
