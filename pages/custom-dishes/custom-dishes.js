const api = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')

Page({
  data: { dishes: [], loading: true },

  onShow() { this.loadCustomDishes() },

  async loadCustomDishes() {
    this.setData({ loading: true })
    try {
      // 优先从后端获取用户独立的菜谱
      const serverDishes = await api.getCustomDishes()
      this.setData({ dishes: Array.isArray(serverDishes) ? serverDishes : [], loading: false })
    } catch (e) {
      // 后端不可用时降级到本地
      const key = getUserStorageKey('customDishes')
      this.setData({ dishes: wx.getStorageSync(key) || [], loading: false })
    }
  },

  onViewDish(e) {
    const dish = e.currentTarget.dataset.dish
    if (dish && dish.id) {
      wx.navigateTo({ url: `/pages/dish-detail/dish-detail?id=${dish.id}` })
    }
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除', content: '确定删除这道自定义菜品吗？',
      success: (res) => {
        if (res.confirm) {
          const key = getUserStorageKey('customDishes')
          const dishes = wx.getStorageSync(key) || []
          wx.setStorageSync(key, dishes.filter(d => d.id !== id))
          this.loadCustomDishes()
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  }
})
