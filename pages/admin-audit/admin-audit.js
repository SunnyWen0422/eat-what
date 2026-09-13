const api = require('../../utils/api')
const ACTIONS = ['', 'USER_STATUS_UPDATE', 'CUSTOM_DISH_CREATE', 'CUSTOM_DISH_UPDATE', 'CUSTOM_DISH_DELETE', 'SYSTEM_DISH_UPDATE', 'SYSTEM_DISH_PUBLICATION']

Page({
  data: { actions: ACTIONS, actionIndex: 0, targetUserId: '', from: '', to: '', logs: [], total: 0, ready: false, loading: false, loadingMore: false, hasMore: false, error: '', notice: '' },
  page: 0, pageSize: 20, version: 0,
  onLoad() { this.load(true) },
  async onPullDownRefresh() { try { this.page = 0; await this.load(true) } finally { wx.stopPullDownRefresh() } },
  onReachBottom() { return this.load(false) },
  params(page) { return { action: ACTIONS[this.data.actionIndex] || undefined, targetUserId: this.data.targetUserId || undefined, from: this.data.from || undefined, to: this.data.to || undefined, page, pageSize: this.pageSize } },
  async load(reset = false) {
    if (!reset && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) return
    const requestVersion = ++this.version
    const page = reset ? 1 : this.page + 1
    this.setData(reset ? { loading: true, error: '', notice: '' } : { loadingMore: true, notice: '' })
    try {
      const result = await api.getAdminAuditLogs(this.params(page))
      if (requestVersion !== this.version) return
      const incoming = (result.list || []).map(log => ({ ...log, target: log.targetDishId ? `菜品 ${log.targetDishId}` : (log.targetUserId ? `用户 ${log.targetUserId}` : '系统'), detail: this.describe(log.detailJson) }))
      this.page = Number(result.page) || page
      const total = Number(result.total) || 0
      this.setData({ logs: reset ? incoming : this.data.logs.concat(incoming), total, ready: true, hasMore: this.page * (Number(result.pageSize) || this.pageSize) < total, error: '', notice: '' })
    } catch (error) {
      if (requestVersion !== this.version) return
      this.setData(this.data.ready ? { notice: '加载失败，仍显示上次结果' } : { error: '审计日志加载失败' })
    } finally { if (requestVersion === this.version) this.setData({ loading: false, loadingMore: false }) }
  },
  describe(value) { try { const data = JSON.parse(value || '{}'); return Object.keys(data).map(key => `${key}: ${data[key]}`).join(' · ') } catch (_) { return '' } },
  onAction(e) { this.setData({ actionIndex: Number(e.detail.value) }) },
  onUser(e) { this.setData({ targetUserId: e.detail.value.replace(/\D/g, '') }) },
  onFrom(e) { this.setData({ from: e.detail.value }) }, onTo(e) { this.setData({ to: e.detail.value }) },
  search() { this.page = 0; this.load(true) },
  reset() { this.page = 0; this.setData({ actionIndex: 0, targetUserId: '', from: '', to: '' }); this.load(true) },
  more() { this.load(false) }, retry() { this.load(true) },
})
