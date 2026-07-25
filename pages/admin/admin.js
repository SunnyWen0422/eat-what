const api = require('../../utils/api')
const { loadRecommendationOptions } = require('../../utils/recommendation-options')

const TYPE_OPTIONS = [
  { code: 'meat', label: '荤菜' },
  { code: 'veg', label: '素菜' },
  { code: 'soup', label: '汤品' },
  { code: 'staple', label: '主食' },
  { code: 'dessert', label: '甜品' },
]

const TAG_GROUPS = [
  { key: 'flavor', label: '口味' },
  { key: 'scene', label: '场景' },
  { key: 'diet', label: '饮食' },
  { key: 'method', label: '做法' },
]

function emptyDish() {
  return {
    name: '',
    type: 'meat',
    ingredients: '',
    steps: '',
    cuisineCode: '',
    cuisineLabel: '未设置',
    tagCodes: [],
    cookMinutes: '',
  }
}

function compactLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
    .join('#')
}

function formatDate(value) {
  if (!value) return '暂无记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

Page({
  data: {
    mode: 'list',
    users: [],
    total: 0,
    searchInput: '',
    keyword: '',
    displayedKeyword: '',
    listReady: false,
    loading: false,
    refreshing: false,
    loadingMore: false,
    listError: '',
    listNotice: '',
    hasMore: false,

    selectedUser: null,
    userDishes: [],
    detailReady: false,
    detailLoading: false,
    detailRefreshing: false,
    detailError: '',
    detailNotice: '',
    deletingDishId: null,

    typeOptions: TYPE_OPTIONS,
    cuisineOptions: [{ code: '', label: '未设置' }],
    cuisineIndex: 0,
    tagGroups: [],
    newDish: emptyDish(),
    saving: false,
  },

  pageSize: 20,
  currentPage: 0,
  listRequestVersion: 0,
  detailRequestVersion: 0,
  detailUserId: null,
  recommendationGroups: {},

  async onLoad() {
    await Promise.all([this.loadMetadata(), this.loadUsers(true)])
  },

  async loadMetadata() {
    const result = await loadRecommendationOptions()
    this.recommendationGroups = result.options.groups || {}
    this.setData({
      cuisineOptions: [
        { code: '', label: '未设置' },
        ...(this.recommendationGroups.cuisine || []),
      ],
    })
    this.renderTagGroups()
  },

  renderTagGroups() {
    const selected = new Set(this.data.newDish.tagCodes || [])
    const tagGroups = TAG_GROUPS.map(group => ({
      ...group,
      items: (this.recommendationGroups[group.key] || []).map(item => ({
        ...item,
        selected: selected.has(item.code),
      })),
    })).filter(group => group.items.length > 0)
    this.setData({ tagGroups })
  },

  async loadUsers(reset = false) {
    if (!reset && (this.data.loading || this.data.refreshing || this.data.loadingMore)) return false
    if (!reset && !this.data.hasMore) return

    const page = reset ? 1 : this.currentPage + 1
    const requestKeyword = this.data.keyword
    const requestVersion = ++this.listRequestVersion
    const initialLoading = reset && !this.data.listReady
    this.setData(reset
      ? {
          loading: initialLoading,
          refreshing: !initialLoading,
          loadingMore: false,
          listError: '',
          listNotice: '',
        }
      : { loadingMore: true, listNotice: '' })
    try {
      const result = await api.getAdminUsers({
        keyword: requestKeyword || undefined,
        page,
        pageSize: this.pageSize,
      })
      if (requestVersion !== this.listRequestVersion) return false
      const incoming = (result.list || result.data || []).map(user => ({
        ...user,
        displayName: user.nickname || user.phone || `用户 ${user.id}`,
        registerDate: formatDate(user.registerTime),
        lastLoginDate: formatDate(user.lastLoginTime),
        customCount: Number(user.customCount) || 0,
      }))
      const users = reset ? incoming : this.mergeUsers(this.data.users, incoming)
      const total = Number(result.total) || 0
      const pageSize = Number(result.pageSize) || this.pageSize
      this.currentPage = Number(result.page) || page
      this.setData({
        users,
        total,
        hasMore: this.currentPage * pageSize < total,
        displayedKeyword: requestKeyword,
        listReady: true,
        listError: '',
        listNotice: '',
      })
      return true
    } catch (error) {
      if (requestVersion !== this.listRequestVersion) return false
      if (!reset) {
        this.setData({ listNotice: '加载更多失败，请重试' })
      } else if (this.data.listReady) {
        this.setData({ listNotice: '更新失败，仍显示上次结果' })
      } else {
        this.setData({ listError: '用户列表加载失败' })
      }
      return false
    } finally {
      if (requestVersion === this.listRequestVersion) {
        this.setData({ loading: false, refreshing: false, loadingMore: false })
      }
    }
  },

  mergeUsers(existing, incoming) {
    const values = new Map(existing.map(item => [String(item.id), item]))
    incoming.forEach(item => values.set(String(item.id), item))
    return [...values.values()]
  },

  onSearchInput(event) {
    this.setData({ searchInput: event.detail.value })
  },

  onSearchSubmit() {
    this.currentPage = 0
    this.setData({ keyword: this.data.searchInput.trim() })
    return this.loadUsers(true)
  },

  onClearSearch() {
    this.currentPage = 0
    this.setData({ searchInput: '', keyword: '' })
    return this.loadUsers(true)
  },

  onLoadMore() {
    return this.loadUsers(false)
  },

  onReachBottom() {
    if (this.data.mode === 'list') return this.onLoadMore()
    return undefined
  },

  async onPullDownRefresh() {
    try {
      if (this.data.mode === 'detail' && this.data.selectedUser) {
        await this.loadUserDetail(this.data.selectedUser.id)
      } else if (this.data.mode === 'list') {
        this.currentPage = 0
        await this.loadUsers(true)
      }
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  onRetryList() {
    return this.loadUsers(true)
  },

  onSelectUser(event) {
    return this.loadUserDetail(event.currentTarget.dataset.id)
  },

  async loadUserDetail(userId) {
    const sameVisibleUser = this.data.detailReady
      && this.data.selectedUser
      && String(this.data.selectedUser.id) === String(userId)
    const requestVersion = ++this.detailRequestVersion
    this.detailUserId = userId
    this.setData({
      mode: 'detail',
      detailReady: sameVisibleUser,
      detailLoading: !sameVisibleUser,
      detailRefreshing: sameVisibleUser,
      detailError: '',
      detailNotice: '',
      ...(sameVisibleUser ? {} : { selectedUser: null, userDishes: [] }),
    })
    try {
      const result = await api.getAdminUser(userId)
      if (requestVersion !== this.detailRequestVersion) return false
      const user = result.user || {}
      this.setData({
        selectedUser: {
          ...user,
          displayName: user.nickname || user.phone || `用户 ${user.id}`,
          registerDate: formatDate(user.registerTime),
          lastLoginDate: formatDate(user.lastLoginTime),
        },
        userDishes: (result.customDishes || []).map(dish => this.decorateDish(dish)),
        detailReady: true,
        detailError: '',
        detailNotice: '',
      })
      return true
    } catch (error) {
      if (requestVersion !== this.detailRequestVersion) return false
      if (sameVisibleUser) {
        this.setData({ detailNotice: '刷新失败，仍显示上次内容' })
      } else {
        this.setData({ detailError: '用户信息加载失败' })
      }
      return false
    } finally {
      if (requestVersion === this.detailRequestVersion) {
        this.setData({ detailLoading: false, detailRefreshing: false })
      }
    }
  },

  decorateDish(dish) {
    const type = TYPE_OPTIONS.find(item => item.code === dish.type)
    const cuisine = (this.recommendationGroups.cuisine || []).find(item => item.code === dish.cuisineCode)
    const tags = TAG_GROUPS
      .flatMap(group => this.recommendationGroups[group.key] || [])
      .filter(item => String(dish.tagCodes || '').split(',').includes(item.code))
      .map(item => item.label)
    return {
      ...dish,
      typeLabel: type ? type.label : dish.type,
      cuisineLabel: cuisine ? cuisine.label : '',
      tagLabel: tags.join('、'),
    }
  },

  onRetryDetail() {
    if (this.detailUserId) return this.loadUserDetail(this.detailUserId)
    return undefined
  },

  onBack() {
    this.detailRequestVersion += 1
    this.detailUserId = null
    this.currentPage = 0
    this.setData({
      mode: 'list',
      selectedUser: null,
      userDishes: [],
      detailReady: false,
      detailLoading: false,
      detailRefreshing: false,
      detailError: '',
      detailNotice: '',
    })
    return this.loadUsers(true)
  },

  onShowAdd() {
    if (!this.data.selectedUser) return
    this.setData({
      mode: 'form',
      newDish: emptyDish(),
      cuisineIndex: 0,
    })
    this.renderTagGroups()
  },

  onCancelAdd() {
    if (this.data.saving) return
    this.setData({ mode: 'detail', newDish: emptyDish(), cuisineIndex: 0 })
    this.renderTagGroups()
  },

  onDishInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`newDish.${field}`]: event.detail.value })
  },

  onTypeTap(event) {
    this.setData({ 'newDish.type': event.currentTarget.dataset.type })
    wx.vibrateShort({ type: 'light' })
  },

  onCuisineChange(event) {
    const index = Number(event.detail.value)
    const selected = this.data.cuisineOptions[index]
    if (!selected) return
    this.setData({
      cuisineIndex: index,
      'newDish.cuisineCode': selected.code,
      'newDish.cuisineLabel': selected.label,
    })
  },

  onTagTap(event) {
    const code = event.currentTarget.dataset.code
    const selected = new Set(this.data.newDish.tagCodes || [])
    if (selected.has(code)) selected.delete(code)
    else selected.add(code)
    this.setData({ 'newDish.tagCodes': [...selected].sort() })
    this.renderTagGroups()
    wx.vibrateShort({ type: 'light' })
  },

  selectedTagLabels() {
    const selected = new Set(this.data.newDish.tagCodes || [])
    return TAG_GROUPS
      .flatMap(group => this.recommendationGroups[group.key] || [])
      .filter(item => selected.has(item.code))
      .map(item => item.label)
  },

  validateDish() {
    const dish = this.data.newDish
    if (!dish.name.trim()) return '请输入菜名'
    if (!dish.ingredients.trim()) return '请输入食材用量'
    if (!dish.steps.trim()) return '请输入烹饪步骤'
    if (dish.cookMinutes !== '') {
      const minutes = Number(dish.cookMinutes)
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) return '烹饪时间应为1-240分钟'
    }
    return ''
  },

  async onSaveDish() {
    if (this.data.saving) return false
    const validationMessage = this.validateDish()
    if (validationMessage) {
      wx.showToast({ title: validationMessage, icon: 'none' })
      return false
    }
    if (!this.data.selectedUser) return false

    const dish = this.data.newDish
    const payload = {
      name: dish.name.trim(),
      type: dish.type,
      cl: compactLines(dish.ingredients),
      step: compactLines(dish.steps),
      cuisineCode: dish.cuisineCode || null,
      tagCodes: (dish.tagCodes || []).join(','),
      tags: this.selectedTagLabels().join(','),
      cookMinutes: dish.cookMinutes === '' ? null : Number(dish.cookMinutes),
    }
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中', mask: true })
    let loadingVisible = true
    try {
      await api.createAdminUserDish(this.data.selectedUser.id, payload)
      wx.hideLoading()
      loadingVisible = false
      wx.showToast({ title: '菜品已添加', icon: 'success' })
      const userId = this.data.selectedUser.id
      this.setData({ mode: 'detail', newDish: emptyDish(), cuisineIndex: 0 })
      this.renderTagGroups()
      await this.loadUserDetail(userId)
      return true
    } catch (error) {
      wx.hideLoading()
      loadingVisible = false
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      return false
    } finally {
      if (loadingVisible) wx.hideLoading()
      this.setData({ saving: false })
    }
  },

  onDeleteDish(event) {
    const dishId = event.currentTarget.dataset.id
    const userId = this.data.selectedUser && this.data.selectedUser.id
    if (!dishId || !userId || this.data.deletingDishId) return
    wx.showModal({
      title: '删除菜品',
      content: '确认删除这道用户菜品？',
      confirmColor: '#C83F49',
      success: async result => {
        if (!result.confirm) return
        this.setData({ deletingDishId: dishId })
        try {
          await api.deleteAdminUserDish(userId, dishId)
          wx.showToast({ title: '已删除', icon: 'success' })
          await this.loadUserDetail(userId)
        } catch (error) {
          wx.showToast({ title: '删除失败，请重试', icon: 'none' })
        } finally {
          this.setData({ deletingDishId: null })
        }
      },
    })
  },
})
