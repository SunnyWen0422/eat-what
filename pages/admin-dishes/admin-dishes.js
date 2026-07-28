const api = require('../../utils/api')
const TYPES = [{ code: '', label: '全部分类' }, { code: 'meat', label: '荤菜' }, { code: 'veg', label: '素菜' }, { code: 'soup', label: '汤品' }, { code: 'staple', label: '主食' }, { code: 'dessert', label: '甜品' }]

Page({
  data: { scope: 'system', keywordInput: '', keyword: '', typeIndex: 0, types: TYPES, publishedIndex: 0, publishedOptions: ['全部状态', '已发布', '已下架'], dishes: [], total: 0, ready: false, loading: false, loadingMore: false, hasMore: false, error: '', notice: '', updatingId: null, mode: 'list', form: null, saving: false },
  page: 0,
  pageSize: 20,
  version: 0,
  onLoad() { this.load(true) },
  async onPullDownRefresh() { try { this.page = 0; await this.load(true) } finally { wx.stopPullDownRefresh() } },
  onReachBottom() { return this.load(false) },
  params(page) {
    const published = this.data.scope === 'system' && this.data.publishedIndex > 0 ? (this.data.publishedIndex === 1 ? 1 : 0) : undefined
    return { scope: this.data.scope, keyword: this.data.keyword || undefined, type: TYPES[this.data.typeIndex].code || undefined, published, page, pageSize: this.pageSize }
  },
  async load(reset = false) {
    if (!reset && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) return
    const requestVersion = ++this.version
    const page = reset ? 1 : this.page + 1
    this.setData(reset ? { loading: true, error: '', notice: '' } : { loadingMore: true, notice: '' })
    try {
      const result = await api.getAdminDishes(this.params(page))
      if (requestVersion !== this.version) return
      const incoming = result.list || []
      const dishes = reset ? incoming : this.data.dishes.concat(incoming)
      this.page = Number(result.page) || page
      const total = Number(result.total) || 0
      this.setData({ dishes, total, ready: true, hasMore: this.page * (Number(result.pageSize) || this.pageSize) < total, error: '', notice: '' })
    } catch (error) {
      if (requestVersion !== this.version) return
      this.setData(this.data.ready ? { notice: '刷新失败，仍显示上次结果' } : { error: '菜品列表加载失败' })
    } finally { if (requestVersion === this.version) this.setData({ loading: false, loadingMore: false }) }
  },
  switchScope(e) { this.page = 0; this.setData({ scope: e.currentTarget.dataset.scope, publishedIndex: 0, mode: 'list' }); this.load(true) },
  onKeyword(e) { this.setData({ keywordInput: e.detail.value }) },
  search() { this.page = 0; this.setData({ keyword: this.data.keywordInput.trim() }); this.load(true) },
  onType(e) { this.page = 0; this.setData({ typeIndex: Number(e.detail.value) }); this.load(true) },
  onPublished(e) { this.page = 0; this.setData({ publishedIndex: Number(e.detail.value) }); this.load(true) },
  more() { this.load(false) }, retry() { this.load(true) },
  openDish(e) {
    const dish = this.data.dishes.find(item => String(item.id) === String(e.currentTarget.dataset.id))
    if (!dish) return
    if (this.data.scope === 'custom') return wx.navigateTo({ url: `/pages/admin-user-detail/admin-user-detail?userId=${dish.userId}` })
    this.setData({ mode: 'form', form: { ...dish, cookMinutes: dish.cookMinutes || '' } })
  },
  cancel() { if (!this.data.saving) this.setData({ mode: 'list', form: null }) },
  onInput(e) { this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value }) },
  onFormType(e) { this.setData({ 'form.type': e.currentTarget.dataset.type }) },
  async save() {
    const form = this.data.form
    if (!form || !form.name.trim() || !String(form.cl || '').trim() || !String(form.step || '').trim()) return wx.showToast({ title: '请填写菜名、食材和步骤', icon: 'none' })
    this.setData({ saving: true, notice: '' })
    try {
      const updated = await api.updateAdminDish(form.id, { ...form, cookMinutes: form.cookMinutes ? Number(form.cookMinutes) : null })
      this.setData({ dishes: this.data.dishes.map(item => item.id === updated.id ? updated : item), mode: 'list', form: null, notice: '系统菜品已保存' })
    } catch (error) { this.setData({ notice: '保存失败，请检查内容后重试' }) }
    finally { this.setData({ saving: false }) }
  },
  togglePublished(e) {
    const id = e.currentTarget.dataset.id
    const dish = this.data.dishes.find(item => String(item.id) === String(id))
    if (!dish) return
    const next = Number(dish.isPublished) === 0 ? 1 : 0
    wx.showModal({ title: next ? '发布菜品' : '下架菜品', content: next ? '发布后用户可以看到并获得推荐。' : '下架后将立即从用户查询和推荐中隐藏。', success: result => { if (result.confirm) this.updatePublished(id, next) } })
  },
  async updatePublished(id, published) {
    this.setData({ updatingId: id, notice: '' })
    try { const updated = await api.updateAdminDishStatus(id, published); this.setData({ dishes: this.data.dishes.map(item => String(item.id) === String(id) ? updated : item), notice: published ? '菜品已发布' : '菜品已下架' }) }
    catch (error) { this.setData({ notice: '发布状态更新失败，请重试' }) }
    finally { this.setData({ updatingId: null }) }
  },
})
