// app.js
const api = require('./utils/api')
const config = require('./utils/config')

App({
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 立即开始预加载菜品数据（与登录并行，不等待登录）
    this.precacheDishes()

    // 登录（与预加载并行执行）
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

              // 登录成功后，如果全局缓存为空，再尝试加载一次（防止预加载失败）
              if (!this.globalData.allDishes || this.globalData.allDishes.length === 0) {
                this.precacheDishes()
              }
            } else {
              console.error('登录失败:', result.message)
              // 登录失败不影响菜品加载，不显示toast
            }
          } catch (err) {
            console.error('登录请求失败:', err)
            // 登录失败不影响菜品加载
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
