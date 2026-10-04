const api = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')
const flow = require('../../utils/meal-workflow')
const { beginShoppingSelection } = require('../../utils/shopping-list')
Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(), weekdays: ['一','二','三','四','五','六','日'], selectedDate: flow.today(), viewMode: 'week', rangeLabel: '', days: [], mealCards: [], overview: { plans: [], consumptions: [] }, loading: true, errorMessage: '', selectMode: false, authenticated: true },
  onLoad(options) { this.setData({ selectMode: options.mode === 'select' || options.select === 'true' }); this.rebuild() },
  onShow() { if(wx.getStorageSync(getUserStorageKey('selectingDateForRecipe')))this.setData({selectMode:true}); this.loadRecipeRecords() },
  onHide() { if(this.data.selectMode){wx.removeStorageSync(getUserStorageKey('selectingDateForRecipe'));this.setData({selectMode:false})} },
  onUnload() { this._epoch = (this._epoch || 0) + 1 },
  period() { const d = flow.parseDay(this.data.selectedDate); return this.data.viewMode === 'week' ? flow.weekRange(this.data.selectedDate) : flow.monthRange(d.getFullYear(), d.getMonth() + 1) },
  rebuild() {
    const range = this.period(), current = this.data.selectedDate, plans = this.data.overview.plans || [], actual = this.data.overview.consumptions || [], days = []
    if (this.data.viewMode === 'month') for (let i = 0; i < (flow.parseDay(range.startDate).getDay() + 6) % 7; i++) days.push({ key: `blank-${i}`, blank: true })
    for (let date = range.startDate; date <= range.endDate; date = flow.shiftDay(date, 1)) {
      const d = flow.parseDay(date)
      days.push({ key: date, fullDate: date, day: d.getDate(), weekLabel: ['日','一','二','三','四','五','六'][d.getDay()], selected: date === current, isToday: date === flow.today(), hasPlan: plans.some(p => String(p.recordDate).slice(0,10) === date), eaten: actual.some(p => p.mealDate === date && p.status === 'eaten') })
    }
    this.setData({ days, rangeLabel: `${range.startDate} — ${range.endDate}`, mealCards: flow.mealViews(this.data.overview, current) })
  },
  async loadRecipeRecords() {
    const epoch = this._epoch = (this._epoch || 0) + 1, identity = getUserStorageKey('mealView'), range = this.period()
    const current = () => epoch === this._epoch && identity === getUserStorageKey('mealView')
    if (this._viewScope !== identity) { this.setData({ overview: { plans: [], consumptions: [] }, mealCards: [] }); this.rebuild() }
    this._viewScope = identity
    this.setData({ loading: true, errorMessage: '' })
    try {
      const overview = await api.getMealOverview(range.startDate, range.endDate)
      if (!current()) return
      this.setData({ overview, authenticated: true }); this.rebuild()
      wx.setStorageSync(getUserStorageKey('mealOverview'), { range, overview })
    } catch (error) {
      if (!current()) return
      const cached = wx.getStorageSync(getUserStorageKey('mealOverview'))
      if (cached && cached.range.startDate === range.startDate && cached.range.endDate === range.endDate) { this.setData({ overview: cached.overview }); this.rebuild() }
      this.setData({ authenticated: error.statusCode !== 401, errorMessage: flow.errorMessage(error, '暂未连接，缓存内容仅供查看。请联网后重试。') })
    } finally { if (current()) this.setData({ loading: false }) }
  },
  onModeChange(e) { this.setData({ viewMode: e.currentTarget.dataset.mode }); this.rebuild(); this.loadRecipeRecords() },
  onSelectDate(e) {
    const day = e.currentTarget.dataset.date
    if (!day) return
    this.setData({ selectedDate: day }); this.rebuild()
    if (this.data.selectMode) {
      const selection = wx.getStorageSync(getUserStorageKey('selectingDateForRecipe'))
      if (selection) { wx.setStorageSync(getUserStorageKey('selectedDateForRecipe'), { date: day, plan: selection.plan }); wx.removeStorageSync(getUserStorageKey('selectingDateForRecipe')); this.setData({ selectMode: false }); if (getCurrentPages().length > 1) wx.navigateBack(); else wx.navigateTo({url:'/pages/result/result?calendarReturn=1'}) }
    }
  },
  move(amount) {
    const date = this.data.viewMode === 'week' ? flow.shiftDay(this.data.selectedDate, amount * 7) : (() => { const d=flow.parseDay(this.data.selectedDate); return flow.formatDay(new Date(d.getFullYear(), d.getMonth()+amount, 1, 12)) })()
    this.setData({ selectedDate: date }); this.rebuild(); this.loadRecipeRecords()
  },
  onPrevMonth() { this.move(-1) }, onNextMonth() { this.move(1) },
  onToday() { this.setData({ selectedDate: flow.today() }); this.rebuild(); this.loadRecipeRecords() },
  onOpenMeal() { wx.navigateTo({ url: `/pages/calendar-detail/calendar-detail?date=${this.data.selectedDate}` }) },
  onShoppingList() { wx.navigateTo({ url: '/pages/shopping-list/shopping-list' }) },
  onReview() { wx.navigateTo({ url: '/pages/statistics/statistics' }) },
  onLogin() { wx.switchTab({ url: '/pages/profile/profile' }) },
  onAssistant() { wx.navigateTo({ url: `/pages/chat/chat?date=${this.data.selectedDate}` }) },
  onPurchaseRange() {
    const cancelled = new Set((this.data.overview.consumptions || []).filter(x => x.status === 'skipped').map(x => `${x.mealDate}|${x.mealType}`))
    const sources = (this.data.overview.plans || []).filter(p => (p.dishIds || []).length && !cancelled.has(`${String(p.recordDate).slice(0,10)}|${p.mealType}`)).map(p => ({ sourceDate: String(p.recordDate).slice(0,10), sourceMealType: p.mealType, dishIds: p.dishIds, targetPeople: p.targetPeople || 2, dishes: p.dishDetails || [] }))
    if (!sources.length) return wx.showToast({ title: '请先安排可采购的菜品', icon: 'none' })
    beginShoppingSelection({ sources, dishIds: [...new Set(sources.flatMap(x=>x.dishIds))], targetPeople: sources[0].targetPeople, source: 'calendar', dishes: sources.flatMap(x=>x.dishes) })
    wx.navigateTo({ url: '/pages/shopping-preview/shopping-preview' })
  },
  onShareAppMessage() { return { title: '把这一周的饭安排好', path: '/pages/calendar/calendar' } }
})
