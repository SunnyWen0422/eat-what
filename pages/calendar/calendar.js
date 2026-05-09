const { getRecipeRecordDates } = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')

Page({
  data: {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    selectedDate: '',
    calendarDays: [],
    today: '',
    hasRecords: {}, // 存储有记录的日期
    selectMode: false // 是否为选择日期模式
  },

  onLoad(options) {
    if (options && options.selectMode === 'true') {
      this.setData({ selectMode: true })
    }
    this.initCalendar()
    this.loadRecipeRecords()
  },

  onShow() {
    this.loadRecipeRecords()
  },

  // 初始化日历
  initCalendar() {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    this.setData({ today })
    this.generateCalendarDays()
  },

  // 生成日历天数
  generateCalendarDays() {
    const { currentYear, currentMonth } = this.data
    const firstDay = new Date(currentYear, currentMonth - 1, 1)
    const lastDay = new Date(currentYear, currentMonth, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const calendarDays = []

    // 添加上个月的日期
    const prevMonthDate = new Date(currentYear, currentMonth - 1, 0)
    const prevMonthDays = prevMonthDate.getDate()
    const prevMonthYear = prevMonthDate.getFullYear()
    const prevMonth = prevMonthDate.getMonth() + 1
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      calendarDays.push({
        date: prevMonthDays - i,
        isCurrentMonth: false,
        fullDate: `${prevMonthYear}-${String(prevMonth).padStart(2, '0')}-${String(prevMonthDays - i).padStart(2, '0')}`
      })
    }

    // 添加本月的日期
    for (let day = 1; day <= daysInMonth; day++) {
      const fullDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      calendarDays.push({
        date: day,
        isCurrentMonth: true,
        fullDate: fullDate,
        hasRecord: this.data.hasRecords[fullDate] || false
      })
    }

    // 添加下个月的日期
    const remainingCells = 42 - calendarDays.length // 6行7列
    const nextMonthDate = new Date(currentYear, currentMonth, 1)
    const nextMonthYear = nextMonthDate.getFullYear()
    const nextMonth = nextMonthDate.getMonth() + 1
    for (let day = 1; day <= remainingCells; day++) {
      calendarDays.push({
        date: day,
        isCurrentMonth: false,
        fullDate: `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      })
    }

    this.setData({ calendarDays })
  },

  // 加载菜谱记录
  async loadRecipeRecords() {
    try {
      const { currentYear, currentMonth } = this.data
      // 使用本地时区计算月份开始和结束日期
      const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
      // 获取当月最后一天：当前月份+1，日期设为0即为上月最后一天
      const lastDay = new Date(currentYear, currentMonth, 0).getDate()
      const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      const recordDates = await getRecipeRecordDates(startDate, endDate)
      const hasRecords = {}

      // 将日期数组转换为对象格式，用于快速查找
      recordDates.forEach(date => {
        // 后端返回的是UTC时间字符串，需要正确处理
        // 格式: "2026-04-01T00:00:00.000+00:00" 或 "2026-04-01"
        const dateStr = date.toString().split('T')[0]
        hasRecords[dateStr] = true
      })

      this.setData({ hasRecords })
      this.generateCalendarDays() // 重新生成日历以显示记录标记
    } catch (error) {
      console.error('加载菜谱记录失败:', error)
      // 如果API调用失败，回退到本地存储（按用户隔离）
      const recordsKey = getUserStorageKey('recipeRecords')
      const records = wx.getStorageSync(recordsKey) || {}
      this.setData({ hasRecords: records })
      this.generateCalendarDays()
    }
  },

  // 选择日期
  onSelectDate(e) {
    const { fullDate, isCurrentMonth } = e.currentTarget.dataset
    if (!isCurrentMonth) return

    this.setData({ selectedDate: fullDate })

    if (this.data.selectMode) {
      // 选择模式：返回到result页面并传递选择的日期（按用户隔离）
      const selectingKey = getUserStorageKey('selectingDateForRecipe')
      const selectedKey = getUserStorageKey('selectedDateForRecipe')
      const selectingData = wx.getStorageSync(selectingKey)
      if (selectingData) {
        wx.removeStorageSync(selectingKey)
        // 传递选择的日期和菜谱数据回result页面
        wx.setStorageSync(selectedKey, {
          date: fullDate,
          plan: selectingData.plan
        })
        this.setData({ selectMode: false })
        wx.navigateBack()
      }
    } else {
      // 正常模式：跳转到详情页面
      wx.navigateTo({
        url: `/pages/calendar-detail/calendar-detail?date=${fullDate}`
      })
    }
  },

  // 上一月
  onPrevMonth() {
    let { currentYear, currentMonth } = this.data
    if (currentMonth === 1) {
      currentYear--
      currentMonth = 12
    } else {
      currentMonth--
    }
    this.setData({ currentYear, currentMonth })
    this.loadRecipeRecords()
  },

  // 下一月
  onNextMonth() {
    let { currentYear, currentMonth } = this.data
    if (currentMonth === 12) {
      currentYear++
      currentMonth = 1
    } else {
      currentMonth++
    }
    this.setData({ currentYear, currentMonth })
    this.loadRecipeRecords()
  },

  // 返回今天
  onToday() {
    const now = new Date()
    this.setData({
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1
    })
    this.loadRecipeRecords()
  },

  onShareAppMessage() {
    return {
      title: '吃什么？每天记录你的美食生活！',
      path: '/pages/index/index'
    }
  },

  onShareTimeline() {
    return {
      title: '吃什么？每天记录你的美食生活！'
    }
  }
})
