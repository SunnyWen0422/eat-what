const { createPreferenceStore, defaultPreferences, normalizePreferences, sanitizePreferencesForOptions } = require('../../utils/preference-store')
const { loadRecommendationOptions } = require('../../utils/recommendation-options')

const DAY_OPTIONS = [0, 3, 7, 14, 30]
const DURATION_OPTIONS = [null, 10, 20, 30, 45, 60]

Page({
  data: {
    loading: true,
    synced: false,
    dirty: false,
    statusText: '',
    preferences: defaultPreferences(),
    cuisineOptions: [],
    tagOptions: [],
    dayOptions: DAY_OPTIONS,
    durationOptions: DURATION_OPTIONS,
    ingredientDraft: '',
    featureEnabled: true,
  },

  async onLoad() {
    this.store = createPreferenceStore()
    await this.store.migrateLegacy()
    const [preferenceResult, optionsResult] = await Promise.all([
      this.store.load(),
      loadRecommendationOptions(),
    ])
    this.options = optionsResult.options
    const featureEnabled = this.options.preferencesEnabled !== false
    const preferences = sanitizePreferencesForOptions(preferenceResult.preferences, this.options)
    const catalogChanged = JSON.stringify(preferences) !== JSON.stringify(preferenceResult.preferences)
    if (catalogChanged) this.store.writeCache(preferences)
    this.setData({
      preferences,
      synced: preferenceResult.synced,
      loading: false,
      featureEnabled,
      statusText: preferenceResult.synced ? '已从账号同步' : '当前使用本机偏好',
    })
    if (catalogChanged) this.setData({ dirty: true, statusText: '已清理失效选项，请保存' })
    this.renderOptions()
  },

  renderOptions() {
    if (!this.options) return
    const preferences = this.data.preferences
    const cuisineOptions = (this.options.groups.cuisine || []).map(item => ({
      ...item,
      selected: preferences.preferredCuisineCodes.includes(item.code),
    }))
    const tagOptions = ['flavor', 'scene', 'diet', 'method']
      .flatMap(group => this.options.groups[group] || [])
      .map(item => ({
        ...item,
        preferred: preferences.preferredTagCodes.includes(item.code),
        excluded: preferences.excludedTagCodes.includes(item.code),
      }))
    this.setData({ cuisineOptions, tagOptions })
  },

  updateList(field, code) {
    const preferences = normalizePreferences(this.data.preferences)
    const values = new Set(preferences[field])
    if (values.has(code)) values.delete(code)
    else values.add(code)
    preferences[field] = [...values].sort()
    if (field === 'preferredTagCodes') preferences.excludedTagCodes = preferences.excludedTagCodes.filter(item => item !== code)
    if (field === 'excludedTagCodes') preferences.preferredTagCodes = preferences.preferredTagCodes.filter(item => item !== code)
    this.setData({ preferences, dirty: true, statusText: '有未保存的更改' })
    this.renderOptions()
  },

  onCuisineTap(e) {
    this.updateList('preferredCuisineCodes', e.currentTarget.dataset.code)
  },

  onPreferredTagTap(e) {
    this.updateList('preferredTagCodes', e.currentTarget.dataset.code)
  },

  onExcludedTagTap(e) {
    this.updateList('excludedTagCodes', e.currentTarget.dataset.code)
  },

  onDayTap(e) {
    this.setData({ 'preferences.avoidRecentDays': Number(e.currentTarget.dataset.value), dirty: true, statusText: '有未保存的更改' })
  },

  onDurationTap(e) {
    const value = e.currentTarget.dataset.value
    this.setData({ 'preferences.maxCookMinutes': value === 'none' ? null : Number(value), dirty: true, statusText: '有未保存的更改' })
  },

  onIngredientInput(e) {
    this.setData({ ingredientDraft: e.detail.value })
  },

  onAddIngredient() {
    const value = String(this.data.ingredientDraft || '').trim().slice(0, 20)
    if (!value) return
    const preferences = normalizePreferences({
      ...this.data.preferences,
      excludedIngredients: [...this.data.preferences.excludedIngredients, value],
    })
    this.setData({ preferences, ingredientDraft: '', dirty: true, statusText: '有未保存的更改' })
  },

  onRemoveIngredient(e) {
    const value = e.currentTarget.dataset.value
    const preferences = normalizePreferences({
      ...this.data.preferences,
      excludedIngredients: this.data.preferences.excludedIngredients.filter(item => item !== value),
    })
    this.setData({ preferences, dirty: true, statusText: '有未保存的更改' })
  },

  async onSave() {
    wx.showLoading({ title: '保存中' })
    const result = await this.store.save(this.data.preferences)
    wx.hideLoading()
    this.setData({
      preferences: result.preferences,
      synced: result.synced,
      dirty: false,
      statusText: result.synced ? '已同步到账号' : '已保存到本机',
    })
    wx.showToast({ title: result.synced ? '偏好已保存' : '已保存到本机', icon: 'success' })
  },

  onShareAppMessage() {
    return { title: '吃什么？个性化推荐设置', path: '/pages/settings/settings' }
  },
})
