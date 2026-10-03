const { getUserStorageKey } = require('../../utils/util')
const { createPreferenceStore, defaultPreferences, normalizePreferences, sanitizePreferencesForOptions } = require('../../utils/preference-store')
const { loadRecommendationOptions } = require('../../utils/recommendation-options')

const DAY_OPTIONS = [0, 3, 7, 14, 30]
const DURATION_OPTIONS = [null, 10, 20, 30, 45, 60]

Page({
  data: { fontScale: require('../../utils/font-scale')(),
    loading: true,
    saving: false,
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

  onDefaultPeople(e) {
    const people=Number(e.detail.value)
    if(!Number.isInteger(people)||people<1||people>50)return this.setData({statusText:'常用人数应为 1 至 50'})
    this.setData({'preferences.defaultPeople':people,dirty:true,statusText:'常用人数未保存'})
  },
  onShow() { if (this._scope && this._scope !== getUserStorageKey('preferencesPage')) this.onLoad() },
  onUnload() { this._unloaded = true },
  async onLoad() {
    const scope = this._scope = getUserStorageKey('preferencesPage')
    this.setData({ preferences: defaultPreferences(), ingredientDraft: '', loading: true, dirty: false, saving: false })
    this.store = createPreferenceStore()
    await this.store.migrateLegacy()
    const [preferenceResult, optionsResult] = await Promise.all([
      this.store.load(),
      loadRecommendationOptions(),
    ])
    if (this._unloaded || scope !== getUserStorageKey('preferencesPage')) return
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
    if (this.data.saving || this._scope !== getUserStorageKey('preferencesPage')) return
    const scope = this._scope
    this.setData({ saving: true })
    const result = await this.store.save(this.data.preferences)
    if (this._unloaded || scope !== getUserStorageKey('preferencesPage')) return
    this.setData({
      preferences: result.preferences,
      synced: result.synced,
      saving: false, dirty: !result.synced,
      statusText: result.synced ? '已同步到账号' : '已保留本机草稿，云端尚未保存，请重试',
    })
    wx.showToast({ title: result.synced ? '偏好已保存' : '云端未保存，草稿已保留', icon: result.synced ? 'success' : 'none' })
  },

  onResetMemory() {
    wx.showModal({ title: '重置偏好记忆？', content: '重置菜系、标签、忌口和近期避重复设置。用餐记录、收藏和购物清单会保留。重置后仍需保存。', success: result => {
      if (!result.confirm || this.data.saving || this._scope !== getUserStorageKey('preferencesPage')) return
      this.setData({ preferences: defaultPreferences(), ingredientDraft: '', dirty: true, statusText: '偏好已重置，等待保存' }); this.renderOptions()
    } })
  },
  onShareAppMessage() {
    return { title: '吃什么？个性化推荐设置', path: '/pages/settings/settings' }
  },
})
