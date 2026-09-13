const app = getApp()
const api = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')
const { beginShoppingSelection } = require('../../utils/shopping-list')

const SESSION_STORAGE = 'assistantSessionId'
const REQUEST_TIMEOUT = 30000

function currentUser() {
  // Storage is updated by the login flow before the app singleton is
  // refreshed. Prefer it so account switching cannot reuse another user's
  // assistant session for one render cycle.
  const storedUser = wx.getStorageSync('userInfo')
  if (storedUser && typeof storedUser === 'object') return storedUser
  const globalUser = app && app.globalData && app.globalData.userInfo
  return globalUser || {}
}

Page({
  data: {
    messages: [], inputText: '', loading: false, errorMessage: '', userAvatar: '',
    scrollTop: 0, sessionId: '', task: null, taskStage: '', mode: '', plan: null, howto: null, alternatives: [], canUndo: false, actions: [], pendingAction: '', initialized: false,
  },
  _requestVersion: 0,
  _contextVersion: 0,
  _scopeKey: '',
  _stageTimer: null,

  onLoad() {
    const user = currentUser()
    this.sessionKey = getUserStorageKey(SESSION_STORAGE)
    this._scopeKey = this.sessionKey
    this.setData({ userAvatar: user.avatar || '', initialized: false })
    return this.initializeSession()
  },

  onShow() {
    const nextScopeKey = getUserStorageKey(SESSION_STORAGE)
    if (this._scopeKey && nextScopeKey !== this._scopeKey) {
      this.stopStageAnimation()
      this._scopeKey = nextScopeKey
      this.sessionKey = nextScopeKey
      this._contextVersion += 1
      this._requestVersion += 1
      this._initializing = null
      this.setData({
        userAvatar: currentUser().avatar || '', initialized: false, sessionId: '',
        messages: [], inputText: '', loading: false, errorMessage: '', task: null,
        plan: null, howto: null, alternatives: [], canUndo: false, actions: [], pendingAction: '',
      })
      return this.initializeSession()
    }
    if (!this.data.initialized && !this._initializing) return this.initializeSession()
    return Promise.resolve()
  },

  isCurrentContext(contextVersion, scopeKey = this.sessionKey) {
    return contextVersion === this._contextVersion && scopeKey === this.sessionKey && scopeKey === getUserStorageKey(SESSION_STORAGE)
  },

  async initializeSession() {
    // Avoid reloading an already hydrated session on every send/show cycle.
    // A second load could replace the user's scoped session with a stale one.
    if (this.data.initialized && this.data.sessionId) return Promise.resolve()
    if (this._initializing) return this._initializing
    const contextVersion = this._contextVersion
    const scopeKey = this.sessionKey
    this._initializing = (async () => {
      let sessionId = wx.getStorageSync(this.sessionKey) || ''
      try {
        if (sessionId && api.getAssistantSession) {
          let existing = null
          try {
            existing = await api.getAssistantSession(sessionId)
          } catch (error) {
            // A 404 means the local session expired or was deleted. Other
            // failures should keep the scoped id so a later retry can recover.
            const status = Number(error && (error.statusCode || error.status))
            if (status !== 404) throw error
          }
          if (existing && existing.success) { if (this.isCurrentContext(contextVersion, scopeKey)) this.hydrateSession(existing); return }
          sessionId = ''
          wx.removeStorageSync(this.sessionKey)
        }
        const created = await api.createAssistantSession({ userId: currentUser().id })
        if (!this.isCurrentContext(contextVersion, scopeKey)) return
        if (created && created.session_id) {
          wx.setStorageSync(this.sessionKey, created.session_id)
          this.hydrateSession(created)
        } else this.showWelcome()
      } catch (error) {
        if (!this.isCurrentContext(contextVersion, scopeKey)) return
        this.showWelcome()
        this.setData({ errorMessage: '助手暂时离线，发送后我会继续尝试连接' })
      } finally {
        if (this.isCurrentContext(contextVersion, scopeKey)) {
          this._initializing = null
          this.setData({ initialized: true })
        }
      }
    })()
    return this._initializing
  },

  showWelcome() {
    if (this.data.messages && this.data.messages.length) return
    this.setData({ messages: [{ id: 'welcome', role: 'assistant', content: '告诉我今晚几个人吃、想吃什么口味，或者把家里的食材发给我。' }] })
  },

  hydrateSession(session) {
    const state = session.state || {}
    const messages = (session.messages || []).map((item, index) => ({ ...item, id: `history-${index}` }))
    const pending = (this.data.messages || []).filter(item => item && item._pendingEcho)
    this.setData({
      sessionId: session.session_id || this.data.sessionId,
      messages: messages.length ? messages.concat(pending) : (pending.length ? pending : [{ id: 'welcome', role: 'assistant', content: '告诉我今晚几个人吃、想吃什么口味，或者把家里的食材发给我。' }]),
      task: state.task || session.task || null, plan: state.plan || session.plan || null,
      taskStage: state.taskStage || (session.task && session.task.status) || '', mode: state.mode || session.mode || '',
      howto: state.howto || session.howto || null,
      alternatives: state.alternatives || session.alternatives || [],
      canUndo: !!(session.can_undo || state.plan_history && state.plan_history.length > 1),
      actions: session.actions || [], errorMessage: '',
    })
    this.scrollToLatest()
  },

  addMessage(role, content, extra = {}) {
    const message = { id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`, role, content: String(content || ''), ...extra }
    this.setData({ messages: (this.data.messages || []).concat([message]) }, () => this.scrollToLatest())
  },

  scrollToLatest() { setTimeout(() => this.setData({ scrollTop: 999999 }), 0) },
  onTapDish(e) { const id = e.currentTarget.dataset.id; if (id) wx.navigateTo({ url: '/pages/dish-detail/dish-detail?id=' + id }) },
  onInput(e) { this.setData({ inputText: e.detail.value }) },

  async onSend() {
    const text = String(this.data.inputText || '').trim()
    if (!text) return
    if (this.data.loading) {
      wx.showToast({ title: '请先停止当前生成', icon: 'none' })
      return
    }
    const contextVersion = this._contextVersion
    const scopeKey = this.sessionKey
    const requestVersion = ++this._requestVersion
    this.addMessage('user', text, { _pendingEcho: true })
    this.setData({ inputText: '', loading: true, errorMessage: '', taskStage: 'understanding' })
    this.startStageAnimation()
    await this.initializeSession()
    if (!this.isCurrentContext(contextVersion, scopeKey) || requestVersion !== this._requestVersion) return
    const sessionId = this.data.sessionId || wx.getStorageSync(this.sessionKey)
    if (!sessionId) { this.setData({ errorMessage: '会话还没准备好，请稍后再试', loading: false }); return }
    const idempotencyKey = `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`
    this._lastRequest = { text, idempotencyKey, sessionId }
    try {
      const result = await this.withTimeout(api.sendAssistantMessage(sessionId, text, { idempotencyKey, parentTaskId: this.data.task && this.data.task.id }), REQUEST_TIMEOUT)
      if (!this.isCurrentContext(contextVersion, scopeKey) || requestVersion !== this._requestVersion) return
      this.applyAssistantResult(result)
    } catch (error) {
      if (!this.isCurrentContext(contextVersion, scopeKey) || requestVersion !== this._requestVersion) return
      this.addMessage('assistant', '这次连接没有完成。刚才的内容我保留着，可以点重试，或先去选菜。')
      this.stopStageAnimation()
      this.setData({ errorMessage: '连接超时或网络不可用', loading: false, taskStage: 'failed' })
    }
  },

  withTimeout(promise, timeout) {
    return new Promise((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('assistant timeout')) } }, timeout)
      Promise.resolve(promise).then(value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value) } }).catch(error => { if (!settled) { settled = true; clearTimeout(timer); reject(error) } })
    })
  },

  applyAssistantResult(result) {
    if (!result || result.success === false) throw new Error('assistant unavailable')
    this.setData({ messages: (this.data.messages || []).map(message => {
      const clean = { ...message }
      delete clean._pendingEcho
      return clean
    }) })
    this.addMessage('assistant', result.reply || '我已经整理好一套方案。', { dishes: result.dishes || [] })
    this.stopStageAnimation()
    this.setData({ sessionId: result.session_id || this.data.sessionId, task: result.task || null, taskStage: (result.task && result.task.status) || 'completed', mode: result.mode || '', plan: result.plan || null, howto: result.howto || null, alternatives: result.alternatives || [], canUndo: !!result.can_undo, actions: result.actions || [], loading: false, errorMessage: '' })
    if (result.task_id) this._activeTaskId = result.task_id
    if (result.session_id) wx.setStorageSync(this.sessionKey, result.session_id)
  },

  onQuick(e) { this.setData({ inputText: e.currentTarget.dataset.kw }); this.onSend() },
  onRetry() { const last = [...(this.data.messages || [])].reverse().find(item => item.role === 'user'); if (last) { this.setData({ inputText: last.content }); return this.onSend() } return Promise.resolve() },
  startStageAnimation() {
    this.stopStageAnimation()
    const stages = ['understanding', 'querying', 'planning', 'validating']
    let index = 0
    this._stageTimer = setInterval(() => {
      if (!this.data.loading) return this.stopStageAnimation()
      index = Math.min(index + 1, stages.length - 1)
      this.setData({ taskStage: stages[index] })
    }, 2200)
  },
  stopStageAnimation() { if (this._stageTimer) { clearInterval(this._stageTimer); this._stageTimer = null } },
  async onStopTask() {
    if (!this.data.loading) return
    this._requestVersion += 1
    this.stopStageAnimation()
    this.setData({ loading: false, taskStage: 'cancelled', errorMessage: '' })
    if (this._activeTaskId && api.cancelAssistantTask) {
      try { await api.cancelAssistantTask(this._activeTaskId, this.data.sessionId) } catch (error) { /* local cancellation still prevents stale UI writes */ }
    }
    wx.showToast({ title: '已停止当前生成', icon: 'success' })
  },
  onKeepDish() { wx.showToast({ title: '已保留这道菜', icon: 'success' }) },
  onReplaceDish() { this.setData({ inputText: '保留其他条件，帮我换一道菜' }); this.onSend() },
  async onUndoPlan() {
    if (!this.data.sessionId || !this.data.plan || !api.undoAssistantPlan) return
    try {
      const result = await api.undoAssistantPlan(this.data.sessionId, this.data.plan.version || 1)
      if (!result || result.success === false) throw new Error('undo unavailable')
      this.applyAssistantResult(result)
      wx.showToast({ title: '已撤销上次修改', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: '这套方案已更新，请重新生成', icon: 'none' })
    }
  },
  onAction(e) { const type = e.currentTarget.dataset.type; if (type === 'SAVE_CALENDAR') return this.confirmSaveCalendar(); if (type === 'ADD_SHOPPING_LIST') return this.confirmShoppingList() },

  getPlanDishesFrom(plan) { return (plan && plan.meals || []).flatMap(meal => (meal.dishes || []).map(dish => ({ ...dish, date: meal.date, mealType: meal.meal_type }))) },
  getPlanDishes() { return this.getPlanDishesFrom(this.data.plan) },

  async confirmSaveCalendar() {
    let plan = this.data.plan
    const dishes = this.getPlanDishesFrom(plan)
    if (!dishes.length) return wx.showToast({ title: '还没有可保存的菜品', icon: 'none' })
    const modal = await new Promise(resolve => wx.showModal({ title: '保存到日历', content: '确认把这套安排保存到对应日期和餐次吗？', success: resolve }))
    if (!modal.confirm || this.data.pendingAction) return
    this.setData({ pendingAction: 'SAVE_CALENDAR' })
    try {
      let previewToken = ''
      const confirmationKey = `calendar-${Date.now()}-${Math.random().toString(16).slice(2)}`
      if (api.previewAssistantAction && this.data.sessionId) {
        const preview = await api.previewAssistantAction(this.data.sessionId, 'SAVE_CALENDAR', this.data.plan.version || 1)
        if (!preview || preview.success === false) throw new Error('方案已更新')
        previewToken = preview.action && preview.action.preview_token || ''
        // Use the server-confirmed snapshot for writes so a stale client
        // cannot save dishes from an older plan revision.
        if (preview.plan && Array.isArray(preview.plan.meals)) {
          plan = preview.plan
          if (!this.getPlanDishesFrom(plan).length) throw new Error('方案中没有可保存的菜品')
        }
      }
      // New Java action service path.  Keep the legacy per-meal path below
      // for older deployments and test doubles that do not return a token.
      if (previewToken && api.confirmAssistantAction) {
        const confirmed = await api.confirmAssistantAction(this.data.sessionId, {
          actionType: 'SAVE_CALENDAR', planVersion: plan.version || 1,
          previewToken, idempotencyKey: confirmationKey,
        })
        if (!confirmed || confirmed.success === false) throw new Error('确认失败')
        if (confirmed.executed === true) {
          wx.showToast({ title: confirmed.retained_count ? `已保存${confirmed.saved_count || 0}项，保留${confirmed.retained_count}项` : '已保存到日历', icon: 'success' })
          return
        }
      }
      const meals = (plan.meals || []).filter(item => (item.dishes || []).length)
      const conflicts = []
      // This read is only a user-facing diff. The write below still carries
      // preserveExisting and is protected by the server-side unique key.
      if (api.getRecipeRecordsByDate) {
        const recordsByDate = {}
        for (const meal of meals) {
          if (recordsByDate[meal.date] !== undefined) continue
          try {
            const records = await api.getRecipeRecordsByDate(meal.date)
            recordsByDate[meal.date] = Array.isArray(records) ? records : []
          } catch (error) {
            recordsByDate[meal.date] = null
          }
        }
        for (const meal of meals) {
          const records = recordsByDate[meal.date]
          const existing = records && records.find(item => item.mealType === meal.meal_type)
          if (existing) conflicts.push({ meal, existing })
        }
      }
      if (conflicts.length) {
        const labels = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }
        const summary = conflicts.map(item => `${item.meal.date} ${labels[item.meal.meal_type] || item.meal.meal_type}已有“${item.existing.recipeName || item.existing.dishNames || '一份记录'}”`).join('\n')
        const conflictModal = await new Promise(resolve => wx.showModal({
          title: '日历已有安排',
          content: `${summary}\n继续保存时将保留已有记录，不会覆盖。`,
          confirmText: '继续保存',
          cancelText: '取消',
          success: resolve,
          fail: () => resolve({ confirm: false }),
        }))
        if (!conflictModal.confirm) return
      }
      let savedCount = 0
      let conflictCount = 0
      for (const meal of meals) {
        try {
          await api.saveRecipeRecord({ recordDate: meal.date, recordDateString: meal.date, mealType: meal.meal_type, recipeName: meal.dishes.map(dish => dish.name).join('、'), dishIds: meal.dishes.map(dish => dish.id).filter(Boolean), isManual: 0, preserveExisting: true })
          savedCount += 1
        } catch (error) {
          const status = Number(error && (error.statusCode || error.status))
          if (status === 409 || (error && error.data && error.data.error === 'RECIPE_RECORD_EXISTS')) conflictCount += 1
          else throw error
        }
      }
      if (savedCount && conflictCount) wx.showToast({ title: `已保存${savedCount}项，保留${conflictCount}项`, icon: 'success' })
      else if (savedCount) wx.showToast({ title: '已保存到日历', icon: 'success' })
      else wx.showToast({ title: '已有日历记录，未覆盖', icon: 'none' })
    } catch (error) { wx.showToast({ title: '保存失败，请重试', icon: 'none' }) } finally { this.setData({ pendingAction: '' }) }
  },

  async confirmShoppingList() {
    let dishes = this.getPlanDishes(); let dishIds = dishes.map(dish => dish.id).filter(Boolean)
    let targetPeople = (this.data.plan.period && this.data.plan.period.people) || 2
    if (!dishIds.length) return wx.showToast({ title: '还没有可加入的菜品', icon: 'none' })
    const modal = await new Promise(resolve => wx.showModal({ title: '加入购物清单', content: '会按每道菜列出所需食材，确认继续吗？', success: resolve }))
    if (!modal.confirm || this.data.pendingAction) return
    this.setData({ pendingAction: 'ADD_SHOPPING_LIST' })
    try {
      if (api.previewAssistantAction && this.data.sessionId) {
        const preview = await api.previewAssistantAction(this.data.sessionId, 'ADD_SHOPPING_LIST', this.data.plan.version || 1)
        if (!preview || preview.success === false) throw new Error('方案已更新')
        // The preview is the server's version check. Prefer its snapshot when
        // supplied so a stale client cannot open shopping with old dishes.
        const verifiedPlan = preview.plan
        if (verifiedPlan && Array.isArray(verifiedPlan.meals)) {
          dishes = (verifiedPlan.meals || []).flatMap(meal => (meal.dishes || []).map(dish => ({ ...dish, date: meal.date, mealType: meal.meal_type })))
          dishIds = dishes.map(dish => dish.id).filter(Boolean)
          targetPeople = (verifiedPlan.period && verifiedPlan.period.people) || targetPeople
          if (!dishIds.length) throw new Error('方案中没有可加入的菜品')
        }
      }
      beginShoppingSelection({ dishIds, targetPeople, source: 'assistant', dishes })
      wx.navigateTo({ url: '/pages/shopping-preview/shopping-preview' })
    } catch (error) {
      wx.showToast({ title: '方案已更新，请重新确认', icon: 'none' })
    } finally { this.setData({ pendingAction: '' }) }
  },

  async onClearSession() {
    const result = await new Promise(resolve => wx.showModal({ title: '清空本次安排', content: '会删除当前助手会话和方案，确定继续吗？', success: resolve }))
    if (!result.confirm) return
    // Invalidate an in-flight reply before deleting the session so a late
    // response cannot resurrect the just-cleared plan.
    this._requestVersion += 1
    this._contextVersion += 1
    this.stopStageAnimation()
    try {
      if (this.data.sessionId) await api.deleteAssistantSession(this.data.sessionId)
    } catch (error) {
      wx.showToast({ title: '清空失败，内容已保留', icon: 'none' })
      return
    }
    wx.removeStorageSync(this.sessionKey)
    this.setData({ sessionId: '', messages: [], plan: null, howto: null, alternatives: [], canUndo: false, task: null, actions: [], errorMessage: '' })
    this.showWelcome(); this.initializeSession()
  },

  onBack() { wx.switchTab({ url: '/pages/index/index' }) },
  onUnload() { this.stopStageAnimation(); this._requestVersion += 1 },
  onShareAppMessage() { return { title: '一起把今天这一餐安排好', path: '/pages/chat/chat' } },
})
