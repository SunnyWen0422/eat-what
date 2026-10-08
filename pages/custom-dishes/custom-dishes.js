const api = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')
const flow = require('../../utils/meal-workflow')
const { currentIdentity } = require('../../utils/account-identity')
Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(), dishes: [], loading: true, errorMessage: '', editing: false, saving: false, form: {}, formError: '', editPending: false, types: ['荤菜','素菜','汤品','主食','甜品'], typeIndex: 0 },
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
    this._requestedEdit = null; this._original = null; this._editScope = null
    this.setData({ editing: false, saving: false, editPending: false, loading: false, dishes: [], form: {}, formError: '', errorMessage: '', typeIndex: 0 })
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
    this._editScope = getUserStorageKey('customDishesCloud'); this._original = dish
    if (!this._writeJournal) this._writeJournal = require('../../utils/personal-recipes').createWriteJournal()
    const pending = this._writeJournal.pending('dish:edit:' + dish.id)
    const source = pending || dish
    const recipeText = require('../../utils/personal-recipes').editableRecipeText
    this.setData({ editing: true, editPending: !!pending, formError: pending ? '上次保存结果未确认，重试将使用原内容' : '', form: { name: source.name, ingredients: recipeText(source.ingredientsAmounts || source.cl), steps: recipeText(source.steps || source.step), cookMinutes: source.cookMinutes || '' }, typeIndex: Math.max(0,['meat','veg','soup','staple','dessert'].indexOf(source.type)) })
  },
  onInput(e) { if (this.data.saving || this.data.editPending) return; this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value }) }, onType(e) { if (this.data.saving || this.data.editPending) return; this.setData({ typeIndex: Number(e.detail.value) }) },
  cancelEdit() { if (!this.data.saving) this.setData({ editing: false }) },
  async saveEdit() {
    if (!this.ensureOwner()) return
    if (this.data.saving) return
    if (!this.current(this._editScope)) { this.onShow(); return }
    const scope = this._editScope, identity = this._identity, epoch = this._epoch
    const form = this.data.form, minutes = Number(form.cookMinutes)
    if (!form.name.trim() || !form.ingredients.trim() || !form.steps.trim()) return this.setData({ formError: '请填写菜名、食材和步骤' })
    if (form.cookMinutes !== '' && (!Number.isInteger(minutes) || minutes < 1 || minutes > 240)) return this.setData({ formError: '烹饪时间应为 1 至 240 分钟' })
    this.setData({ saving: true, formError: '' })
    try {
      await this._writeJournal.run('dish:edit:' + this._original.id, { expectedVersion: this._original.contentVersion, name: form.name.trim(), type: ['meat','veg','soup','staple','dessert'][this.data.typeIndex], cl: form.ingredients.trim().replace(/\n/g,'#'), ingredientsAmounts: form.ingredients.trim().replace(/\n/g,'#'), step: form.steps.trim().replace(/\n/g,'#'), cookMinutes: form.cookMinutes === '' ? null : minutes }, body => api.updateCustomDish(this._original.id, body))
      if (!this.current(scope, identity) || epoch !== this._epoch) return
      this.setData({ editing: false }); wx.showToast({ title: '菜品已保存', icon: 'success' }); await this.loadCustomDishes()
    } catch (error) { if (this.current(scope, identity) && epoch === this._epoch) this.setData({ formError: flow.errorMessage(error, '保存失败，输入仍然保留，请重试。') }) }
    finally { if (this.current(scope, identity)) this.setData({ saving: false, editPending: !!this._writeJournal.pending('dish:edit:' + this._original.id) }) }
  },
  onReloadEdit() {
    if (!this.ensureOwner() || this.data.saving || this.data.editPending) return
    const scope = this._editScope, identity = this._identity
    wx.showModal({ title: '重新读取菜品？', content: '当前未保存的输入会放弃，显示云端最新内容。', success: result => {
      if (!result.confirm || !this.current(scope, identity)) return
      this._requestedEdit = this._original.id
      this.setData({ editing: false }); this.loadCustomDishes()
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
