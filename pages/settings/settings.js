const { getUserStorageKey } = require('../../utils/util')
const { createPreferenceStore, defaultPreferences, normalizePreferences, sanitizePreferencesForOptions } = require('../../utils/preference-store')
const { loadRecommendationOptions } = require('../../utils/recommendation-options')
const experiencePreferences = require('../../utils/experience-preferences')

const DAY_OPTIONS = [0, 3, 7, 14, 30]
const DURATION_OPTIONS = [null, 10, 20, 30, 45, 60]

Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(),
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
    ingredientDraft: '',peopleDraft:'2',peopleError:'',preferencesReadFailed:false,
    featureEnabled: true,
    reducedMotion: false,
    motionStatus: '',
  },

  onReducedMotionChange(e) {
    if (this._scope && this._scope !== getUserStorageKey('preferencesPage')) return this.onLoad()
    const reducedMotion = !!e.detail.value
    try {
      if (!this.experienceStore) this.experienceStore = experiencePreferences()
      this.experienceStore.setReducedMotion(reducedMotion)
      this.setData({ reducedMotion, motionStatus: '已保存到当前账号的本机设置' })
    } catch (error) { this.setData({ motionStatus: '动态效果设置未保存，请重试' }) }
  },

  canEditPreferences(){return !this._unloaded&&!this.data.loading&&!this.data.saving&&!this.data.preferencesReadFailed&&this.data.featureEnabled&&this._scope===getUserStorageKey('preferencesPage')},
  onDefaultPeople(e) {
    if(!this.canEditPreferences())return
    const text=String(e.detail.value),people=Number(text),valid=/^[1-9][0-9]?$/.test(text)&&people<=50
    this.setData({peopleDraft:text,peopleError:valid?'':'常用人数应为 1 至 50',dirty:true,statusText:'有未保存的更改'})
    if(valid)this.setData({'preferences.defaultPeople':people})
  },
  onShow() { if (this._scope && this._scope !== getUserStorageKey('preferencesPage')) this.onLoad() },
  onUnload() { this._unloaded = true },
  async onLoad(options={}) {
    const handoff=options.handoffToken?require('../../utils/assistant-action-handoff').incoming(options,['edit_preferences'],{storage:wx,storageKey:getUserStorageKey}):null
    const scope = this._scope = getUserStorageKey('preferencesPage'),epoch=this._loadEpoch=(this._loadEpoch||0)+1
    this.experienceStore = experiencePreferences()
    this.setData({ reducedMotion: this.experienceStore.get().reducedMotion,
      motionStatus: this.experienceStore.readFailed() ? '本机动态效果设置暂未读到，已暂时减少动态效果；推荐偏好仍可使用。' : '' })
    this.setData({ preferences: defaultPreferences(),peopleDraft:'2',peopleError:'',preferencesReadFailed:false, ingredientDraft: '', loading: true, dirty: false, saving: false })
    this.store = createPreferenceStore()
    const store=this.store
    try{
    await store.migrateLegacy()
    const [preferenceResult, optionsResult] = await Promise.all([
      store.load(),
      loadRecommendationOptions(),
    ])
    if (this._unloaded || scope !== getUserStorageKey('preferencesPage') || epoch!==this._loadEpoch) return
    this.options = optionsResult.options
    const featureEnabled = this.options.preferencesEnabled !== false
    const preferences = sanitizePreferencesForOptions(preferenceResult.preferences, this.options)
    const catalogChanged = JSON.stringify(preferences) !== JSON.stringify(preferenceResult.preferences)
    if (catalogChanged) this.store.writeCache(preferences)
    this.setData({
      preferences,peopleDraft:String(preferences.defaultPeople),peopleError:'',
      synced: preferenceResult.synced,
      loading: false,
      featureEnabled,
      statusText: preferenceResult.synced ? '已从账号同步' : '当前使用本机偏好',
    })
    if (catalogChanged) this.setData({ dirty: true, statusText: '已清理失效选项，请保存' })
    this.renderOptions()
    if(handoff&&handoff.prefill&&handoff.prefill.userText&&scope===getUserStorageKey('preferencesPage'))wx.showModal({title:'核对长期偏好',content:handoff.prefill.userText+'\n请在页面中调整，保存后生效。',showCancel:false})
    }catch(error){if(!this._unloaded&&scope===getUserStorageKey('preferencesPage')&&epoch===this._loadEpoch)this.setData({loading:false,preferencesReadFailed:true,statusText:'偏好暂未读到，请重新读取后再修改'})}
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
    if(!this.canEditPreferences())return
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
    if(!this.canEditPreferences())return
    if(!DAY_OPTIONS.includes(Number(e.currentTarget.dataset.value)))return
    this.setData({ 'preferences.avoidRecentDays': Number(e.currentTarget.dataset.value), dirty: true, statusText: '有未保存的更改' })
  },

  onDurationTap(e) {
    if(!this.canEditPreferences())return
    const value = e.currentTarget.dataset.value
    if(value!=='none'&&!DURATION_OPTIONS.includes(Number(value)))return
    this.setData({ 'preferences.maxCookMinutes': value === 'none' ? null : Number(value), dirty: true, statusText: '有未保存的更改' })
  },

  onIngredientInput(e) {
    if(!this.canEditPreferences())return
    this.setData({ ingredientDraft: e.detail.value })
  },

  onAddIngredient() {
    if(!this.canEditPreferences())return
    const value = String(this.data.ingredientDraft || '').trim().slice(0, 20)
    if (!value) return
    const preferences = normalizePreferences({
      ...this.data.preferences,
      excludedIngredients: [...this.data.preferences.excludedIngredients, value],
    })
    this.setData({ preferences, ingredientDraft: '', dirty: true, statusText: '有未保存的更改' })
  },

  onRemoveIngredient(e) {
    if(!this.canEditPreferences())return
    const value = e.currentTarget.dataset.value
    const preferences = normalizePreferences({
      ...this.data.preferences,
      excludedIngredients: this.data.preferences.excludedIngredients.filter(item => item !== value),
    })
    this.setData({ preferences, dirty: true, statusText: '有未保存的更改' })
  },

  async onSave() {
    if(!this.canEditPreferences())return
    const text=this.data.peopleDraft===undefined?String(this.data.preferences.defaultPeople):this.data.peopleDraft
    if(!/^[1-9][0-9]?$/.test(text)||Number(text)>50)return this.setData({peopleError:'常用人数应为 1 至 50',statusText:'请核对常用人数'})
    const scope=this._scope,store=this.store
    this.setData({saving:true})
    try{
      const result=await store.save(this.data.preferences)
      if(this._unloaded||scope!==getUserStorageKey('preferencesPage')||store!==this.store)return
      this.setData({preferences:result.preferences,peopleDraft:String(result.preferences.defaultPeople),peopleError:'',synced:result.synced,dirty:!result.synced,statusText:result.synced?'偏好已保存':'已保留本机草稿，账号尚未保存，请重试'})
      wx.showToast({title:result.synced?'偏好已保存':'尚未同步，草稿已保留',icon:result.synced?'success':'none'})
    }catch(error){if(!this._unloaded&&scope===getUserStorageKey('preferencesPage')&&store===this.store)this.setData({dirty:true,statusText:'偏好未保存，输入仍在，请重试'})}
    finally{if(!this._unloaded&&scope===getUserStorageKey('preferencesPage')&&store===this.store)this.setData({saving:false})}
  },

  onResetMemory() {
    if(!this.canEditPreferences())return
    wx.showModal({ title: '重置偏好记忆？', content: '重置菜系、标签、忌口和近期避重复设置。用餐记录、收藏和购物清单会保留。重置后仍需保存。', success: result => {
      if (!result.confirm || this.data.saving || this._scope !== getUserStorageKey('preferencesPage')) return
      this.setData({ preferences: defaultPreferences(),peopleDraft:'2',peopleError:'', ingredientDraft: '', dirty: true, statusText: '偏好已重置，等待保存' }); this.renderOptions()
    } })
  },
  onShareAppMessage() {
    return { title: '吃什么？个性化推荐设置', path: '/pages/settings/settings' }
  },
})
