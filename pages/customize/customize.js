// pages/customize/customize.js
const api = require('../../utils/api')

Page({
  data: {
    activeTab: 'meat',
    tabs: ['meat', 'veg', 'soup'],
    tabNames: {
      'meat': '荤菜',
      'veg': '素菜',
      'soup': '汤品'
    },
    currentDishes: [],
    loading: false,
    loadingMore: false,
    hasMore: true,
    searchKeyword: '',
    selectedIds: [],
    selectedTotal: 0,
    selectedList: [],
    showSelectedPanel: false
  },

  pageSize: 20,
  currentPage: 1,
  // 全局缓存所有加载过的菜品（按 id），跨分类共享
  allDishesMap: {},

  onLoad() {
    this.loadPage('meat', 1)
  },

  // 把菜品加入全局缓存
  addToGlobalCache(dishes) {
    for (const d of dishes) {
      if (d.id) {
        this.allDishesMap[d.id] = d
      }
    }
  },

  // 根据 selectedIds 从全局缓存构建已选列表
  buildSelectedList(selectedIds) {
    const list = []
    for (const id of selectedIds) {
      const d = this.allDishesMap[id]
      if (d) {
        list.push({ id: d.id, name: d.name })
      }
    }
    return list
  },

  // 加载某一页数据
  async loadPage(type, page) {
    const { selectedIds, searchKeyword } = this.data

    // 搜索模式
    if (searchKeyword) {
      this.setData({ loading: true })
      try {
        const dishes = await api.searchDishes(searchKeyword, type)
        const simplified = (dishes || []).map(d => ({
          id: d.id,
          name: d.name,
          type: d.type,
          isSelected: selectedIds.includes(d.id)
        }))
        this.setData({
          currentDishes: simplified,
          loading: false,
          hasMore: false
        })
      } catch (err) {
        console.error('搜索失败:', err)
        this.setData({ loading: false })
      }
      return
    }

    // 正常分页模式
    if (page === 1) {
      this.setData({ loading: true })
    } else {
      this.setData({ loadingMore: true })
    }

    try {
      const result = await api.getDishes({ type: type, page: page, pageSize: this.pageSize })
      const list = result.list || []
      const total = result.total || 0

      const simplified = list.map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        isSelected: selectedIds.includes(d.id)
      }))

      // 加入全局缓存
      this.addToGlobalCache(simplified)

      const hasMore = page * this.pageSize < total

      if (page === 1) {
        this.setData({
          currentDishes: simplified,
          hasMore: hasMore,
          loading: false
        })
      } else {
        this.setData({
          currentDishes: [...this.data.currentDishes, ...simplified],
          hasMore: hasMore,
          loadingMore: false
        })
      }
      this.currentPage = page
    } catch (err) {
      console.error('加载失败:', err)
      this.setData({ loading: false, loadingMore: false })
    }
  },

  // 切换分类
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    const wasSearching = !!this.data.searchKeyword
    this.setData({ activeTab: tab, searchKeyword: '' })
    this.currentPage = 1
    this.loadPage(tab, 1)
  },

  // 搜索输入（防抖）
  onSearchInput(e) {
    const keyword = e.detail.value.trim()
    this.setData({ searchKeyword: keyword })

    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.currentPage = 1
      if (!keyword) {
        this.loadPage(this.data.activeTab, 1)
        return
      }
      this.loadPage(this.data.activeTab, 1)
    }, 300)
  },

  // scroll-view 滚动到底部加载更多
  onScrollToLower() {
    const { activeTab, hasMore, loadingMore, searchKeyword } = this.data
    if (!hasMore || loadingMore || searchKeyword) return

    const nextPage = this.currentPage + 1
    this.loadPage(activeTab, nextPage)
  },

  // 点击菜名 → 详情页
  onTapDish(e) {
    const dish = e.currentTarget.dataset.dish
    if (!dish || !dish.id) return
    wx.navigateTo({
      url: `/pages/dish-detail/dish-detail?id=${dish.id}`
    })
  },

  // 勾选/取消
  onToggleSelect(e) {
    const dish = e.currentTarget.dataset.dish
    if (!dish || !dish.id) return
    const selectedIds = [...this.data.selectedIds]
    const idx = selectedIds.indexOf(dish.id)
    if (idx >= 0) {
      selectedIds.splice(idx, 1)
    } else {
      selectedIds.push(dish.id)
      wx.vibrateShort({ type: 'light' })
    }

    // 只更新当前列表的选中状态和底栏数字
    const currentDishes = this.data.currentDishes.map(d => ({
      ...d,
      isSelected: selectedIds.includes(d.id)
    }))
    this.setData({
      selectedIds: selectedIds,
      selectedTotal: selectedIds.length,
      currentDishes: currentDishes
    })
  },

  // 显示已选面板
  onShowSelected() {
    const { selectedIds } = this.data
    const selectedList = this.buildSelectedList(selectedIds)
    this.setData({ selectedList: selectedList, showSelectedPanel: true })
  },

  // 隐藏已选面板
  onHideSelected() {
    this.setData({ showSelectedPanel: false })
  },

  // 从面板中删除一道菜
  onRemoveSelected(e) {
    const id = e.currentTarget.dataset.id
    const selectedIds = this.data.selectedIds.filter(x => x !== id)
    const currentDishes = this.data.currentDishes.map(d => ({
      ...d,
      isSelected: selectedIds.includes(d.id)
    }))
    this.setData({
      selectedIds: selectedIds,
      selectedTotal: selectedIds.length,
      currentDishes: currentDishes
    })
  },

  // 清空全部
  onClearSelected() {
    wx.showModal({
      title: '清空已选',
      content: '确定清空所有已选菜品？',
      success: (res) => {
        if (res.confirm) {
          const currentDishes = this.data.currentDishes.map(d => ({
            ...d,
            isSelected: false
          }))
          this.setData({
            selectedIds: [],
            selectedTotal: 0,
            currentDishes: currentDishes
          })
        }
      }
    })
  },

  // 保存到日历
  async onSaveToCalendar() {
    const { selectedIds } = this.data
    if (!selectedIds.length) {
      wx.showToast({ title: '请先勾选菜品', icon: 'none' })
      return
    }
    wx.showActionSheet({
      itemList: ['早餐', '午餐', '晚餐'],
      success: (res) => {
        const mealTypes = ['breakfast', 'lunch', 'dinner']
        const mealType = mealTypes[res.tapIndex]
        this.doSave(mealType, selectedIds)
      }
    })
  },

  async doSave(mealType, selectedIds) {
    // 从全局缓存构建已选菜品详情
    const selectedDishes = []
    for (const id of selectedIds) {
      const d = this.allDishesMap[id]
      if (d) {
        selectedDishes.push({ id: d.id, name: d.name, type: d.type })
      }
    }

    const now = new Date()
    const todayStr = this.getBeijingDateString(now)
    const timeStr = [String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0')].join(':')

    try {
      await api.saveRecipeRecord({
        userId: this.getCurrentUserId(),
        recordDateString: todayStr,
        mealType: mealType,
        recipeName: `定制菜谱 ${timeStr}`,
        dishIds: selectedIds,
        dishDetails: selectedDishes,
        isManual: 1
      })
      wx.showToast({ title: '已保存到日历', icon: 'success' })
      // 清空选中状态
      const currentDishes = this.data.currentDishes.map(d => ({ ...d, isSelected: false }))
      this.allDishesMap = {}
      this.setData({
        selectedIds: [],
        selectedTotal: 0,
        currentDishes: currentDishes,
        showSelectedPanel: false
      })
    } catch (err) {
      console.error('保存失败:', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  getCurrentUserId() {
    const userInfo = wx.getStorageSync('userInfo') || {}
    if (!userInfo.id) throw new Error('用户未登录')
    return userInfo.id
  },

  getBeijingDateString(date) {
    const d = new Date(date.getTime() + 8 * 3600000)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return y + '-' + m + '-' + day
  },

  onBack() {
    wx.navigateBack()
  }
})
