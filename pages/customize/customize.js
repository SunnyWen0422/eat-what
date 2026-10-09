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
  return { name: '', type: 'meat', ingredients: '', steps: '', cuisineCode: '', cuisineLabel: '未设置', tagCodes: [], cookMinutes: '' }
}

Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(),
    activeTab: 'meat',selectionMode:false,selectionTargetLabel:'',
    showMenus: false, menus: [], menuLoading: false, menuBusy: false, menuError: '', menuName: '', menuPeople: 2, menuEditingId: null, menuDate: '', menuMealIndex: 2, menuMealLabels: ['早餐','午餐','晚餐'], customPending: false, menuPending: false, menuReviewDishes: [], menuReviewNotice: '',
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
    this._openMenusRequested=options.menus==='1' || wx.getStorageSync(getUserStorageKey('openPersonalMenus'))
    wx.removeStorageSync(getUserStorageKey('openPersonalMenus'))
    this.ensureBrowseOwner()
    this.loadPage('meat', 1)
    this.loadCustomMetadata()
  },

  onShow() {
    this._visible = true
    if (this._menuApplyWasHidden) { this._menuApplyWasHidden = false; this.setData({ menuBusy: false }) }
    const scope = getUserStorageKey('customBrowse')
    if (!this.ensureBrowseOwner()) this.loadPage('meat', 1)
    this._browseScope = scope
    if(this._openMenusRequested){this._openMenusRequested=false;this.onOpenMenus()}
    const pendingCustom = this.writeJournal().pending('dish:create')
    if (pendingCustom) this.setData({ customPending: true, customForm: { ...emptyCustomForm(), name: pendingCustom.name, type: pendingCustom.type, ingredients: String(pendingCustom.cl || '').replace(/#/g,'\n'), steps: String(pendingCustom.step || '').replace(/#/g,'\n'), cuisineCode: pendingCustom.cuisineCode || '', tagCodes: String(pendingCustom.tagCodes || '').split(',').filter(Boolean), cookMinutes: pendingCustom.cookMinutes || '' } })
    this._planOwnerScope = getUserStorageKey('mealView')
    const rules=require('../../utils/meal-workspace'),pending=wx.getStorageSync(getUserStorageKey('pendingRecipeRecord')),intent=wx.getStorageSync(getUserStorageKey('recipeSelectionIntent'))
    const target=pending || wx.getStorageSync(getUserStorageKey('activeMealTarget')) || rules.defaultTarget()
    this.setData({selectionMode:this.data.selectionMode || !!pending || !!intent,selectionTargetLabel:`${target.date} ${require('../../utils/meal-workflow').mealNames[target.mealType] || '当前餐'}`})
    if(intent)wx.removeStorageSync(getUserStorageKey('recipeSelectionIntent'))
    if (wx.getStorageSync(getUserStorageKey('openCustomDishForm'))) { wx.removeStorageSync(getUserStorageKey('openCustomDishForm')); this.setData({ showCustomForm: true, activeTab: 'custom' }) }
  },
  onHide() { this._visible = false; this._menuApplyEpoch = (this._menuApplyEpoch || 0) + 1; if (this._menuApplying) { this._menuApplyWasHidden = true; this._menuApplying = false } },
  onUnload() { this._unloaded = true; clearTimeout(this.searchTimer); this._pageEpoch = (this._pageEpoch || 0) + 1; this._privateEpoch = (this._privateEpoch || 0) + 1; this._pendingPlanWrite = null },
  onToggleSelectionMode(){if(this.ensureBrowseOwner())this.setData({selectionMode:!this.data.selectionMode})},
  ensureBrowseOwner() {
    if (this._unloaded) return false
    const identity = currentIdentity()
    if (this._browseIdentity === undefined) { this._browseIdentity = identity; this._browseScope = getUserStorageKey('customBrowse'); return true }
    if (this._browseIdentity === identity) return true
    this._browseIdentity = identity; this._browseScope = getUserStorageKey('customBrowse')
    this._pageEpoch = (this._pageEpoch || 0) + 1; this._privateEpoch = (this._privateEpoch || 0) + 1
    clearTimeout(this.searchTimer)
    this.allDishesMap = {}; this.currentPage = 1; this._pendingPlanWrite = null
    this._planOwnerScope = getUserStorageKey('mealView')
    this.setData({ activeTab: 'meat', selectionMode:false, selectedIds: [], selectedTotal: 0, selectedList: [], currentDishes: [], showCustomForm: false, showSelectedPanel: false,
      customForm: emptyCustomForm(), customTagOptions: this.data.customTagOptions.map(item => ({ ...item, selected: false })),
      customError: '', saveError: '', browseError: '', savingCustom: false, savingPlan: false, loading: false, loadingMore: false,
      showMenus: false, menus: [], menuLoading: false, menuBusy: false, menuError: '', menuName: '', menuPeople: 2, menuEditingId: null, customPending: false, menuPending: false, menuReviewDishes: [], menuReviewNotice: '',
      searchKeyword: '', hasMore: true, browseCriteria: emptyBrowseCriteria(), showBrowseFilters: false })
    this.renderBrowseFilters()
    return false
  },
  isBrowseCurrent(identity, epoch = this._privateEpoch || 0) {
    return this.ensureBrowseOwner() && identity === this._browseIdentity && epoch === (this._privateEpoch || 0)
  },
  onRetryPage() { this.loadPage(this.data.activeTab, 1) },
  onCancelCustom() { if (this.ensureBrowseOwner() && !this.data.savingCustom) this.setData({ showCustomForm: false, activeTab: 'meat', customError: '' }) },

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
      const result = await api.getDishes({
        type: type,
        keyword: searchKeyword || undefined,
        page: page,
        pageSize: this.pageSize,
        ...this.data.browseCriteria,
      })
      if (!this.isBrowseCurrent(identity) || epoch !== this._pageEpoch || scope !== getUserStorageKey('customBrowse')) return
      const list = result.list || []
      const total = result.total || 0

      const simplified = list.map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        contentVersion: d.contentVersion,
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
    this.setData({ activeTab: tab, showCustomForm: false, searchKeyword: '' })
    this.currentPage = 1
    this.loadPage(tab, 1)
  },

  onCustomTypeChange(e) {
    if (!this.ensureBrowseOwner() || this.data.savingCustom || this.data.customPending) return
    this.setData({ 'customForm.type': e.currentTarget.dataset.type })
  },

  onCustomCuisineChange(e) {
    if (!this.ensureBrowseOwner() || this.data.savingCustom || this.data.customPending) return
    const selected = this.data.cuisineOptions[Number(e.detail.value)]
    if (!selected) return
    this.setData({ 'customForm.cuisineCode': selected.code, 'customForm.cuisineLabel': selected.label })
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
    })
  },

  onCustomInput(e) {
    if (!this.ensureBrowseOwner() || this.data.savingCustom || this.data.customPending) return
    const field = e.currentTarget.dataset.field
    this.setData({ [`customForm.${field}`]: e.detail.value })
  },

  async onSaveCustomDish() {
    if (!this.ensureBrowseOwner()) return
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
    if (this.data.savingCustom) return
    const identity = this._browseIdentity, epoch = this._privateEpoch || 0
    this.setData({ savingCustom: true, customError: '' })
    try {
      await this.writeJournal().run('dish:create', { name: name.trim(), type, cl: ingredients.trim().replace(/\n/g, '#'), step: steps.trim().replace(/\n/g, '#'), cuisineCode: cuisineCode || null, tagCodes: tagCodes.join(','), cookMinutes: Number(cookMinutes) > 0 ? Number(cookMinutes) : null }, body => api.createCustomDish(body))
      if (!this.isBrowseCurrent(identity, epoch)) return
      wx.showToast({ title: '菜品已保存', icon: 'success' }); this.setData({ 'customForm.name': '', 'customForm.ingredients': '', 'customForm.steps': '' })
    } catch (error) { if (this.isBrowseCurrent(identity, epoch)) this.setData({ customError: require('../../utils/meal-workflow').errorMessage(error, '保存失败，输入仍保留，请重试。') }) }
    finally { if (this.isBrowseCurrent(identity, epoch)) this.setData({ savingCustom: false, customPending: !!this.writeJournal().pending('dish:create') }) }
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
  onTapDish(e) {
    if (!this.ensureBrowseOwner()) return
    const dish = e.currentTarget.dataset.dish
    if (!dish || !dish.id) return
    wx.navigateTo({
      url: `/pages/dish-detail/dish-detail?id=${dish.id}`
    })
  },

  // 勾选/取消
  onToggleSelect(e) {
    if (!this.ensureBrowseOwner()) return
    const dish = e.currentTarget.dataset.dish
    if (!dish || !dish.id) return
    const selectedIds = [...this.data.selectedIds]
    const idx = selectedIds.indexOf(dish.id)
    if (idx >= 0) {
      selectedIds.splice(idx, 1)
    } else {
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
    })
  },

  // 显示已选面板
  onShowSelected() {
    if (!this.ensureBrowseOwner()) return
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
    beginShoppingSelection({ dishIds: selectedIds, targetPeople: 2, source: 'customize', dishes })
    wx.navigateTo({ url: '/pages/shopping-preview/shopping-preview' })
  },

  // 隐藏已选面板
  onHideSelected() {
    if (!this.ensureBrowseOwner()) return
    this.setData({ showSelectedPanel: false })
  },

  // 从面板中删除一道菜
  onRemoveSelected(e) {
    if (!this.ensureBrowseOwner()) return
    const id = e.currentTarget.dataset.id
    const selectedIds = this.data.selectedIds.filter(x => x !== id)
    const currentDishes = this.data.currentDishes.map(d => ({
      ...d,
      isSelected: selectedIds.includes(d.id)
    }))
    this.setData({
      selectedIds: selectedIds,
      selectedTotal: selectedIds.length,
      selectedList: this.buildSelectedList(selectedIds),
      currentDishes: currentDishes
    })
  },

  // 清空全部
  onClearSelected() {
    if (!this.ensureBrowseOwner()) return
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
          })
        }
      }
    })
  },

  // 保存到日历
  async onSaveToCalendar() {
    if (!this.ensureBrowseOwner()) return
    if (this.data.savingPlan || !this.data.selectedIds.length) return
    if (require('../../utils/config').ENABLE_MEAL_WORKSPACE) {
      if (this._browseScope !== getUserStorageKey('customBrowse')) { this.onShow(); return }
      const rules=require('../../utils/meal-workspace'), pending=wx.getStorageSync(getUserStorageKey('pendingRecipeRecord'))
      const target=pending?{date:pending.date,mealType:pending.mealType}:wx.getStorageSync(getUserStorageKey('activeMealTarget'))||rules.defaultTarget()
      if(this.data.selectedIds.length>10)return this.setData({saveError:'一餐最多选择 10 道菜'})
      wx.setStorageSync(getUserStorageKey('activeMealTarget'),target)
      wx.setStorageSync(getUserStorageKey('workspaceSelectedDishes'),{...target,dishIds:this.data.selectedIds.map(Number)})
      wx.navigateTo({url:`/pages/result/result?date=${target.date}&mealType=${target.mealType}`});return
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

  writeJournal() {
    if (!this._writeJournal) this._writeJournal = require('../../utils/personal-recipes').createWriteJournal()
    return this._writeJournal
  },
  async onOpenMenus() {
    if (!this.ensureBrowseOwner()) return
    const rules = require('../../utils/meal-workspace')
    const target = wx.getStorageSync(getUserStorageKey('pendingRecipeRecord')) || wx.getStorageSync(getUserStorageKey('activeMealTarget')) || rules.defaultTarget()
    this.setData({ showMenus: true, showSelectedPanel: false, menuDate: target.date, menuMealIndex: Math.max(0,['breakfast','lunch','dinner'].indexOf(target.mealType)) })
    const pending = this.writeJournal().pending('menu:new')
    if (pending && !this.data.menuEditingId) this.setData({ menuPending: true, menuName: pending.name, menuPeople: pending.people, selectedIds: pending.dishIds, selectedTotal: pending.dishIds.length, selectionMode: true, currentDishes: this.data.currentDishes.map(d => ({ ...d, isSelected: pending.dishIds.includes(d.id) })) })
    return this.loadMenus()
  },
  onOpenMenuForm(){if(!this.data.menuBusy)this.setData({menuFormVisible:true})},
  onCloseMenus() { if (!this.data.menuBusy) this.setData({ showMenus: false }) },
  onMenuInput(e) { if (this.ensureBrowseOwner() && !this.data.menuBusy && !this.data.menuPending) this.setData({ [e.currentTarget.dataset.field]: e.detail.value }) },
  onMenuDate(e) { if (!this.data.menuBusy) this.setData({ menuDate: e.detail.value }) },
  onMenuMeal(e) { if (!this.data.menuBusy) this.setData({ menuMealIndex: Number(e.detail.value) }) },
  async loadMenus() {
    if (!this.ensureBrowseOwner()) return
    const identity = this._browseIdentity, epoch = this._menuEpoch = (this._menuEpoch || 0) + 1
    this.setData({ menuLoading: true, menuError: '' })
    try {
      const menus = await api.getPersonalMenus()
      if (this.isBrowseCurrent(identity) && epoch === this._menuEpoch) this.setData({ menus: Array.isArray(menus) ? menus : [] })
    } catch (error) { if (this.isBrowseCurrent(identity) && epoch === this._menuEpoch) this.setData({ menuError: require('../../utils/meal-workflow').errorMessage(error, '菜单读取失败，请重试') }) }
    finally { if (this.isBrowseCurrent(identity) && epoch === this._menuEpoch) this.setData({ menuLoading: false }) }
  },
  async onSaveMenu() {
    if (!this.ensureBrowseOwner() || this.data.menuBusy) return
    const id = this.data.menuEditingId, action = 'menu:' + (id || 'new'), pending = this.writeJournal().pending(action)
    const ids = this.data.selectedIds.map(Number), people = Number(this.data.menuPeople)
    if (!pending && (!String(this.data.menuName).trim() || !Number.isInteger(people) || people < 1 || people > 50 || !ids.length || ids.length > 10)) return this.setData({ menuError: '请填写菜单名称、1–50 人，并选择 1–10 道菜' })
    const dishVersions = {}; ids.forEach(dishId => { const dish = this.allDishesMap[dishId]; if (dish && dish.contentVersion) dishVersions[dishId] = dish.contentVersion })
    const identity = this._browseIdentity, epoch = this._privateEpoch || 0
    this.setData({ menuBusy: true, menuError: '' })
    try {
      await this.writeJournal().run(action, { name: String(this.data.menuName).trim(), people, dishIds: ids, dishVersions, expectedVersion: id ? this._menuVersion : 0 }, body => id ? api.updatePersonalMenu(id, body) : api.createPersonalMenu(body))
      if (!this.isBrowseCurrent(identity, epoch)) return
      this.setData({ menuName: '', menuPeople: 2, menuEditingId: null, menuPending: false }); this._menuVersion = null
      wx.showToast({ title: '菜单已保存', icon: 'success' }); await this.loadMenus()
    } catch (error) { if (this.isBrowseCurrent(identity, epoch)) this.setData({ menuError: require('../../utils/meal-workflow').errorMessage(error, '保存结果未确认，重试会使用原内容') }) }
    finally { if (this.isBrowseCurrent(identity, epoch)) this.setData({ menuBusy: false, menuPending: !!this.writeJournal().pending(action) }) }
  },
  async onEditMenu(e) {
    if (!this.ensureBrowseOwner() || this.data.menuBusy) return
    const id = Number(e.currentTarget.dataset.id), identity = this._browseIdentity, epoch = this._privateEpoch || 0
    this.setData({ menuBusy: true, menuError: '' })
    try {
      const menu = await api.getPersonalMenu(id)
      if (!this.isBrowseCurrent(identity, epoch)) return
      const pending = this.writeJournal().pending('menu:' + id), ids = (pending ? pending.dishIds : menu.dishIds).map(Number)
      const snapshots = menu.dishes || []
      const refreshed = pending ? snapshots : await Promise.all(ids.map(async dishId => {
        const snapshot = snapshots.find(d => Number(d.id) === dishId) || { id: dishId, name: '菜品 ' + dishId }
        try {
          const current = await api.getDishById(dishId)
          return { ...current, changed: current.contentVersion !== snapshot.contentVersion }
        } catch (error) {
          if (error.statusCode === 404) return { ...snapshot, unavailable: true }
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
      this.setData({ menuEditingId: id, menuName: pending ? pending.name : menu.name, menuPeople: pending ? pending.people : menu.people, menuPending: !!pending, menuReviewDishes, menuReviewNotice, selectedIds: ids, selectedTotal: ids.length, selectedList: this.buildSelectedList(ids), selectionMode: true, currentDishes: this.data.currentDishes.map(d => ({ ...d, isSelected: ids.includes(d.id) })) })
    } catch (error) { if (this.isBrowseCurrent(identity, epoch)) this.setData({ menuError: require('../../utils/meal-workflow').errorMessage(error, '菜单读取失败') }) }
    finally { if (this.isBrowseCurrent(identity, epoch)) this.setData({ menuBusy: false }) }
  },
  onNewMenu() { if (!this.data.menuBusy && !this.data.menuPending) { this._menuVersion = null; this.setData({ menuFormVisible:true,menuEditingId: null, menuName: '', menuPeople: 2, menuReviewDishes: [], menuReviewNotice: '' }) } },
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
    this.setData({ menuBusy: true, menuError: '' })
    try {
      const resolved = await api.resolvePersonalMenu(menu.id, { expectedVersion: menu.version, date, mealType })
      if (!current()) return
      const handoff = require('../../utils/personal-recipes').menuHandoff(resolved)
      wx.setStorageSync(getUserStorageKey('workspaceSelectedDishes'), handoff)
      wx.setStorageSync(getUserStorageKey('activeMealTarget'), { date: handoff.date, mealType: handoff.mealType })
      wx.navigateTo({ url: '/pages/result/result?date=' + handoff.date + '&mealType=' + handoff.mealType })
    } catch (error) { if (current()) this.setData({ menuError: require('../../utils/meal-workflow').errorMessage(error, '菜单未应用，原安排保留，请重试') }) }
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
    wx.navigateBack()
  },

  onQuickSearch(e) {
    const kw = e.currentTarget.dataset.kw
    this.setData({ searchKeyword: kw })
    this.loadPage(this.data.activeTab, 1)
  }
})
