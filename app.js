// app.js
const api = require('./utils/api')
const config = require('./utils/config')

App({
  onLaunch() {
    const environment = config.getApiBaseUrl()
    const previousEnvironment = wx.getStorageSync('apiEnvironment')
    // Pages may load even when migration cannot finish. Never let them reuse
    // the previous service's credentials against the newly configured API.
    if (previousEnvironment !== environment) {
      wx.removeStorageSync('token'); wx.removeStorageSync('userInfo')
    }
    // Retain existing local work under its original service; never replay it into an online account.
    try { require('./utils/util').preserveLegacyUserStorage(previousEnvironment) } catch (_) {
      console.warn('旧环境记录保留在原缓存中，迁移未完成，请重新启动重试')
      return
    }
    if (previousEnvironment !== environment) {
      wx.setStorageSync('apiEnvironment', environment)
    }
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 登录（登录成功后会自动预加载菜品数据）
    this.doLogin()
  },

  // One visible login attempt has one Promise and one identity generation.
  doLogin() {
    if (this._loginActive && this._loginPromise) return this._loginPromise
    const epoch = this._loginEpoch = (this._loginEpoch || 0) + 1
    this._loginActive = true; this.globalData.loginReady = false
    this._loginPromise = new Promise(resolve => { this._loginResolve = resolve })
    this._loginTimer = setTimeout(() => this._markLoginReady({ success: false, reason: 'timeout' }, epoch), 8000)
    if (!config.ENABLE_LOGIN) this._markLoginReady({ success: false, reason: 'disabled' }, epoch)
    else {
      const token = wx.getStorageSync('token'), user = wx.getStorageSync('userInfo')
      if (token && user) {
        this.globalData.userInfo = user; this.globalData.isLoggedIn = true
        this._markLoginReady({ success: true, reason: 'cached' }, epoch); this.precacheDishes(); this._verifyTokenLazy(token)
      } else { this.globalData.isLoggedIn = false; this._slowLogin(epoch) }
    }
    return this._loginPromise
  },
  _loginCurrent(epoch) { return this._loginActive && epoch === this._loginEpoch },
  _markLoginReady(result = { success: false, reason: 'failed' }, epoch = this._loginEpoch) {
    if (!this._loginCurrent(epoch)) return
    this._loginActive = false; this.globalData.loginReady = true
    clearTimeout(this._loginTimer)
    if (this._loginResolve) this._loginResolve(result)
    this._loginResolve = null
  },
  _slowLogin(epoch) {
    const send = async code => {
      try {
        const result = await api.login({ code })
        if (!this._loginCurrent(epoch)) return
        if (result && result.success && result.token && result.user) {
          wx.setStorageSync('token', result.token); wx.setStorageSync('userInfo', result.user)
          this.globalData.userInfo = result.user; this.globalData.isLoggedIn = true
          this._markLoginReady({ success: true, reason: 'logged_in' }, epoch); this.precacheDishes()
        } else this._markLoginReady({ success: false, reason: 'rejected' }, epoch)
      } catch (_) { this._markLoginReady({ success: false, reason: 'unavailable' }, epoch) }
    }
    if (/^http:\/\/127\.0\.0\.1:/.test(config.getApiBaseUrl())) return send('local-v4')
    wx.login({ success: res => { if (!this._loginCurrent(epoch)) return; if (res.code) return send(res.code); this._markLoginReady({ success: false, reason: 'no_code' }, epoch) },
      fail: () => this._markLoginReady({ success: false, reason: 'platform_rejected' }, epoch) })
  },

  // 后台静默验证 token 有效性
  async _verifyTokenLazy(token) {
    try {
      await require('./utils/api').requestSilent('/users/info', 'GET')
      console.log('✅ Token 验证有效')
    } catch (e) {
      console.log('⚠️ 缓存 Token 已失效，清除后下次启动重新登录')
      if (wx.getStorageSync('token') !== token) return
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
    const catalog = require('./utils/catalog-cache').createCatalogCache()
    const source = catalog.currentSource()
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
      catalog.assertSource(source)
      const elapsed = Date.now() - startTime

      if (allDishes.length > 0) {
        catalog.write(allDishes, source)
        console.log(`✅ 菜品预加载完成: ${allDishes.length} 条 (荤${meats.length}/素${vegs.length}/汤${soups.length}/甜${desserts.length})，耗时 ${elapsed}ms`)
      } else {
        // 降级：分类加载失败时尝试全量加载（带 limit 防止返回全部 4 万行）
        console.log('⚠️ 分类加载返回空，降级到全量加载（限制 500 条）...')
        const dishes = await api.getDishesLite({ limit: 500 })
        if (dishes && dishes.length > 0) {
          catalog.write(dishes, source)
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
