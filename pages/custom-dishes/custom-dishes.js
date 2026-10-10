const api = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')
const flow = require('../../utils/meal-workflow')
const { currentIdentity } = require('../../utils/account-identity')
Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(), dishes: [], loading: true, errorMessage: '', editing: false, saving: false, form: {}, formError: '', editPending: false, editExtrasVisible: false, formFocus: '', editQualityNotice: '', personalSaveMessage: '', types: ['荤菜','素菜','汤品','主食','甜品'], typeIndex: 0 },
  onLoad(options = {}) { this._requestedEdit = options.edit; this._identity = currentIdentity(); this._viewScope = getUserStorageKey('customDishesCloud') },
  onShow() {
    this.ensureOwner()
    if (!this.data.editing) this.loadCustomDishes()
  },
  onUnload() { this._unloaded = true; this._epoch = (this._epoch || 0) + 1 },
  ensureOwner() {
    if (this._unloaded) return false
    const identity = currentIdentity()
    if (this._identity === undefined) { this._identity = identity; this._viewScope = getUserStorageKey('customDishesCloud'); return true }
    if (this._identity === identity) return true
    this._identity = identity; this._viewScope = getUserStorageKey('customDishesCloud'); this._epoch = (this._epoch || 0) + 1
    this._requestedEdit = null; this._original = null; this._editScope = null; this._editInitial = null
    this.setData({ editQualityNotice: '', personalSaveMessage: '', editExtrasVisible: false, formFocus: '', editing: false, saving: false, editPending: false, loading: false, dishes: [], form: {}, formError: '', errorMessage: '', typeIndex: 0 }); this.syncEditLeaveAlert()
    return false
  },
  current(scope, identity = this._identity) { return this.ensureOwner() && identity === this._identity && scope === getUserStorageKey('customDishesCloud') },
  async loadCustomDishes() {
    if (!this.ensureOwner()) return
    const identity = this._identity
    const scope = getUserStorageKey('customDishesCloud'), epoch = this._epoch = (this._epoch || 0) + 1
    this._viewScope = scope
    this.setData({ loading: true, errorMessage: '' })
    try {
      const dishes = await api.getCustomDishes()
      if (!this.current(scope, identity) || epoch !== this._epoch) return
      const list = Array.isArray(dishes) ? dishes : []
      wx.setStorageSync(scope,list); this.setData({ dishes: list })
      if (this._requestedEdit) { const dish = list.find(item => String(item.id) === String(this._requestedEdit)); this._requestedEdit = null; if (dish) this.edit(dish) }
    } catch (error) { if (this.current(scope, identity) && epoch === this._epoch) this.setData({ dishes: wx.getStorageSync(scope) || [], errorMessage: flow.errorMessage(error, '云端读取失败，显示上次数据。请刷新后编辑。') }) }
    finally { if (this.current(scope, identity) && epoch === this._epoch) this.setData({ loading: false }) }
  },
  onViewDish(e) { wx.navigateTo({ url: '/pages/dish-detail/dish-detail?id=' + e.currentTarget.dataset.id }) },
  onEdit(e) { const dish = this.data.dishes.find(item => String(item.id) === String(e.currentTarget.dataset.id)); if (dish) this.edit(dish) },
  edit(dish) {
    if (!this.ensureOwner()) return
    this._editScope = getUserStorageKey('customDishesCloud'); this._original = JSON.parse(JSON.stringify(dish))
    if (!this._writeJournal) this._writeJournal = require('../../utils/personal-recipes').createWriteJournal()
    const pending = this._writeJournal.pending('dish:edit:' + dish.id)
    const source = pending || dish
    const recipeForm = require('../../utils/personal-recipes').recipeForm
    const form = pending ? recipeForm({ ...dish, ...pending, ingredientsAmounts: pending.cl, steps: pending.step, fl: pending.editServingDescription ? pending.fl : dish.fl, image: pending.editImage ? pending.image : dish.image }) : recipeForm(dish)
    this._editInitial = JSON.stringify({ form, type: source.type })
    this.setData({ editing: true, editExtrasVisible: false, formFocus: '', editPending: !!pending, formError: pending ? '上次保存结果未确认，重试将使用原内容' : '', form,
      editQualityNotice: require('../../utils/recipe-quality').editRecipeQualityNotice(dish, form), typeIndex: Math.max(0,['meat','veg','soup','staple','dessert'].indexOf(source.type)) }); this.syncEditLeaveAlert()
  },
  onInput(e) {
    if (!this.ensureOwner() || this.data.saving || this.data.editPending) return
    this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value, formFocus: '' })
    this.setData({ editQualityNotice: require('../../utils/recipe-quality').editRecipeQualityNotice(this._original, this.data.form) }); this.syncEditLeaveAlert()
  },
  onType(e) { if (this.ensureOwner() && !this.data.saving && !this.data.editPending) { this.setData({ typeIndex: Number(e.detail.value) }); this.syncEditLeaveAlert() } },
  onToggleEditExtras() { if (this.ensureOwner()) this.setData({ editExtrasVisible: !this.data.editExtrasVisible }) },
  editChanged() { return JSON.stringify({ form: this.data.form, type: ['meat','veg','soup','staple','dessert'][this.data.typeIndex] }) !== this._editInitial },
  syncEditLeaveAlert() {
    if (this.data.editing && (this.data.editPending || this.editChanged()) && wx.enableAlertBeforeUnload) wx.enableAlertBeforeUnload({ message: '菜谱修改尚未保存。离开会放弃未提交输入；结果待确认的原保存请求会保留。' })
    else if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload()
  },
  cancelEdit() {
    if (!this.ensureOwner() || this.data.saving) return
    if (this.data.editPending) return this.setData({ formError: '上次保存结果未确认，请先重试原保存，输入仍保留。' })
    if (!this.editChanged()) { this.setData({ editing: false }); this.syncEditLeaveAlert(); return }
    const scope = this._editScope, identity = this._identity
    wx.showModal({ title: '保留这次修改？', content: '修改尚未保存到我的菜谱。可继续编辑，或放弃修改。', confirmText: '放弃修改', cancelText: '保留编辑', success: result => {
      if (result.confirm && this.current(scope, identity) && !this.data.saving) { this.setData({ editing: false }); this.syncEditLeaveAlert() }
    } })
  },
  async saveEdit() {
    if (!this.ensureOwner()) return
    if (this.data.saving) return
    if (!this.current(this._editScope)) { this.onShow(); return }
    const scope = this._editScope, identity = this._identity, epoch = this._epoch
    const form = this.data.form, validation = require('../../utils/personal-recipes').recipeValidation(form, this._original)
    if (validation && !this.data.editPending) return this.setData({ formError: validation.message, formFocus: validation.field, editExtrasVisible: ['cookMinutes','image'].includes(validation.field) || this.data.editExtrasVisible })
    this.setData({ saving: true, formError: '' })
    try {
      const id = this._original.id
      const saved = await this._writeJournal.run('dish:edit:' + id, require('../../utils/personal-recipes').recipeEditBody(this._original, form, ['meat','veg','soup','staple','dessert'][this.data.typeIndex]), body => api.updateCustomDish(id, body))
      if (!this.current(scope, identity) || epoch !== this._epoch) return
      this.setData({ editing: false, personalSaveMessage: '菜谱已保存到我的菜谱，可在详情查看。' }); this.syncEditLeaveAlert(); wx.showToast({ title: '已保存到我的菜谱', icon: 'success' }); wx.navigateTo({ url: '/pages/dish-detail/dish-detail?id=' + encodeURIComponent(saved.id || id) })
    } catch (error) { if (this.current(scope, identity) && epoch === this._epoch) this.setData({ formError: flow.errorMessage(error, '保存失败，输入仍然保留，请重试。') }) }
    finally { if (this.current(scope, identity)) this.setData({ saving: false, editPending: !!this._writeJournal.pending('dish:edit:' + this._original.id) }) }
  },
  onReloadEdit() {
    if (!this.ensureOwner() || this.data.saving || this.data.editPending) return
    const scope = this._editScope, identity = this._identity
    wx.showModal({ title: '重新读取菜品？', content: '当前未保存的输入会放弃，显示云端最新内容。', success: result => {
      if (!result.confirm || !this.current(scope, identity)) return
      this._requestedEdit = this._original.id
      this.setData({ editing: false }); this.syncEditLeaveAlert(); this.loadCustomDishes()
    } })
  },
  onDelete(e) {
    if (!this.ensureOwner()) return
    const identity = this._identity, epoch = this._epoch
    const id = e.currentTarget.dataset.id, scope = getUserStorageKey('customDishesCloud')
    wx.showModal({ title: '删除自定义菜品？', content: '云端菜品会删除，已记录的实际用餐快照会保留。', confirmText: '删除', success: async result => {
      if (!result.confirm || this.data.saving || !this.current(scope, identity) || epoch !== this._epoch) return
      this.setData({ saving: true })
      try {
        const dish = this.data.dishes.find(item => String(item.id) === String(id))
        if (!dish) throw new Error('菜品已变化，请重新读取')
        if (!this._writeJournal) this._writeJournal = require('../../utils/personal-recipes').createWriteJournal()
        await this._writeJournal.run('dish:delete:' + id, { expectedVersion: dish.contentVersion }, body => api.deleteCustomDish(id, body)); if (this.current(scope, identity)) { wx.showToast({ title: '已删除', icon: 'success' }); await this.loadCustomDishes() } }
      catch (error) { if (this.current(scope, identity)) this.setData({ errorMessage: flow.errorMessage(error, '删除失败，菜品仍然保留') }) }
      finally { if (this.current(scope, identity)) this.setData({ saving: false }) }
    } })
  },
  onAdd() { wx.setStorageSync(getUserStorageKey('openCustomDishForm'),true); wx.switchTab({ url: '/pages/customize/customize' }) },
})
