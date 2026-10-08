// pages/about/about.js
Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(),
    version: require('../../utils/product-release').version
  },

  onLoad() {
    // 获取小程序版本号
    try {
      const accountInfo = wx.getAccountInfoSync()
      this.setData({
        version: accountInfo.miniProgram.version || require('../../utils/product-release').version
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
