const api = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')
const flow = require('../../utils/meal-workflow')
Page({
  data: { fontScale: require('../../utils/font-scale')(), dishes: [], loading: true, errorMessage: '', editing: false, saving: false, form: {}, formError: '', types: ['荤菜','素菜','汤品','主食','甜品'], typeIndex: 0 },
  onLoad(options) { this._requestedEdit = options.edit },
  onShow() {
    if (this._viewScope !== getUserStorageKey('customDishesCloud')) { this._requestedEdit = null; this._original = null; this.setData({ editing: false, saving: false, dishes: [], form: {}, formError: '' }) }
    if (!this.data.editing) this.loadCustomDishes()
  },
  onUnload() { this._unloaded = true; this._epoch = (this._epoch || 0) + 1 },
  current(scope) { return !this._unloaded && scope === getUserStorageKey('customDishesCloud') },
  async loadCustomDishes() {
    const scope = getUserStorageKey('customDishesCloud'), epoch = this._epoch = (this._epoch || 0) + 1
    this._viewScope = scope
    this.setData({ loading: true, errorMessage: '' })
    try {
      const dishes = await api.getCustomDishes()
      if (!this.current(scope) || epoch !== this._epoch) return
      const list = Array.isArray(dishes) ? dishes : []
      wx.setStorageSync(scope,list); this.setData({ dishes: list })
      if (this._requestedEdit) { const dish = list.find(item => String(item.id) === String(this._requestedEdit)); this._requestedEdit = null; if (dish) this.edit(dish) }
    } catch (error) { if (this.current(scope) && epoch === this._epoch) this.setData({ dishes: wx.getStorageSync(scope) || [], errorMessage: flow.errorMessage(error, '云端读取失败，显示上次数据。请刷新后编辑。') }) }
    finally { if (this.current(scope) && epoch === this._epoch) this.setData({ loading: false }) }
  },
  onViewDish(e) { wx.navigateTo({ url: '/pages/dish-detail/dish-detail?id=' + e.currentTarget.dataset.id }) },
  onEdit(e) { const dish = this.data.dishes.find(item => String(item.id) === String(e.currentTarget.dataset.id)); if (dish) this.edit(dish) },
  edit(dish) {
    this._editScope = getUserStorageKey('customDishesCloud'); this._original = dish
    this.setData({ editing: true, formError: '', form: { name: dish.name, ingredients: String(dish.ingredientsAmounts || dish.cl || '').replace(/###|#/g,'\n'), steps: String(dish.step || dish.steps || '').replace(/###|#/g,'\n'), cookMinutes: dish.cookMinutes || '' }, typeIndex: Math.max(0,['meat','veg','soup','staple','dessert'].indexOf(dish.type)) })
  },
  onInput(e) { this.setData({ [`form.${e.currentTarget.dataset.field}`]: e.detail.value }) }, onType(e) { this.setData({ typeIndex: Number(e.detail.value) }) },
  cancelEdit() { if (!this.data.saving) this.setData({ editing: false }) },
  async saveEdit() {
    if (this.data.saving) return
    if (!this.current(this._editScope)) { this.onShow(); return }
    const form = this.data.form, minutes = Number(form.cookMinutes)
    if (!form.name.trim() || !form.ingredients.trim() || !form.steps.trim()) return this.setData({ formError: '请填写菜名、食材和步骤' })
    if (form.cookMinutes !== '' && (!Number.isInteger(minutes) || minutes < 1 || minutes > 240)) return this.setData({ formError: '烹饪时间应为 1 至 240 分钟' })
    this.setData({ saving: true, formError: '' })
    try {
      await api.updateCustomDish(this._original.id, { ...this._original, name: form.name.trim(), type: ['meat','veg','soup','staple','dessert'][this.data.typeIndex], cl: form.ingredients.trim().replace(/\n/g,'#'), ingredientsAmounts: form.ingredients.trim().replace(/\n/g,'#'), step: form.steps.trim().replace(/\n/g,'#'), cookMinutes: form.cookMinutes === '' ? null : minutes })
      if (!this.current(this._editScope)) return
      this.setData({ editing: false }); wx.showToast({ title: '菜品已保存', icon: 'success' }); await this.loadCustomDishes()
    } catch (error) { if (this.current(this._editScope)) this.setData({ formError: flow.errorMessage(error, '保存失败，输入仍然保留，请重试。') }) }
    finally { if (this.current(this._editScope)) this.setData({ saving: false }) }
  },
  onDelete(e) {
    const id = e.currentTarget.dataset.id, scope = getUserStorageKey('customDishesCloud')
    wx.showModal({ title: '删除自定义菜品？', content: '云端菜品会删除，已记录的实际用餐快照会保留。', confirmText: '删除', success: async result => {
      if (!result.confirm || this.data.saving || !this.current(scope)) return
      this.setData({ saving: true })
      try { await api.deleteCustomDish(id); if (this.current(scope)) { wx.showToast({ title: '已删除', icon: 'success' }); await this.loadCustomDishes() } }
      catch (error) { if (this.current(scope)) this.setData({ errorMessage: flow.errorMessage(error, '删除失败，菜品仍然保留') }) }
      finally { if (this.current(scope)) this.setData({ saving: false }) }
    } })
  },
  onAdd() { wx.setStorageSync(getUserStorageKey('openCustomDishForm'),true); wx.switchTab({ url: '/pages/customize/customize' }) },
})
