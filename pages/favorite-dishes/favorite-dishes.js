const { getFavoriteDishes, removeFavoriteDish } = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')

Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(),
    favorites: [],
    filtered: [],
    loading: true,
    searchKeyword: '', errorMessage: '', removingId: null, addingId: null, mealAddError: ''
  },

  onShow() {
    this.loadFavorites()
  },

  async loadFavorites() {
    const epoch = this._epoch = (this._epoch || 0) + 1, scope = getUserStorageKey('favoriteView')
    if(this._viewScope !== scope)this.setData({ favorites: [], filtered: [], removingId: null, addingId: null, mealAddError: '', searchKeyword: '' })
    this._viewScope = scope
    this.setData({ loading: true, errorMessage: '' })
    try {
      const result = await getFavoriteDishes()
      if (epoch !== this._epoch || scope !== getUserStorageKey('favoriteView')) return
      // 兼容不同返回格式
      const list = Array.isArray(result) ? result : (result.list || result.data || [])
      const normalized = list.map(item => {
        const dish = item.dish || item
        return { id: dish.id, name: dish.name, type: dish.type, image: dish.image || '', dish: dish }
      })
      this.setData({ favorites: normalized, loading: false })
      this.doFilter()
    } catch (error) {
      if (epoch === this._epoch && scope === getUserStorageKey('favoriteView')) this.setData({ loading: false, errorMessage: require('../../utils/meal-workflow').errorMessage(error, '收藏读取失败，请重试') })
    }
  },

  onUnload() { this._epoch = (this._epoch || 0) + 1 },
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
    this.doFilter()
  },

  doFilter() {
    const kw = this.data.searchKeyword.trim()
    const filtered = kw
      ? this.data.favorites.filter(f => f.name.includes(kw))
      : this.data.favorites
    this.setData({ filtered })
  },

  onViewDish(e) {
    const dish = e.currentTarget.dataset.dish
    if (!dish || !dish.id) return
    wx.navigateTo({ url: `/pages/dish-detail/dish-detail?id=${dish.id}` })
  },

  async onAddToMeal(e) {
    const id=Number(e.currentTarget.dataset.id),scope=this._viewScope,epoch=this._epoch
    const current=()=>scope===getUserStorageKey('favoriteView')&&scope===this._viewScope&&epoch===this._epoch
    if(!Number.isSafeInteger(id)||id<1||this.data.addingId||!current())return
    this.setData({addingId:id,mealAddError:''})
    try{await require('../../utils/dish-workspace-handoff').addDishToWorkspace(id,{api:require('../../utils/api'),wx,storageKey:getUserStorageKey,current})}
    catch(error){if(current())this.setData({mealAddError:error.message||'暂未加入，请重试'})}
    finally{if(current())this.setData({addingId:null})}
  },

  async onRemoveFavorite(e) {
    const dishId = e.currentTarget.dataset.id
    if (!dishId || this.data.removingId) return
    const scope = getUserStorageKey('favoriteView')
    wx.showModal({
      title: '确认取消收藏',
      content: '确定要取消收藏这道菜吗？',
      success: async (res) => {
        if (res.confirm && scope === getUserStorageKey('favoriteView') && scope === this._viewScope) {
          this.setData({ removingId: dishId })
          try {
            await removeFavoriteDish(dishId)
            if (scope !== getUserStorageKey('favoriteView')) return
            wx.showToast({ title: '已取消收藏', icon: 'success' })
            this.loadFavorites()
          } catch (err) {
            if (scope === getUserStorageKey('favoriteView')) wx.showToast({ title: '操作失败', icon: 'none' })
          } finally { if (scope === getUserStorageKey('favoriteView')) this.setData({ removingId: null }) }
        }
      }
    })
  },

  onBrowse() { wx.switchTab({ url: '/pages/customize/customize' }) },
  onShareAppMessage() {
    return { title: '我的收藏好菜', path: '/pages/index/index' }
  }
})
