const { saveRecipeRecord, getRecipeRecordsByDate, batchCheckFavoriteDishes, addFavoriteDish, removeFavoriteDish } = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')
const { getAllDishes } = require('../../utils/recommend')
const recommendationFlow = require('../../utils/recommendation-flow')
const { criteriaSummary } = require('../../utils/recommendation-criteria')
const { filterAndRankDishes } = require('../../utils/recommendation-matcher')
const { createPreferenceStore } = require('../../utils/preference-store')

Page({
  data: {
    loading: true,
    refreshing: false,
    loadingStage: '',
    generationNotice: '',
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
    const params = query && query.params ? JSON.parse(decodeURIComponent(query.params)) : null
    this.setData({ params })
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
    // 检查是否有从日历页面选择返回的日期
    this.checkSelectedDateFromCalendar()
  },

  onUnload() {
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
    const generationVersion = ++this.generationVersion
    this.generationInFlight = true
    this.startGenerationStageFeedback(generationVersion)
    this.setData({
      loading: !hasExistingPlans,
      refreshing: hasExistingPlans,
      loadingStage: '正在分析你的偏好',
      generationNotice: '',
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
      if (generationVersion !== this.generationVersion) return false
      const plans = result.plans || []
      if (plans.length === 0) {
        if (hasExistingPlans) {
          this.setData({
            loading: false,
            refreshing: false,
            empty: false,
            generationNotice: '没有找到新方案，仍显示上次方案',
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
      if (generationVersion !== this.generationVersion) return false
      if (hasExistingPlans) {
        this.setData({
          loading: false,
          refreshing: false,
          empty: false,
          generationNotice: '生成失败，仍显示上次方案',
        })
      } else {
        this.setData({
          loading: false,
          refreshing: false,
          empty: true,
          plans: [],
          warnings: [error && error.code === 'GENERATION_TIMEOUT'
            ? '生成推荐超时，请重试。'
            : '推荐服务暂时不可用，请稍后重试。'],
        })
      }
      return false
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      if (generationVersion === this.generationVersion) {
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
          this.setData({ loadingStage: '正在筛选合适的菜品' })
        }
      }, this.filteringStageDelayMs),
      setTimeout(() => {
        if (generationVersion === this.generationVersion && this.generationInFlight) {
          this.setData({ loadingStage: '网络较慢，正在准备本地方案' })
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
    if (source === 'cache') return '网络较慢，已使用缓存菜品生成'
    if (source === 'local') return '已使用本地菜品生成'
    return ''
  },

  // 检查收藏状态
  async checkFavoriteStatus(generationVersion = this.generationVersion) {
    try {
      if (generationVersion !== this.generationVersion) return
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
      if (generationVersion !== this.generationVersion) return
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
    if (!dish || !dish.id) return

    try {
      const isFavorite = dish.isFavorite
      if (isFavorite) {
        await removeFavoriteDish(dish.id)
        wx.showToast({ title: '已取消收藏', icon: 'success' })
      } else {
        await addFavoriteDish(dish.id)
        wx.showToast({ title: '已收藏', icon: 'success' })
      }

      // 更新本地状态（部分更新，避免整体 setData 传大量数据）
      const newPlans = [...this.data.plans]
      newPlans[planIndex] = { ...newPlans[planIndex], dishes: [...newPlans[planIndex].dishes] }
      newPlans[planIndex].dishes[dishIndex] = { ...newPlans[planIndex].dishes[dishIndex], isFavorite: !isFavorite }
      this.setData({ [`plans[${planIndex}]`]: newPlans[planIndex] })
    } catch (error) {
      console.error('收藏操作失败:', error)
      wx.showToast({ title: '操作失败', icon: 'none' })
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
      title: dishNames ? `今天吃：${dishNames}` : '吃什么？智能推荐，告别选择困难！',
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

          const newPlans = [...plans]
          const newDishes = [...dishes]
          newDishes[dishIndex] = newDish
          newPlans[planIndex] = { ...plan, dishes: newDishes }
          this.setData({ plans: newPlans })
          return
        }
      }
    } catch (e) {
      console.log('⚠️ 后端单道推荐失败，降级到本地:', e)
    }

    // 第二步：降级到本地菜品池
    try {
      let pool = this.allDishes
      if (!pool || !pool.length) {
        pool = await getAllDishes()
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

      const newPlans = [...plans]
      const newDishes = [...dishes]
      newDishes[dishIndex] = newDish
      newPlans[planIndex] = { ...plan, dishes: newDishes }

      this.setData({ plans: newPlans })
    } catch (error) {
      console.error('刷新单个菜品失败:', error)
      wx.showToast({
        title: '刷新失败，请稍后重试',
        icon: 'none'
      })
    }
  },

  // 选择此方案
  onSelectForMeal() {
    const currentPlan = this.data.plans[this.data.current || 0]
    if (!currentPlan) return

    this.selectDateAndMeal(currentPlan)
  },

  // 选择日期和餐次
  selectDateAndMeal(plan) {
    wx.showActionSheet({
      itemList: ['选择今天', '选择其他日期'],
      success: (res) => {
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
    this.setData({
      showDatePicker: true,
      customDate: this.getBeijingDateString()
    })
  },

  // 日期选择完成回调
  onCustomDateChange(e) {
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
    wx.showActionSheet({
      itemList: ['早餐', '午餐', '晚餐'],
      success: (res) => {
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
    const now = new Date()
    const todayStr = this.getBeijingDateString(now)
    const dateToSave = targetDate || todayStr

    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    // 先检查该时段是否已有记录
    try {
      const existingRecords = await getRecipeRecordsByDate(dateToSave)
      const records = Array.isArray(existingRecords) ? existingRecords : []
      const existingRecord = records.find(r => r.mealType === mealType)

      if (existingRecord) {
        const mealName = this.getMealName(mealType)
        const dateDisplay = dateToSave === todayStr ? '今天' : dateToSave
        const confirmRes = await new Promise((resolve) => {
          wx.showModal({
            title: '该时段已有菜谱',
            content: `${dateDisplay}的${mealName}已有记录，是否覆盖？`,
            confirmText: '覆盖',
            cancelText: '取消',
            confirmColor: '#ff4d4f',
            success: resolve,
            fail: () => resolve({ confirm: false })
          })
        })

        if (!confirmRes.confirm) {
          return
        }
      }
    } catch (err) {
      console.log('检查已有记录失败:', err)
    }

    try {
      const dishIds = plan.dishes
        ? plan.dishes
            .map(dish => dish && dish.id ? Number(dish.id) : null)
            .filter(id => id !== null && !isNaN(id))
        : []

      const dishDetails = plan.dishes
        ? plan.dishes
            .filter(dish => dish && dish.id)
            .map(dish => ({
              id: dish.id,
              name: dish.name,
              type: dish.type,
              ingredientsAmounts: dish.ingredientsAmounts || '',
              step: dish.step || ''
            }))
        : []

      // 只发送 recordDateString，不发送 recordDate
      // 避免后端 Jackson 反序列化 recordDate 时因时区转换导致日期偏移
      const recipeRecord = {
        userId: this.getCurrentUserId(),
        recordDateString: dateToSave,
        mealType: mealType,
        recipeName: `推荐菜谱${timeStr}`,
        dishIds: dishIds,
        dishDetails: dishDetails,
        isManual: 0
      }

      await saveRecipeRecord(recipeRecord)

      // 如果是待保存记录，清除待保存标记（按用户隔离）
      if (targetDate) {
        const pendingKey = getUserStorageKey('pendingRecipeRecord')
        wx.removeStorageSync(pendingKey)
      }

      this.showSuccessAndNavigate(dateToSave, mealType)
    } catch (error) {
      console.error('保存到后端失败:', error)

      // 尝试显示后端返回的具体错误信息
      let errorMessage = '保存失败，请重试'
      if (error.data) {
        if (error.data.error) {
          errorMessage = error.data.error
          if (error.data.message) {
            errorMessage += ': ' + error.data.message
          }
        } else if (error.data.message) {
          errorMessage = error.data.message
        }
      }

      wx.showToast({
        title: errorMessage,
        icon: 'none',
        duration: 3000
      })

      // 如果API调用失败，回退到本地存储
      this.saveToLocalStorage(mealType, plan, dateToSave, targetDate)
    }
  },

  // 检查是否有待保存的菜谱记录（按用户隔离）
  checkPendingRecipeRecord() {
    const pendingKey = getUserStorageKey('pendingRecipeRecord')
    const pendingRecord = wx.getStorageSync(pendingKey)
    if (pendingRecord) {
      wx.removeStorageSync(pendingKey)
      wx.showModal({
        title: '发现待保存记录',
        content: `是否将刚才的推荐保存为${this.getMealName(pendingRecord.mealType)}？`,
        success: async (res) => {
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

  // 本地存储回退方法
  saveToLocalStorage(mealType, plan, dateToSave, targetDate) {
    const now = new Date()
    const recipeRecord = {
      name: `推荐菜谱${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`,
      dishes: plan.dishes,
      mealType: mealType,
      createdAt: now.toISOString(),
      date: dateToSave
    }

    // 获取现有记录（按用户隔离）
    const recordsKey = getUserStorageKey('recipeRecords')
    const records = wx.getStorageSync(recordsKey) || {}
    if (!records[dateToSave]) {
      records[dateToSave] = {}
    }

    // 检查是否已有该餐次的记录
    if (records[dateToSave][mealType]) {
      const todayStr = this.getBeijingDateString(now)
      wx.showModal({
        title: '该时段已有菜谱',
        content: `${dateToSave === todayStr ? '今天' : dateToSave}的${this.getMealName(mealType)}已有记录，是否覆盖？`,
        confirmText: '覆盖',
        cancelText: '取消',
        confirmColor: '#ff4d4f',
        success: (res) => {
          if (res.confirm) {
            records[dateToSave][mealType] = recipeRecord
            wx.setStorageSync(recordsKey, records)
            if (targetDate) {
              const pendingKey = getUserStorageKey('pendingRecipeRecord')
              wx.removeStorageSync(pendingKey)
            }
            this.showSuccessAndNavigate(dateToSave, mealType)
          }
        }
      })
    } else {
      records[dateToSave][mealType] = recipeRecord
      wx.setStorageSync(recordsKey, records)
      if (targetDate) {
        const pendingKey = getUserStorageKey('pendingRecipeRecord')
        wx.removeStorageSync(pendingKey)
      }
      this.showSuccessAndNavigate(dateToSave, mealType)
    }
  },

  // 显示成功提示并导航
  showSuccessAndNavigate(dateToSave, mealType) {
    const todayStr = this.getBeijingDateString()
    const dateDisplay = dateToSave === todayStr ? '今天' : dateToSave
    const mealName = this.getMealName(mealType)

    wx.showModal({
      title: '保存成功',
      content: `菜谱已保存到${dateDisplay}的${mealName}`,
      showCancel: false,
      success: () => {
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
