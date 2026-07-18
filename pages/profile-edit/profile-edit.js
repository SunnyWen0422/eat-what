const api = require('../../utils/api')
const app = getApp()

Page({
  data: {
    userInfo: {},
    joinDays: 0
  },

  onShow() {
    this.loadUser()
  },

  loadUser() {
    const user = wx.getStorageSync('userInfo') || app.globalData.userInfo || {}
    const hasNickname = !!(user.nickname && user.nickname.trim())
    let joinDays = 0
    if (user.registerTime) {
      joinDays = Math.floor((Date.now() - new Date(user.registerTime).getTime()) / 86400000)
    }
    this.setData({
      userInfo: {
        avatar: user.avatar || 'https://img.yzcdn.cn/vant/cat.jpeg',
        nickname: user.nickname || (hasNickname ? '' : ''),
        level: hasNickname ? '已登录' : '游客模式',
        id: user.id
      },
      joinDays
    })
  },

  // 微信头像选择
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    this.setData({ 'userInfo.avatar': avatarUrl })
    this.saveUser({ avatar: avatarUrl })
  },

  // 昵称输入
  onNicknameInput(e) {
    this.setData({ 'userInfo.nickname': e.detail.value })
  },

  // 昵称失焦保存
  onNicknameSave(e) {
    const name = e.detail.value.trim()
    if (name) {
      this.saveUser({ nickname: name })
    }
  },

  // 保存用户信息到本地 + 后端
  saveUser(fields) {
    const user = wx.getStorageSync('userInfo') || {}
    Object.assign(user, fields)
    wx.setStorageSync('userInfo', user)
    app.globalData.userInfo = user

    // 异步更新后端（失败不影响本地体验）
    api.updateUserInfo(fields).catch(function(err) {
      console.warn('后端同步昵称失败，下次打开会重试', err)
    })
  },

  onShareAppMessage() {
    return { title: '吃什么？', path: '/pages/index/index' }
  }
})
