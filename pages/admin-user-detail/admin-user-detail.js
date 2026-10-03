const api = require('../../utils/api')
const { withAdminIdentity } = require('../../utils/admin-page-identity')

function emptyDish() { return { name: '', type: 'meat', cl: '', fl: '', step: '', tags: '', cuisineCode: '', tagCodes: '', cookMinutes: '' } }

Page(withAdminIdentity({
  data: { fontScale: require('../../utils/font-scale')(), userId: null, user: null, dishes: [], types: ['meat', 'veg', 'soup', 'staple', 'dessert'], ready: false, loading: false, error: '', notice: '', updatingStatus: false, deletingId: null, mode: 'detail', form: emptyDish(), editingId: null, saving: false },
  onLoad(options) { this.setData({ userId: options.userId }); this.load() },
  async onPullDownRefresh() { try { await this.load() } finally { wx.stopPullDownRefresh() } },
  async load() {
    const operation = this.beginAdminOperation()
    if (!operation) return
    if (this.data.loading) return
    this.setData({ loading: true, error: '', notice: this.data.ready ? '正在刷新' : '' })
    try {
      const result = await api.getAdminUser(this.data.userId)
      if (!this.isAdminOperationCurrent(operation)) return
      this.setData({ user: result.user, dishes: result.customDishes || [], ready: true, error: '', notice: '' })
    } catch (error) { if (!this.handleAdminError(error, operation)) this.setData(this.data.ready ? { notice: '刷新失败，仍显示上次内容' } : { error: '用户详情加载失败' }) }
    finally { if (this.isAdminOperationCurrent(operation)) this.setData({ loading: false }) }
  },
  retry() { return this.load() },
  toggleStatus() {
    const operation = this.beginAdminOperation()
    if (!this.data.user) return
    const next = Number(this.data.user.status) === 0 ? 1 : 0
    wx.showModal({ title: next ? '启用用户' : '停用用户', content: next ? '确认恢复该用户？' : '停用后该用户将无法继续使用服务。', success: result => { if (result.confirm && this.isAdminOperationCurrent(operation)) return this.updateStatus(next) } })
  },
  async updateStatus(status) {
    const operation = this.beginAdminOperation()
    if (!operation || this.data.updatingStatus) return
    this.setData({ updatingStatus: true, notice: '' })
    try {
      const result = await api.updateAdminUserStatus(this.data.userId, status)
      if (!this.isAdminOperationCurrent(operation)) return
      this.setData({ user: result.user || this.data.user, notice: '用户状态已更新' })
    } catch (error) { if (!this.handleAdminError(error, operation)) this.setData({ notice: '状态更新失败，请重试' }) }
    finally { if (this.isAdminOperationCurrent(operation)) this.setData({ updatingStatus: false }) }
  },
  startAdd() { this.setData({ mode: 'form', editingId: null, form: emptyDish() }) },
  startEdit(e) {
    const dish = this.data.dishes.find(item => String(item.id) === String(e.currentTarget.dataset.id))
    if (!dish) return
    this.setData({ mode: 'form', editingId: dish.id, form: { ...emptyDish(), ...dish, cookMinutes: dish.cookMinutes || '' } })
  },
  cancelForm() { if (!this.data.saving) this.setData({ mode: 'detail', editingId: null, form: emptyDish() }) },
  onInput(e) { this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value }) },
  onType(e) { this.setData({ 'form.type': e.currentTarget.dataset.type }) },
  async save() {
    const operation = this.beginAdminOperation()
    if (!operation) return
    if (this.data.saving) return
    const form = this.data.form
    if (!form.name.trim() || !form.cl.trim() || !form.step.trim()) return wx.showToast({ title: '请填写菜名、食材和步骤', icon: 'none' })
    const payload = { ...form, cookMinutes: form.cookMinutes ? Number(form.cookMinutes) : null }
    this.setData({ saving: true, notice: '' })
    try {
      if (this.data.editingId) await api.updateAdminUserDish(this.data.userId, this.data.editingId, payload)
      else await api.createAdminUserDish(this.data.userId, payload)
      if (!this.isAdminOperationCurrent(operation)) return
      this.setData({ mode: 'detail', editingId: null, form: emptyDish(), notice: '菜品已保存' })
      await this.load()
    } catch (error) { if (!this.handleAdminError(error, operation)) this.setData({ notice: '保存失败，请检查内容后重试' }) }
    finally { if (this.isAdminOperationCurrent(operation)) this.setData({ saving: false }) }
  },
  deleteDish(e) {
    const operation = this.beginAdminOperation()
    const id = e.currentTarget.dataset.id
    wx.showModal({ title: '删除自定义菜品', content: '删除后无法恢复，确认继续？', confirmColor: '#b13b36', success: result => { if (result.confirm && this.isAdminOperationCurrent(operation)) return this.remove(id) } })
  },
  async remove(id) {
    const operation = this.beginAdminOperation()
    if (!operation || this.data.deletingId) return
    this.setData({ deletingId: id, notice: '' })
    try { await api.deleteAdminUserDish(this.data.userId, id); if (!this.isAdminOperationCurrent(operation)) return; this.setData({ dishes: this.data.dishes.filter(item => String(item.id) !== String(id)), notice: '菜品已删除' }) }
    catch (error) { if (!this.handleAdminError(error, operation)) this.setData({ notice: '删除失败，请重试' }) }
    finally { if (this.isAdminOperationCurrent(operation)) this.setData({ deletingId: null }) }
  },
}))
