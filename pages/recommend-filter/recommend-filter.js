const { getUserStorageKey } = require('../../utils/util')
const { emptyCriteria, normalizeCriteria } = require('../../utils/recommendation-criteria')
const { loadRecommendationOptions, sanitizeCriteriaForOptions } = require('../../utils/recommendation-options')
const { preferenceSaveIssue } = require('../../utils/preference-save-presentation')

const GROUP_LABELS = {
  cuisine: '菜系',
  flavor: '口味',
  scene: '场景',
  diet: '饮食',
  method: '做法',
}

const DURATION_OPTIONS = [
  { label: '不限', value: null },
  { label: '10分钟', value: 10 },
  { label: '20分钟', value: 20 },
  { label: '30分钟', value: 30 },
  { label: '45分钟', value: 45 },
  { label: '60分钟', value: 60 },
]

Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(),
    loading: true,
    offline: false,
    criteria: emptyCriteria(),
    tagMode: 'include',
    groupViews: [],
    ingredientDraft: '',
    ingredientError: '', ingredientFocus: false, dirty: false,
    durationOptions: DURATION_OPTIONS,
    featureEnabled: true,
  },

  onShow() { if (this._scope && this._scope !== getUserStorageKey('filterPage')) return this.onLoad(); this.syncEditLeaveAlert() },
  onUnload() { this._unloaded = true; if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload() },
  canEditFilter() { return !this._unloaded && !this.data.loading && this.data.featureEnabled && this._scope === getUserStorageKey('filterPage') },
  editSnapshot() { return JSON.stringify({ criteria: normalizeCriteria(this.data.criteria), ingredientDraft: this.data.ingredientDraft }) },
  syncEditLeaveAlert() {
    const dirty = !!this._editInitial && this.editSnapshot() !== this._editInitial
    this.setData({ dirty })
    if (dirty && wx.enableAlertBeforeUnload) wx.enableAlertBeforeUnload({ message: '本餐筛选尚未应用，离开会放弃未提交输入。' })
    else if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload()
  },
  async onLoad() {
    const scope = this._scope = getUserStorageKey('filterPage'), epoch = this._loadEpoch = (this._loadEpoch || 0) + 1
    this._editInitial = null
    this.setData({ criteria: emptyCriteria(), ingredientDraft: '', ingredientError: '', ingredientFocus: false, loading: true, dirty: false })
    this.syncEditLeaveAlert()
    const editingKey = getUserStorageKey('editingRecommendationCriteria')
    const criteria = normalizeCriteria(wx.getStorageSync(editingKey) || emptyCriteria())
    wx.removeStorageSync(editingKey)
    const result = await loadRecommendationOptions()
    if (this._unloaded || scope !== getUserStorageKey('filterPage') || epoch !== this._loadEpoch) return
    this.options = result.options
    this.setData({
      criteria: sanitizeCriteriaForOptions(criteria, this.options),
      loading: false,
      offline: !result.synced,
      featureEnabled: this.options.preferencesEnabled !== false,
    })
    this._editInitial = this.editSnapshot(); this.syncEditLeaveAlert()
    this.renderGroups()
  },

  renderGroups() {
    if (!this.options) return
    const { criteria, tagMode } = this.data
    const groupViews = Object.keys(GROUP_LABELS).map(key => ({
      key,
      label: GROUP_LABELS[key],
      items: (this.options.groups[key] || []).map(item => ({
        ...item,
        selected: key === 'cuisine'
          ? criteria.cuisineCodes.includes(item.code)
          : (tagMode === 'include' ? criteria.includeTagCodes : criteria.excludeTagCodes).includes(item.code),
      })),
    }))
    this.setData({ groupViews })
  },

  onTagModeChange(e) {
    if (!this.canEditFilter()) return
    this.setData({ tagMode: e.currentTarget.dataset.mode })
    this.renderGroups()
  },

  onOptionTap(e) {
    if (!this.canEditFilter()) return
    const { group, code } = e.currentTarget.dataset
    const criteria = normalizeCriteria(this.data.criteria)
    const field = group === 'cuisine'
      ? 'cuisineCodes'
      : (this.data.tagMode === 'include' ? 'includeTagCodes' : 'excludeTagCodes')
    const values = new Set(criteria[field])
    if (values.has(code)) values.delete(code)
    else values.add(code)
    criteria[field] = [...values].sort()
    if (field === 'includeTagCodes' && criteria.excludeTagCodes.includes(code)) {
      criteria.excludeTagCodes = criteria.excludeTagCodes.filter(item => item !== code)
    }
    if (field === 'excludeTagCodes' && criteria.includeTagCodes.includes(code)) {
      criteria.includeTagCodes = criteria.includeTagCodes.filter(item => item !== code)
    }
    this.setData({ criteria })
    this.syncEditLeaveAlert()
    wx.vibrateShort({ type: 'light' })
    this.renderGroups()
  },

  onDurationTap(e) {
    if (!this.canEditFilter()) return
    const raw = e.currentTarget.dataset.value
    if (raw !== 'none' && !DURATION_OPTIONS.some(item => item.value === Number(raw))) return
    const criteria = normalizeCriteria({ ...this.data.criteria, maxCookMinutes: raw === 'none' ? null : Number(raw) })
    this.setData({ criteria })
    this.syncEditLeaveAlert()
  },

  onIngredientInput(e) {
    if (!this.canEditFilter()) return
    this.setData({ ingredientDraft: e.detail.value, ingredientError: '', ingredientFocus: false }); this.syncEditLeaveAlert()
  },

  onAddIngredient() {
    if (!this.canEditFilter()) return
    const value = String(this.data.ingredientDraft || '').trim().slice(0, 20)
    if (!value) return
    const criteria = normalizeCriteria({
      ...this.data.criteria,
      excludedIngredients: [...this.data.criteria.excludedIngredients, value],
    })
    this.setData({ criteria, ingredientDraft: '', ingredientError: '', ingredientFocus: false }); this.syncEditLeaveAlert()
  },

  onRemoveIngredient(e) {
    if (!this.canEditFilter()) return
    const value = e.currentTarget.dataset.value
    const criteria = normalizeCriteria({
      ...this.data.criteria,
      excludedIngredients: this.data.criteria.excludedIngredients.filter(item => item !== value),
    })
    this.setData({ criteria })
    this.syncEditLeaveAlert()
  },

  onClear() {
    if (!this.canEditFilter()) return
    this.setData({ criteria: emptyCriteria(), ingredientDraft: '', ingredientError: '', ingredientFocus: false }); this.syncEditLeaveAlert()
    this.renderGroups()
  },

  onApply() {
    if (this._scope !== getUserStorageKey('filterPage')) { this.onLoad(); return }
    if (!this.canEditFilter()) return
    const issue = preferenceSaveIssue({ ingredientDraft: this.data.ingredientDraft })
    if (issue) { this.setData({ ingredientFocus: false }); this.setData({ ingredientError: '请先添加这项本餐排除食材', ingredientFocus: true }); return }
    wx.setStorageSync(getUserStorageKey('pendingRecommendationCriteria'), normalizeCriteria(this.data.criteria))
    this._editInitial = this.editSnapshot(); this.syncEditLeaveAlert()
    wx.showToast({ title: '筛选已带回本餐', icon: 'success' })
    wx.navigateBack()
  },
})
