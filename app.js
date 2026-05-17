// app.js
const api = require('./utils/api')
const config = require('./utils/config')

App({
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 登录（登录成功后会自动预加载菜品数据）
    this.doLogin()
  },

  // 执行登录
  doLogin() {
    // 存储登录完成状态，供页面等待
    this._loginResolve = null
    this._loginReject = null
    this._loginPromise = new Promise((resolve) => {
      this._loginResolve = resolve
    })
    // 超时保护：最多等 8 秒（防止 wx.login 永久无回调）
    this._loginTimer = setTimeout(() => {
      console.log('⏰ 登录超时，释放等待')
      this.globalData.loginReady = true
      if (this._loginResolve) this._loginResolve()
    }, 8000)

    if (!config.ENABLE_LOGIN) {
      console.log('登录功能已禁用')
      this.globalData.loginReady = true
      if (this._loginResolve) this._loginResolve()
      clearTimeout(this._loginTimer)
      // 即使不登录，也预加载菜品数据到内存缓存
      this.precacheDishes()
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

              // 登录成功后，后台预加载菜品数据到内存缓存（静默，不阻塞UI）
              this.precacheDishes()
            } else {
              console.error('登录失败:', result.message)
              // 登录失败也不阻塞页面，token由autoReLogin兜底
            }
          } catch (err) {
            console.error('登录请求失败:', err)
          }
        } else {
          console.error('获取code失败:', res.errMsg)
        }
        // 无论成功或失败，标记登录流程已走完
        this.globalData.loginReady = true
        clearTimeout(this._loginTimer)
        if (this._loginResolve) this._loginResolve()
      },
      fail: (err) => {
        console.error('wx.login失败:', err)
        this.globalData.loginReady = true
        clearTimeout(this._loginTimer)
        if (this._loginResolve) this._loginResolve()
      }
    })
  },

  // 等待登录完成（页面可在导航前调用）
  waitForLogin() {
    if (this.globalData.loginReady) return Promise.resolve()
    return this._loginPromise || Promise.resolve()
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
    allDishes: null,
    loginReady: false  // 登录流程是否走完（成功或失败都置 true）
  }
})
