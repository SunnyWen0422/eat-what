const api = require('../../utils/api')
const store = require('../../utils/shopping-list')
const { getUserStorageKey } = require('../../utils/util')
const flow = require('../../utils/meal-workflow')
const { isSafeQuantity } = require('../../utils/shopping-ingredients')
const { buildShoppingView, shoppingAddMessage } = require('../../utils/shopping-view')
Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(), targetPeople: 2, uniformPeople: false, dishes: [], warnings: [], previewLoading: true, confirmInFlight: false, errorMessage: '', formVisible: false, formQuantity: '', formError: '', editName: '', canConfirm: false, viewMode: 'summary', shoppingView: {}, itemCount: 0, unknownMessage: '', resultMessage: '', outcomeUnknown: false, sourceRows: [], sourcesVisible: false },
  onLoad() {
    this._scope = getUserStorageKey('shoppingList')
    this._draftKey = getUserStorageKey('shoppingPreparation')
    const selection = store.consumeShoppingSelection()
    const stored = wx.getStorageSync(this._draftKey)
    const saved = stored && !stored.retired ? stored : null
    // An unresolved request owns this preparation until its original receipt resolves.
    if (saved && saved.payload) {
      if (selection) store.beginShoppingSelection(selection)
      this.selection = saved.selection; this._selectionId = saved.selectionId; this._confirmedPayload = saved.payload
      this.setData({ ...saved.data, confirmInFlight: false, previewLoading: false, outcomeUnknown: true })
      this.refreshView(); return
    }
    this.selection = selection || (saved && saved.selection) || { dishIds: [], dishes: [], sources: [] }
    this._selectionId = saved && !selection ? saved.selectionId : flow.requestId('selection')
    if (saved && !selection) { this.setData({ ...saved.data, confirmInFlight: false, previewLoading: false }); this.refreshView(); return }
    this.setData({ targetPeople: Number(this.selection.targetPeople) || 2 }); this.loadPreview()
  },
  onUnload() { this.persist(); this._unloaded = true; this._epoch = (this._epoch || 0) + 1 },
  current() { return !this._unloaded && this._scope === getUserStorageKey('shoppingList') },
  sources() { return this.selection.sources && this.selection.sources.length ? this.selection.sources : [{ dishIds: this.selection.dishIds || [], targetPeople: this.data.targetPeople }] },
  reconcilePreparation() {
    if (!this.current() || !this._confirmedPayload) return
    const saved = wx.getStorageSync(this._draftKey)
    if (!saved) return
    if (saved.selectionId !== this._selectionId) {
      this._retired = true
      this.setData({ canConfirm: false, outcomeUnknown: false, errorMessage: '已有新的食材准备，请返回查看。' })
      return
    }
    if (saved.retired && saved.retiredRequestId === this._confirmedPayload.requestId) {
      this._retired = true
      this.setData({ canConfirm: false, outcomeUnknown: false, errorMessage: '这份本地草稿已处理，请返回重新选择；云端内容以购物清单为准。' })
    } else if (saved.payload && saved.payload.requestId !== this._confirmedPayload.requestId) {
      this._confirmedPayload = saved.payload
    }
  },
  persist() {
    this.reconcilePreparation()
    if (this._retired) return
    if (this.current() && this._draftKey && !this.data.resultMessage) wx.setStorageSync(this._draftKey, { selection: this.selection, selectionId: this._selectionId, payload: this._confirmedPayload || null, data: { dishes: this.data.dishes, warnings: this.data.warnings, targetPeople: this.data.targetPeople, uniformPeople: this.data.uniformPeople, canConfirm: this.data.canConfirm, viewMode: this.data.viewMode, errorMessage: this.data.errorMessage, outcomeUnknown: this.data.outcomeUnknown } })
  },
  locked() { return this._retired || !this.current() || this.data.confirmInFlight || this.data.outcomeUnknown || !!this.data.resultMessage },
  refreshView() {
    const shoppingView = buildShoppingView({ dishes: this.data.dishes })
    const unknown = shoppingView.groups.flatMap(group => group.items).filter(item => !item.userOverride && !isSafeQuantity(item)).length
    this.setData({ shoppingView, itemCount: shoppingView.pendingCount, unknownMessage: unknown ? `${unknown}项待确认，可先加入` : '' })
    this.persist()
  },
  onViewMode(e) { const mode = e.currentTarget.dataset.mode; if (mode === 'summary' || mode === 'dish') this.setData({ viewMode: mode }) },
  onSources(e) {
    const row = this.data.shoppingView.rows.find(item => item.key === e.currentTarget.dataset.key)
    if (!row) return
    const keys = new Set(row.sources.map(source => source.key))
    const sourceRows = []
    this.data.shoppingView.groups.forEach(group => group.items.forEach(item => {
      if (!keys.has(item.key)) return
      const dishIndex = this.data.dishes.findIndex(dish => dish.selectionKey === group.selectionKey)
      const itemIndex = this.data.dishes[dishIndex].items.findIndex(raw => raw.clientKey === item.clientKey)
      sourceRows.push({ ...item, dishIndex, itemIndex })
    }))
    this.setData({ sourceRows, sourcesVisible: true })
  },
  sourceEvent(e) {
    const key = e.currentTarget.dataset.key
    for (const group of this.data.shoppingView.groups) for (const item of group.items) if (item.key === key) {
      const dishIndex = this.data.dishes.findIndex(dish => dish.selectionKey === group.selectionKey)
      const itemIndex = this.data.dishes[dishIndex].items.findIndex(raw => raw.clientKey === item.clientKey)
      return { currentTarget: { dataset: { dishIndex, itemIndex } } }
    }
    return null
  },
  onEditSource(e) { const source = this.sourceEvent(e); if (source) this.onEditItem(source) },
  onRemoveSource(e) { const source = this.sourceEvent(e); if (source) this.onRemoveItem(source) },
  closeSources() { this.setData({ sourcesVisible: false }) },
  async loadPreview() {
    if (this.locked()) return
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
      this.setData({ dishes, warnings: [...new Set(warnings)], canConfirm: true }); this.refreshView()
    } catch (error) { if (epoch === this._epoch && this.current()) this.setData({ errorMessage: flow.errorMessage(error, '预览读取失败，请重试；原选择仍然保留。') }) }
    finally { if (epoch === this._epoch && this.current()) this.setData({ previewLoading: false }) }
  },
  async onPeopleChange(e) {
    if (this.locked()) return
    const value = Number(e.detail.value)
    if (value === this.data.targetPeople) return
    if (!Number.isInteger(value) || value < 1 || value > 50) { this.setData({ errorMessage: '人数应为 1 至 50 的整数' }); return }
    const approved = await new Promise(resolve => wx.showModal({ title: '重新计算全部食材？', content: '将所有餐次统一为新人数，之前编辑和移除的食材会重新生成。', success: r => resolve(r.confirm), fail: () => resolve(false) }))
    if (!approved || this.locked()) return
    this.setData({ targetPeople: value, uniformPeople: true }); this.loadPreview()
  },
  onRemoveItem(e) {
    if (this.locked()) return
    const { dishIndex, itemIndex } = e.currentTarget.dataset
    this._confirmedPayload = null
    this.setData({ dishes: this.data.dishes.map((dish, index) => index === Number(dishIndex) ? { ...dish, items: dish.items.filter((_, idx) => idx !== Number(itemIndex)) } : dish) }); this.setData({ sourcesVisible: false }); this.refreshView()
  },
  onEditItem(e) {
    if (this.locked()) return
    this._edit = { dishIndex: Number(e.currentTarget.dataset.dishIndex), itemIndex: Number(e.currentTarget.dataset.itemIndex) }
    const item = this.data.dishes[this._edit.dishIndex].items[this._edit.itemIndex]
    this.setData({ sourcesVisible: false, formVisible: true, editName: item.displayName, formQuantity: item.quantityText || '', formError: '' })
  },
  onQuantity(e) { this.setData({ formQuantity: e.detail.value }) }, closeForm() { this.setData({ formVisible: false }) },
  saveForm() {
    if (this.locked()) return
    const text = this.data.formQuantity.trim()
    if (!text || text.length > 255) return this.setData({ formError: '请输入不超过 255 字的用量和单位' })
    this._confirmedPayload = null
    this.setData({ formVisible: false, dishes: this.data.dishes.map((dish, index) => index !== this._edit.dishIndex ? dish : { ...dish, items: dish.items.map((item, idx) => idx !== this._edit.itemIndex ? item : { ...item, quantityText: text, quantityValue: null, quantityMin: null, quantityMax: null, userOverride: true }) }) }); this.setData({ sourcesVisible: false }); this.refreshView()
  },
  async onConfirm() {
    this.reconcilePreparation()
    if (this._retired) return
    if (this.data.confirmInFlight || this.data.resultMessage || this.data.previewLoading || !this.data.canConfirm || !this.current()) return
    const dishes = this.data.dishes.filter(dish => dish.items.length)
    if (!dishes.length) return this.setData({ errorMessage: '请至少保留一项食材' })
    this.setData({ confirmInFlight: true, errorMessage: '' })
    let payload
    try {
      if (!this._confirmedPayload) {
        const remote = await api.getShoppingList('all')
        if (!this.current()) return
        if (!remote || !Number.isSafeInteger(remote.version) || remote.version < 0 || !Array.isArray(remote.dishes)) throw { isNetworkError: true }
        if (remote.version >= store.loadLocalShoppingList().version) store.saveLocalShoppingList(remote)
        this._confirmedPayload = { requestId: flow.requestId('purchase'), previewId: this._selectionId, targetPeople: this.data.targetPeople, expectedListVersion: remote.version || 0, dishes: dishes.map(dish => ({ selectionKey: dish.selectionKey, sourceDate: dish.sourceDate, sourceMealType: dish.sourceMealType, targetPeople: dish.targetPeople, items: dish.items })) }
      }
      payload = this._confirmedPayload
      this.persist()
      store.enqueueShoppingOperation({ type: 'batch-add', label: '加入采购食材', payload })
      const result = await api.batchAddShoppingItems(payload)
      if (!this.current()) return
      this.reconcilePreparation()
      if (this._retired || this._confirmedPayload.requestId !== payload.requestId) return
      const list = result && (result.list || result)
      if (!result || result.success === false || !list || !Array.isArray(list.dishes) || !Number.isSafeInteger(list.version) || list.version <= payload.expectedListVersion || list.dishes.some(dish => !dish || !Array.isArray(dish.items || []) || (dish.items || []).some(item => !item))) throw { isNetworkError: true }
      if (list.version >= store.loadLocalShoppingList().version) store.saveLocalShoppingList(list)
      store.removePendingOperation(null, payload.requestId)
      this._confirmedPayload = null
      this.setData({ resultMessage: shoppingAddMessage(result), outcomeUnknown: false, canConfirm: false })
      wx.removeStorageSync(this._draftKey)
    } catch (error) {
      if (!this.current()) return
      // Reconcile before terminal errors clear the identity needed to detect retirement.
      this.reconcilePreparation()
      if (this._retired || (payload && this._confirmedPayload.requestId !== payload.requestId)) return
      if (error.statusCode === 409) {
        if (this._confirmedPayload) store.removePendingOperation(null, this._confirmedPayload.requestId)
        this._confirmedPayload = null
        this.setData({ outcomeUnknown: false, errorMessage: '清单已变化，预览和修改仍保留。再次确认会读取最新版本，保留已买标记和手动用量。' })
      } else if (error.isNetworkError || error.statusCode >= 500) this.setData({ outcomeUnknown: true, errorMessage: '云端结果待确认，已保留本次内容。可重试确认，或在购物清单查看待确认草稿。' })
      else { if (this._confirmedPayload) store.removePendingOperation(null, this._confirmedPayload.requestId); this._confirmedPayload = null; this.setData({ outcomeUnknown: false, errorMessage: flow.errorMessage(error) }) }
    } finally { if (this.current()) { this.setData({ confirmInFlight: false }); this.persist() } }
  },
  onBack() { wx.navigateBack() }, onShoppingList() { wx.redirectTo({ url: '/pages/shopping-list/shopping-list' }) },
})
