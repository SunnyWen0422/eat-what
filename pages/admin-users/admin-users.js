const api = require('../../utils/api')

Page({
  data: { fontScale: require('../../utils/font-scale')(), users: [], total: 0, keywordInput: '', keyword: '', ready: false, loading: false, refreshing: false, loadingMore: false, hasMore: false, error: '', notice: '', updatingId: null },
  page: 0,
  pageSize: 20,
  version: 0,

  onLoad() { this.load(true) },
  async onPullDownRefresh() { try { this.page = 0; await this.load(true) } finally { wx.stopPullDownRefresh() } },
  onReachBottom() { return this.load(false) },
  async load(reset = false) {
    if (!reset && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) return
    const requestVersion = ++this.version
    const page = reset ? 1 : this.page + 1
    const initial = reset && !this.data.ready
    this.setData(reset ? { loading: initial, refreshing: !initial, loadingMore: false, error: '', notice: '' } : { loadingMore: true, notice: '' })
    try {
      const result = await api.getAdminUsers({ keyword: this.data.keyword || undefined, page, pageSize: this.pageSize })
      if (requestVersion !== this.version) return
      const incoming = (result.list || []).map(item => ({ ...item, displayName: item.nickname || item.phone || `用户 ${item.id}` }))
      const users = reset ? incoming : this.data.users.concat(incoming)
      const currentPage = Number(result.page) || page
      const size = Number(result.pageSize) || this.pageSize
      this.page = currentPage
      this.setData({ users, total: Number(result.total) || 0, hasMore: currentPage * size < (Number(result.total) || 0), ready: true, error: '', notice: '' })
    } catch (error) {
      if (requestVersion !== this.version) return
      this.setData(this.data.ready ? { notice: reset ? '刷新失败，仍显示上次结果' : '加载更多失败，请重试' } : { error: '用户列表加载失败' })
    } finally {
      if (requestVersion === this.version) this.setData({ loading: false, refreshing: false, loadingMore: false })
    }
  },
  onInput(e) { this.setData({ keywordInput: e.detail.value }) },
  search() { this.page = 0; this.setData({ keyword: this.data.keywordInput.trim() }); return this.load(true) },
  clear() { this.page = 0; this.setData({ keywordInput: '', keyword: '' }); return this.load(true) },
  retry() { return this.load(true) },
  more() { return this.load(false) },
  openUser(e) { wx.navigateTo({ url: `/pages/admin-user-detail/admin-user-detail?userId=${e.currentTarget.dataset.id}` }) },
  toggleStatus(e) {
    const id = e.currentTarget.dataset.id
    const user = this.data.users.find(item => String(item.id) === String(id))
    if (!user) return
    const next = Number(user.status) === 0 ? 1 : 0
    wx.showModal({ title: next ? '启用用户' : '停用用户', content: next ? '确认恢复该用户的使用权限？' : '停用后该用户将无法继续使用服务。', success: result => { if (result.confirm) this.updateStatus(id, next) } })
  },
  async updateStatus(id, status) {
    this.setData({ updatingId: id, notice: '' })
    try {
      const result = await api.updateAdminUserStatus(id, status)
      const updated = result.user || {}
      this.setData({ users: this.data.users.map(item => String(item.id) === String(id) ? { ...item, ...updated, displayName: item.displayName } : item), notice: '用户状态已更新' })
    } catch (error) { this.setData({ notice: '状态更新失败，请重试' }) }
    finally { this.setData({ updatingId: null }) }
  },
})
