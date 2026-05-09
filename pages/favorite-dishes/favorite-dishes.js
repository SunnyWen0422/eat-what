const { getFavoriteDishes, removeFavoriteDish } = require('../../utils/api')

Page({
  data: {
    favorites: [],
    loading: true
  },

  onShow() {
    this.loadFavorites()
  },

  // 加载收藏的菜品
  async loadFavorites() {
    this.setData({ loading: true })
    try {
      const favorites = await getFavoriteDishes()
      this.setData({ favorites, loading: false })
    } catch (error) {
      console.error('加载收藏失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  // 查看菜品详情
  onViewDish(e) {
    const dish = e.currentTarget.dataset.dish
    if (!dish || !dish.id) return

    wx.navigateTo({
      url: `/pages/dish-detail/dish-detail?id=${dish.id}`
    })
  },

  // 取消收藏
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
          } catch (error) {
            console.error('取消收藏失败:', error)
            wx.showToast({ title: '操作失败', icon: 'none' })
          }
        }
      }
    })
  }
})
