// pages/customize/customize.js
const api = require('../../utils/api')
const { loadRecommendationOptions } = require('../../utils/recommendation-options')

const BROWSE_GROUPS = [
  { key: 'cuisine', label: '菜系', field: 'cuisineCodes' },
  { key: 'flavor', label: '口味', field: 'tagCodes' },
  { key: 'scene', label: '场景', field: 'tagCodes' },
  { key: 'diet', label: '饮食', field: 'tagCodes' },
  { key: 'method', label: '做法', field: 'methodCodes' },
]
const BROWSE_DURATIONS = [
  { key: 'none', label: '不限', value: null },
  { key: '10', label: '10分钟', value: 10 },
  { key: '20', label: '20分钟', value: 20 },
  { key: '30', label: '30分钟', value: 30 },
  { key: '45', label: '45分钟', value: 45 },
  { key: '60', label: '60分钟', value: 60 },
]

function emptyBrowseCriteria() {
  return { cuisineCodes: [], tagCodes: [], methodCodes: [], maxCookMinutes: null }
}

Page({
  data: {
    activeTab: 'meat',
    tabs: ['meat', 'veg', 'soup', 'staple', 'dessert'],
    tabNames: {
      'meat': '荤菜',
      'veg': '素菜',
      'soup': '汤品',
      'staple': '主食',
      'dessert': '甜品',
      'custom': '定制'
    },
    currentDishes: [],
    loading: false,
    loadingMore: false,
    hasMore: true,
    searchKeyword: '',
    selectedIds: [],
    selectedTotal: 0,
    selectedList: [],
    showSelectedPanel: false,
    showBrowseFilters: false,
    browseCriteria: emptyBrowseCriteria(),
    browseFilterGroups: [],
    browseDurationOptions: BROWSE_DURATIONS,
    browseFilterCount: 0,
    browseFilterSummary: '',
    // 定制菜品表单
    showCustomForm: false,
    cuisineOptions: [],
    customTagOptions: [],
    customForm: {
      name: '',
      type: 'meat',
      ingredients: '',
      steps: '',
      cuisineCode: '',
      cuisineLabel: '未设置',
      tagCodes: [],
      cookMinutes: ''
    }
  },

  pageSize: 20,
  currentPage: 1,
  // 全局缓存所有加载过的菜品（按 id），跨分类共享
  allDishesMap: {},

  onLoad() {
    this.loadPage('meat', 1)
    this.loadCustomMetadata()
  },

  async loadCustomMetadata() {
    const result = await loadRecommendationOptions()
    const groups = result.options.groups || {}
    this.recommendationGroups = groups
    const customTagOptions = ['flavor', 'scene', 'diet', 'method']
      .flatMap(group => groups[group] || [])
      .map(item => ({ ...item, selected: false }))
    this.setData({ cuisineOptions: groups.cuisine || [], customTagOptions })
    this.renderBrowseFilters()
  },

  renderBrowseFilters() {
    if (!this.recommendationGroups) return
    const criteria = this.data.browseCriteria || emptyBrowseCriteria()
    const browseFilterGroups = BROWSE_GROUPS.map(group => ({
      ...group,
      items: (this.recommendationGroups[group.key] || []).map(item => ({
        ...item,
        selected: (criteria[group.field] || []).includes(item.code),
      })),
    }))
    const selectedLabels = browseFilterGroups
      .flatMap(group => group.items.filter(item => item.selected).map(item => item.label))
    const browseFilterCount = selectedLabels.length + (criteria.maxCookMinutes ? 1 : 0)
    if (criteria.maxCookMinutes) selectedLabels.push(`${criteria.maxCookMinutes}分钟内`)
    this.setData({
      browseFilterGroups,
      browseFilterCount,
      browseFilterSummary: selectedLabels.join('、'),
    })
  },

  onToggleBrowseFilters() {
    this.setData({ showBrowseFilters: !this.data.showBrowseFilters })
  },

  onBrowseOptionTap(e) {
    const { group, code } = e.currentTarget.dataset
    const definition = BROWSE_GROUPS.find(item => item.key === group)
    if (!definition) return Promise.resolve()
    const criteria = { ...this.data.browseCriteria }
    const values = new Set(criteria[definition.field] || [])
    if (values.has(code)) values.delete(code)
    else values.add(code)
    criteria[definition.field] = [...values].sort()
    this.setData({ browseCriteria: criteria })
    this.renderBrowseFilters()
    wx.vibrateShort({ type: 'light' })
    this.currentPage = 1
    return this.loadPage(this.data.activeTab, 1)
  },

  onBrowseDurationTap(e) {
    const raw = e.currentTarget.dataset.value
    const browseCriteria = {
      ...this.data.browseCriteria,
      maxCookMinutes: raw === 'none' ? null : Number(raw),
    }
    this.setData({ browseCriteria })
    this.renderBrowseFilters()
    this.currentPage = 1
    return this.loadPage(this.data.activeTab, 1)
  },

  onClearBrowseFilters() {
    this.setData({ browseCriteria: emptyBrowseCriteria() })
    this.renderBrowseFilters()
    this.currentPage = 1
    return this.loadPage(this.data.activeTab, 1)
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

    // 正常分页模式
    if (page === 1) {
      this.setData({ loading: true })
    } else {
      this.setData({ loadingMore: true })
    }

    try {
      const result = await api.getDishes({
        type: type,
        keyword: searchKeyword || undefined,
        page: page,
        pageSize: this.pageSize,
        ...this.data.browseCriteria,
      })
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
    if (tab === 'custom') {
      this.setData({ activeTab: 'custom', showCustomForm: true, searchKeyword: '' })
      return
    }
    this.setData({ activeTab: tab, showCustomForm: false, searchKeyword: '' })
    this.currentPage = 1
    this.loadPage(tab, 1)
  },

  onCustomTypeChange(e) {
    this.setData({ 'customForm.type': e.currentTarget.dataset.type })
  },

  onCustomCuisineChange(e) {
    const selected = this.data.cuisineOptions[Number(e.detail.value)]
    if (!selected) return
    this.setData({ 'customForm.cuisineCode': selected.code, 'customForm.cuisineLabel': selected.label })
  },

  onCustomTagTap(e) {
    const code = e.currentTarget.dataset.code
    const values = new Set(this.data.customForm.tagCodes)
    if (values.has(code)) values.delete(code)
    else values.add(code)
    const tagCodes = [...values].sort()
    this.setData({
      'customForm.tagCodes': tagCodes,
      customTagOptions: this.data.customTagOptions.map(item => ({ ...item, selected: tagCodes.includes(item.code) })),
    })
  },

  onCustomInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`customForm.${field}`]: e.detail.value })
  },

  async onSaveCustomDish() {
    const { name, type, ingredients, steps, cuisineCode, tagCodes, cookMinutes } = this.data.customForm
    if (!name.trim()) {
      wx.showToast({ title: '请输入菜品名称', icon: 'none' })
      return
    }
    if (!ingredients.trim()) {
      wx.showToast({ title: '请输入食材用料', icon: 'none' })
      return
    }
    if (!steps.trim()) {
      wx.showToast({ title: '请输入烹饪步骤', icon: 'none' })
      return
    }
    if (cookMinutes !== '' && (!Number.isInteger(Number(cookMinutes)) || Number(cookMinutes) < 1 || Number(cookMinutes) > 240)) {
      wx.showToast({ title: '烹饪时间应为1-240分钟', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中...', mask: true })
    try {
      const payload = {
        name: name.trim(), type: type,
        cl: ingredients.trim().replace(/\n/g, '#'),
        step: steps.trim().replace(/\n/g, '#'),
        cuisineCode: cuisineCode || null,
        tagCodes: tagCodes.join(','),
        cookMinutes: Number(cookMinutes) > 0 ? Number(cookMinutes) : null,
      }
      await api.createCustomDish(payload)
      wx.hideLoading()
      wx.showToast({ title: '添加成功', icon: 'success' })
      this.setData({ 'customForm.name': '', 'customForm.ingredients': '', 'customForm.steps': '' })
    } catch (err) {
      wx.hideLoading()
      const { getUserStorageKey } = require('../../utils/util')
      const key = getUserStorageKey('customDishes')
      const dishes = wx.getStorageSync(key) || []
      dishes.push({
        id: Date.now(), name: name.trim(), type: type,
        cl: ingredients.trim().replace(/\n/g, '#'),
        step: steps.trim().replace(/\n/g, '#'),
        cuisineCode: cuisineCode || '', tagCodes: tagCodes.join(','),
        cookMinutes: Number(cookMinutes) > 0 ? Number(cookMinutes) : null,
        isCustom: true
      })
      wx.setStorageSync(key, dishes)
      wx.showToast({ title: '已保存到本地', icon: 'success' })
      this.setData({ 'customForm.name': '', 'customForm.ingredients': '', 'customForm.steps': '' })
    }
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
  },

  onQuickSearch(e) {
    const kw = e.currentTarget.dataset.kw
    this.setData({ searchKeyword: kw })
    this.loadPage(this.data.activeTab, 1)
  }
})
