const { recommendPlans, getAllDishes } = require('../../utils/recommend')
const { saveRecipeRecord, getRecipeRecordsByDate, batchCheckFavoriteDishes, addFavoriteDish, removeFavoriteDish } = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')

Page({
  data: {
    loading: true,
    empty: false,
    plans: [],
    params: null
  },

  // 不在 data 中存储 allDishes，避免 setData 传输大量数据
  allDishes: [],

  onLoad(query) {
    const params = query && query.params ? JSON.parse(decodeURIComponent(query.params)) : null
    this.setData({ params })
    this.generatePlans()

    // 检查是否有待保存的菜谱记录（从日历页面跳转回来时）
    this.checkPendingRecipeRecord()
  },

  onShow() {
    // 检查是否有从日历页面选择返回的日期
    this.checkSelectedDateFromCalendar()
  },

  async generatePlans() {
    wx.vibrateShort({ type: 'light' })

    console.log('🚀 开始生成推荐方案，参数:', this.data.params)

    // 优先检查全局缓存，如果存在则立即使用缓存生成推荐（秒开效果）
    const app = getApp()
    const hasCache = app && app.globalData && app.globalData.allDishes && app.globalData.allDishes.length > 0

    if (hasCache) {
      console.log('📦 使用缓存数据快速生成推荐')
      this.setData({ loading: false, empty: false })

      // 立即使用缓存数据生成推荐（不等待后端）
      const { recommendPlans } = require('../../utils/recommend')
      const plans = await recommendPlans(this.data.params, app.globalData.allDishes)
      console.log('✅ 本地推荐方案（缓存）:', plans)

      if (plans && plans.length > 0) {
        this.setData({ plans, loading: false })
        this.checkFavoriteStatus()

        // 后台异步调用后端推荐，成功后更新（静默刷新）
        this._tryBackendRecommendationSilently()
        return
      }
    }

    // 无缓存，显示loading并执行完整流程
    this.setData({ loading: true, empty: false })

    try {
      // 第一步：优先调用后端直出推荐接口（最快路径）
      const api = require('../../utils/api')
      const result = await api.getRecommendations(this.data.params)
      console.log('✅ 后端推荐结果:', result)

      if (result && result.success && result.plans && result.plans.length > 0) {
        // 后端返回的是 {dishes: [...]} 结构，转换为前端兼容格式
        // 同时应用后端返回的 favoriteIds，无需二次网络请求
        const favoriteSet = new Set(result.favoriteIds || []);
        const plans = result.plans.map(plan => ({
          dishes: (plan.dishes || []).map(dish => ({
            id: dish.id,
            name: dish.name,
            type: dish.type,
            tags: typeof dish.tags === 'string' && dish.tags
              ? dish.tags.split(',').map(t => t.trim()).filter(Boolean)
              : (dish.tags || []),
            image: dish.image || '',
            ingredientsAmounts: dish.ingredientsAmounts || '',
            step: dish.step || '',
            isFavorite: favoriteSet.has(dish.id)
          }))
        }))

        console.log('🎯 后端推荐方案:', plans.length, '套')
        this.setData({ plans, loading: false })
        return
      }
    } catch (e) {
      console.log('⚠️ 后端推荐失败，降级到本地算法:', e)
    }

    // 第二步：降级到本地推荐算法
    try {
      // 先尝试从全局缓存或本地存储获取菜品
      let allDishes = null
      const app = getApp()
      if (app && app.globalData && app.globalData.allDishes) {
        allDishes = app.globalData.allDishes
        console.log('📦 使用全局缓存菜品:', allDishes.length, '条')
      } else {
        const cached = wx.getStorageSync('cachedAllDishes')
        if (cached && cached.length > 0) {
          allDishes = cached
          console.log('📦 使用本地存储菜品:', allDishes.length, '条')
        }
      }

      const { recommendPlans } = require('../../utils/recommend')
      const plans = await recommendPlans(this.data.params, allDishes)
      console.log('✅ 本地推荐方案:', plans)

      if (!plans || plans.length === 0) {
        console.log('⚠️ 无可用推荐方案')
        this.setData({ loading: false, empty: true })
        return
      }

      // 如果之前没缓存，补充获取完整菜品池用于刷新单个菜品
      if (!this.allDishes || this.allDishes.length === 0) {
        if (allDishes) {
          this.allDishes = allDishes
        } else {
          this.allDishes = await getAllDishes()
        }
      }

      this.setData({ plans, loading: false })
      this.checkFavoriteStatus()
    } catch (e) {
      console.error('❌ 生成推荐方案失败:', e)
      this.setData({ loading: false, empty: true })
    }
  },

  // 后台静默调用后端推荐，成功后更新方案（不阻塞用户）
  async _tryBackendRecommendationSilently() {
    try {
      const api = require('../../utils/api')
      const result = await api.getRecommendations(this.data.params)

      if (result && result.success && result.plans && result.plans.length > 0) {
        const favoriteSet = new Set(result.favoriteIds || []);
        const plans = result.plans.map(plan => ({
          dishes: (plan.dishes || []).map(dish => ({
            id: dish.id,
            name: dish.name,
            type: dish.type,
            tags: typeof dish.tags === 'string' && dish.tags
              ? dish.tags.split(',').map(t => t.trim()).filter(Boolean)
              : (dish.tags || []),
            image: dish.image || '',
            ingredientsAmounts: dish.ingredientsAmounts || '',
            step: dish.step || '',
            isFavorite: favoriteSet.has(dish.id)
          }))
        }))

        console.log('✅ 后端推荐（后台）更新:', plans.length, '套')
        this.setData({ plans })
      }
    } catch (e) {
      console.log('⚠️ 后端推荐（后台）失败，保持本地推荐:', e)
    }
  },

  // 检查收藏状态
  async checkFavoriteStatus() {
    try {
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

      // 更新本地状态
      const newPlans = [...this.data.plans]
      newPlans[planIndex].dishes[dishIndex].isFavorite = !isFavorite
      this.setData({ plans: newPlans })
    } catch (error) {
      console.error('收藏操作失败:', error)
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  onRegenerate() {
    this.generatePlans()
  },

  onBack() {
    wx.navigateBack()
  },

  onShareAppMessage() {
    const currentPlan = this.data.plans[this.data.current || 0]
    const dishNames = currentPlan && currentPlan.dishes
      ? currentPlan.dishes.map(d => d.name).join('、')
      : ''
    return {
      title: dishNames ? `推荐菜品：${dishNames}` : '今天吃什么？快来看看推荐！',
      path: '/pages/index/index'
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

    // 第一步：优先调用后端接口，从整体2万+数据中随机抽取一道
    try {
      const result = await api.getSingleRecommendation(targetDish.type, excludeIds)
      if (result && result.success && result.dish) {
        const backendDish = result.dish
        if (!usedNamesExceptTarget.has(backendDish.name)) {
          const newDish = {
            id: backendDish.id,
            name: backendDish.name,
            type: backendDish.type,
            tags: typeof backendDish.tags === 'string' && backendDish.tags
              ? backendDish.tags.split(',').map(t => t.trim()).filter(Boolean)
              : (backendDish.tags || []),
            image: backendDish.image || '',
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

      const sameTypePool = pool.filter(d => d.type === targetDish.type)
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
        wx.switchTab({
          url: '/pages/calendar/calendar'
        })
      }
    })
  }
})
