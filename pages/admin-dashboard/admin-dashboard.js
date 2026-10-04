const api = require('../../utils/api')
const { withAdminIdentity } = require('../../utils/admin-page-identity')

Page(withAdminIdentity({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(),
    overview: null,
    loading: false,
    ready: false,
    error: '',
    notice: '',
  },

  onShow() {
    this.load()
  },

  async onPullDownRefresh() {
    try { await this.load() } finally { wx.stopPullDownRefresh() }
  },

  async load() {
    const operation = this.beginAdminOperation()
    if (!operation) return
    if (this.data.loading) return
    const keepContent = this.data.ready
    this.setData({ loading: true, error: '', notice: keepContent ? '正在刷新数据' : '' })
    try {
      const overview = await api.getAdminOverview()
      if (!this.isAdminOperationCurrent(operation)) return
      this.commitAdminSuccess(operation, { overview, ready: true, error: '', notice: '' })
    } catch (error) {
      if (this.handleAdminError(error, operation)) return
      this.setData(keepContent
        ? { notice: '刷新失败，仍显示上次数据' }
        : { error: '管理概览加载失败' })
    } finally {
      if (this.isAdminOperationCurrent(operation)) this.setData({ loading: false })
    }
  },

  retry() { return this.load() },
  openUsers() { wx.navigateTo({ url: '/pages/admin-users/admin-users' }) },
  openDishes() { wx.navigateTo({ url: '/pages/admin-dishes/admin-dishes' }) },
  openAudit() { wx.navigateTo({ url: '/pages/admin-audit/admin-audit' }) },
}))
