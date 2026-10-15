const api = require('../../utils/api')
const { withAdminIdentity } = require('../../utils/admin-page-identity')
const ACTION_LABELS={USER_STATUS_UPDATE:'修改用户状态',CUSTOM_DISH_CREATE:'新增私房菜',CUSTOM_DISH_UPDATE:'修改私房菜',CUSTOM_DISH_DELETE:'删除私房菜',SYSTEM_DISH_UPDATE:'修改系统菜品',SYSTEM_DISH_PUBLICATION:'调整菜品发布'}
const ACTIONS = ['', 'USER_STATUS_UPDATE', 'CUSTOM_DISH_CREATE', 'CUSTOM_DISH_UPDATE', 'CUSTOM_DISH_DELETE', 'SYSTEM_DISH_UPDATE', 'SYSTEM_DISH_PUBLICATION']

Page(withAdminIdentity({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(), actions: ACTIONS.map(code=>ACTION_LABELS[code]||'全部操作'), actionIndex: 0, targetUserId: '', from: '', to: '', logs: [], total: 0, ready: false, loading: false, loadingMore: false, hasMore: false, error: '', notice: '' },
  page: 0, pageSize: 20, version: 0,
  onLoad() { this.load(true) },
  async onPullDownRefresh() { try { this.page = 0; await this.load(true) } finally { wx.stopPullDownRefresh() } },
  onReachBottom() { return this.load(false) },
  params(page) { return { action: ACTIONS[this.data.actionIndex] || undefined, targetUserId: this.data.targetUserId || undefined, from: this.data.from || undefined, to: this.data.to || undefined, page, pageSize: this.pageSize } },
  async load(reset = false) {
    const operation = this.beginAdminOperation()
    if (!operation) return
    if (!reset && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) return
    const requestVersion = ++this.version
    const page = reset ? 1 : this.page + 1
    this.setData(reset ? { loading: true, error: '', notice: '' } : { loadingMore: true, notice: '' })
    try {
      const result = await api.getAdminAuditLogs(this.params(page))
      if (!this.isAdminOperationCurrent(operation) || requestVersion !== this.version) return
      const incoming = (result.list || []).map(log => ({ ...log,actionLabel:ACTION_LABELS[log.action]||'其他操作',resultLabel:log.result==='SUCCESS'?'成功':log.result==='FAILED'?'未完成':'查看详情',detailsExpanded:false, target: log.targetDishId ? `菜品 ${log.targetDishId}` : (log.targetUserId ? `用户 ${log.targetUserId}` : '系统'), detail: this.describe(log.detailJson) }))
      this.page = Number(result.page) || page
      const total = Number(result.total) || 0
      this.commitAdminSuccess(operation, { logs: reset ? incoming : this.data.logs.concat(incoming), total, ready: true, hasMore: this.page * (Number(result.pageSize) || this.pageSize) < total, error: '', notice: '' })
    } catch (error) {
      if (requestVersion !== this.version || this.handleAdminError(error, operation)) return
      this.setData(this.data.ready ? { notice: '加载失败，仍显示上次结果' } : { error: '审计日志加载失败' })
    } finally { if (this.isAdminOperationCurrent(operation) && requestVersion === this.version) this.setData({ loading: false, loadingMore: false }) }
  },
  onAuditDetails(e){const id=e.currentTarget.dataset.id;this.setData({logs:this.data.logs.map(log=>String(log.id)===String(id)?{...log,detailsExpanded:!log.detailsExpanded}:log)})},
  onCopyAudit(e){const log=this.data.logs.find(row=>String(row.id)===String(e.currentTarget.dataset.id));if(log)wx.setClipboardData({data:JSON.stringify({id:log.id,requestId:log.requestId,action:log.action,result:log.result,detail:log.detail})})},
  describe(value) { try { const data = JSON.parse(value || '{}'); return Object.keys(data).map(key => `${key}: ${data[key]}`).join(' · ') } catch (_) { return '' } },
  onAction(e) { this.setData({ actionIndex: Number(e.detail.value) }) },
  onUser(e) { this.setData({ targetUserId: e.detail.value.replace(/\D/g, '') }) },
  onFrom(e) { this.setData({ from: e.detail.value }) }, onTo(e) { this.setData({ to: e.detail.value }) },
  search() { this.page = 0; this.load(true) },
  reset() { this.page = 0; this.setData({ actionIndex: 0, targetUserId: '', from: '', to: '' }); this.load(true) },
  more() { this.load(false) }, retry() { this.load(true) },
}))
