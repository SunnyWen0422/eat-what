// pages/statistics/statistics.js
const api = require('../../utils/api')

Page({
  data: {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    statistics: {
      meatCount: 0,
      vegCount: 0,
      soupCount: 0,
      totalCalories: 0,
      dailyCalories: 0,
      daysWithRecords: 0
    },
    // 热量分析
    caloriesMin: 1800,
    caloriesMax: 2200,
    caloriesPercent: 50,
    caloriesLevel: 'normal',
    caloriesVerdict: '',
    // 荤素比例
    meatPercent: 0,
    vegPercent: 0,
    soupPercent: 0,
    ratioVerdict: '',
    // 建议列表
    suggestionList: [],
    loading: true,
    isEmpty: false
  },

  onLoad() {
    this._needRefresh = true
    this.loadStatistics()
  },

  onShow() {
    // 检查是否有来自保存操作的刷新信号
    const { getUserStorageKey } = require('../../utils/util')
    const refreshKey = getUserStorageKey('needRefreshStats')
    const refreshSignal = wx.getStorageSync(refreshKey)
    if (refreshSignal) {
      wx.removeStorageSync(refreshKey)
      this._needRefresh = true
    }
    if (this._needRefresh) {
      this._needRefresh = false
      this.loadStatistics()
    }
  },

  // 加载统计数据
  async loadStatistics() {
    this.setData({ loading: true, isEmpty: false })
    
    try {
      const { currentYear, currentMonth } = this.data
      
      // 计算月份的开始和结束日期
      const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
      const lastDay = new Date(currentYear, currentMonth, 0).getDate()
      const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      const result = await api.getStatistics(startDate, endDate)
      
      if (result && result.success) {
        const stats = result.statistics || {}
        const daysWithRecords = result.daysWithRecords || 0
        const dishes = result.dishes || []
        
        const totalCalories = this.calculateTotalCalories(stats, dishes)
        const dailyCalories = daysWithRecords > 0 
          ? Math.round(totalCalories / daysWithRecords) 
          : 0

        // 计算热量等级和百分比
        const { caloriesPercent, caloriesLevel, caloriesVerdict, caloriesMin, caloriesMax } = 
          this.analyzeCalories(dailyCalories, stats)

        // 计算荤素比例
        const { meatPercent, vegPercent, soupPercent, ratioVerdict } = 
          this.analyzeRatio(stats)

        // 生成建议列表
        const suggestionList = this.generateSuggestions(stats, daysWithRecords, dailyCalories)

        this.setData({
          statistics: {
            meatCount: stats.meatCount || 0,
            vegCount: stats.vegCount || 0,
            soupCount: stats.soupCount || 0,
            totalCalories: totalCalories,
            dailyCalories: dailyCalories,
            daysWithRecords: daysWithRecords
          },
          caloriesMin,
          caloriesMax,
          caloriesPercent,
          caloriesLevel,
          caloriesVerdict,
          meatPercent,
          vegPercent,
          soupPercent,
          ratioVerdict,
          suggestionList,
          isEmpty: daysWithRecords === 0,
          loading: false
        })
      } else {
        this.setData({
          isEmpty: true,
          loading: false,
          suggestionList: ['暂无数据，快去记录你的第一餐吧！']
        })
      }
    } catch (error) {
      console.error('加载统计数据失败:', error)
      this.setData({
        isEmpty: true,
        loading: false,
        suggestionList: ['数据加载失败，请稍后重试']
      })
    }
  },

  // 热量分析
  analyzeCalories(dailyCalories, stats) {
    const caloriesMin = 1800
    const caloriesMax = 2200
    
    // 计算百分比（以3000为最大值的基准）
    const maxCal = 3000
    const caloriesPercent = Math.min(100, Math.round((dailyCalories / maxCal) * 100))
    
    let caloriesLevel = 'normal'
    let caloriesVerdict = ''
    
    if (dailyCalories > 2500) {
      caloriesLevel = 'high'
      caloriesVerdict = '⚠️ 热量摄入偏高，建议减少高油高盐食物'
    } else if (dailyCalories < 1200) {
      caloriesLevel = 'low'
      caloriesVerdict = '⚠️ 热量摄入偏低，注意加强营养'
    } else if (dailyCalories >= caloriesMin && dailyCalories <= caloriesMax) {
      caloriesLevel = 'good'
      caloriesVerdict = '✅ 热量摄入合理，继续保持'
    } else if (dailyCalories > caloriesMax && dailyCalories <= 2500) {
      caloriesLevel = 'normal'
      caloriesVerdict = '📌 热量略高，可适当增加运动'
    } else {
      caloriesLevel = 'low'
      caloriesVerdict = '📌 热量偏低，建议适当增加食量'
    }
    
    return { caloriesPercent, caloriesLevel, caloriesVerdict, caloriesMin, caloriesMax }
  },

  // 荤素比例分析
  analyzeRatio(stats) {
    const { meatCount = 0, vegCount = 0, soupCount = 0 } = stats
    const total = meatCount + vegCount + soupCount
    
    if (total === 0) {
      return { meatPercent: 0, vegPercent: 0, soupPercent: 0, ratioVerdict: '暂无数据' }
    }
    
    const meatPercent = Math.round((meatCount / total) * 100)
    const vegPercent = Math.round((vegCount / total) * 100)
    const soupPercent = 100 - meatPercent - vegPercent
    
    let ratioVerdict = ''
    if (meatPercent > 60) {
      ratioVerdict = '📌 荤菜偏多，建议多摄入蔬菜，保持营养均衡'
    } else if (vegPercent > 70) {
      ratioVerdict = '📌 素菜为主，建议适量补充蛋白质'
    } else if (meatPercent >= 30 && meatPercent <= 50 && vegPercent >= 30 && vegPercent <= 50) {
      ratioVerdict = '✅ 荤素搭配均衡，营养结构良好'
    } else {
      ratioVerdict = '📌 建议保持荤素搭配'
    }
    
    return { meatPercent, vegPercent, soupPercent, ratioVerdict }
  },

  // 热量估算
  estimateCalories(dish) {
    if (!dish) return 0
    const name = (dish.name || '').toLowerCase()
    const type = dish.type || ''
    
    let baseCalories = 0
    if (type === '荤菜' || type === 'meat') {
      baseCalories = 250
    } else if (type === '素菜' || type === 'veg') {
      baseCalories = 80
    } else if (type === '汤' || type === '汤品' || type === 'soup') {
      baseCalories = 100
    } else {
      if (name.includes('汤') || name.includes('羹') || name.includes('粥')) {
        baseCalories = 100
      } else if (name.includes('肉') || name.includes('鸡') || name.includes('鱼') || name.includes('虾') || name.includes('蛋')) {
        baseCalories = 250
      } else {
        baseCalories = 80
      }
    }

    let multiplier = 1.0
    const highCal = ['红烧', '糖醋', '油炸', '炸', '烤', '煎', '爆炒', '干煸', '回锅']
    const lowCal = ['清炒', '清蒸', '水煮', '凉拌', '白切', '清汤']
    for (const kw of highCal) { if (name.includes(kw)) { multiplier += 0.3; break } }
    for (const kw of lowCal) { if (name.includes(kw)) { multiplier -= 0.2; break } }

    const ingredients = (dish.ingredientsAmounts || '').toLowerCase()
    if (['油', '糖', '肉', '肥'].some(m => ingredients.includes(m))) multiplier += 0.2

    const finalCal = Math.round(baseCalories * multiplier)
    if (type === '荤菜' || type === 'meat') return Math.max(150, Math.min(500, finalCal))
    if (type === '素菜' || type === 'veg') return Math.max(30, Math.min(200, finalCal))
    if (type === '汤' || type === '汤品' || type === 'soup') return Math.max(40, Math.min(300, finalCal))
    return Math.max(50, Math.min(400, finalCal))
  },

  // 计算总热量
  calculateTotalCalories(stats, dishes) {
    const { meatCount = 0, vegCount = 0, soupCount = 0 } = stats
    if (meatCount === 0 && vegCount === 0 && soupCount === 0) return 0
    
    let meatCal = 0, vegCal = 0, soupCal = 0
    let meatCnt = 0, vegCnt = 0, soupCnt = 0
    
    for (const dish of (dishes || [])) {
      const cal = this.estimateCalories(dish)
      const type = dish.type || ''
      if (type === '荤菜' || type === 'meat') { meatCal += cal; meatCnt++ }
      else if (type === '素菜' || type === 'veg') { vegCal += cal; vegCnt++ }
      else if (type === '汤' || type === '汤品' || type === 'soup') { soupCal += cal; soupCnt++ }
    }
    
    const avgMeat = meatCnt > 0 ? meatCal / meatCnt : 250
    const avgVeg = vegCnt > 0 ? vegCal / vegCnt : 80
    const avgSoup = soupCnt > 0 ? soupCal / soupCnt : 100
    
    return Math.round(meatCount * avgMeat + vegCount * avgVeg + soupCount * avgSoup)
  },

  // 生成建议列表
  generateSuggestions(stats, daysWithRecords, dailyCalories) {
    const { meatCount = 0, vegCount = 0, soupCount = 0 } = stats
    const total = meatCount + vegCount + soupCount
    const suggestions = []
    
    if (daysWithRecords === 0) return ['暂无数据，快去记录你的第一餐吧！']
    
    // 热量建议
    if (dailyCalories > 2500) {
      suggestions.push('日均热量较高，建议减少油炸、高糖食物')
    } else if (dailyCalories < 1200) {
      suggestions.push('日均热量偏低，注意增加营养摄入')
    } else if (dailyCalories >= 1800 && dailyCalories <= 2200) {
      suggestions.push('热量摄入合理，继续保持')
    } else {
      suggestions.push('热量摄入基本正常')
    }
    
    // 荤素建议
    const meatR = total > 0 ? meatCount / total : 0
    const vegR = total > 0 ? vegCount / total : 0
    if (meatR > 0.6) {
      suggestions.push('荤菜比例偏高，建议多选择蔬菜')
    } else if (vegR > 0.7) {
      suggestions.push('素菜为主，可适量增加蛋白质摄入')
    } else if (meatR >= 0.3 && meatR <= 0.5 && vegR >= 0.3 && vegR <= 0.5) {
      suggestions.push('荤素搭配均衡，营养结构良好')
    } else {
      suggestions.push('建议保持荤素搭配')
    }
    
    // 汤品建议
    const soupR = total > 0 ? soupCount / total : 0
    if (soupR < 0.1 && total > 10) {
      suggestions.push('汤品摄入较少，餐前喝汤有助于消化')
    } else if (soupR >= 0.15 && soupR <= 0.25) {
      suggestions.push('汤品摄入合理')
    }
    
    return suggestions
  },

  // 上一个月
  onPrevMonth() {
    let { currentYear, currentMonth } = this.data
    currentMonth--
    if (currentMonth < 1) { currentMonth = 12; currentYear-- }
    this.setData({ currentYear, currentMonth })
    this._needRefresh = true
    this.loadStatistics()
  },

  // 下一个月
  onNextMonth() {
    let { currentYear, currentMonth } = this.data
    const now = new Date()
    const maxYear = now.getFullYear()
    const maxMonth = now.getMonth() + 1
    if (currentYear > maxYear || (currentYear === maxYear && currentMonth >= maxMonth)) {
      wx.showToast({ title: '不能查看未来月份', icon: 'none' })
      return
    }
    currentMonth++
    if (currentMonth > 12) { currentMonth = 1; currentYear++ }
    this.setData({ currentYear, currentMonth })
    this.loadStatistics()
  }
})
