// app.js
const api = require('./utils/api')
const config = require('./utils/config')

App({
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 登录
    this.doLogin()
  },
  
  // 执行登录
  doLogin() {
    if (!config.ENABLE_LOGIN) {
      console.log('登录功能已禁用')
      return
    }

    wx.login({
      success: async (res) => {
        if (res.code) {
          try {
            // 发送 code 到后台换取 token 和用户信息
            const result = await api.login({ code: res.code })
            
            if (result.success) {
              // 保存 token 和用户信息
              wx.setStorageSync('token', result.token)
              wx.setStorageSync('userInfo', result.user)
              this.globalData.userInfo = result.user

              console.log('登录成功', result.isNewUser ? '(新用户)' : '(老用户)')

              // 如果是新用户，可以在这里提示或跳转到完善资料页面
              if (result.isNewUser) {
                console.log('新用户注册成功')
              }

              // 预加载菜品数据到全局缓存
              this.precacheDishes()
            } else {
              console.error('登录失败:', result.message)
              wx.showToast({
                title: result.message || '登录失败',
                icon: 'none'
              })
            }
          } catch (err) {
            console.error('登录请求失败:', err)
            wx.showToast({
              title: '网络错误，请重试',
              icon: 'none'
            })
          }
        } else {
          console.error('获取code失败:', res.errMsg)
        }
      },
      fail: (err) => {
        console.error('wx.login失败:', err)
      }
    })
  },
  
  // 检查登录状态
  checkLogin() {
    const token = wx.getStorageSync('token')
    const userInfo = wx.getStorageSync('userInfo')
    
    if (!token || !userInfo) {
      // 如果token或用户信息不存在，重新登录
      this.doLogin()
      return false
    }
    
    this.globalData.userInfo = userInfo
    return true
  },
  
  // 预加载菜品数据到全局缓存（不写入本地存储，避免10MB超限）
  async precacheDishes() {
    try {
      const api = require('./utils/api')
      console.log('🔄 预加载菜品数据...')
      const dishes = await api.getDishesLite()
      if (dishes && dishes.length > 0) {
        this.globalData.allDishes = dishes
        console.log('✅ 菜品预加载完成:', dishes.length, '条（仅内存缓存）')
      }
    } catch (e) {
      console.log('⚠️ 菜品预加载失败:', e)
    }
  },

  globalData: {
    userInfo: null,
    allDishes: null
  }
})
