const { getRecipeRecordsByDate, saveRecipeRecord, deleteRecipeRecordByDateAndMeal } = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')

Page({
  data: {
    selectedDate: '',
    dateDisplay: '',
    meals: {
      breakfast: null,
      lunch: null,
      dinner: null
    }
  },

  _loading: false, // 防重复请求标记

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

  onLoad(options) {
    if (options.date) {
      this.setData({
        selectedDate: options.date,
        dateDisplay: this.formatDateDisplay(options.date)
      })
    }
  },

  onShow() {
    if (this.data.selectedDate) {
      this.loadMealRecords()
    }
  },

  // 格式化日期显示
  formatDateDisplay(dateStr) {
    const date = new Date(dateStr)
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
    const weekDay = weekDays[date.getDay()]

    return `${year}年${month}月${day}日 ${weekDay}`
  },

  // 格式化时间
  formatTime(dateStr) {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${hours}:${minutes}`
  },

  // 加载餐次记录
  async loadMealRecords() {
    try {
      const records = await getRecipeRecordsByDate(this.data.selectedDate)
      const recList = Array.isArray(records) ? records : (records && records.list ? records.list : [])
      const meals = {
        breakfast: null,
        lunch: null,
        dinner: null
      }

      // 将API返回的记录按餐次类型分组
      recList.forEach(record => {
        if (record.mealType && meals.hasOwnProperty(record.mealType)) {
          meals[record.mealType] = {
            id: record.id,
            name: record.recipeName,
            dishNames: record.dishNames || '',
            dishDetails: record.dishDetails || [],  // 菜品详情列表
            manual: record.isManual === 1,
            createdAt: record.createTime,
            createTimeFormatted: this.formatTime(record.createTime)
          }
        }
      })

      this.setData({ meals })
    } catch (error) {
      console.error('加载餐次记录失败:', error)
      // 如果API调用失败，回退到本地存储（按用户隔离）
      const recordsKey = getUserStorageKey('recipeRecords')
      const records = wx.getStorageSync(recordsKey) || {}
      const dateRecords = records[this.data.selectedDate] || {}

      this.setData({
        meals: {
          breakfast: dateRecords.breakfast || null,
          lunch: dateRecords.lunch || null,
          dinner: dateRecords.dinner || null
        }
      })
    }
  },

  // 选择餐次
  onSelectMeal(e) {
    const mealType = e.currentTarget.dataset.meal
    wx.showActionSheet({
      itemList: ['从首页推荐选择', '手动输入'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 从首页推荐选择 - 存储待保存信息并跳转到首页
          const pendingRecord = {
            mealType: mealType,
            date: this.data.selectedDate,
            dishCount: 0 // 会在result页面更新
          }
          const pendingKey = getUserStorageKey('pendingRecipeRecord')
          wx.setStorageSync(pendingKey, pendingRecord)

          wx.switchTab({
            url: '/pages/index/index',
            success: () => {
              wx.showToast({
                title: `请先选择${this.getMealName(mealType)}菜谱`,
                icon: 'none',
                duration: 2000
              })
            }
          })
        } else if (res.tapIndex === 1) {
          // 手动输入
          this.manualInputMeal(mealType)
        }
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

  // 手动输入餐次
  manualInputMeal(mealType) {
    wx.showModal({
      title: `添加${this.getMealName(mealType)}`,
      placeholderText: '请输入菜谱名称',
      editable: true,
      success: (res) => {
        if (res.confirm && res.content.trim()) {
          this.saveMealRecord(mealType, {
            name: res.content.trim(),
            manual: true,
            createdAt: new Date().toISOString()
          })
        }
      }
    })
  },

  // 保存餐次记录
  async saveMealRecord(mealType, record) {
    try {
      const recipeRecord = {
        userId: this.getCurrentUserId(), // 从session获取用户ID
        recordDate: this.data.selectedDate, // 使用字符串格式 YYYY-MM-DD
        recordDateString: this.data.selectedDate, // 同时发送字符串格式，确保后端能正确转换
        mealType: mealType,
        recipeName: record.name,
        dishIds: record.dishes ? record.dishes.map(dish => dish.id) : [],
        isManual: record.manual ? 1 : 0
      }

      await saveRecipeRecord(recipeRecord)

      // 重新加载记录以获取完整的记录信息（包括ID）
      await this.loadMealRecords()

      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      // 更新日历页面的记录标记
      this.updateCalendarRecords()
    } catch (error) {
      console.error('保存餐次记录失败:', error)
      // 如果API调用失败，回退到本地存储（按用户隔离）
      const recordsKey = getUserStorageKey('recipeRecords')
      const records = wx.getStorageSync(recordsKey) || {}
      
      if (!records[this.data.selectedDate]) {
        records[this.data.selectedDate] = {}
      }
      
      // 格式与后端保持一致，便于后续同步
      records[this.data.selectedDate][mealType] = {
        id: Date.now(), // 使用时间戳作为临时ID
        name: record.name,
        dishes: record.dishes || [],
        manual: record.manual || false,
        createdAt: new Date().toISOString(),
        synced: false // 标记为未同步
      }
      
      wx.setStorageSync(recordsKey, records)

      this.setData({
        [`meals.${mealType}`]: records[this.data.selectedDate][mealType]
      })

      wx.showToast({
        title: '保存成功（离线模式）',
        icon: 'success'
      })

      this.updateCalendarRecords()
    }
  },

  // 更新日历页面的记录标记
  updateCalendarRecords() {
    const pages = getCurrentPages()
    const calendarPage = pages.find(page => page.route === 'pages/calendar/calendar')
    if (calendarPage) {
      calendarPage.loadRecipeRecords()
    }
  },

  // 删除餐次记录
  onDeleteMeal(e) {
    const mealType = e.currentTarget.dataset.meal
    wx.showModal({
      title: '确认删除',
      content: `确定要删除${this.getMealName(mealType)}记录吗？`,
      success: (res) => {
        if (res.confirm) {
          this.deleteMealRecord(mealType)
        }
      }
    })
  },

  // 删除餐次记录
  async deleteMealRecord(mealType) {
    try {
      await deleteRecipeRecordByDateAndMeal(this.data.selectedDate, mealType)

      // 更新页面数据
      this.setData({
        [`meals.${mealType}`]: null
      })

      wx.showToast({
        title: '删除成功',
        icon: 'success'
      })

      // 更新日历页面的记录标记
      this.updateCalendarRecords()
    } catch (error) {
      console.error('删除餐次记录失败:', error)
      // 如果API调用失败，回退到本地存储（按用户隔离）
      const recordsKey = getUserStorageKey('recipeRecords')
      const records = wx.getStorageSync(recordsKey) || {}
      if (records[this.data.selectedDate]) {
        delete records[this.data.selectedDate][mealType]
        // 如果该日期没有记录了，删除整个日期
        if (Object.keys(records[this.data.selectedDate]).length === 0) {
          delete records[this.data.selectedDate]
        }
        wx.setStorageSync(recordsKey, records)
      }

      this.setData({
        [`meals.${mealType}`]: null
      })

      wx.showToast({
        title: '删除成功（离线模式）',
        icon: 'success'
      })

      this.updateCalendarRecords()
    }
  },

  // 查看菜谱详情
  onViewMealDetail(e) {
    const meal = e.currentTarget.dataset.meal
    if (!meal) return

    // 使用自定义弹窗显示菜品列表
    this.setData({
      showDetailModal: true,
      modalMeal: meal
    })
  },

  // 查看菜品详情（跳转到详情页）
  onViewDish(e) {
    const dish = e.currentTarget.dataset.dish
    if (!dish || !dish.id) return

    wx.navigateTo({
      url: `/pages/dish-detail/dish-detail?id=${dish.id}`
    })
  },

  // 关闭详情弹窗
  onCloseModal() {
    this.setData({
      showDetailModal: false,
      modalMeal: null,
      modalContent: ''
    })
  }
})
