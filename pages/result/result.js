const { recommendPlans } = require('../../utils/recommend')

Page({
  data: {
    loading: true,
    empty: false,
    plans: [],
    params: null
  },
  onLoad(query) {
    const params = query && query.params ? JSON.parse(decodeURIComponent(query.params)) : null
    this.setData({ params })
    this.generatePlans()
  },
  async generatePlans() {
    wx.vibrateShort({ type: 'light' })
    this.setData({ loading: true, empty: false })
    try {
      const plans = recommendPlans(this.data.params)
      if (!plans || plans.length === 0) {
        this.setData({ loading: false, empty: true })
        return
      }
      this.setData({ plans, loading: false })
    } catch (e) {
      this.setData({ loading: false, empty: true })
    }
  },
  onRegenerate() {
    this.generatePlans()
  },
  onBack() {
    wx.navigateBack()
  },
  onTapDish(e) {
    const dish = e.currentTarget.dataset.dish
    wx.showModal({
      title: dish.name,
      content: '做法（模拟）：\n1. 准备食材\n2. 清洗切配\n3. 烹饪装盘',
      showCancel: false
    })
  }
})


