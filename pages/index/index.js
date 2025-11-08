// index.js
Page({
  data: {
    motto: 'Hello World',
    // 参数设置
    people: 2,
    meat: 2,
    veg: 2,
    soup: 1,
    mealType: 'lunch',
    // 我的菜谱
    savedRecipes: [],
    selectedRecipeId: null
  },
  
  onShow() {
    // 每次显示页面时加载菜谱
    this.loadSavedRecipes()
  },
  
  // 加载已保存的菜谱
  loadSavedRecipes() {
    const recipes = wx.getStorageSync('savedRecipes') || []
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
    const { people, mealType } = this.data
    // 规则1：人数与荤菜上限联动
    let meatMax = 5
    if (people <= 1) meatMax = 2
    else if (people <= 3) meatMax = 3
    else if (people <= 6) meatMax = 4
    // 早餐整体更清淡
    if (mealType === 'breakfast') meatMax = Math.min(meatMax, 1)
    const meat = Math.min(this.data.meat, meatMax)
    this.setData({ meat })
  },
  // 导航到结果页并传参
  onStart() {
    wx.vibrateShort({ type: 'medium' })
    
    // 如果选择了菜谱，传递菜谱ID
    const selectedRecipe = this.data.selectedRecipeId 
      ? this.data.savedRecipes.find(r => r.id === this.data.selectedRecipeId)
      : null
    
    const params = {
      people: this.data.people,
      meat: this.data.meat,
      veg: this.data.veg,
      soup: this.data.soup,
      mealType: this.data.mealType,
      selectedRecipe: selectedRecipe // 传递选中的菜谱
    }
    const url = `/pages/result/result?params=${encodeURIComponent(JSON.stringify(params))}`
    wx.navigateTo({ url })
  },
  // 跳转到定制菜谱页面
  onCustomize() {
    wx.vibrateShort({ type: 'light' })
    wx.navigateTo({ url: '/pages/customize/customize' })
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
          wx.setStorageSync('savedRecipes', recipes)
          
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
