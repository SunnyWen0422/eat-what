const api = require('../../utils/api')

Page({
  data: {
    loading: false,
    items: []
  },

  onLoad() {
    // 尝试拉取已有清单
    this.loadShoppingList()
  },

  async onGenerate() {
    this.setData({ loading: true, items: [] })
    try {
      await api.generateShoppingList({})
      await this.loadShoppingList()
    } catch (e) {
      console.error('生成购物清单失败:', e)
      wx.showToast({
        title: '生成失败，请稍后重试',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadShoppingList() {
    try {
      const res = await api.getShoppingList()
      // 后端返回结构不确定，这里做兼容处理
      const data = res && (res.data || res)
      const items = Array.isArray(data) ? data : (data && (data.items || data.list)) || []
      this.setData({ items })
    } catch (e) {
      // 后端暂未实现时，这里允许静默失败，避免影响页面进入
      console.warn('获取购物清单失败（可忽略）：', e)
      this.setData({ items: [] })
    }
  }
})

