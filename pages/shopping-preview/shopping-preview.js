const api = require('../../utils/api')
const store = require('../../utils/shopping-list')
const { getUserStorageKey } = require('../../utils/util')
const flow = require('../../utils/meal-workflow')
Page({
  data: { fontScale: require('../../utils/font-scale')(), targetPeople: 2, uniformPeople: false, dishes: [], warnings: [], previewLoading: true, confirmInFlight: false, errorMessage: '', formVisible: false, formQuantity: '', formError: '', editName: '', canConfirm: false },
  onLoad() {
    this.selection = store.consumeShoppingSelection() || { dishIds: [], dishes: [], sources: [] }
    this._scope = getUserStorageKey('shoppingList'); this._selectionId = flow.requestId('selection')
    this.setData({ targetPeople: Number(this.selection.targetPeople) || 2 }); this.loadPreview()
  },
  onUnload() { this._unloaded = true; this._epoch = (this._epoch || 0) + 1 },
  current() { return !this._unloaded && this._scope === getUserStorageKey('shoppingList') },
  sources() { return this.selection.sources && this.selection.sources.length ? this.selection.sources : [{ dishIds: this.selection.dishIds || [], targetPeople: this.data.targetPeople }] },
  async loadPreview() {
    const epoch = this._epoch = (this._epoch || 0) + 1
    this.setData({ previewLoading: true, errorMessage: '', canConfirm: false })
    try {
      const sources = this.sources(), previewRequests = new Map()
      for (const source of sources) {
        const people = this.data.uniformPeople ? Number(this.data.targetPeople) : Number(source.targetPeople) || Number(this.data.targetPeople)
        if (!previewRequests.has(people)) previewRequests.set(people, new Set())
        for (const id of source.dishIds || []) previewRequests.get(people).add(id)
      }
      const previews = new Map(await Promise.all([...previewRequests].map(async ([people, ids]) => [people, await api.createShoppingPreview({ dishIds: [...ids], targetPeople: people, clientRequestId: this._selectionId })])))
      if (epoch !== this._epoch || !this.current()) return
      const dishes = [], seen = new Set(), warnings = []
      for (const source of sources) {
        const people = this.data.uniformPeople ? Number(this.data.targetPeople) : Number(source.targetPeople) || Number(this.data.targetPeople)
        const preview = previews.get(people)
        warnings.push(...preview.warnings || [])
        for (const id of source.dishIds || []) {
          const original = (preview.dishes || []).find(dish => String(dish.dishId) === String(id))
          if (!original) throw new Error('菜品已失效，请返回重新选择')
          const selectionKey = source.sourceDate ? `meal-${source.sourceDate}-${source.sourceMealType}-${id}` : `${this._selectionId}-${id}`
          if (seen.has(selectionKey)) continue
          seen.add(selectionKey)
          dishes.push({ ...original, sourceDate: source.sourceDate, sourceMealType: source.sourceMealType, sourceLabel: source.sourceDate ? `${source.sourceDate} ${flow.mealNames[source.sourceMealType] || ''}` : '本次菜谱', selectionKey, items: (original.items || []).map(item => ({ ...item, clientKey: `${selectionKey}-${item.sourceLineNo}` })) })
        }
      }
      this._confirmedPayload = null
      this.setData({ dishes, warnings: [...new Set(warnings)], canConfirm: true })
    } catch (error) { if (epoch === this._epoch && this.current()) this.setData({ errorMessage: flow.errorMessage(error, '预览读取失败，请重试；原选择仍然保留。') }) }
    finally { if (epoch === this._epoch && this.current()) this.setData({ previewLoading: false }) }
  },
  async onPeopleChange(e) {
    const value = Number(e.detail.value)
    if (!Number.isInteger(value) || value < 1 || value > 50) { this.setData({ errorMessage: '人数应为 1 至 50 的整数' }); return }
    const approved = await new Promise(resolve => wx.showModal({ title: '重新计算全部食材？', content: '将所有餐次统一为新人数，之前编辑和移除的食材会重新生成。', success: r => resolve(r.confirm), fail: () => resolve(false) }))
    if (!approved) return
    this.setData({ targetPeople: value, uniformPeople: true }); this.loadPreview()
  },
  onRemoveItem(e) {
    if (this.data.confirmInFlight) return
    const { dishIndex, itemIndex } = e.currentTarget.dataset
    this._confirmedPayload = null
    this.setData({ dishes: this.data.dishes.map((dish, index) => index === Number(dishIndex) ? { ...dish, items: dish.items.filter((_, idx) => idx !== Number(itemIndex)) } : dish) })
  },
  onEditItem(e) {
    if (this.data.confirmInFlight) return
    this._edit = { dishIndex: Number(e.currentTarget.dataset.dishIndex), itemIndex: Number(e.currentTarget.dataset.itemIndex) }
    const item = this.data.dishes[this._edit.dishIndex].items[this._edit.itemIndex]
    this.setData({ formVisible: true, editName: item.displayName, formQuantity: item.quantityText || '', formError: '' })
  },
  onQuantity(e) { this.setData({ formQuantity: e.detail.value }) }, closeForm() { this.setData({ formVisible: false }) },
  saveForm() {
    const text = this.data.formQuantity.trim()
    if (!text || text.length > 255) return this.setData({ formError: '请输入不超过 255 字的用量和单位' })
    this._confirmedPayload = null
    this.setData({ formVisible: false, dishes: this.data.dishes.map((dish, index) => index !== this._edit.dishIndex ? dish : { ...dish, items: dish.items.map((item, idx) => idx !== this._edit.itemIndex ? item : { ...item, quantityText: text, quantityValue: null, quantityMin: null, quantityMax: null, userOverride: true }) }) })
  },
  async onConfirm() {
    if (this.data.confirmInFlight || !this.data.canConfirm || !this.current()) return
    const dishes = this.data.dishes.filter(dish => dish.items.length)
    if (!dishes.length) return this.setData({ errorMessage: '请至少保留一项食材' })
    this.setData({ confirmInFlight: true, errorMessage: '' })
    try {
      if (!this._confirmedPayload) {
        const remote = await api.getShoppingList('all')
        if (!this.current()) return
        store.saveLocalShoppingList(remote)
        this._confirmedPayload = { requestId: flow.requestId('purchase'), previewId: this._selectionId, targetPeople: this.data.targetPeople, expectedListVersion: remote.version || 0, dishes: dishes.map(dish => ({ selectionKey: dish.selectionKey, sourceDate: dish.sourceDate, sourceMealType: dish.sourceMealType, targetPeople: dish.targetPeople, items: dish.items })) }
      }
      const payload = this._confirmedPayload
      store.enqueueShoppingOperation({ type: 'batch-add', label: '加入采购食材', payload })
      const result = await api.batchAddShoppingItems(payload)
      if (!this.current()) return
      store.saveLocalShoppingList(result.list || result); store.removePendingOperation(null, payload.requestId)
      wx.showToast({ title: '已加入购物清单', icon: 'success' }); wx.redirectTo({ url: '/pages/shopping-list/shopping-list' })
    } catch (error) {
      if (!this.current()) return
      if (error.statusCode === 409) {
        if (this._confirmedPayload) store.removePendingOperation(null, this._confirmedPayload.requestId)
        this._confirmedPayload = null
        this.setData({ errorMessage: '清单已变化，预览和修改仍保留。再次确认会读取最新版本，保留已买标记和手动用量。' })
      } else if (error.isNetworkError) this.setData({ errorMessage: '云端结果待确认，已保留本次内容。可重试确认，或在购物清单查看待确认草稿。' })
      else { if (this._confirmedPayload) store.removePendingOperation(null, this._confirmedPayload.requestId); this.setData({ errorMessage: flow.errorMessage(error) }) }
    } finally { if (this.current()) this.setData({ confirmInFlight: false }) }
  },
  onBack() { wx.navigateBack() }, onShoppingList() { wx.redirectTo({ url: '/pages/shopping-list/shopping-list' }) },
})
