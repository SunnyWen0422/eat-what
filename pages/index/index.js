// index.js
const { getUserStorageKey } = require('../../utils/util')

Page({
  data: {
    motto: 'Hello World',
    // 参数设置
    people: 2,
    meat: 2,
    veg: 2,
    soup: 1,
    dessert: 0,
    mealType: 'lunch',
    // 我的菜谱
    savedRecipes: [],
    selectedRecipeId: null,
    // 用户选中的菜品（从定制页带回）
    selectedDishes: [],
    // 菜品选择提示
    hasSelectedDishes: false,
    // 热门搭配标签
    activeTag: ''
  },
  
  onLoad(options) {
    // 处理从定制页返回时带入的选中菜品
    if (options && options.selectedDishes) {
      try {
        const selectedDishes = JSON.parse(decodeURIComponent(options.selectedDishes))
        this.setData({
          selectedDishes: selectedDishes,
          hasSelectedDishes: selectedDishes.length > 0
        })
        if (selectedDishes.length > 0) {
          wx.showToast({
            title: `已选${selectedDishes.length}道菜品`,
            icon: 'success'
          })
        }
      } catch (e) {
        console.error('解析选中菜品失败:', e)
      }
    }
  },

  onShow() {
    this.loadSavedRecipes()
    // 也检查本地存储中是否有从定制页带回的菜品
    const { getUserStorageKey } = require('../../utils/util')
    const pendingKey = getUserStorageKey('pendingSelectedDishes')
    const pending = wx.getStorageSync(pendingKey)
    if (pending && pending.length > 0) {
      wx.removeStorageSync(pendingKey)
      this.setData({
        selectedDishes: pending,
        hasSelectedDishes: true
      })
      wx.showToast({
        title: `已选${pending.length}道菜品`,
        icon: 'success'
      })
    }

  },

  onShareAppMessage() {
    return {
      title: '吃什么？帮你搞定每天的美食选择！',
      path: '/pages/index/index'
    }
  },

  onShareTimeline() {
    return {
      title: '吃什么？帮你搞定每天的美食选择！'
    }
  },
  
  // 加载已保存的菜谱（按用户隔离）
  loadSavedRecipes() {
    const recipesKey = getUserStorageKey('savedRecipes')
    const recipes = wx.getStorageSync(recipesKey) || []
    this.setData({ savedRecipes: recipes })
  },
  // 参数交互与联动
  onPeopleChange(e) {
    const people = e.detail.value
    wx.vibrateShort({ type: 'light' })
    this.setData({ people })
    this.applyConstraints()
  },
  onMeatChange(e) {
    wx.vibrateShort({ type: 'light' })
    this.setData({ meat: e.detail.value })
    this.applyConstraints()
  },
  onVegChange(e) {
    wx.vibrateShort({ type: 'light' })
    this.setData({ veg: e.detail.value })
    this.applyConstraints()
  },
  onSoupChange(e) {
    wx.vibrateShort({ type: 'light' })
    this.setData({ soup: e.detail.value })
    this.applyConstraints()
  },
  // ±按钮处理（老人友好）
  onPeopleMinus() {
    wx.vibrateShort({ type: 'light' })
    if (this.data.people > 1) {
      this.setData({ people: this.data.people - 1 })
    }
  },
  onPeoplePlus() {
    wx.vibrateShort({ type: 'light' })
    if (this.data.people < 10) {
      this.setData({ people: this.data.people + 1 })
    }
  },
  onMeatMinus() {
    wx.vibrateShort({ type: 'light' })
    if (this.data.meat > 0) {
      const m = this.data.meat - 1
      this.setData({ meat: m })
      this.applyConstraints()
    }
  },
  onMeatPlus() {
    wx.vibrateShort({ type: 'light' })
    if (this.data.meat < 5) {
      const m = this.data.meat + 1
      this.setData({ meat: m })
      this.applyConstraints()
    }
  },
  onVegMinus() {
    wx.vibrateShort({ type: 'light' })
    if (this.data.veg > 0) {
      const v = this.data.veg - 1
      this.setData({ veg: v })
      this.applyConstraints()
    }
  },
  onVegPlus() {
    wx.vibrateShort({ type: 'light' })
    if (this.data.veg < 5) {
      const v = this.data.veg + 1
      this.setData({ veg: v })
      this.applyConstraints()
    }
  },
  onSoupMinus() {
    wx.vibrateShort({ type: 'light' })
    if (this.data.soup > 0) {
      const s = this.data.soup - 1
      this.setData({ soup: s })
      this.applyConstraints()
    }
  },
  onSoupPlus() {
    wx.vibrateShort({ type: 'light' })
    if (this.data.soup < 3) {
      const s = this.data.soup + 1
      this.setData({ soup: s })
      this.applyConstraints()
    }
  },
  onDessertMinus() {
    wx.vibrateShort({ type: 'light' })
    if (this.data.dessert > 0) {
      const d = this.data.dessert - 1
      this.setData({ dessert: d })
      this.applyConstraints()
    }
  },
  onDessertPlus() {
    wx.vibrateShort({ type: 'light' })
    if (this.data.dessert < 3) {
      const d = this.data.dessert + 1
      this.setData({ dessert: d })
      this.applyConstraints()
    }
  },
  // 餐次按钮选择
  onMealTypeSelect(e) {
    wx.vibrateShort({ type: 'light' })
    const mealType = e.currentTarget.dataset.type
    this.setData({ mealType })
    // 根据餐次类型调整默认倾向
    if (mealType === 'breakfast') {
      this.setData({ meat: Math.min(this.data.meat, 1), soup: Math.min(this.data.soup, 1) })
    } else if (mealType === 'dinner') {
      this.setData({ meat: Math.max(this.data.meat, 2) })
    }
    this.applyConstraints()
  },
  onMealTypeChange(e) {
    wx.vibrateShort({ type: 'light' })
    const mealType = e.detail.value
    this.setData({ mealType })
    // 根据餐次类型调整默认倾向
    if (mealType === 'breakfast') {
      this.setData({ meat: Math.min(this.data.meat, 1), soup: Math.min(this.data.soup, 1) })
    } else if (mealType === 'dinner') {
      this.setData({ meat: Math.max(this.data.meat, 2) })
    }
    this.applyConstraints()
  },
  applyConstraints() {
    // 荤素汤数量上限固定：荤0-5、素0-5、汤0-3
    // 已由±按钮的边界检查保证，此处无需额外约束
  },
  // 导航到结果页并传参
  onStart() {
    wx.vibrateShort({ type: 'medium' })
    this._doNavigate()
  },

  // 执行跳转
  _doNavigate() {
    const { selectedRecipeId, savedRecipes, selectedDishes, people, meat, veg, soup, dessert, mealType } = this.data

    // 如果选择了菜谱，传递菜谱ID
    const selectedRecipe = selectedRecipeId
      ? savedRecipes.find(r => r.id === selectedRecipeId)
      : null

    const params = {
      people: people,
      meat: meat,
      veg: veg,
      soup: soup,
      dessert: dessert,
      mealType: mealType,
      selectedRecipe: selectedRecipe,
      // 传递用户手动选中的菜品（用于在推荐菜谱中优先展示）
      userSelectedDishes: selectedDishes
    }
    const url = `/pages/result/result?params=${encodeURIComponent(JSON.stringify(params))}`
    wx.navigateTo({ url })
  },
  
  // 跳转到定制菜谱页面
  onCustomize() {
    wx.vibrateShort({ type: 'light' })
    wx.navigateTo({ url: '/pages/customize/customize' })
  },
  
  // 热门搭配标签切换
  onTagTap(e) {
    const tag = e.currentTarget.dataset.tag
    wx.vibrateShort({ type: 'light' })
    // 切换选中状态
    this.setData({
      activeTag: this.data.activeTag === tag ? '' : tag
    })
  },

  // 清除已选菜品
  onClearSelectedDishes() {
    wx.vibrateShort({ type: 'light' })
    this.setData({
      selectedDishes: [],
      hasSelectedDishes: false
    })
    wx.showToast({
      title: '已清除选中菜品',
      icon: 'none'
    })
  },
  
  // 选择菜谱
  onSelectRecipe(e) {
    const recipeId = e.currentTarget.dataset.id
    const recipe = this.data.savedRecipes.find(r => r.id === recipeId)
    
    if (!recipe) return
    
    wx.vibrateShort({ type: 'light' })
    
    // 应用菜谱的参数
    this.setData({
      selectedRecipeId: recipeId,
      people: recipe.people || this.data.people,
      meat: recipe.meatCount || this.data.meat,
      veg: recipe.vegCount || this.data.veg,
      soup: recipe.soupCount || this.data.soup,
      dessert: recipe.dessertCount || this.data.dessert,
      mealType: recipe.mealType || this.data.mealType
    })
    
    wx.showToast({
      title: `已应用《${recipe.name}》`,
      icon: 'success',
      duration: 1500
    })
  },
  
  // 取消选择菜谱
  onUnselectRecipe() {
    wx.vibrateShort({ type: 'light' })
    this.setData({ selectedRecipeId: null })
    wx.showToast({
      title: '已取消选择',
      icon: 'none'
    })
  },
  
  // 删除菜谱
  onDeleteRecipe(e) {
    const recipeId = e.currentTarget.dataset.id
    const recipe = this.data.savedRecipes.find(r => r.id === recipeId)
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除菜谱《${recipe.name}》吗？`,
      success: (res) => {
        if (res.confirm) {
          const recipes = this.data.savedRecipes.filter(r => r.id !== recipeId)
          const recipesKey = getUserStorageKey('savedRecipes')
          wx.setStorageSync(recipesKey, recipes)
          
          // 如果删除的是当前选中的菜谱，取消选中
          if (this.data.selectedRecipeId === recipeId) {
            this.setData({ selectedRecipeId: null })
          }
          
          this.loadSavedRecipes()
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          })
        }
      }
    })
  }
})
