const { getFavoriteDishes, removeFavoriteDish } = require('../../utils/api')

Page({
  data: {
    favorites: [],
    filtered: [],
    loading: true,
    searchKeyword: ''
  },

  onShow() {
    this.loadFavorites()
  },

  async loadFavorites() {
    this.setData({ loading: true })
    try {
      const result = await getFavoriteDishes()
      // 兼容不同返回格式
      const list = Array.isArray(result) ? result : (result.list || result.data || [])
      const normalized = list.map(item => {
        const dish = item.dish || item
        return { id: dish.id, name: dish.name, type: dish.type, image: dish.image || '', dish: dish }
      })
      this.setData({ favorites: normalized, loading: false })
      this.doFilter()
    } catch (error) {
      console.error('加载收藏失败:', error)
      this.setData({ loading: false })
    }
  },

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

  async onRemoveFavorite(e) {
    const dishId = e.currentTarget.dataset.id
    if (!dishId) return
    wx.showModal({
      title: '确认取消收藏',
      content: '确定要取消收藏这道菜吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await removeFavoriteDish(dishId)
            wx.showToast({ title: '已取消收藏', icon: 'success' })
            this.loadFavorites()
          } catch (err) {
            wx.showToast({ title: '操作失败', icon: 'none' })
          }
        }
      }
    })
  },

  onShareAppMessage() {
    return { title: '我的收藏好菜', path: '/pages/index/index' }
  }
})
