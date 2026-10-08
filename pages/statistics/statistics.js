const api = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')
const flow = require('../../utils/meal-workflow')
const { presentDietReport, recordUrl } = require('../../utils/diet-report')
Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(), periodMode: 'week', selectedDate: flow.today(), rangeLabel: '', loading: true, errorMessage: '', report: null, reportView: null, categoryRows: [], dailyRows: [], recordRows: [] },
  onLoad(options = {}) {
    const anchor = options.anchor
    if (typeof anchor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(anchor) && flow.formatDay(flow.parseDay(anchor)) === anchor) {
      this.setData({ selectedDate: anchor, periodMode: options.period === 'month' ? 'month' : 'week' })
    }
  },
  onShow() { this._unloaded = false; this.loadStatistics() },
  onUnload() { this._unloaded = true; this._epoch = (this._epoch || 0) + 1 },
  range() { const date = flow.parseDay(this.data.selectedDate); return this.data.periodMode === 'week' ? flow.weekRange(this.data.selectedDate) : flow.monthRange(date.getFullYear(), date.getMonth() + 1) },
  clearReport() { this.setData({ report: null, reportView: null, categoryRows: [], dailyRows: [], recordRows: [] }) },
  async loadStatistics() {
    const epoch = this._epoch = (this._epoch || 0) + 1
    const scope = getUserStorageKey('dietReview'), range = this.range()
    const current = () => !this._unloaded && epoch === this._epoch && scope === getUserStorageKey('dietReview')
    const rangeKey = `${range.startDate}|${range.endDate}`
    if (this._viewScope !== scope || this._rangeKey !== rangeKey) this.clearReport()
    this._viewScope = scope; this._rangeKey = rangeKey
    this.setData({ loading: true, errorMessage: '', rangeLabel: `${range.startDate} — ${range.endDate}` })
    try {
      const report = await api.getDietReview(range.startDate, range.endDate)
      if (!current()) return
      const presentation = presentDietReport(report, range)
      this.setData({ report, ...presentation })
    } catch (error) {
      if (current()) {
        this.clearReport()
        this.setData({ errorMessage: flow.errorMessage(error, error && error.message || '读取失败，请联网后重试。') })
      }
    } finally { if (current()) this.setData({ loading: false }) }
  },
  onMode(e) { this.setData({ periodMode: e.currentTarget.dataset.mode }); this.loadStatistics() },
  move(amount) { const current = flow.parseDay(this.data.selectedDate); const date = this.data.periodMode === 'week' ? flow.shiftDay(this.data.selectedDate, amount * 7) : flow.formatDay(new Date(current.getFullYear(), current.getMonth() + amount, 1, 12)); if (date > flow.today()) return wx.showToast({ title: '未来用餐尚未记录', icon: 'none' }); this.setData({ selectedDate: date }); this.loadStatistics() },
  onPrevMonth() { this.move(-1) }, onNextMonth() { this.move(1) }, onCurrent() { this.setData({ selectedDate: flow.today() }); this.loadStatistics() },
  onRecord(e) {
    if (this._unloaded || this._viewScope && this._viewScope !== getUserStorageKey('dietReview')) { this.clearReport(); return }
    const target = e && e.currentTarget && e.currentTarget.dataset || {}
    wx.navigateTo({ url: recordUrl(target.date || flow.today(), target.meal) })
  },
  onLogin() { wx.switchTab({ url: '/pages/profile/profile' }) }
})
