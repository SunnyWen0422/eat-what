// pages/customize/customize.js
const api = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')
const { loadRecommendationOptions } = require('../../utils/recommendation-options')
const { currentIdentity } = require('../../utils/account-identity')

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

function emptyCustomForm() {
  return { name: '', type: 'meat', ingredients: '', steps: '', cuisineCode: '', cuisineLabel: '未设置', tagCodes: [], cookMinutes: '', servingDescription: '', image: '' }
}

Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(),
    activeTab: 'meat',recipeSource:'all',browseScrollTop:0,selectionMode:true,selectionTargetLabel:'',showMealSelected:false,mealSelectedDishes:[],selectedMeal:null,selectionFeedback:null,selectionLoading:false,selectionBusy:false,selectionBlocked:true,
    personalSaveMessage:'',personalGuideVisible:false,customFocus:'',customExtrasVisible:false,menuMissingDishes:[],activeMenu:null,showMenuTarget:false,menuFormVisible:false, showMenus: false, menus: [], menuLoading: false, menuSaving: false, menuBusy: false, menuError: '', menuName: '', menuPeople: 2, menuEditingId: null, menuDate: '', menuMealIndex: 2, menuMealLabels: ['早餐','午餐','晚餐'], customPending: false, menuPending: false, menuReviewDishes: [], menuReviewNotice: '',
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
    customForm: emptyCustomForm()
  },

  pageSize: 20,
  currentPage: 1,
  // 全局缓存所有加载过的菜品（按 id），跨分类共享
  allDishesMap: {},

  onLoad(options={}) {
    this._openMenusRequested=options.menus==='1'
    this.ensureBrowseOwner()
    this.loadPage('meat', 1)
    this.loadCustomMetadata()
  },

  async onShow() {
    this._recipeVisible = true
    this._visible = true
    if (this._menuApplyWasHidden) { this._menuApplyWasHidden = false; this.setData({ menuBusy: false }) }
    const scope = getUserStorageKey('customBrowse')
    if (!this.ensureBrowseOwner()) this.loadPage('meat', 1)
    this._browseScope = scope
    const menuIntentKey=getUserStorageKey('openPersonalMenus')
    if(this._openMenusRequested || wx.getStorageSync(menuIntentKey)){this._openMenusRequested=false;wx.removeStorageSync(menuIntentKey);this.onOpenMenus()}
    const pendingCustom = this.writeJournal().pending('dish:create')
    if (pendingCustom) this.setData({ showCustomForm: true, customPending: true, customForm: { ...emptyCustomForm(), name: pendingCustom.name, type: pendingCustom.type, ingredients: String(pendingCustom.cl || '').replace(/#/g,'\n'), steps: String(pendingCustom.step || '').replace(/#/g,'\n'), cuisineCode: pendingCustom.cuisineCode || '', tagCodes: String(pendingCustom.tagCodes || '').split(',').filter(Boolean), cookMinutes: pendingCustom.cookMinutes == null ? '' : String(pendingCustom.cookMinutes), servingDescription: pendingCustom.fl || '', image: pendingCustom.image || '' } })
    this._planOwnerScope = getUserStorageKey('mealView')
    const rules=require('../../utils/meal-workspace'),pending=wx.getStorageSync(getUserStorageKey('pendingRecipeRecord')),intent=wx.getStorageSync(getUserStorageKey('recipeSelectionIntent'))
    const target=pending || wx.getStorageSync(getUserStorageKey('activeMealTarget')) || rules.defaultTarget()
    this.setData({selectionMode:true,selectionTargetLabel:`${target.date} ${require('../../utils/meal-workflow').mealNames[target.mealType] || '当前餐'}`})
    if(intent)wx.removeStorageSync(getUserStorageKey('recipeSelectionIntent'))
    if (wx.getStorageSync(getUserStorageKey('openCustomDishForm'))) { wx.removeStorageSync(getUserStorageKey('openCustomDishForm')); this.setData({ showCustomForm: true, activeTab: 'custom' }) }
    this.syncCustomLeaveAlert()
    this.setData({ personalGuideVisible: !wx.getStorageSync(getUserStorageKey('personalRecipeGuideDismissed')) })
    const openForm = () => {
      if (!this.ensureBrowseOwner()) return
      const intent = getUserStorageKey('openPersonalMenuForm')
      if (wx.getStorageSync(intent)) this.onOpenMenuFromCurrentMeal()
    }
    if (require('../../utils/config').ENABLE_MEAL_WORKSPACE) { await this.refreshSelectedMeal(); openForm(); return }
    openForm()
  },
  onHide() { this._recipeVisible = false; clearTimeout(this._recipePoll); this._visible = false; this._menuApplyEpoch = (this._menuApplyEpoch || 0) + 1; if (this._menuApplying) { this._menuApplyWasHidden = true; this._menuApplying = false } },
  onUnload() { require('../../utils/dish-workspace-handoff').disposeSelectionPage(this); this._unloaded = true; clearTimeout(this.searchTimer); this._pageEpoch = (this._pageEpoch || 0) + 1; this._privateEpoch = (this._privateEpoch || 0) + 1; this._pendingPlanWrite = null },
  onToggleSelectionMode(){if(this.ensureBrowseOwner())this.setData({selectionMode:!this.data.selectionMode})},
  ensureBrowseOwner() {
    if (this._unloaded) return false
    const identity = currentIdentity()
    if (this._browseIdentity === undefined) { this._browseIdentity = identity; this._browseScope = getUserStorageKey('customBrowse'); return true }
    if (this._browseIdentity === identity) return true
    require('../../utils/dish-workspace-handoff').disposeSelectionPage(this)
    this._browseIdentity = identity; this._browseScope = getUserStorageKey('customBrowse')
    this._pageEpoch = (this._pageEpoch || 0) + 1; this._privateEpoch = (this._privateEpoch || 0) + 1
    clearTimeout(this.searchTimer)
    this.allDishesMap = {}; this.currentPage = 1; this._pendingPlanWrite = null; this._customInitial = null; this._menuInitial = null; this._menuVersion = null; this._menuNamingDialog = null
    this._planOwnerScope = getUserStorageKey('mealView')
    this.setData({ activeTab: 'meat', recipeSource:'all', browseScrollTop:0, showMealSelected:false,mealSelectedDishes:[],selectedMeal:null, selectionFeedback:null, selectionBusy:false, selectionLoading:false, selectionMode:true, selectedIds: [], selectedTotal: 0, selectedList: [], currentDishes: [], showCustomForm: false, showSelectedPanel: false,
      customForm: emptyCustomForm(), customTagOptions: this.data.customTagOptions.map(item => ({ ...item, selected: false })),
      customError: '', saveError: '', browseError: '', savingCustom: false, savingPlan: false, loading: false, loadingMore: false,
      personalSaveMessage:'',personalGuideVisible:false,customFocus:'',customExtrasVisible:false,menuMissingDishes:[],activeMenu:null,showMenuTarget:false,menuFormVisible:false, showMenus: false, menus: [], menuLoading: false, menuSaving: false, menuBusy: false, menuError: '', menuName: '', menuPeople: 2, menuEditingId: null, customPending: false, menuPending: false, menuReviewDishes: [], menuReviewNotice: '',
      searchKeyword: '', hasMore: true, browseCriteria: emptyBrowseCriteria(), showBrowseFilters: false })
    this.renderBrowseFilters(); this.syncCustomLeaveAlert()
    return false
  },
  isBrowseCurrent(identity, epoch = this._privateEpoch || 0) {
    return this.ensureBrowseOwner() && identity === this._browseIdentity && epoch === (this._privateEpoch || 0)
  },
  onRetryPage() { this.loadPage(this.data.activeTab, 1) },
  onDismissPersonalGuide() { if (this.ensureBrowseOwner()) { wx.setStorageSync(getUserStorageKey('personalRecipeGuideDismissed'), true); this.setData({ personalGuideVisible: false }) } },
  onToggleCustomExtras() { if (this.ensureBrowseOwner()) this.setData({ customExtrasVisible: !this.data.customExtrasVisible }) },
  syncCustomLeaveAlert() {
    const customDirty = this.data.showCustomForm && (this.data.customPending || this.data.savingCustom || JSON.stringify(this.data.customForm) !== (this._customInitial || JSON.stringify(emptyCustomForm())))
    const menuActive = this.data.menuFormVisible || this.data.menuEditingId || this.data.menuPending
    const menuDirty = menuActive && (this.data.menuPending || this.data.menuSaving || this.menuChanged())
    if ((customDirty || menuDirty) && wx.enableAlertBeforeUnload) wx.enableAlertBeforeUnload({ message: '菜谱或常用菜单输入尚未保存。离开会放弃未提交输入；结果待确认的原保存请求会保留。' })
    else if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload()
  },
  onCancelCustom(next, leavingPage = false) {
    if (!this.ensureBrowseOwner() || this.data.savingCustom) return
    if (this.data.customPending) return this.setData({ customError: '上次保存结果未确认，请先重试原保存，输入仍保留。' })
    const initial = this._customInitial || JSON.stringify(emptyCustomForm())
    const close = discard => { if (discard) this.setData({ customForm: emptyCustomForm() }); this.setData({ showCustomForm: false, activeTab: 'meat', customError: '', customFocus: '' }); this.syncCustomLeaveAlert(); if (typeof next === 'function') next() }
    if (JSON.stringify(this.data.customForm) === initial) return close(false)
    const identity = this._browseIdentity, epoch = this._privateEpoch || 0
    wx.showModal({ title: '保留这份菜谱输入？', content: '还没保存到我的菜谱。保留后可以稍后继续，或放弃本次输入。', confirmText: '放弃输入', cancelText: '保留输入', success: result => {
      if (this.isBrowseCurrent(identity, epoch) && !this.data.savingCustom && (!leavingPage || result.confirm)) close(!!result.confirm)
    } })
  },

  async loadCustomMetadata() {
    if (!this.ensureBrowseOwner()) return
    const identity = this._browseIdentity
    const result = await loadRecommendationOptions()
    if (!this.isBrowseCurrent(identity)) return
    const groups = result.options.groups || {}
    this.recommendationGroups = groups
    const customTagOptions = ['flavor', 'scene', 'diet', 'method']
      .flatMap(group => groups[group] || [])
      .map(item => ({ ...item, selected: this.data.customForm.tagCodes.includes(item.code) }))
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
    if (!this.ensureBrowseOwner()) return
    const identity = this._browseIdentity
    const epoch = this._pageEpoch = (this._pageEpoch || 0) + 1, scope = getUserStorageKey('customBrowse')
    this.setData({ browseError: '' })
    const { selectedIds, searchKeyword } = this.data

    // 正常分页模式
    if (page === 1) {
      this.setData({ loading: true })
    } else {
      this.setData({ loadingMore: true })
    }

    try {
      let result
      if (this.data.recipeSource === 'mine') {
        const own = await api.getCustomDishes()
        const criteria = this.data.browseCriteria
        const filtered = require('../../utils/recommendation-matcher').filterAndRankDishes(Array.isArray(own) ? own : own.list || [], { criteria: { ...criteria, includeTagCodes: [...criteria.tagCodes, ...criteria.methodCodes] }, useSavedPreferences: false })
          .filter(d => d.type === type && (!searchKeyword || d.name.includes(searchKeyword)))
        result = { list: filtered.slice((page - 1) * this.pageSize, page * this.pageSize), total: filtered.length }
      } else result = await api.getDishes({ type, keyword: searchKeyword || undefined, page, pageSize: this.pageSize, ...this.data.browseCriteria })
      if (!this.isBrowseCurrent(identity) || epoch !== this._pageEpoch || scope !== getUserStorageKey('customBrowse')) return
      const list = result.list || []
      const total = result.total || 0

      const simplified = list.map(d => ({
        ...d,
        isSelected: this.data.selectedIds.includes(Number(d.id))
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
      if (!this.isBrowseCurrent(identity) || epoch !== this._pageEpoch || scope !== getUserStorageKey('customBrowse')) return
      this.setData({ browseError: require('../../utils/meal-workflow').errorMessage(err, '读取失败，请重试，已选菜品仍保留。') })
      this.setData({ loading: false, loadingMore: false })
    }
  },

  // 切换分类
  onTabChange(e) {
    if (!this.ensureBrowseOwner()) return
    const tab = e.currentTarget.dataset.tab
    if (tab === 'custom') {
      this.setData({ activeTab: 'custom', showCustomForm: true, searchKeyword: '' })
      return
    }
    const change = () => { this.setData({ activeTab: tab, showCustomForm: false, searchKeyword: '' }); this.currentPage = 1; this.loadPage(tab, 1) }
    if (this.data.showCustomForm) return this.onCancelCustom(change)
    change()
  },

  onCustomTypeChange(e) {
    if (!this.ensureBrowseOwner() || this.data.savingCustom || this.data.customPending) return
    this.setData({ 'customForm.type': e.currentTarget.dataset.type }); this.syncCustomLeaveAlert()
  },

  onCustomCuisineChange(e) {
    if (!this.ensureBrowseOwner() || this.data.savingCustom || this.data.customPending) return
    const selected = this.data.cuisineOptions[Number(e.detail.value)]
    if (!selected) return
    this.setData({ 'customForm.cuisineCode': selected.code, 'customForm.cuisineLabel': selected.label }); this.syncCustomLeaveAlert()
  },

  onCustomTagTap(e) {
    if (!this.ensureBrowseOwner() || this.data.savingCustom || this.data.customPending) return
    const code = e.currentTarget.dataset.code
    const values = new Set(this.data.customForm.tagCodes)
    if (values.has(code)) values.delete(code)
    else values.add(code)
    const tagCodes = [...values].sort()
    this.setData({
      'customForm.tagCodes': tagCodes,
      customTagOptions: this.data.customTagOptions.map(item => ({ ...item, selected: tagCodes.includes(item.code) })),
    }); this.syncCustomLeaveAlert()
  },

  onCustomInput(e) {
    if (!this.ensureBrowseOwner() || this.data.savingCustom || this.data.customPending) return
    const field = e.currentTarget.dataset.field
    this.setData({ [`customForm.${field}`]: e.detail.value, customFocus: '' }); this.syncCustomLeaveAlert()
  },

  async onSaveCustomDish() {
    if (!this.ensureBrowseOwner()) return
    const { name, type, ingredients, steps, cuisineCode, tagCodes, cookMinutes, servingDescription, image } = this.data.customForm
    const validation = require('../../utils/personal-recipes').recipeValidation(this.data.customForm)
    if (validation && !this.data.customPending) return this.setData({ customError: validation.message, customFocus: validation.field, customExtrasVisible: ['cookMinutes','image'].includes(validation.field) || this.data.customExtrasVisible })
    if (this.data.savingCustom) return
    const identity = this._browseIdentity, epoch = this._privateEpoch || 0
    this.setData({ savingCustom: true, customError: '' })
    try {
      const saved = await this.writeJournal().run('dish:create', { name: name.trim(), type, cl: ingredients.trim().replace(/\n/g, '#'), step: steps.trim().replace(/\n/g, '#'), cuisineCode: cuisineCode || null, tagCodes: tagCodes.join(','), cookMinutes: Number(cookMinutes) > 0 ? Number(cookMinutes) : null, fl: String(servingDescription || '').trim() || null, image: String(image || '').trim() || null }, async body => {
        const result = await api.createCustomDish(body), id = result && result.id
        if (!result || !['number','string'].includes(typeof id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) throw new Error('保存结果未确认，菜谱目的地未读到，请重试原保存。')
        return result
      })
      if (!this.isBrowseCurrent(identity, epoch)) return
      this.setData({ showCustomForm: false, customForm: emptyCustomForm(), customFocus: '', personalSaveMessage: '已保存到我的菜谱，正在打开菜谱详情。' }); this._customInitial = null; this.syncCustomLeaveAlert()
      wx.showToast({ title: '已保存到我的菜谱', icon: 'success' }); wx.navigateTo({ url: '/pages/dish-detail/dish-detail?id=' + Number(saved.id) })
    } catch (error) { if (this.isBrowseCurrent(identity, epoch)) this.setData({ customError: require('../../utils/meal-workflow').errorMessage(error, error.message || '保存失败，输入仍保留，请重试。') }) }
    finally { if (this.isBrowseCurrent(identity, epoch)) { this.setData({ savingCustom: false, customPending: !!this.writeJournal().pending('dish:create') }); this.syncCustomLeaveAlert() } }
  },

  // 搜索输入（防抖）
  onSearchInput(e) {
    if (!this.ensureBrowseOwner()) return
    const keyword = e.detail.value.trim()
    this._pageEpoch = (this._pageEpoch || 0) + 1
    this.setData({ searchKeyword: keyword, loading: false, loadingMore: false, hasMore: false })
    const identity = this._browseIdentity

    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      if (!this.isBrowseCurrent(identity)) return
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
    if (!this.ensureBrowseOwner()) return
    const { activeTab, hasMore, loading, loadingMore } = this.data
    if (!hasMore || loading || loadingMore) return

    const nextPage = this.currentPage + 1
    return this.loadPage(activeTab, nextPage)
  },

  // 点击菜名 → 详情页
  onMenuDish(e) {
    if (!this.ensureBrowseOwner()) return
    const id = Number(e.currentTarget.dataset.id), people = Number(e.currentTarget.dataset.people)
    if (!Number.isSafeInteger(id) || id < 1) return
    const targetPeople = Number.isInteger(people) && people >= 1 && people <= 50 ? people : 2
    wx.navigateTo({ url: `/pages/dish-detail/dish-detail?id=${id}&people=${targetPeople}` })
  },
  onTapDish(e) {
    if (!this.ensureBrowseOwner()) return
    const dish = e.detail && e.detail.id ? this.allDishesMap[e.detail.id] || {id:e.detail.id} : e.currentTarget.dataset.dish
    if (!dish || !dish.id) return
    wx.navigateTo({
      url: `/pages/dish-detail/dish-detail?id=${dish.id}&people=${this.data.selectedMeal ? this.data.selectedMeal.people : 2}`
    })
  },

  // 勾选/取消
  onToggleSelect(e) {
    if (!this.ensureBrowseOwner() || this.data.menuBusy || this.data.menuPending) return
    if (require('../../utils/config').ENABLE_MEAL_WORKSPACE && !this.data.menuEditingId && !this.data.menuPending && !this.data.menuFormVisible) {
      const id = Number(e.detail && e.detail.id || e.currentTarget.dataset.dish && e.currentTarget.dataset.dish.id)
      if (this.data.selectedMeal && this.data.selectedMeal.dishIds.includes(id)) return this.onViewMeal()
      return require('../../utils/dish-workspace-handoff').changeSelectionPage(this,'append',id,this.selectionOptions())
    }
    const dish = e.detail && e.detail.id ? this.allDishesMap[e.detail.id] : e.currentTarget.dataset.dish
    if (!dish || !dish.id) return
    const selectedIds = [...this.data.selectedIds]
    const idx = selectedIds.indexOf(dish.id)
    if (idx >= 0) {
      selectedIds.splice(idx, 1)
    } else {
      if (selectedIds.length >= 10) {
        this.setData({ saveError: '最多选择 10 道菜，请先移除一道后再加入，已有菜品保留。' })
        wx.showToast({ title: '最多选择10道菜', icon: 'none' }); return
      }
      this.addToGlobalCache([dish])
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
    }); this.renderTemplateSelection()
  },

  // 显示已选面板
  onShowSelected() {
    if (!this.ensureBrowseOwner()) return
    if(this.data.selectedMeal && !this.data.menuEditingId && !this.data.menuPending && !this.data.menuFormVisible)return this.setData({showMealSelected:true})
    const { selectedIds } = this.data
    const selectedList = this.buildSelectedList(selectedIds)
    this.setData({ selectedList: selectedList, showSelectedPanel: true })
  },

  onAddSelectedToShoppingList() {
    if (!this.ensureBrowseOwner()) return
    const { selectedIds } = this.data
    if (!selectedIds.length) {
      wx.showToast({ title: '请先勾选菜品', icon: 'none' })
      return
    }
    const { beginShoppingSelection } = require('../../utils/shopping-list')
    const dishes = selectedIds.map(id => this.allDishesMap[id]).filter(Boolean)
    beginShoppingSelection({ dishIds: selectedIds, targetPeople: this.data.selectedMeal ? this.data.selectedMeal.people : 2, source: 'customize', dishes })
    wx.navigateTo({ url: '/pages/shopping-preview/shopping-preview' })
  },

  // 隐藏已选面板
  onHideSelected() {
    if (!this.ensureBrowseOwner()) return
    this.setData({ showSelectedPanel: false })
  },

  // 从面板中删除一道菜
  onRemoveSelected(e) {
    if (!this.ensureBrowseOwner() || this.data.menuBusy || this.data.menuPending) return
    if (require('../../utils/config').ENABLE_MEAL_WORKSPACE && !this.data.menuEditingId && !this.data.menuPending && !this.data.menuFormVisible) return require('../../utils/dish-workspace-handoff').changeSelectionPage(this,'remove',Number(e.currentTarget.dataset.id),this.selectionOptions())
    const id = Number(e.currentTarget.dataset.id)
    const selectedIds = this.data.selectedIds.filter(x => Number(x) !== id)
    const currentDishes = this.data.currentDishes.map(d => ({
      ...d,
      isSelected: selectedIds.includes(d.id)
    }))
    this.setData({
      selectedIds: selectedIds,
      selectedTotal: selectedIds.length,
      selectedList: this.buildSelectedList(selectedIds),
      currentDishes: currentDishes
    }); this.renderTemplateSelection()
  },

  // 清空全部
  onClearSelected() {
    if (!this.ensureBrowseOwner() || this.data.menuBusy || this.data.menuPending) return
    if (require('../../utils/config').ENABLE_MEAL_WORKSPACE && !this.data.menuEditingId && !this.data.menuPending && !this.data.menuFormVisible) return this.setData({saveError:'本餐至少保留 1 道菜，请逐道移除或继续选菜。已保存的日历安排保留。'})
    const identity = this._browseIdentity, epoch = this._privateEpoch || 0
    wx.showModal({
      title: '清空已选',
      content: '确定清空所有已选菜品？',
      success: (res) => {
        if (res.confirm && this.isBrowseCurrent(identity, epoch)) {
          const currentDishes = this.data.currentDishes.map(d => ({
            ...d,
            isSelected: false
          }))
          this.setData({
            selectedIds: [],
            selectedTotal: 0,
            selectedList: [],
            currentDishes: currentDishes
          }); this.renderTemplateSelection()
        }
      }
    })
  },

  // 保存到日历
  async onSaveToCalendar() {
    if (!this.ensureBrowseOwner()) return
    if (this.data.savingPlan || !this.data.selectedIds.length) return
    if (require('../../utils/config').ENABLE_MEAL_WORKSPACE) {
      return require('../../utils/dish-workspace-handoff').openSelectedMeal(this,wx,true)
    }
    const pending = wx.getStorageSync(getUserStorageKey('pendingRecipeRecord'))
    if (pending) return this.doSave(pending.mealType, this.data.selectedIds, pending)
    const identity = this._browseIdentity, epoch = this._privateEpoch || 0, selectedIds = [...this.data.selectedIds]
    wx.showActionSheet({ itemList: ['今天早餐', '今天午餐', '今天晚餐'], success: r => { if (this.isBrowseCurrent(identity, epoch)) return this.doSave(['breakfast','lunch','dinner'][r.tapIndex], selectedIds) } })
  },
  async doSave(mealType, selectedIds, pending) {
    if (!this.ensureBrowseOwner()) return
    const identity = this._browseIdentity, epoch = this._privateEpoch || 0
    this.isPlanWriteCurrent = () => this.isBrowseCurrent(identity, epoch)
    if (this.data.savingPlan) return
    if (this._browseScope !== getUserStorageKey('customBrowse')) { this.onShow(); return }
    const flow = require('../../utils/meal-workflow'), scope = getUserStorageKey('mealView'), date = pending ? pending.date : flow.today()
    this.setData({ savingPlan: true, saveError: '' })
    try {
      const names = selectedIds.map(id => this.allDishesMap[id]).filter(Boolean).map(dish => dish.name)
      const saved = await require('../../utils/plan-save').savePlan(this, date, mealType, { recipeName: names.join('、'), dishIds: selectedIds, isManual: 1, targetPeople: pending && pending.targetPeople || 2 }, pending && pending.expectedRevision)
      if (!this.isBrowseCurrent(identity, epoch) || !saved || scope !== getUserStorageKey('mealView')) return
      wx.removeStorageSync(getUserStorageKey('pendingRecipeRecord'))
      this.setData({ selectedIds: [], selectedTotal: 0, selectedList: [], currentDishes: this.data.currentDishes.map(dish => ({ ...dish, isSelected: false })), showSelectedPanel: false })
      wx.showToast({ title: '已保存安排', icon: 'success' }); wx.navigateTo({ url: '/pages/calendar-detail/calendar-detail?date=' + date })
    } catch (error) { if (this.isBrowseCurrent(identity, epoch) && scope === getUserStorageKey('mealView')) this.setData({ saveError: flow.errorMessage(error, '保存失败，已选菜品仍保留，可重试。') }) }
    finally { if (this.isBrowseCurrent(identity, epoch) && scope === getUserStorageKey('mealView')) this.setData({ savingPlan: false }) }
  },

  onHideMealSelected(){this.setData({showMealSelected:false})},
  onRemoveMealDish(e){return require('../../utils/dish-workspace-handoff').changeSelectionPage(this,'remove',Number(e.currentTarget.dataset.id),this.selectionOptions())},
  onSelectedDish(e){if(this.ensureBrowseOwner())wx.navigateTo({url:'/pages/dish-detail/dish-detail?id='+Number(e.currentTarget.dataset.id)+'&people='+(this.data.selectedMeal?this.data.selectedMeal.people:2)})},
  onContinueSelecting(){this.setData({showMealSelected:false,showSelectedPanel:false})},
  selectionOptions() { return { api, wx, storageKey:getUserStorageKey, current:()=>this.ensureBrowseOwner(), errorKey:'saveError' } },
  refreshSelectedMeal() { return require('../../utils/dish-workspace-handoff').refreshSelectionPage(this,this.selectionOptions()) },
  onRetrySelection() { return require('../../utils/dish-workspace-handoff').changeSelectionPage(this,'recover',null,this.selectionOptions()) },
  onViewMeal() { if(this.ensureBrowseOwner())return require('../../utils/dish-workspace-handoff').openSelectedMeal(this,wx) },
  onBrowseScroll(e) { this.setData({browseScrollTop:Math.max(0,Number(e.detail.scrollTop)||0)}) },
  onBrowseReachEnd() { if (!this.data.showCustomForm) return this.onScrollToLower() },
  onRecipeSource(e) {
    if(!this.ensureBrowseOwner())return
    const source=e.currentTarget.dataset.source
    if(source==='menus')return this.onOpenMenus()
    if(!['all','mine'].includes(source)||source===this.data.recipeSource)return
    this.setData({recipeSource:source,browseScrollTop:0,currentDishes:[]});this.currentPage=1
    return this.loadPage(this.data.activeTab,1)
  },
  onAddRecipe() { return this.onTabChange({ currentTarget: { dataset: { tab: 'custom' } } }) },
  onManageRecipes() { if (this.ensureBrowseOwner()) wx.navigateTo({ url: '/pages/custom-dishes/custom-dishes' }) },
  onOpenMenuDetail(e) {
    if (!this.ensureBrowseOwner() || this.data.menuBusy || this.data.menuFormVisible || this.data.menuEditingId || this.data.menuPending) return
    const menu = this.data.menus.find(item => String(item.id) === String(e.currentTarget.dataset.id))
    if (menu) this.setData({ activeMenu: menu, showMenuTarget: false, menuError: '', menuMissingDishes: [] })
  },
  onBackToMenus() { if (this.ensureBrowseOwner() && !this.data.menuBusy) this.setData({ activeMenu: null, showMenuTarget: false, menuMissingDishes: [] }) },
  onToggleMenuTarget() { if (this.ensureBrowseOwner() && !this.data.menuBusy) this.setData({ showMenuTarget: !this.data.showMenuTarget }) },

  writeJournal() {
    if (!this._writeJournal) this._writeJournal = require('../../utils/personal-recipes').createWriteJournal()
    return this._writeJournal
  },
  async onOpenMenus() {
    if (!this.ensureBrowseOwner()) return
    const rules = require('../../utils/meal-workspace')
    const target = wx.getStorageSync(getUserStorageKey('pendingRecipeRecord')) || wx.getStorageSync(getUserStorageKey('activeMealTarget')) || rules.defaultTarget()
    this.setData({ showMenus: true, menuMissingDishes: [], showSelectedPanel: false, menuDate: target.date, menuMealIndex: Math.max(0,['breakfast','lunch','dinner'].indexOf(target.mealType)) })
    const pending = this.writeJournal().pending('menu:create')
    if (pending && !this.data.menuEditingId) this.setData({ menuFormVisible: true, menuPending: true, menuName: pending.name, menuPeople: pending.people, selectedIds: pending.dishIds, selectedTotal: pending.dishIds.length, selectionMode: true, currentDishes: this.data.currentDishes.map(d => ({ ...d, isSelected: pending.dishIds.includes(d.id) })) })
    this.syncCustomLeaveAlert()
    return this.loadMenus()
  },
  onResumeMenuForm() {
    if (!this.ensureBrowseOwner() || this.data.menuBusy) return
    if (this.data.menuFormVisible || this.data.menuEditingId || this.data.menuPending) return this.onOpenMenus()
    return this.onOpenMenuForm()
  },
  onOpenMenuForm() {
    if (!this.ensureBrowseOwner() || this.data.menuBusy) return
    if (this.data.menuPending || this.writeJournal().pending('menu:create')) return this.onOpenMenus()
    const identity = this._browseIdentity, epoch = this._privateEpoch || 0, snapshot = this.menuFormSnapshot()
    const start = () => {
      this.beginMenuForm(this.data.selectedIds, this.data.menuFormVisible || this.data.menuEditingId ? Number(this.data.menuPeople) : this.data.selectedMeal && this.data.selectedMeal.people || 2, this.data.menuFormVisible || this.data.menuEditingId ? this.data.menuReviewDishes : this.data.mealSelectedDishes || [])
      return this.onOpenMenus()
    }
    if (this.menuChanged()) {
      wx.showModal({ title: '改为新常用菜单？', content: '当前菜单输入未保存。可继续编辑，或放弃输入后用已选组合命名新菜单。原模板和日历保留。', confirmText: '放弃并新建', cancelText: '继续编辑', success: result => {
        if (result.confirm && this.isBrowseCurrent(identity, epoch) && snapshot === this.menuFormSnapshot() && !this.data.menuBusy && !this.data.menuPending) return start()
      } }); return
    }
    return start()
  },
  onCloseMenus() { if (!this.data.menuBusy) this.setData({ showMenus: false }) },
  onMenuInput(e) { if (this.ensureBrowseOwner() && !this.data.menuBusy && !this.data.menuPending) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); this.syncCustomLeaveAlert() } },
  onMenuDate(e) { if (!this.data.menuBusy) this.setData({ menuDate: e.detail.value }) },
  onMenuMeal(e) { if (!this.data.menuBusy) this.setData({ menuMealIndex: Number(e.detail.value) }) },
  async loadMenus() {
    if (!this.ensureBrowseOwner()) return
    const identity = this._browseIdentity, epoch = this._menuEpoch = (this._menuEpoch || 0) + 1
    this.setData({ menuLoading: true, menuError: '' })
    try {
      const menus = await api.getPersonalMenus()
      if (this.isBrowseCurrent(identity) && epoch === this._menuEpoch) { const list = Array.isArray(menus) ? menus : []; this.setData({ menus: list, activeMenu: this.data.activeMenu ? list.find(row => String(row.id) === String(this.data.activeMenu.id)) || null : null }) }
    } catch (error) { if (this.isBrowseCurrent(identity) && epoch === this._menuEpoch) this.setData({ menuError: require('../../utils/meal-workflow').errorMessage(error, '菜单读取失败，请重试') }) }
    finally { if (this.isBrowseCurrent(identity) && epoch === this._menuEpoch) this.setData({ menuLoading: false }) }
  },
  async onSaveMenu() {
    if (!this.ensureBrowseOwner() || this.data.menuBusy) return
    const id = this.data.menuEditingId, action = id ? 'menu:edit:' + id : 'menu:create', pending = this.writeJournal().pending(action)
    const ids = this.data.selectedIds.map(Number), people = Number(this.data.menuPeople)
    if (!pending && (!String(this.data.menuName).trim() || !Number.isInteger(people) || people < 1 || people > 50 || !ids.length || ids.length > 10)) return this.setData({ menuError: '请填写菜单名称、1–50 人，并选择 1–10 道菜' })
    if (!pending && ids.some(id => this.allDishesMap[id] && this.allDishesMap[id].unavailable)) return this.setData({ menuError: '部分菜品不可用，请移除或替换后再保存常用菜单。' })
    const dishVersions = {}; ids.forEach(dishId => { const dish = this.allDishesMap[dishId]; if (dish && dish.contentVersion) dishVersions[dishId] = dish.contentVersion })
    const identity = this._browseIdentity, epoch = this._privateEpoch || 0
    this.setData({ menuBusy: true, menuSaving: true, menuError: '' }); this.syncCustomLeaveAlert()
    try {
      await this.writeJournal().run(action, { name: String(this.data.menuName).trim(), people, dishIds: ids, dishVersions, expectedVersion: id ? this._menuVersion : 0 }, body => id ? api.updatePersonalMenu(id, body) : api.createPersonalMenu(body))
      if (!this.isBrowseCurrent(identity, epoch)) return
      this.setData({ showMenus: true, personalSaveMessage: '已保存到常用菜单，可在这里用作本餐菜单。尚未写入日历。', menuFormVisible:false, menuName: '', menuPeople: 2, menuEditingId: null, menuPending: false }); this._menuVersion = null
      if(this._recipeSelection)require('../../utils/dish-workspace-handoff').renderSelectionPage(this)
      wx.showToast({ title: '常用菜单已保存', icon: 'success' }); await this.loadMenus()
    } catch (error) { if (this.isBrowseCurrent(identity, epoch)) this.setData({ menuError: require('../../utils/meal-workflow').errorMessage(error, '保存结果未确认，重试会使用原内容') }) }
    finally { if (this.isBrowseCurrent(identity, epoch)) { this.setData({ menuBusy: false, menuSaving: false, menuPending: !!this.writeJournal().pending(action) }); this.syncCustomLeaveAlert() } }
  },
  async onEditMenu(e, approved = false) {
    if (!this.ensureBrowseOwner() || this.data.menuBusy) return
    const id = Number(e.currentTarget.dataset.id), identity = this._browseIdentity, epoch = this._privateEpoch || 0
    const sameTemplate = String(this.data.menuEditingId) === String(id)
    if (!approved && (this.data.menuPending || this.menuChanged())) {
      if (this.data.menuPending) return this.setData({ menuError: '上次保存结果待确认，请先重试原保存，当前编辑仍保留。' })
      const snapshot = this.menuFormSnapshot()
      wx.showModal({ title: sameTemplate ? '重新读取这份菜单？' : '改为编辑另一个菜单？', content: sameTemplate ? '当前修改尚未保存。可保留输入继续编辑，或放弃输入并读取云端最新版本与菜品快照。重新读取不会自动保存。' : '当前常用菜单的修改未保存。可保留编辑，或放弃修改后打开另一个模板。', confirmText: sameTemplate ? '重新读取' : '放弃并打开', cancelText: '保留编辑', success: result => {
        if (result.confirm && this.isBrowseCurrent(identity, epoch) && snapshot === this.menuFormSnapshot() && !this.data.menuBusy && !this.data.menuPending) return this.onEditMenu(e, true)
      } }); return
    }
    this.setData({ menuBusy: true, menuError: '' })
    try {
      const pending = this.writeJournal().pending('menu:edit:' + id)
      const menu = pending ? { id, version: pending.expectedVersion, ...pending, dishes: pending.dishIds.map(dishId => this.allDishesMap[dishId] || { id: dishId, name: '菜品 ' + dishId }) } : await api.getPersonalMenu(id)
      if (!this.isBrowseCurrent(identity, epoch)) return
      const ids = (pending ? pending.dishIds : menu.dishIds).map(Number)
      const snapshots = menu.dishes || []
      const refreshed = pending ? snapshots : await Promise.all(ids.map(async dishId => {
        const snapshot = snapshots.find(d => Number(d.id) === dishId) || { id: dishId, name: '菜品 ' + dishId }
        try {
          const current = await api.getDishById(dishId)
          return { ...current, changed: current.contentVersion !== snapshot.contentVersion }
        } catch (error) {
          if ([403,404].includes(error.statusCode)) return { ...snapshot, unavailable: true }
          throw error
        }
      }))
      if (!this.isBrowseCurrent(identity, epoch)) return
      this.addToGlobalCache(refreshed)
      const recipeText = require('../../utils/personal-recipes').editableRecipeText
      const menuReviewDishes = refreshed.map(d => ({ ...d, reviewIngredients: (require('../../utils/recipe-quality').presentRecipeQuality(d) || {}).ingredientLines || recipeText(d.ingredientsAmounts || d.cl), reviewSteps: recipeText(d.steps || d.step) }))
      const unavailable = refreshed.some(d => d.unavailable), changed = refreshed.some(d => d.changed)
      const menuReviewNotice = pending ? '上次保存结果未确认，重试会使用原内容。' : unavailable ? '部分菜品已不可用，仍保留在已选中。请移除或替换后再保存。' : changed ? '菜单菜谱内容有变化，以下为最新内容。请核对后点保存菜单，确认更新快照。' : '已读取当前菜谱。保存菜单后才会更新组合和快照。'
      this._menuVersion = pending ? pending.expectedVersion : menu.version
      this.setData({ menuFormVisible: true, activeMenu: null, showMenuTarget: false, menuEditingId: id, menuName: pending ? pending.name : menu.name, menuPeople: pending ? pending.people : menu.people, menuPending: !!pending, menuReviewDishes, menuReviewNotice, selectedIds: ids, selectedTotal: ids.length, selectedList: this.buildSelectedList(ids), selectionMode: true, currentDishes: this.data.currentDishes.map(d => ({ ...d, isSelected: ids.includes(d.id) })) })
      this._menuInitial = this.menuFormSnapshot(); this.syncCustomLeaveAlert()
    } catch (error) { if (this.isBrowseCurrent(identity, epoch)) this.setData({ menuError: require('../../utils/meal-workflow').errorMessage(error, '菜单读取失败') }) }
    finally { if (this.isBrowseCurrent(identity, epoch)) { this.setData({ menuBusy: false }); this.syncCustomLeaveAlert() } }
  },
  renderTemplateSelection() {
    if (!this.data.menuFormVisible && !this.data.menuEditingId && !this.data.menuPending) return
    const recipeText = require('../../utils/personal-recipes').editableRecipeText
    const dishes = this.data.selectedIds.map(id => this.allDishesMap[id] || { id, name: '菜品 ' + id })
    this.setData({ menuReviewDishes: dishes.map(d => ({ ...d, reviewIngredients: (require('../../utils/recipe-quality').presentRecipeQuality(d) || {}).ingredientLines || recipeText(d.ingredientsAmounts || d.cl), reviewSteps: recipeText(d.steps || d.step) })),
      menuReviewNotice: dishes.some(d => d.unavailable) ? '部分菜品不可用，请从已选组合移除或替换后再保存。' : '已选组合已调整，保存常用菜单后才会更新模板；历史餐食保留。' })
    this.syncCustomLeaveAlert()
  },
  menuFormSnapshot() { return JSON.stringify({ name: this.data.menuName, people: Number(this.data.menuPeople), ids: this.data.selectedIds }) },
  menuChanged() { return !!this._menuInitial && (this.data.menuFormVisible || this.data.menuEditingId) && this.menuFormSnapshot() !== this._menuInitial },
  onExitMenuEdit(next) {
    if(!this.ensureBrowseOwner() || this.data.menuBusy)return
    if (this.data.menuPending) return this.setData({ menuError: '上次保存结果待确认，请先重试原保存，当前编辑仍保留。' })
    const close = () => { this._menuVersion=null; this._menuInitial=null; this.setData({menuFormVisible:false,menuEditingId:null,menuName:'',menuReviewDishes:[],menuReviewNotice:''}); if(this._recipeSelection)require('../../utils/dish-workspace-handoff').renderSelectionPage(this); this.syncCustomLeaveAlert(); if (typeof next === 'function') next() }
    if (!this._menuInitial || this.menuFormSnapshot() === this._menuInitial) return close()
    const identity=this._browseIdentity, epoch=this._privateEpoch || 0, snapshot=this.menuFormSnapshot()
    wx.showModal({ title: '保留常用菜单修改？', content: '修改尚未保存，原常用菜单和历史餐食保留。', confirmText: '放弃修改', cancelText: '保留编辑', success: result => { if(result.confirm && this.isBrowseCurrent(identity,epoch) && snapshot === this.menuFormSnapshot() && !this.data.menuBusy && !this.data.menuPending)close() } })
  },
  beginMenuForm(ids, people, sourceDishes = []) {
    this._menuVersion = null
    const selectedIds = [...ids], dishes = selectedIds.map(id => sourceDishes.find(d => Number(d.id) === Number(id)) || this.allDishesMap[id] || { id, name: '菜品 ' + id })
    this.addToGlobalCache(dishes)
    this.setData({ menuFormVisible:true,activeMenu:null,showMenuTarget:false,menuEditingId: null, menuName: '', menuPeople: people, selectedIds, selectedTotal: selectedIds.length, selectedList: dishes, menuReviewDishes: dishes, menuReviewNotice: '这些已选菜品仅保存为可复用模板，不写入日历。', currentDishes: this.data.currentDishes.map(d => ({ ...d, isSelected: selectedIds.includes(Number(d.id)) })) })
    this._menuInitial = this.menuFormSnapshot(); this.syncCustomLeaveAlert()
  },
  onNewMenu() {
    if (!this.ensureBrowseOwner() || this.data.menuBusy) return
    // Reopening the naming entry resumes its independent form instead of clearing it.
    if (this.data.menuFormVisible || this.data.menuEditingId || this.data.menuPending) return
    this.beginMenuForm(this.data.selectedIds, this.data.selectedMeal && this.data.selectedMeal.people || 2, this.data.mealSelectedDishes || [])
  },
  onOpenMenuFromCurrentMeal() {
    if (!this.ensureBrowseOwner() || this._menuNamingDialog) return
    const intentKey = getUserStorageKey('openPersonalMenuForm'), view = this.data.selectedMeal
    if (!wx.getStorageSync(intentKey)) return
    if (this.data.menuPending || this.data.menuBusy || this.writeJournal().pending('menu:create')) {
      this.setData({ showMenus: true, menuError: '上次菜单保存结果待确认，请先恢复原保存，当前编辑仍保留。' }); return
    }
    if (!view || !view.count || this.data.selectionBlocked || this.data.selectionLoading) {
      this.setData({ menuError: '本餐草稿尚未读到或结果待确认，请核对本餐后再命名。' }); return
    }
    const identity = this._browseIdentity, epoch = this._privateEpoch || 0, source = JSON.stringify({ target: view.target, ids: view.dishIds, people: view.people })
    const target = JSON.stringify(wx.getStorageSync(getUserStorageKey('activeMealTarget')) || null), snapshot = this.menuFormSnapshot()
    const current = () => this.isBrowseCurrent(identity, epoch) && this._visible !== false && !this.data.selectionBlocked && !this.data.selectionLoading && target === JSON.stringify(wx.getStorageSync(getUserStorageKey('activeMealTarget')) || null) && source === JSON.stringify({ target: this.data.selectedMeal && this.data.selectedMeal.target, ids: this.data.selectedMeal && this.data.selectedMeal.dishIds, people: this.data.selectedMeal && this.data.selectedMeal.people })
    const open = () => {
      if (!current() || this.data.menuBusy || this.data.menuPending) return
      wx.removeStorageSync(intentKey)
      this.beginMenuForm(view.dishIds, view.people, this.data.mealSelectedDishes || [])
      return this.onOpenMenus()
    }
    if (this.menuChanged()) {
      const binding = this._menuNamingDialog = { identity, epoch, snapshot }
      wx.showModal({ title: '改为保存本餐常用菜单？', content: '当前模板的修改未保存。放弃后将命名本餐已选的 ' + view.count + ' 道菜、' + view.people + ' 人；原模板和日历保留。', confirmText: '放弃并命名本餐', cancelText: '保留当前编辑', success: result => {
        if (this._menuNamingDialog !== binding) return
        this._menuNamingDialog = null
        if (!current() || snapshot !== this.menuFormSnapshot() || this.data.menuBusy || this.data.menuPending) return
        if (result.confirm) return open()
        wx.removeStorageSync(intentKey); this.setData({ showMenus: true }); this.syncCustomLeaveAlert()
      }, fail: () => { if (this._menuNamingDialog === binding) this._menuNamingDialog = null } }); return
    }
    return open()
  },
  onSaveMenuAsNew() {
    if (!this.ensureBrowseOwner() || this.data.menuBusy || this.data.menuPending) return
    this._menuVersion = null
    this.setData({ menuFormVisible: true, menuEditingId: null, menuName: this.data.menuName + '（副本）', menuReviewNotice: '另存为新常用菜单，原模板和历史餐食保留。' })
    this._menuInitial = JSON.stringify({ name: '', people: Number(this.data.menuPeople), ids: this.data.selectedIds }); this.syncCustomLeaveAlert()
  },
  async onApplyMenu(e) {
    if (!this.ensureBrowseOwner() || this.data.menuBusy) return
    const menu = this.data.menus.find(item => String(item.id) === String(e.currentTarget.dataset.id))
    if (!menu) return
    const identity = this._browseIdentity, epoch = this._privateEpoch || 0
    const applyEpoch = this._menuApplyEpoch = (this._menuApplyEpoch || 0) + 1
    const date = this.data.menuDate, mealType = ['breakfast','lunch','dinner'][this.data.menuMealIndex]
    const activeTarget = JSON.stringify(wx.getStorageSync(getUserStorageKey('activeMealTarget')) || null)
    const current = () => this.isBrowseCurrent(identity, epoch) && this._visible !== false && applyEpoch === this._menuApplyEpoch && date === this.data.menuDate && mealType === ['breakfast','lunch','dinner'][this.data.menuMealIndex] && activeTarget === JSON.stringify(wx.getStorageSync(getUserStorageKey('activeMealTarget')) || null)
    this._menuApplying = true
    this.setData({ menuBusy: true, menuError: '', menuMissingDishes: [] })
    try {
      const currentSession = this._recipeSelection && this._recipeSelection.view()
      if (currentSession && (currentSession.state.pending || currentSession.state.dirty || currentSession.state.syncStatus !== 'synced')) throw new Error('本餐有未同步或结果待确认的草稿，请先查看本餐核对。')
      const template = api.getPersonalMenu ? await api.getPersonalMenu(menu.id) : menu
      if (!current()) return
      const ids = (template.dishIds || []).map(Number), snapshots = template.dishes || []
      if (template.version !== menu.version) throw new Error('常用菜单已更新，请重新读取后使用')
      const missing = []
      if (api.getDishById) await Promise.all(ids.map(async id => {
        try { const value = await api.getDishById(id); if (!value || Number(value.id) !== id) throw { statusCode: 404 } }
        catch (error) { if (![403,404].includes(error.statusCode)) throw error; missing.push(snapshots.find(d => Number(d.id) === id) || { id, name: '菜品 ' + id }) }
      }))
      if (!current()) return
      if (missing.length) { this.setData({ menuMissingDishes: missing }); throw new Error('以下菜品已删除或不可用：' + missing.map(d => d.name).join('、') + '。请编辑修复菜单后再使用。') }
      const resolved = await api.resolvePersonalMenu(menu.id, { expectedVersion: menu.version, date, mealType })
      if (!current()) return
      const handoff = require('../../utils/personal-recipes').menuHandoff(resolved)
      if (handoff.date !== date || handoff.mealType !== mealType || handoff.menuId !== Number(menu.id) || handoff.menuVersion !== menu.version) throw new Error('菜单回执与目标不一致，请重新读取')
      if (ids.length && JSON.stringify(ids) !== JSON.stringify(handoff.dishIds)) throw new Error('菜单菜品不完整，原菜单仍保留，请编辑修复后再使用。')
      if (require('../../utils/config').ENABLE_MEAL_WORKSPACE) {
        const state = await api.getMealWorkspace(date, mealType)
        if (!current()) return
        const selected = require('../../utils/selected-meal').deriveSelectedMeal({ ...state, context: { date, mealType, people: state.workspace && state.workspace.context.people || 2 } }, { date, mealType })
        const session = this._recipeSelection && this._recipeSelection.view()
        if (session && session.selectedMeal.target.date === date && session.selectedMeal.target.mealType === mealType && (session.state.pending || session.state.dirty || session.state.syncStatus !== 'synced')) throw new Error('本餐有未同步或结果待确认的草稿，请先查看本餐核对。')
        const w = state.workspace
        if (w && w.status === 'generating') throw new Error('本餐正在更新，请等待后再使用菜单。')
        handoff.expectedWorkspaceId = w ? w.id : null; handoff.expectedWorkspaceRevision = w ? w.revision : null
        if (selected.count) {
          const oldNames = (w.draft.dishes || []).map(d => d.name || '菜品 ' + d.id).join('、'), newNames = snapshots.length ? snapshots.map(d => d.name).join('、') : template.name
          const approved = await new Promise(resolve => wx.showModal({ title: '替换本餐草稿？', content: `${date} ${require('../../utils/meal-workflow').mealNames[mealType]}。原草稿：${oldNames} · ${selected.people} 人。新菜单：${newNames} · ${handoff.people} 人。只替换草稿，已保存的日历和历史记录保留。`, confirmText: '替换草稿', cancelText: '保留原草稿', success: result => resolve(!!result.confirm), fail: () => resolve(false) }))
          if (!current() || !approved) return
        }
      }
      wx.setStorageSync(getUserStorageKey('workspaceSelectedDishes'), handoff)
      wx.setStorageSync(getUserStorageKey('activeMealTarget'), { date: handoff.date, mealType: handoff.mealType })
      this.setData({ personalSaveMessage: '常用菜单将用作本餐草稿，保存到日历还需单独确认。' })
      wx.navigateTo({ url: '/pages/result/result?date=' + handoff.date + '&mealType=' + handoff.mealType })
    } catch (error) { if (current()) this.setData({ menuError: require('../../utils/meal-workflow').errorMessage(error, error.message || '菜单未应用，原安排保留，请重试') }) }
    finally { if (this.isBrowseCurrent(identity, epoch) && applyEpoch === this._menuApplyEpoch && this._visible !== false) { this._menuApplying = false; this.setData({ menuBusy: false }) } }
  },
  onDeleteMenu(e) {
    if (!this.ensureBrowseOwner() || this.data.menuBusy) return
    const menu = this.data.menus.find(item => String(item.id) === String(e.currentTarget.dataset.id))
    if (!menu) return
    const identity = this._browseIdentity, epoch = this._privateEpoch || 0
    wx.showModal({ title: '删除这个菜单？', content: '菜单会删除，已经确认的餐食安排和用餐历史会保留。', confirmText: '删除', success: async result => {
      if (!result.confirm || !this.isBrowseCurrent(identity, epoch) || this.data.menuBusy) return
      this.setData({ menuBusy: true, menuError: '' })
      try {
        await this.writeJournal().run('menu:delete:' + menu.id, { expectedVersion: menu.version }, body => api.deletePersonalMenu(menu.id, body))
        if (this.isBrowseCurrent(identity, epoch)) { if (String(this.data.menuEditingId) === String(menu.id)) this.setData({ menuEditingId: null, menuName: '' }); await this.loadMenus() }
      } catch (error) { if (this.isBrowseCurrent(identity, epoch)) this.setData({ menuError: require('../../utils/meal-workflow').errorMessage(error, '删除结果未确认，请重试原操作') }) }
      finally { if (this.isBrowseCurrent(identity, epoch)) this.setData({ menuBusy: false }) }
    } })
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
    const finish = () => {
      if (this.data.showCustomForm) return this.onCancelCustom(() => wx.navigateBack(), true)
      wx.navigateBack()
    }
    if (this.data.menuFormVisible || this.data.menuEditingId || this.data.menuPending) return this.onExitMenuEdit(finish)
    return finish()
  },

  onQuickSearch(e) {
    const kw = e.currentTarget.dataset.kw
    this.setData({ searchKeyword: kw })
    this.loadPage(this.data.activeTab, 1)
  }
})
