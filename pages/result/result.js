const { saveRecipeRecord, getRecipeRecordsByDate, batchCheckFavoriteDishes, addFavoriteDish, removeFavoriteDish } = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')
const { getAllDishes } = require('../../utils/recommend')
const recommendationFlow = require('../../utils/recommendation-flow')
const { criteriaSummary } = require('../../utils/recommendation-criteria')
const { filterAndRankDishes } = require('../../utils/recommendation-matcher')
const { createPreferenceStore } = require('../../utils/preference-store')

Page(require('../../utils/config').ENABLE_MEAL_WORKSPACE ? require('../../utils/meal-workspace-page')({mode: 'result'}) : {
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(),
    loading: true,
    refreshing: false,
    loadingStage: '',
    generationNotice: '',
    favoriteBusyKey: '',
    empty: false,
    plans: [],
    params: null,
    current: 0,
    warnings: [],
    filterSummary: ''
  },

  // 不在 data 中存储 allDishes，避免 setData 传输大量数据
  allDishes: [],
  generationVersion: 0,
  generationInFlight: false,
  generationTimeoutMs: 8000,
  filteringStageDelayMs: 800,
  fallbackStageDelayMs: 2500,
  generationStageTimers: [],

  onLoad(query) {
    if(query && query.calendarReturn){
      const selected = wx.getStorageSync(getUserStorageKey('selectedDateForRecipe'))
      if(selected && selected.plan){ this._viewScope = getUserStorageKey('resultView'); this._planOwnerScope = getUserStorageKey('mealView'); this.setData({ plans: [selected.plan], loading: false, current: 0, people: 2 }); this.checkSelectedDateFromCalendar(); return }
    }
    const params = query && query.params ? JSON.parse(decodeURIComponent(query.params)) : null
    this.setData({ params, people: Number(params && params.people) || 2 })
    // 等待登录完成再生成推荐
    const app = getApp()
    const doGenerate = () => {
      this.generatePlans()
      this.checkPendingRecipeRecord()
    }
    if (!app.globalData.loginReady) {
      app.waitForLogin().then(doGenerate)
    } else {
      doGenerate()
    }
  },

  onShow() {
    if(this._viewScope && this._viewScope !== getUserStorageKey('resultView')) {
      this._favoriteRequest = null
      this.generationVersion += 1; this.generationInFlight = false; this.allDishes = []; this._pendingPlanWrite = null
      this._selectingPlan = null; this._selectingScope = null
      this.setData({ plans: [], params: null, people: 2, savingPlan: false, saveError: '', showDatePicker: false, favoriteBusyKey: '' }); this.generatePlans()
    }
    // 检查是否有从日历页面选择返回的日期
    this.checkSelectedDateFromCalendar()
  },

  onUnload() {
    this._unloaded = true
    this._favoriteRequest = null
    this.generationVersion += 1
    this.generationInFlight = false
    this.clearGenerationStageTimers()
  },

  async generatePlans() {
    if (this.generationInFlight) {
      wx.showToast({ title: '正在生成新方案', icon: 'none' })
      return false
    }
    wx.vibrateShort({ type: 'light' })
    const hasExistingPlans = Array.isArray(this.data.plans) && this.data.plans.length > 0
    const scope = this._viewScope = getUserStorageKey('resultView')
    this._planOwnerScope = getUserStorageKey('mealView')
    const generationVersion = ++this.generationVersion
    this._favoriteRequest = null
    this.generationInFlight = true
    this.startGenerationStageFeedback(generationVersion)
    this.setData({
      loading: !hasExistingPlans,
      refreshing: hasExistingPlans,
      loadingStage: '先看看你今天想吃什么',
      generationNotice: '',
      favoriteBusyKey: '',
      empty: false,
    })
    let timeoutId
    try {
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error('recommendation generation timed out')
          error.code = 'GENERATION_TIMEOUT'
          reject(error)
        }, this.generationTimeoutMs)
      })
      const result = await Promise.race([
        recommendationFlow.generateRecommendation(this.data.params),
        timeout,
      ])
      if (generationVersion !== this.generationVersion || scope !== getUserStorageKey('resultView')) return false
      const plans = result.plans || []
      if (plans.length === 0) {
        if (hasExistingPlans) {
          this.setData({
            loading: false,
            refreshing: false,
            empty: false,
            generationNotice: '没有更合适的新组合，先保留刚才这套',
            warnings: result.warnings || [],
          })
        } else {
          this.setData({ loading: false, empty: true, plans: [], warnings: result.warnings || [] })
        }
        return false
      }
      this.allDishes = result.dishPool || this.allDishes
      this.setData({
        plans,
        current: 0,
        loading: false,
        refreshing: false,
        empty: false,
        warnings: result.warnings || [],
        generationNotice: this.sourceNotice(result.source),
        filterSummary: criteriaSummary(result.appliedCriteria || (this.data.params || {}).criteria || {}),
      })
      if (result.source !== 'backend') this.checkFavoriteStatus(generationVersion)
      return true
    } catch (error) {
      if (generationVersion !== this.generationVersion || scope !== getUserStorageKey('resultView')) return false
      if (hasExistingPlans) {
        this.setData({
          loading: false,
          refreshing: false,
          empty: false,
          generationNotice: '这次没连上推荐服务，先保留刚才这套',
        })
      } else {
        this.setData({
          loading: false,
          refreshing: false,
          empty: true,
          plans: [],
          warnings: [error && error.code === 'GENERATION_TIMEOUT'
            ? '这次等得有点久，换个条件再试试。'
            : '推荐服务暂时没回应，稍后再试试。'],
        })
      }
      return false
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      if (generationVersion === this.generationVersion && scope === getUserStorageKey('resultView')) {
        this.generationInFlight = false
        this.clearGenerationStageTimers()
        this.setData({ loading: false, refreshing: false, loadingStage: '' })
      }
    }
  },

  startGenerationStageFeedback(generationVersion) {
    this.clearGenerationStageTimers()
    this.generationStageTimers = [
      setTimeout(() => {
        if (generationVersion === this.generationVersion && this.generationInFlight) {
          this.setData({ loadingStage: '正在挑合适的菜' })
        }
      }, this.filteringStageDelayMs),
      setTimeout(() => {
        if (generationVersion === this.generationVersion && this.generationInFlight) {
          this.setData({ loadingStage: '网络慢一点，我先用本地菜谱帮你搭一桌' })
        }
      }, this.fallbackStageDelayMs),
    ]
  },

  clearGenerationStageTimers() {
    const timers = this.generationStageTimers || []
    timers.forEach(timerId => clearTimeout(timerId))
    this.generationStageTimers = []
  },

  sourceNotice(source) {
    if (source === 'cache') return '网络慢了一点，先用已加载的菜谱'
    if (source === 'local') return '先用本地菜谱给你搭了一套'
    return ''
  },

  // 检查收藏状态
  async checkFavoriteStatus(generationVersion = this.generationVersion) {
    const favoriteVersion = this._favoriteVersion || 0, scope = getUserStorageKey('resultView')
    try {
      if (generationVersion !== this.generationVersion || this._unloaded || scope !== getUserStorageKey('resultView')) return
      const { plans } = this.data
      // 收集所有菜品ID
      const allDishIds = []
      plans.forEach(plan => {
        plan.dishes.forEach(dish => {
          if (dish.id) allDishIds.push(dish.id)
        })
      })

      if (allDishIds.length === 0) return

      // 批量检查收藏状态
      const favoriteIds = await batchCheckFavoriteDishes(allDishIds)
      if (generationVersion !== this.generationVersion || favoriteVersion !== (this._favoriteVersion || 0)
        || this._unloaded || scope !== getUserStorageKey('resultView')) return
      const favoriteSet = new Set(favoriteIds)

      // 更新plans中的收藏状态
      const newPlans = plans.map(plan => ({
        ...plan,
        dishes: plan.dishes.map(dish => ({
          ...dish,
          isFavorite: favoriteSet.has(dish.id)
        }))
      }))

      this.setData({ plans: newPlans })
    } catch (error) {
      console.log('检查收藏状态失败:', error)
    }
  },

  // 切换收藏状态
  async onToggleFavorite(e) {
    const { dish, planIndex, dishIndex } = e.currentTarget.dataset
    const plan = this.data.plans[planIndex]
    const target = plan && plan.dishes[dishIndex]
    if (this._unloaded || !dish || !dish.id || !target || target.id !== dish.id) return
    if (this._viewScope && this._viewScope !== getUserStorageKey('resultView')) return
    if (this._favoriteRequest && this._favoriteRequest.current()) return
    const scope = getUserStorageKey('resultView'), generationVersion = this.generationVersion
    const request = { current: () => {
      const row = this.data.plans[planIndex] && this.data.plans[planIndex].dishes[dishIndex]
      return !this._unloaded && scope === getUserStorageKey('resultView') && generationVersion === this.generationVersion
        && this._favoriteRequest === request && row && row.id === dish.id
    } }
    this._favoriteRequest = request
    this._favoriteVersion = (this._favoriteVersion || 0) + 1
    this.setData({ favoriteBusyKey: `${planIndex}:${dishIndex}` })
    try {
      const isFavorite = target.isFavorite
      if (isFavorite) {
        await removeFavoriteDish(dish.id)
      } else {
        await addFavoriteDish(dish.id)
      }
      if (!request.current()) return
      wx.showToast({ title: isFavorite ? '已取消收藏' : '已收藏', icon: 'success' })
      // 更新本地状态（部分更新，避免整体 setData 传大量数据）
      const newPlans = [...this.data.plans]
      newPlans[planIndex] = { ...newPlans[planIndex], dishes: [...newPlans[planIndex].dishes] }
      newPlans[planIndex].dishes[dishIndex] = { ...newPlans[planIndex].dishes[dishIndex], isFavorite: !isFavorite }
      this.setData({ [`plans[${planIndex}]`]: newPlans[planIndex] })
    } catch (error) {
      if (!request.current()) return
      console.error('收藏操作失败:', error)
      wx.showToast({ title: '操作失败', icon: 'none' })
    } finally {
      if (request.current()) this.setData({ favoriteBusyKey: '' })
      if (this._favoriteRequest === request) this._favoriteRequest = null
    }
  },

  onRegenerate() {
    return this.generatePlans()
  },

  onBack() {
    wx.navigateBack()
  },

  onShareAppMessage() {
    const currentPlan = this.data.plans[this.data.current || 0]
    const dishNames = currentPlan && currentPlan.dishes
      ? currentPlan.dishes.map(d => d.name).slice(0, 3).join('、')
      : ''
    return {
      title: dishNames ? `今天这桌：${dishNames}` : '来看看今天适合吃什么',
      path: '/pages/index/index',
      imageUrl: currentPlan && currentPlan.dishes && currentPlan.dishes[0]
        ? currentPlan.dishes[0].image || '' : ''
    }
  },

  onTapDish(e) {
    const dish = e.currentTarget.dataset.dish
    if (!dish || !dish.id) return

    // 跳转到菜品详情页
    wx.navigateTo({
      url: `/pages/dish-detail/dish-detail?id=${dish.id}`
    })
  },

  onImgError(e) {
    const { planIndex, dishIndex } = e.currentTarget.dataset
    if (planIndex === undefined || dishIndex === undefined) return

    this.setData({
      [`plans[${planIndex}].dishes[${dishIndex}].image`]: ''
    })
  },

  // 刷新当前方案中的某一道菜（不刷新整套方案）
  async onRefreshDish(e) {
    const planIndex = e.currentTarget.dataset.planIndex
    const dishIndex = e.currentTarget.dataset.dishIndex
    const { plans } = this.data

    if (!plans || !plans[planIndex] || !plans[planIndex].dishes) return

    const plan = plans[planIndex]
    const dishes = plan.dishes
    const targetDish = dishes[dishIndex]
    if (!targetDish) return
    const scope = getUserStorageKey('resultView'), generationVersion = this.generationVersion
    if (this._unloaded || (this._viewScope && this._viewScope !== scope)) return
    const user = wx.getStorageSync('userInfo') || {}
    // Without a stable user identifier, invalidate local fallback when the token
    // changes even though the user-scoped storage key still says guest.
    const fallbackToken = user.id || user.openId ? null : String(wx.getStorageSync('token') || '')
    const current = () => !this._unloaded && scope === getUserStorageKey('resultView') && generationVersion === this.generationVersion
      && (fallbackToken === null || fallbackToken === String(wx.getStorageSync('token') || ''))
      && this.data.plans[planIndex] === plan && this.data.plans[planIndex].dishes[dishIndex] === targetDish
    const applyReplacement = newDish => {
      if (!current()) return false
      const newDishes = [...plan.dishes]
      newDishes[dishIndex] = { ...newDish }
      const newPlans = [...this.data.plans]
      newPlans[planIndex] = { ...plan, dishes: newDishes }
      this.setData({ plans: newPlans })
      return true
    }

    const params = this.data.params || {}
    const recommendationOptions = {
      criteria: params.criteria || {},
      preferences: createPreferenceStore().readCache(),
      useSavedPreferences: params.useSavedPreferences !== false,
      recentNames: [],
    }

    // 收集所有方案中已出现的菜品ID和菜名（排除当前要替换的那道）
    const excludeIds = []
    const usedNamesExceptTarget = new Set()
    plans.forEach(p => {
      (p.dishes || []).forEach(d => {
        if (d.id) excludeIds.push(d.id)
        if (d.name && d.name !== targetDish.name) usedNamesExceptTarget.add(d.name)
      })
    })

    const api = require('../../utils/api')

    // 第一步：优先调用后端接口，从完整系统菜池中随机抽取一道
    try {
      const result = await api.getSingleRecommendation(targetDish.type, excludeIds)
      if (!current()) return
      if (result && result.success && result.dish) {
        const backendDish = result.dish
        const eligibleBackendDish = filterAndRankDishes([backendDish], recommendationOptions)[0]
        if (eligibleBackendDish && !usedNamesExceptTarget.has(backendDish.name)) {
          const newDish = {
            id: backendDish.id,
            name: backendDish.name,
            type: backendDish.type,
            tags: typeof backendDish.tags === 'string' && backendDish.tags
              ? backendDish.tags.split(',').map(t => t.trim()).filter(Boolean)
              : (backendDish.tags || []),
            image: (backendDish.image || '').replace(/^http:/, 'https:'),
            kcal: backendDish.kcal || null,
            difficulty: backendDish.difficulty || '',
            cookTime: backendDish.cookTime || '',
            cookMinutes: backendDish.cookMinutes || null,
            cuisineCode: backendDish.cuisineCode || '',
            tagCodes: backendDish.tagCodes || '',
            metadataVersion: backendDish.metadataVersion || 1,
            cl: backendDish.cl || '',
            ingredientsAmounts: backendDish.ingredientsAmounts || '',
            step: backendDish.step || '',
            isFavorite: result.isFavorite || false
          }

          applyReplacement(newDish)
          return
        }
      }
    } catch (e) {
      if (!current()) return
      console.log('⚠️ 后端单道推荐失败，降级到本地:', e)
    }

    // 第二步：降级到本地菜品池
    try {
      let pool = this.allDishes
      if (!pool || !pool.length) {
        pool = await getAllDishes()
        if (!current()) return
        this.allDishes = pool
      }

      const sameTypePool = filterAndRankDishes(pool, recommendationOptions)
        .filter(d => d.type === targetDish.type)
      const excludeNames = new Set(dishes.map(d => d.name))
      excludeNames.add(targetDish.name)
      const candidates = sameTypePool.filter(d => !excludeNames.has(d.name))

      if (!candidates.length) {
        wx.showToast({
          title: '没有更多可替换的菜品',
          icon: 'none'
        })
        return
      }

      const newDish = candidates[Math.floor(Math.random() * candidates.length)]

      applyReplacement(newDish)
    } catch (error) {
      if (!current()) return
      console.error('刷新单个菜品失败:', error)
      wx.showToast({
        title: '刷新失败，请稍后重试',
        icon: 'none'
      })
    }
  },

  // 选择此方案
  onPlanChange(e) {
    const current = Number(e.detail.current)
    if (Number.isInteger(current) && current >= 0 && current < this.data.plans.length) {
      this.setData({ current })
    }
  },

  onSelectForMeal() {
    const currentPlan = this.data.plans[this.data.current || 0]
    if (!currentPlan) return

    this.selectDateAndMeal(currentPlan)
  },

  onAddPlanToShoppingList() {
    if (this._viewScope !== getUserStorageKey('resultView')) { this.onShow(); return }
    const currentPlan = this.data.plans[this.data.current || 0]
    if (!currentPlan || !currentPlan.dishes || currentPlan.dishes.length === 0) {
      wx.showToast({ title: '当前没有可加入的菜品', icon: 'none' })
      return
    }
    const { beginShoppingSelection } = require('../../utils/shopping-list')
    const params = this.data.params || {}
    beginShoppingSelection({
      dishIds: currentPlan.dishes.map(dish => dish.id).filter(Boolean),
      targetPeople: Number(this.data.people || params.people || params.targetPeople || 2),
      source: 'result',
      dishes: currentPlan.dishes,
    })
    wx.navigateTo({ url: '/pages/shopping-preview/shopping-preview' })
  },

  // 选择日期和餐次
  selectDateAndMeal(plan) {
    const scope = getUserStorageKey('resultView')
    wx.showActionSheet({
      itemList: ['选择今天', '选择其他日期'],
      success: (res) => {
        if (scope !== getUserStorageKey('resultView')) return
        if (res.tapIndex === 0) {
          const today = this.getBeijingDateString()
          this.selectMealType(plan, today)
        } else if (res.tapIndex === 1) {
          this.selectCustomDate(plan)
        }
      }
    })
  },

  // 选择自定义日期 - 显示日期选择弹窗
  selectCustomDate(plan) {
    this._selectingPlan = plan
    this._selectingScope = getUserStorageKey('resultView')
    this.setData({
      showDatePicker: true,
      customDate: this.getBeijingDateString()
    })
  },

  // 日期选择完成回调
  onCustomDateChange(e) {
    if (this._selectingScope !== getUserStorageKey('resultView')) { this.onCancelDatePicker(); return }
    const selectedDate = e.detail.value
    this.setData({ showDatePicker: false, customDate: selectedDate })
    if (this._selectingPlan) {
      const plan = this._selectingPlan
      this._selectingPlan = null
      this.selectMealType(plan, selectedDate)
    }
  },

  // 取消日期选择
  onCancelDatePicker() {
    this.setData({ showDatePicker: false })
    this._selectingPlan = null
  },

  // 选择餐次类型
  selectMealType(plan, selectedDate) {
    const scope = getUserStorageKey('resultView')
    wx.showActionSheet({
      itemList: ['早餐', '午餐', '晚餐'],
      success: (res) => {
        if (scope !== getUserStorageKey('resultView')) return
        const mealTypes = ['breakfast', 'lunch', 'dinner']
        const selectedMealType = mealTypes[res.tapIndex]
        this.saveRecipeToCalendar(selectedMealType, plan, selectedDate)
      }
    })
  },

  // 获取餐次名称
  getMealName(mealType) {
    const names = {
      breakfast: '早餐',
      lunch: '午餐',
      dinner: '晚餐'
    }
    return names[mealType] || mealType
  },

  // 获取当前用户ID（移除硬编码回退值）
  getCurrentUserId() {
    try {
      const userInfo = wx.getStorageSync('userInfo') || {}
      if (!userInfo.id) {
        console.error('错误：用户未登录，userInfo.id 不存在')
        throw new Error('用户未登录')
      }
      return userInfo.id
    } catch (e) {
      console.error('获取用户ID失败:', e)
      throw new Error('用户认证失败')
    }
  },

  // 获取北京时间日期字符串（始终按 UTC+8 计算，不受设备时区影响）
  getBeijingDateString(date = new Date()) {
    // date.getTime() 返回 UTC 时间戳，加上 8 小时得到北京时间时间戳
    const beijingTimestamp = date.getTime() + (8 * 3600000)
    const beijingDate = new Date(beijingTimestamp)
    const y = beijingDate.getUTCFullYear()
    const m = String(beijingDate.getUTCMonth() + 1).padStart(2, '0')
    const d = String(beijingDate.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  },

  // 保存菜谱到日历
  async saveRecipeToCalendar(mealType, plan, targetDate = null) {
    if (this.data.savingPlan) return
    if(this._viewScope !== getUserStorageKey('resultView')) { this.onShow(); return }
    const flow = require('../../utils/meal-workflow'), scope = getUserStorageKey('mealView'), date = targetDate || flow.today()
    const pending = wx.getStorageSync(getUserStorageKey('pendingRecipeRecord'))
    this.setData({ savingPlan: true, saveError: '' })
    try {
      const saved = await require('../../utils/plan-save').savePlan(this, date, mealType, { recipeName: (plan.dishes || []).map(dish => dish.name).join('、'), dishIds: (plan.dishes || []).map(dish => Number(dish.id)).filter(Boolean), isManual: 0, targetPeople: Number(this.data.people) || 2 }, pending && pending.date === date && pending.mealType === mealType ? pending.expectedRevision : undefined)
      if (!saved || scope !== getUserStorageKey('mealView')) return
      if (targetDate) wx.removeStorageSync(getUserStorageKey('pendingRecipeRecord'))
      this.showSuccessAndNavigate(date, mealType)
    } catch (error) { if (scope === getUserStorageKey('mealView')) this.setData({ saveError: flow.errorMessage(error, '保存失败，方案已保留。请重新确认保存。') }) }
    finally { if (scope === getUserStorageKey('mealView')) this.setData({ savingPlan: false }) }
  },

  // 检查是否有待保存的菜谱记录（按用户隔离）
  checkPendingRecipeRecord() {
    const pendingKey = getUserStorageKey('pendingRecipeRecord')
    const pendingRecord = wx.getStorageSync(pendingKey)
    if (pendingRecord) {
      wx.showModal({
        title: '发现待保存记录',
        content: `是否将刚才的推荐保存为${this.getMealName(pendingRecord.mealType)}？`,
        success: async (res) => {
          if (pendingKey !== getUserStorageKey('pendingRecipeRecord')) return
          if (res.confirm) {
            // 直接保存当前显示的方案（第一个方案）
            const currentPlan = this.data.plans[this.data.current || 0]
            if (currentPlan) {
              await this.saveRecipeToCalendar(pendingRecord.mealType, currentPlan, pendingRecord.date)
            }
          }
        }
      })
    }
  },

  // 检查从日历页面选择返回的日期（按用户隔离）
  checkSelectedDateFromCalendar() {
    const selectedKey = getUserStorageKey('selectedDateForRecipe')
    const selectedData = wx.getStorageSync(selectedKey)
    if (selectedData) {
      wx.removeStorageSync(selectedKey)
      // 直接进入餐次选择
      this.selectMealType(selectedData.plan, selectedData.date)
    }
  },

  // 显示成功提示并导航
  showSuccessAndNavigate(dateToSave, mealType) {
    const scope = getUserStorageKey('mealView')
    const todayStr = this.getBeijingDateString()
    const dateDisplay = dateToSave === todayStr ? '今天' : dateToSave
    const mealName = this.getMealName(mealType)

    wx.showModal({
      title: '保存成功',
      content: `菜谱已保存到${dateDisplay}的${mealName}`,
      showCancel: false,
      success: () => {
        if (scope !== getUserStorageKey('mealView')) return
        // 通知日历页和统计页需要刷新数据
        const { getUserStorageKey } = require('../../utils/util')
        wx.setStorageSync(getUserStorageKey('needRefreshCalendar'), Date.now())
        wx.setStorageSync(getUserStorageKey('needRefreshStats'), Date.now())
        wx.switchTab({
          url: '/pages/calendar/calendar'
        })
      }
    })
  }
})
