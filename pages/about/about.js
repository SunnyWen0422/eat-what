// pages/about/about.js
Page({
  data: {
    version: '3.2.0'
  },

  onLoad() {
    // 获取小程序版本号
    try {
      const accountInfo = wx.getAccountInfoSync()
      this.setData({
        version: accountInfo.miniProgram.version || '3.2.0'
      })
    } catch (e) {
      // 开发环境可能无法获取版本号
    }
  },

  onShareAppMessage() {
    return {
      title: '吃什么？帮我选好每天吃什么！',
      path: '/pages/index/index'
    }
  }
})
