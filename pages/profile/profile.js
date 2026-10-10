// pages/profile/profile.js
const api = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')
const { loadLocalShoppingList, loadPendingOperations } = require('../../utils/shopping-list')
const app = getApp()

function pendingItemCount(list) {
  return (Array.isArray(list.dishes) ? list.dishes : []).reduce((total, dish) =>
    total + (Array.isArray(dish.items) ? dish.items : []).filter(item => !item.checked).length, 0)
}

function localShoppingSummary() {
  const list = loadLocalShoppingList()
  const pending = loadPendingOperations().length
  const hasLocalItems = (list.dishes || []).some(dish => (dish.items || []).some(item => !item.id))
  return {
    pendingCount: pendingItemCount(list),
    syncLabel: pending ? `${pending} 项草稿待确认` : '已显示本地清单',
    refreshing: false,
    localOnly: pending > 0 || hasLocalItems,
  }
}

Page({
  data: { productVersion: require('../../utils/product-release').version, fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(),
    userInfo: {
      avatar: '',
      nickname: '点击登录',
      level: '游客模式',
      joinDays: 0
    },
    showLoginModal: false, loginBusy: false, loginError: '',
    isAdmin: false,
    shoppingSummary: { pendingCount: 0, syncLabel: '已显示本地清单', refreshing: false },
    menuItems: [
      {icon:'chef',title:'我的菜单',desc:'几道菜的常用组合，随时再用',url:'/pages/customize/customize',tab:true},
      {
        icon: 'chart',
        title: '饮食回顾',
        desc: '查看明确记录的实际用餐',
        url: '/pages/statistics/statistics'
      },
      {
        icon: 'heart',
        title: '收藏菜品',
        desc: '我收藏的美味好菜',
        url: '/pages/favorite-dishes/favorite-dishes'
      },
      {
        icon: 'chef',
        title: '我的私房菜',
        desc: '我的私房菜',
        url: '/pages/custom-dishes/custom-dishes'
      },
      {
        icon: 'settings',
        title: '偏好设置',
        desc: '个性化推荐偏好',
        url: '/pages/settings/settings'
      },
      { icon: 'refresh', title: '数据同步', desc: '确认本机草稿与同步结果', url: '/pages/sync/sync' },
      { icon: 'history', title: '助手历史', desc: '查看以往对话与餐单', url: '/pages/assistant-history/assistant-history' },
      { icon: 'info', title: '隐私说明', desc: '查看小程序隐私保护说明', action: 'privacy' },
      {
        icon: 'info',
        title: '关于',
        desc: '版本信息和更新日志',
        url: '/pages/about/about'
      }
    ]
  },

  onLoad() {
    this.loadUserInfo()
  },

  onShareAppMessage() {
    return {
      title: '我最近常做的家常菜，给你也挑几道？',
      path: '/pages/index/index'
    }
  },

  onShareTimeline() {
    return {
      title: '吃什么？帮我选好每天吃什么，快来试试！'
    }
  },
  
  onShow() {
    this.loadUserInfo()
    this.loadShoppingSummary()
  },

  onHide() {
    this.shoppingSummaryRequest = (this.shoppingSummaryRequest || 0) + 1
    clearTimeout(this.loginModalTimer)
    this.setData({ showLoginModal: false })
  },

  onUnload() { this.onHide() },

  shoppingSummaryTimeoutMs: 5000,

  async loadShoppingSummary() {
    const requestId = this.shoppingSummaryRequest = (this.shoppingSummaryRequest || 0) + 1
    const identity = getUserStorageKey('shoppingList')
    const local = localShoppingSummary()
    this.setData({ shoppingSummary: local })
    if (local.localOnly || !wx.getStorageSync('token')) return
    this.setData({ 'shoppingSummary.refreshing': true })
    const isCurrent = () => requestId === this.shoppingSummaryRequest && identity === getUserStorageKey('shoppingList')
    let timeout
    try {
      const remote = await Promise.race([
        api.getShoppingList('all', { silent: true, maxRetries: 0 }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('summary timeout')), this.shoppingSummaryTimeoutMs) }),
      ])
      if (!isCurrent()) return
      const latest = localShoppingSummary()
      if (latest.localOnly) {
        this.setData({ shoppingSummary: latest })
        return
      }
      if (!remote || !Array.isArray(remote.dishes)) throw new Error('invalid shopping summary')
      this.setData({ shoppingSummary: { pendingCount: pendingItemCount(remote), syncLabel: '刚刚已同步', refreshing: false } })
    } catch (_) {
      if (isCurrent()) this.setData({ shoppingSummary: { ...localShoppingSummary(), syncLabel: '暂未连接 · 显示本地清单', refreshing: false } })
    } finally {
      clearTimeout(timeout)
    }
  },

  onShoppingListTap() {
    wx.navigateTo({ url: '/pages/shopping-list/shopping-list' })
  },

  // 加载用户信息
  async loadUserInfo() {
    const scope = getUserStorageKey('profileUser'), epoch = this._userEpoch = (this._userEpoch || 0) + 1
    const current = () => scope === getUserStorageKey('profileUser') && epoch === this._userEpoch
    if (this._userScope !== scope) this.setData({ isAdmin: false, userInfo: { avatar: '', nickname: '点击登录', favoriteDishes: '—', totalRecipes: '—' } })
    this._userScope = scope
    try {
      // 先从本地存储获取
      const localUserInfo = wx.getStorageSync('userInfo')
      if (localUserInfo) {
        this.setData({
          userInfo: {
            ...this.data.userInfo,
            ...localUserInfo, avatar: require('../../utils/avatar').resolveAvatar(localUserInfo.avatar)
          }
        })
      }

      // 从API获取最新用户信息
      const userResult = await api.getUserInfo()
      if (!current()) return
      if (userResult.success && userResult.user) {
        const user = userResult.user

        // 计算注册天数
        let joinDays = 0
        if (user.registerTime) {
          const registerDate = require('../../utils/server-date').serverDate(user.registerTime)
          const now = new Date()
          joinDays = registerDate ? Math.max(0, Math.floor((now - registerDate) / (1000 * 60 * 60 * 24))) : 0
        }

        // 更新本地存储
        wx.setStorageSync('userInfo', user)
        app.globalData.userInfo = user

        // 更新页面用户信息
        const hasNickname = !!(user.nickname && user.nickname.trim())
        this.setData({
          isAdmin: userResult.isAdmin === true,
          userInfo: {
            avatar: require('../../utils/avatar').resolveAvatar(user.avatar),
            nickname: user.nickname || '点击登录',
            level: hasNickname ? '已登录' : '游客模式',
            joinDays: joinDays || 0
          }
        })
      }

      // 获取统计数据
      await this.loadStatistics()
    } catch (err) {
      console.error('加载用户信息失败:', err)
    }
  },

  // 加载统计数据
  async loadStatistics() {
    const identity = getUserStorageKey('profileReview')
    // 获取收藏菜品数量（独立try-catch，后端未部署时不影响其他功能）
    try {
      const favorites = await api.getFavoriteDishes()
      if (identity !== getUserStorageKey('profileReview')) return
      const favList = Array.isArray(favorites) ? favorites : (favorites && favorites.list ? favorites.list : [])
      this.setData({
        'userInfo.favoriteDishes': favList.length || 0
      })
    } catch (err) {
      console.log('收藏功能暂不可用')
    }

    try {
      const flow = require('../../utils/meal-workflow'), scope = getUserStorageKey('profileReview'), day = flow.today(), range = flow.monthRange(Number(day.slice(0,4)), Number(day.slice(5,7)))
      const review = await api.getDietReview(range.startDate, range.endDate)
      if (scope === getUserStorageKey('profileReview')) this.setData({ 'userInfo.totalRecipes': review.mealCount })
    } catch (error) { if (identity === getUserStorageKey('profileReview')) this.setData({ 'userInfo.totalRecipes': '—' }) }
  },

  // 点击用户信息区域 → 跳转编辑页
  onUserInfoTap() {
    if (!wx.getStorageSync('token')) return this.setData({ showLoginModal: true })
    wx.navigateTo({ url: '/pages/profile-edit/profile-edit' })
  },
  onAdminWorkbench() { if(this.data.isAdmin) wx.navigateTo({url:'/pages/admin-dashboard/admin-dashboard'}) },

  // 5击版本文字进入管理后台
  onVersionTap() {
    if (!this.data.isAdmin) return
    this._adminTapCount = (this._adminTapCount || 0) + 1
    if (this._adminTapCount >= 5) {
      this._adminTapCount = 0
      // Keep the legacy entry route as a compatibility shim; the page can forward to the new workbench.
      wx.navigateTo({ url: '/pages/admin/admin' })
    } else if (this._adminTapCount === 3) {
      wx.showToast({ title: `再点${5-this._adminTapCount}次进入后台`, icon: 'none', duration: 1000 })
    }
  },

  // 点击统计卡片
  onStatTap(e) { wx.navigateTo({ url: e.currentTarget.dataset.type === 'favorite' ? '/pages/favorite-dishes/favorite-dishes' : '/pages/statistics/statistics' }) },
  onAvatarError() { this.setData({ 'userInfo.avatar': '' }) },

  // 点击菜单项
  onMenuTap(e) {
    const { index } = e.currentTarget.dataset
    const menuItem = this.data.menuItems[index]

    if (menuItem.action === 'privacy') {
      const unavailable = () => wx.showModal({ title: '隐私说明暂未打开', content: '可在微信的小程序菜单中查看隐私保护说明。', showCancel: false })
      if (wx.openPrivacyContract) wx.openPrivacyContract({ fail: unavailable })
      else unavailable()
      return
    }

    if (menuItem.url) {
      if(menuItem.tab){wx.setStorageSync(getUserStorageKey('openPersonalMenus'),true);wx.switchTab({url:menuItem.url});return}
      // 如果有跳转链接
      wx.navigateTo({
        url: menuItem.url
      })
    } else {
      // 显示功能提示
      wx.showModal({
        title: menuItem.title,
        content: `${menuItem.desc}\n\n此功能正在开发中，敬请期待！`,
        showCancel: false,
        confirmText: '知道了'
      })
    }
  },

  onCloseLoginModal() {
    if (this.data.loginBusy) return
    this.setData({ showLoginModal: false })
  },

  // 使用微信一键登录
  async onWxLogin() {
    if (this.data.loginBusy) return
    this.setData({ loginBusy: true, loginError: '' })
    wx.showLoading({ title: '登录中...', mask: true })
    try {
      const app = getApp()
      const result = await app.doLogin()
      if (!result || !result.success) throw new Error('login_incomplete')
      wx.hideLoading()
      this.loadUserInfo()
      this.loadShoppingSummary()
      this.setData({ showLoginModal: false })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
      this.setData({ loginError: '登录未完成，可重试或暂不登录。' })
    } finally { this.setData({ loginBusy: false }) }
  },


  onEditProfile() { this.onUserInfoTap() },
  editNickname() { this.onEditProfile() }, editAvatar() { this.onEditProfile() },
})
