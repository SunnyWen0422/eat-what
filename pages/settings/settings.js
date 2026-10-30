const { getUserStorageKey } = require('../../utils/util')
const { createPreferenceStore, defaultPreferences, normalizePreferences, sanitizePreferencesForOptions } = require('../../utils/preference-store')
const { loadRecommendationOptions } = require('../../utils/recommendation-options')
const { preferenceSaveIssue } = require('../../utils/preference-save-presentation')

const DAY_OPTIONS = [0, 3, 7, 14, 30]
const DURATION_OPTIONS = [null, 10, 20, 30, 45, 60]

Page({
  onAssistantReturn(){return require('../../utils/assistant-origin').returnFromPage(this)},
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
    ingredientDraft: '', ingredientError: '', ingredientFocus: false, assistantPreferenceProposal: '', peopleDraft:'2',peopleError:'',preferencesReadFailed:false,
    featureEnabled: true,
  },

  canEditPreferences(){return !this._unloaded&&!this.data.loading&&!this.data.saving&&!this.data.preferencesReadFailed&&this.data.featureEnabled&&this._scope===getUserStorageKey('preferencesPage')},
  editSnapshot() { return JSON.stringify({ preferences: normalizePreferences(this.data.preferences), peopleDraft: this.data.peopleDraft, ingredientDraft: this.data.ingredientDraft }) },
  syncEditLeaveAlert() {
    const dirty = !!this._editInitial && this.editSnapshot() !== this._editInitial
    this.setData({ dirty })
    if (!dirty && ['有未保存的更改', '偏好已重置，等待保存'].includes(this.data.statusText)) this.setData({ statusText: this.data.synced ? '' : '当前使用本机偏好' })
    if (dirty && wx.enableAlertBeforeUnload) wx.enableAlertBeforeUnload({ message: '偏好输入尚未保存，离开会放弃未提交输入。' })
    else if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload()
  },
  onDefaultPeople(e) {
    if(!this.canEditPreferences())return
    const text=String(e.detail.value),people=Number(text),valid=/^[1-9][0-9]?$/.test(text)&&people<=50
    this.setData({peopleDraft:text,peopleError:valid?'':'常用人数应为 1 至 50',statusText:'有未保存的更改'})
    if(valid)this.setData({'preferences.defaultPeople':people})
    this.syncEditLeaveAlert()
  },
  onShow() { if(this._assistantOrigin)require('../../utils/assistant-origin').refreshAssistantOrigin(this); if (this._scope && this._scope !== getUserStorageKey('preferencesPage')) return this.onLoad(); this.syncEditLeaveAlert() },
  onUnload() { this._unloaded = true; if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload() },
  async onLoad(options={}) {
    const accountChanged = this._scope && this._scope !== getUserStorageKey('preferencesPage')
    if (accountChanged) { this._assistantOrigin = null; this.setData({ assistantReturnVisible: false }) }
    const handoff=options.handoffToken?require('../../utils/assistant-origin').receiveHandoff(this,options,['edit_preferences'],{storage:wx,storageKey:getUserStorageKey}):null
    const proposal = handoff && handoff.prefill ? handoff.prefill.userText : accountChanged || options.handoffToken ? '' : this.data.assistantPreferenceProposal
    const scope = this._scope = getUserStorageKey('preferencesPage'),epoch=this._loadEpoch=(this._loadEpoch||0)+1
    this._editInitial = null
    this.setData({ preferences: defaultPreferences(),peopleDraft:'2',peopleError:'',preferencesReadFailed:false, ingredientDraft: '', ingredientError: '', ingredientFocus: false, assistantPreferenceProposal: proposal || '', loading: true, dirty: false, saving: false })
    this.syncEditLeaveAlert()
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
      balancedRecommendation: optionsResult.synced&&this.options.recommendationPolicyVersion==='balanced-v1',
      learningResetEnabled: optionsResult.synced&&this.options.learningResetEnabled===true,
      statusText: preferenceResult.synced ? '' : preferenceResult.pending ? '有未同步的偏好，点击保存重试' : '当前使用本机偏好',
    })
    this._editInitial = JSON.stringify({ preferences: normalizePreferences(preferenceResult.preferences), peopleDraft: String(preferences.defaultPeople), ingredientDraft: '' })
    this.syncEditLeaveAlert()
    if (catalogChanged) this.setData({ statusText: '已清理失效选项，请保存' })
    this.renderOptions()
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
    this.syncEditLeaveAlert()
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
    this.syncEditLeaveAlert()
  },

  onDurationTap(e) {
    if(!this.canEditPreferences())return
    const value = e.currentTarget.dataset.value
    if(value!=='none'&&!DURATION_OPTIONS.includes(Number(value)))return
    this.setData({ 'preferences.maxCookMinutes': value === 'none' ? null : Number(value), dirty: true, statusText: '有未保存的更改' })
    this.syncEditLeaveAlert()
  },

  onIngredientInput(e) {
    if(!this.canEditPreferences())return
    this.setData({ ingredientDraft: e.detail.value, ingredientError: '', ingredientFocus: false })
    this.syncEditLeaveAlert()
  },

  onAddIngredient() {
    if(!this.canEditPreferences())return
    const value = String(this.data.ingredientDraft || '').trim().slice(0, 20)
    if (!value) return
    const preferences = normalizePreferences({
      ...this.data.preferences,
      excludedIngredients: [...this.data.preferences.excludedIngredients, value],
    })
    this.setData({ preferences, ingredientDraft: '', ingredientError: '', ingredientFocus: false, dirty: true, statusText: '有未保存的更改' })
    this.syncEditLeaveAlert()
  },

  onRemoveIngredient(e) {
    if(!this.canEditPreferences())return
    const value = e.currentTarget.dataset.value
    const preferences = normalizePreferences({
      ...this.data.preferences,
      excludedIngredients: this.data.preferences.excludedIngredients.filter(item => item !== value),
    })
    this.setData({ preferences, dirty: true, statusText: '有未保存的更改' })
    this.syncEditLeaveAlert()
  },

  async onSave() {
    if(!this.canEditPreferences())return
    const text=this.data.peopleDraft===undefined?String(this.data.preferences.defaultPeople):this.data.peopleDraft
    const issue = preferenceSaveIssue({ peopleDraft: text, ingredientDraft: this.data.ingredientDraft })
    if (issue) {
      if (issue.field === 'ingredientDraft') { this.setData({ ingredientFocus: false }); this.setData({ ingredientError: issue.message, ingredientFocus: true, statusText: '请先核对忌口食材' }) }
      else this.setData({ peopleError: issue.message, statusText: '请核对常用人数' })
      return
    }
    const scope=this._scope,store=this.store
    this.setData({saving:true})
    try{
      const result=await store.save(this.data.preferences)
      if(this._unloaded||scope!==getUserStorageKey('preferencesPage')||store!==this.store)return
      this.setData({preferences:result.preferences,peopleDraft:String(result.preferences.defaultPeople),peopleError:'',synced:result.synced,statusText:result.synced?'偏好已保存':'已保留本机草稿，账号尚未保存，请重试'})
      this._editInitial = this.editSnapshot(); this.syncEditLeaveAlert()
      wx.showToast({title:result.synced?'偏好已保存':'尚未同步，草稿已保留',icon:result.synced?'success':'none'})
    }catch(error){if(!this._unloaded&&scope===getUserStorageKey('preferencesPage')&&store===this.store){this.setData({statusText:'偏好未保存，输入仍在，请重试'});this.syncEditLeaveAlert()}}
    finally{if(!this._unloaded&&scope===getUserStorageKey('preferencesPage')&&store===this.store)this.setData({saving:false})}
  },

  onClearLearning() {
    if(!this.canEditPreferences()||!this.data.learningResetEnabled||this.data.clearingLearning)return
    const scope=this._scope,key=getUserStorageKey('pendingLearningReset')
    wx.showModal({title:'清除学习记录？',content:'清除从采用和单菜替换中学到的口味。手填偏好、收藏、日历和用餐记录都会保留。',success:async result=>{
      if(!result.confirm||this._unloaded||scope!==getUserStorageKey('preferencesPage'))return
      const pending=wx.getStorageSync(key)||{requestId:require('../../utils/meal-workspace').requestId()}
      wx.setStorageSync(key,pending);this.setData({clearingLearning:true})
      try{await require('../../utils/api').resetRecommendationLearning(pending)
        if(this._unloaded||scope!==getUserStorageKey('preferencesPage'))return
        if((wx.getStorageSync(key)||{}).requestId===pending.requestId)wx.removeStorageSync(key)
        this.setData({statusText:'学习记录已清除'});wx.showToast({title:'已清除学习记录',icon:'success'})
      }catch(error){if(!this._unloaded&&scope===getUserStorageKey('preferencesPage'))this.setData({statusText:'暂未确认清除结果，再次点击可继续确认'})}
      finally{if(!this._unloaded&&scope===getUserStorageKey('preferencesPage'))this.setData({clearingLearning:false})}
    }})
  },
  onResetMemory() {
    if(!this.canEditPreferences())return
    wx.showModal({ title: '重置偏好记忆？', content: '重置菜系、标签、忌口和近期避重复设置。用餐记录、收藏和购物清单会保留。重置后仍需保存。', success: result => {
      if (!result.confirm || this.data.saving || this._scope !== getUserStorageKey('preferencesPage')) return
      this.setData({ preferences: defaultPreferences(),peopleDraft:'2',peopleError:'', ingredientDraft: '', ingredientError: '', ingredientFocus: false, statusText: '偏好已重置，等待保存' }); this.syncEditLeaveAlert(); this.renderOptions()
    } })
  },
  onShareAppMessage() {
    return { title: '吃什么？个性化推荐设置', path: '/pages/settings/settings' }
  },
})
