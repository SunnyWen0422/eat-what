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
    this._loginPromise = new Promise((resolve) => {
      this._loginResolve = resolve
    })
    // 超时保护：最多等 8 秒
    this._loginTimer = setTimeout(() => {
      console.log('⏰ 登录超时，释放等待')
      this.globalData.loginReady = true
      if (this._loginResolve) this._loginResolve()
    }, 8000)

    if (!config.ENABLE_LOGIN) {
      console.log('登录功能已禁用')
      this._markLoginReady()
      this.precacheDishes()
      return
    }

    // 快速路径：有缓存 token → 秒开，后台静默验证
    const cachedToken = wx.getStorageSync('token')
    const cachedUser = wx.getStorageSync('userInfo')
    if (cachedToken && cachedUser) {
      this.globalData.userInfo = cachedUser
      this.globalData.isLoggedIn = true
      console.log('⚡ 使用缓存 token，秒开')
      this._markLoginReady()
      this.precacheDishes()
      // 后台验证，失败也不影响当前使用（api.js 的 401 兜底会处理）
      this._verifyTokenLazy(cachedToken)
      return
    }

    // 无缓存 token：游客模式，走完整登录
    this.globalData.isLoggedIn = false
    console.log('👤 游客模式，开始登录')
    this._slowLogin()
  },

  // 内部：标记登录就绪
  _markLoginReady() {
    this.globalData.loginReady = true
    clearTimeout(this._loginTimer)
    if (this._loginResolve) this._loginResolve()
  },

  _slowLogin() {
    this.globalData.isLoggedIn = false
    wx.login({
      success: async (res) => {
        if (res.code) {
          try {
            const result = await require('./utils/api').login({ code: res.code })
            if (result.success) {
              wx.setStorageSync('token', result.token)
              wx.setStorageSync('userInfo', result.user)
              this.globalData.userInfo = result.user
              this.globalData.isLoggedIn = true
              console.log('登录成功' + (result.isNewUser ? '(新用户)' : '(老用户)'))
              this.precacheDishes()
            }
          } catch (err) { console.error('登录失败:', err) }
        }
        this._markLoginReady()
      },
      fail: (err) => {
        console.error('wx.login失败:', err)
        this._markLoginReady()
      }
    })
  },

  // 后台静默验证 token 有效性
  async _verifyTokenLazy(token) {
    try {
      await require('./utils/api').requestSilent('/users/info', 'GET')
      console.log('✅ Token 验证有效')
    } catch (e) {
      console.log('⚠️ 缓存 Token 已失效，清除后下次启动重新登录')
      try {
        wx.removeStorageSync('token')
        wx.removeStorageSync('userInfo')
      } catch (_) {}
    }
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
  
  // 预加载菜品数据到全局缓存（按类型分批，每类限 100 条，大幅减少首屏数据量）
  async precacheDishes() {
    try {
      const api = require('./utils/api')
      console.log('🔄 预加载菜品数据（按类型分批）...')
      const startTime = Date.now()

      // 并行加载四类菜品，每类最多 100 条（推荐算法每类只用到前 30 条）
      const [meats, vegs, soups, desserts] = await Promise.all([
        api.getDishesLiteByType('meat', 100).catch(() => []),
        api.getDishesLiteByType('veg', 100).catch(() => []),
        api.getDishesLiteByType('soup', 100).catch(() => []),
        api.getDishesLiteByType('dessert', 100).catch(() => [])
      ])

      const allDishes = [...meats, ...vegs, ...soups, ...desserts]
      const elapsed = Date.now() - startTime

      if (allDishes.length > 0) {
        this.globalData.allDishes = allDishes
        console.log(`✅ 菜品预加载完成: ${allDishes.length} 条 (荤${meats.length}/素${vegs.length}/汤${soups.length}/甜${desserts.length})，耗时 ${elapsed}ms`)
      } else {
        // 降级：分类加载失败时尝试全量加载（带 limit 防止返回全部 4 万行）
        console.log('⚠️ 分类加载返回空，降级到全量加载（限制 500 条）...')
        const dishes = await api.getDishesLite({ limit: 500 })
        if (dishes && dishes.length > 0) {
          this.globalData.allDishes = dishes
          console.log('✅ 菜品全量预加载完成:', dishes.length, '条')
        }
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
