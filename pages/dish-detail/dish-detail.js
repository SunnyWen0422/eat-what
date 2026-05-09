// pages/dish-detail/dish-detail.js
const { getDishById } = require('../../utils/api')

Page({
  data: {
    dish: null,
    loading: true,
    error: false,
    isFavorite: false
  },

  onLoad(options) {
    if (options.id) {
      this.loadDishDetail(options.id)
    } else {
      this.setData({ loading: false, error: true })
    }
  },

  async loadDishDetail(id) {
    try {
      this.setData({ loading: true, error: false })
      const dish = await getDishById(id)
      
      if (dish) {
        // 处理步骤图片（如果是JSON字符串则解析）
        if (dish.stepImages && typeof dish.stepImages === 'string') {
          try {
            dish.stepImagesList = JSON.parse(dish.stepImages)
          } catch (e) {
            dish.stepImagesList = []
          }
        } else if (Array.isArray(dish.stepImages)) {
          dish.stepImagesList = dish.stepImages
        } else {
          dish.stepImagesList = []
        }

        // 处理食材与用量（如果是JSON字符串则解析）
        if (dish.ingredientsAmounts && typeof dish.ingredientsAmounts === 'string') {
          try {
            dish.ingredientsList = JSON.parse(dish.ingredientsAmounts)
          } catch (e) {
            // 如果不是JSON，按换行分割
            dish.ingredientsList = dish.ingredientsAmounts.split('\n').filter(item => item.trim())
          }
        } else {
          dish.ingredientsList = []
        }

        // 处理步骤（如果是JSON字符串则解析）
        if (dish.steps && typeof dish.steps === 'string') {
          try {
            dish.stepsList = JSON.parse(dish.steps)
          } catch (e) {
            // 如果不是JSON，按换行分割
            dish.stepsList = dish.steps.split('\n').filter(item => item.trim())
          }
        } else if (Array.isArray(dish.steps)) {
          dish.stepsList = dish.steps
        } else {
          dish.stepsList = []
        }

        this.setData({ dish, loading: false })
        this.checkFavoriteStatus(id)
      } else {
        this.setData({ loading: false, error: true })
      }
    } catch (err) {
      console.error('加载菜品详情失败:', err)
      this.setData({ loading: false, error: true })
    }
  },

  async checkFavoriteStatus(dishId) {
    try {
      const { checkFavoriteDish } = require('../../utils/api')
      const result = await checkFavoriteDish(dishId)
      this.setData({ isFavorite: result && result.isFavorite })
    } catch (err) {
      console.error('检查收藏状态失败:', err)
    }
  },

  async toggleFavorite() {
    try {
      const { addFavoriteDish, removeFavoriteDish } = require('../../utils/api')
      const dishId = this.data.dish.id
      
      if (this.data.isFavorite) {
        await removeFavoriteDish(dishId)
        this.setData({ isFavorite: false })
        wx.showToast({ title: '已取消收藏', icon: 'success' })
      } else {
        await addFavoriteDish(dishId)
        this.setData({ isFavorite: true })
        wx.showToast({ title: '收藏成功', icon: 'success' })
      }
    } catch (err) {
      console.error('收藏操作失败:', err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    if (url) {
      wx.previewImage({
        current: url,
        urls: [url]
      })
    }
  },

  previewStepImage(e) {
    const url = e.currentTarget.dataset.url
    const urls = this.data.dish.stepImagesList || []
    if (url && urls.length > 0) {
      wx.previewImage({
        current: url,
        urls: urls
      })
    }
  },

  onShareAppMessage() {
    const dish = this.data.dish
    if (dish) {
      return {
        title: `推荐菜品：${dish.name}`,
        path: `/pages/dish-detail/dish-detail?id=${dish.id}`
      }
    }
    return {
      title: '吃什么 - 菜品详情',
      path: '/pages/index/index'
    }
  }
})
