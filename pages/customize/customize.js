// pages/customize/customize.js
Page({
  data: {
    activeTab: 'people',
    // 左侧分类
    tabs: ['people', 'meat', 'veg', 'soup', 'custom'],
    tabNames: {
      'people': '人数',
      'meat': '荤菜',
      'veg': '素菜',
      'soup': '汤品',
      'custom': '自定义'
    },
    // 人数设置
    people: 3,
    // 菜品数量设置
    meatCount: 2,
    vegCount: 2,
    soupCount: 1,
    mealType: 'lunch',
    // 菜品数据
    meatDishes: [],
    vegDishes: [],
    soupDishes: [],
    // 搜索相关
    searchKeyword: '',
    searchResults: [],
    isSearching: false,
    // 自定义菜谱
    customRecipes: [],
    // 选中的菜品
    selectedDishes: [],
    currentRecipe: {
      name: '',
      type: 'meat',
      tags: []
    }
  },

  onLoad() {
    this.loadDefaultDishes()
    this.loadCustomRecipes()
  },

  // 加载默认菜品数据
  loadDefaultDishes() {
    // 从全局或者API加载
    const { getDefaultDishes } = require('../../utils/dishes')
    const dishes = getDefaultDishes()
    this.setData({
      meatDishes: dishes.filter(d => d.type === 'meat').map(d => ({...d, isSelected: false})),
      vegDishes: dishes.filter(d => d.type === 'veg').map(d => ({...d, isSelected: false})),
      soupDishes: dishes.filter(d => d.type === 'soup').map(d => ({...d, isSelected: false}))
    })
  },

  // 加载自定义菜谱
  loadCustomRecipes() {
    const recipes = wx.getStorageSync('customRecipes') || []
    this.setData({ customRecipes: recipes })
  },

  // 切换分类标签
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab, searchKeyword: '', searchResults: [] })
  },

  // 人数选择
  onPeopleChange(e) {
    this.setData({ people: e.detail.value })
  },
  
  // 菜品数量选择
  onMeatCountChange(e) {
    this.setData({ meatCount: e.detail.value })
  },
  
  onVegCountChange(e) {
    this.setData({ vegCount: e.detail.value })
  },
  
  onSoupCountChange(e) {
    this.setData({ soupCount: e.detail.value })
  },
  
  onMealTypeChange(e) {
    this.setData({ mealType: e.detail.value })
  },

  // 搜索输入
  onSearchInput(e) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword, isSearching: true })
    
    if (keyword.trim() === '') {
      this.setData({ searchResults: [], isSearching: false })
      return
    }

    // 搜索逻辑
    this.performSearch(keyword)
  },

  // 执行搜索
  performSearch(keyword) {
    const { activeTab, selectedDishes } = this.data
    let allDishes = []
    
    switch (activeTab) {
      case 'meat':
        allDishes = [...this.data.meatDishes, ...this.data.customRecipes.filter(r => r.type === 'meat')]
        break
      case 'veg':
        allDishes = [...this.data.vegDishes, ...this.data.customRecipes.filter(r => r.type === 'veg')]
        break
      case 'soup':
        allDishes = [...this.data.soupDishes, ...this.data.customRecipes.filter(r => r.type === 'soup')]
        break
    }

    const results = allDishes.filter(dish => 
      dish.name.includes(keyword)
    ).map(dish => ({
      ...dish,
      isSelected: selectedDishes.some(d => d.name === dish.name)
    }))
    
    this.setData({ searchResults: results, isSearching: false })
  },

  // 选择菜品
  onSelectDish(e) {
    const dish = e.currentTarget.dataset.dish
    const selectedDishes = this.data.selectedDishes
    
    // 检查是否已选择
    const index = selectedDishes.findIndex(d => d.name === dish.name)
    
    if (index >= 0) {
      // 已选择，取消选择
      selectedDishes.splice(index, 1)
      wx.showToast({
        title: `已取消 ${dish.name}`,
        icon: 'none'
      })
    } else {
      // 未选择，添加
      selectedDishes.push(dish)
      wx.vibrateShort({ type: 'light' })
      wx.showToast({
        title: `已添加 ${dish.name}`,
        icon: 'success'
      })
    }
    
    this.setData({ selectedDishes })
    
    // 更新菜品列表的选中状态
    this.updateDishesSelectedState()
  },
  
  // 更新菜品列表的选中状态
  updateDishesSelectedState() {
    const { selectedDishes, meatDishes, vegDishes, soupDishes, searchResults } = this.data
    
    const updateSelected = (dishes) => {
      return dishes.map(dish => ({
        ...dish,
        isSelected: selectedDishes.some(d => d.name === dish.name)
      }))
    }
    
    this.setData({
      meatDishes: updateSelected(meatDishes),
      vegDishes: updateSelected(vegDishes),
      soupDishes: updateSelected(soupDishes),
      searchResults: searchResults.length > 0 ? updateSelected(searchResults) : []
    })
  },
  
  // 检查菜品是否已选择
  isDishSelected(dishName) {
    return this.data.selectedDishes.some(d => d.name === dishName)
  },

  // 切换到自定义模式
  onShowCustomInput() {
    wx.showModal({
      title: '添加自定义菜品',
      editable: true,
      placeholderText: '请输入菜品名称',
      success: (res) => {
        if (res.confirm && res.content) {
          this.addCustomDish(res.content)
        }
      }
    })
  },

  // 添加自定义菜品
  addCustomDish(name) {
    const { activeTab, currentRecipe } = this.data
    
    // 调用API保存自定义菜品
    this.saveCustomDish({
      name,
      type: activeTab === 'meat' ? 'meat' : activeTab === 'veg' ? 'veg' : 'soup',
      calories: 200,
      protein: 10,
      tags: ['自定义']
    })
  },

  // 保存自定义菜品到本地和服务器
  saveCustomDish(dish) {
    const customRecipes = [...this.data.customRecipes, dish]
    this.setData({ customRecipes })
    
    // 本地存储
    wx.setStorageSync('customRecipes', customRecipes)
    
    // 调用后端API
    this.callSaveDishAPI(dish)
    
    wx.showToast({
      title: '保存成功',
      icon: 'success'
    })
  },

  // 调用后端API保存菜品
  callSaveDishAPI(dish) {
    // TODO: 调用实际的后端API
    console.log('保存自定义菜品:', dish)
    // wx.request({
    //   url: 'https://your-api.com/dishes',
    //   method: 'POST',
    //   data: dish,
    //   success: (res) => {
    //     console.log('API保存成功', res)
    //   }
    // })
  },

  // 保存整个菜谱
  onSaveRecipe() {
    // 弹出输入框让用户输入菜谱名称
    wx.showModal({
      title: '保存菜谱',
      editable: true,
      placeholderText: '请输入菜谱名称',
      content: `当前配置：${this.data.people}人餐，已选${this.data.selectedDishes.length}道菜`,
      success: (res) => {
        if (res.confirm) {
          const recipeName = res.content || `我的菜谱-${this.data.people}人餐`
          this.saveRecipeWithName(recipeName)
        }
      }
    })
  },
  
  // 实际保存菜谱
  saveRecipeWithName(name) {
    const { people, meatCount, vegCount, soupCount, mealType, selectedDishes } = this.data
    
    const recipe = {
      id: Date.now(),
      name: name,
      people: people,
      meatCount: meatCount,
      vegCount: vegCount,
      soupCount: soupCount,
      mealType: mealType,
      selectedDishes: selectedDishes, // 用户选择的具体菜品
      createdAt: new Date().toISOString()
    }
    
    const recipes = wx.getStorageSync('savedRecipes') || []
    recipes.push(recipe)
    wx.setStorageSync('savedRecipes', recipes)
    
    wx.showModal({
      title: '保存成功',
      content: `菜谱《${name}》已保存\n包含${selectedDishes.length}道菜品\n在主页可以选择使用`,
      showCancel: true,
      cancelText: '留在这里',
      confirmText: '返回主页',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack()
        }
      }
    })
  },

  // 返回
  onBack() {
    wx.navigateBack()
  }
})

