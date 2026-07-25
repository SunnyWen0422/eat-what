const { getUserStorageKey } = require('../../utils/util')
const { emptyCriteria, normalizeCriteria } = require('../../utils/recommendation-criteria')
const { loadRecommendationOptions, sanitizeCriteriaForOptions } = require('../../utils/recommendation-options')

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
  data: {
    loading: true,
    offline: false,
    criteria: emptyCriteria(),
    tagMode: 'include',
    groupViews: [],
    ingredientDraft: '',
    durationOptions: DURATION_OPTIONS,
    featureEnabled: true,
  },

  async onLoad() {
    const editingKey = getUserStorageKey('editingRecommendationCriteria')
    const criteria = normalizeCriteria(wx.getStorageSync(editingKey) || emptyCriteria())
    wx.removeStorageSync(editingKey)
    const result = await loadRecommendationOptions()
    this.options = result.options
    this.setData({
      criteria: sanitizeCriteriaForOptions(criteria, this.options),
      loading: false,
      offline: !result.synced,
      featureEnabled: this.options.preferencesEnabled !== false,
    })
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
    this.setData({ tagMode: e.currentTarget.dataset.mode })
    this.renderGroups()
  },

  onOptionTap(e) {
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
    wx.vibrateShort({ type: 'light' })
    this.renderGroups()
  },

  onDurationTap(e) {
    const raw = e.currentTarget.dataset.value
    const criteria = normalizeCriteria({ ...this.data.criteria, maxCookMinutes: raw === 'none' ? null : Number(raw) })
    this.setData({ criteria })
  },

  onIngredientInput(e) {
    this.setData({ ingredientDraft: e.detail.value })
  },

  onAddIngredient() {
    const value = String(this.data.ingredientDraft || '').trim().slice(0, 20)
    if (!value) return
    const criteria = normalizeCriteria({
      ...this.data.criteria,
      excludedIngredients: [...this.data.criteria.excludedIngredients, value],
    })
    this.setData({ criteria, ingredientDraft: '' })
  },

  onRemoveIngredient(e) {
    const value = e.currentTarget.dataset.value
    const criteria = normalizeCriteria({
      ...this.data.criteria,
      excludedIngredients: this.data.criteria.excludedIngredients.filter(item => item !== value),
    })
    this.setData({ criteria })
  },

  onClear() {
    this.setData({ criteria: emptyCriteria(), ingredientDraft: '' })
    this.renderGroups()
  },

  onApply() {
    wx.setStorageSync(getUserStorageKey('pendingRecommendationCriteria'), normalizeCriteria(this.data.criteria))
    wx.showToast({ title: '筛选已应用', icon: 'success' })
    wx.navigateBack()
  },
})
