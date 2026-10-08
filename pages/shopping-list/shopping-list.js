const api = require('../../utils/api')
const store = require('../../utils/shopping-list')
const { getUserStorageKey } = require('../../utils/util')
const { buildPurchaseSummary } = require('../../utils/shopping-ingredients')
const flow = require('../../utils/meal-workflow')
const pricing = require('../../utils/shopping-prices')
const capabilities = require('../../utils/shopping-capabilities')
const {decorateShoppingRows}=require('../../utils/shopping-list-presentation')
const confirm = (title, content, confirmText = '确认') => new Promise(resolve => wx.showModal({ title, content, confirmText, success: r => resolve(r.confirm), fail: () => resolve(false) }))
const sourceLabel = dish => dish.sourceDate ? `${dish.sourceDate} ${flow.mealNames[dish.sourceMealType] || ''} · ${dish.dishName}` : dish.dishId ? dish.dishName : '手动添加'
Page({
  data: { pricingRows:[],pendingPrice:'—',actualSpend:'—',priceNotice:'',expensesEnabled:false,expenseVisible:false,expenseAmount:'',expenseChannel:'',channels:pricing.CHANNELS,moreVisible:false, fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(), loading: true, refreshing: false, busy: false, errorMessage: '', offline: false, statusFilter: 'pending', viewMode: 'summary', dishes: [], summaryRows: [], drafts: [], pendingCount: 0, checkedCount: 0, version: 0, formVisible: false, formMode: 'manual', formName: '', formQuantity: '', formQuantityEdited: false, formNote: '', formError: '' },
  onShow() { this.loadList() },
  onUnload() { this._unloaded = true; this._epoch = (this._epoch || 0) + 1 },
  current(scope) { return !this._unloaded && scope === getUserStorageKey('shoppingList') },
  async loadList() {
    const scope = getUserStorageKey('shoppingList'), epoch = this._epoch = (this._epoch || 0) + 1
    if (this._scope !== scope) { this._expandedSources=[];this.setData({detailsExpanded:false,moreVisible:false,addVisible:false});this._signature = null; this._pendingMutation = null; this.setData({ expenseVisible:false,pricingRows:[],actualSpend:'—',formVisible: false, formName: '', formQuantity: '', formQuantityEdited: false, formNote: '', busy: false }) }
    this._scope = scope
    this.applyList(store.loadLocalShoppingList())
    this.setData({ loading: !this._full.dishes.length, refreshing: true, errorMessage: '', drafts: store.loadPendingOperations() })
    try {
      const list = await api.getShoppingList('all')
      if (epoch !== this._epoch || !this.current(scope)) return
      this.applyList(store.saveLocalShoppingList(list)); this.setData({ offline: false });this.loadPrices(scope,epoch)
    } catch (error) {
      if (epoch === this._epoch && this.current(scope)) this.setData({ offline: true, errorMessage: flow.errorMessage(error, '暂时无法读取云端，显示上次清单。新增内容可保存为待确认草稿。') })
    } finally { if (epoch === this._epoch && this.current(scope)) this.setData({ loading: false, refreshing: false }) }
  },
  applyList(list) {
    this._full = { version: 0, dishes: [], ...list }
    let pendingCount = 0, checkedCount = 0
    for (const group of this._full.dishes) for (const item of group.items || []) item.checked ? checkedCount++ : pendingCount++
    this.setData({ version: Number(this._full.version) || 0, pendingCount, checkedCount }); this.renderList()
  },
  renderList() {
    const filter = this.data.statusFilter
    const groups = this._full.dishes.map(group => ({ ...group, sourceLabel: sourceLabel(group), items: (group.items || []).filter(item => filter === 'all' || (filter === 'checked' ? item.checked : !item.checked)) })).filter(group => group.items.length)
    const summary = buildPurchaseSummary(groups)
    const rows = [...summary.mergeableItems, ...summary.separateItems].map((item, index) => ({ ...item, rowKey: `summary-${index}`, itemIds: item.itemIds || [item.id].filter(Boolean), note: !item.sourceDishId ? item.sourceQuantityText || '' : '', sourceLabel: (item.sources || []).map(source => sourceLabel(source)).join('；') || item.sourceDishLabel || '手动添加', checkedState: item.checkedState || (item.checked ? 'all' : 'none') }))
    const cost=pricing.buildPricing(this._full,this._quotes||{});this.setData({ dishes: groups, summaryRows:decorateShoppingRows(rows,cost.rows,this._expandedSources||[]), pricingRows:cost.rows,pendingPrice:cost.pendingText,actualSpend:cost.actualText,missingPrices:cost.pendingMissing })
  },
  async loadPrices(scope,epoch) {
    const config=await capabilities.refresh()
    if(!this.current(scope)||epoch!==this._epoch)return
    this.setData({expensesEnabled:config.expensesEnabled,priceNotice:capabilities.notice()})
    if(!config.pricesEnabled)return
    const version=this._full.version
    try {const rows=pricing.buildPricing(this._full).rows;const quotes=await api.getIngredientPriceQuotes(rows.map(r=>({ingredientKey:r.ingredientKey,canonicalName:r.canonicalName,normalizedVariant:r.normalizedVariant})));if(this.current(scope)&&epoch===this._epoch&&version===this._full.version){this._quotes=quotes;this.renderList()}}
    catch(error){if(this.current(scope)&&epoch===this._epoch){if(error.statusCode===404)capabilities.markQuotesUnavailable();this.setData({priceNotice:'暂无可用官方参考价，清单和实付记录仍可使用'})}}
  },
  onEditExpense(e) {const row=this.data.pricingRows.find(r=>r.ingredientKey===e.currentTarget.dataset.key);if(!row||!this.current(this._scope)||!this.data.expensesEnabled)return;this._expenseKey=row.ingredientKey;this.setData({expenseVisible:true,expenseName:row.displayName,expenseAmount:row.expense?String(row.expense.amount):'',expenseChannel:row.channel||'',formError:''})},
  onExpenseAmount(e){this.setData({expenseAmount:e.detail.value})},
  onExpenseChannel(e){this.setData({expenseChannel:pricing.CHANNELS[Number(e.detail.value)]})},
  closeExpense(){if(!this.data.busy)this.setData({expenseVisible:false})},
  saveExpense(){try{pricing.amountCents(this.data.expenseAmount)}catch(error){return this.setData({formError:error.message})}return this.perform(this.stableOperation('expense',{ingredientKey:this._expenseKey,amount:String(this.data.expenseAmount).trim(),channel:this.data.expenseChannel}))},
  removeExpense(){return this.perform(this.stableOperation('expense',{ingredientKey:this._expenseKey,remove:true}))},
  onCopyList(){wx.setClipboardData({data:pricing.copyPending(this._full)})},
  onMore(){this.setData({moreVisible:!this.data.moreVisible})},
  onPriceDetails(){this.setData({detailsExpanded:!this.data.detailsExpanded})},
  onSourceDetails(e){const key=e.currentTarget.dataset.key;this._expandedSources=this._expandedSources||[];this._expandedSources=this._expandedSources.includes(key)?this._expandedSources.filter(k=>k!==key):[...this._expandedSources,key];this.renderList()},
  onFilterChange(e) { this.setData({ statusFilter: e.currentTarget.dataset.status }); this.renderList() },
  onViewMode(e) { this.setData({ viewMode: e.currentTarget.dataset.mode }) },
  onAddOptions() { if(!this.data.busy)this.setData({addVisible:!this.data.addVisible}) },
  onAddManual() { this.setData({ addVisible:false, formVisible: true, formMode: 'manual', formName: '', formQuantity: '', formQuantityEdited: false, formNote: '', formError: '' }) },
  onEditItem(e) {
    const item = this.findItem(e.currentTarget.dataset.id)
    if (!item) return
    this._editId = item.id
    this.setData({ formVisible: true, formMode: 'edit', formName: item.displayName, formQuantity: item.quantityText || '', formQuantityEdited: false, formNote: '', formError: '' })
  },
  findItem(id) { for (const group of this._full.dishes) { const item = (group.items || []).find(row => String(row.id) === String(id)); if (item) return item } },
  onName(e) { this.setData({ formName: e.detail.value }) },
  // An input event is explicit quantity intent even when the shopper confirms the same text.
  onQuantity(e) { this.setData({ formQuantity: e.detail.value, formQuantityEdited: true }) },
  onNote(e) { this.setData({ formNote: e.detail.value }) },
  closeForm() { if (!this.data.busy) this.setData({ formVisible: false }) },
  stableOperation(type, body, itemId) {
    const signature = JSON.stringify([type, body, itemId])
    if (signature !== this._signature) { this._signature = signature; this._pendingMutation = { scope: this._scope, type, itemId, payload: { ...body, expectedListVersion: this.data.version, requestId: flow.requestId(type) } } }
    return this._pendingMutation
  },
  async perform(operation) {
    if (this.data.busy || !this.current(this._scope) || operation.scope && operation.scope !== this._scope) return
    const scope = this._scope
    this.setData({ busy: true, errorMessage: '', formError: '' })
    try {
      let response
      if (operation.type === 'expense') response = await api.saveShoppingExpense(operation.payload)
      else if (operation.type === 'manual') response = await api.addManualShoppingItem(operation.payload)
      else if (operation.type === 'check') response = await api.checkShoppingItems(operation.payload)
      else if (operation.type === 'patch') response = await api.patchShoppingItemConfirmed(operation.itemId, operation.payload)
      else if (operation.type === 'delete') response = await api.deleteShoppingItemConfirmed(operation.itemId, operation.payload)
      else if (operation.type === 'clear') response = await api.clearShoppingList(operation.payload)
      if (!this.current(scope)) return
      this.applyList(store.saveLocalShoppingList(response.list || response))
      store.removePendingOperation(null, operation.payload.requestId)
      this._signature = null
      this.setData({ expenseVisible:false, formVisible: false, offline: false, drafts: store.loadPendingOperations() })
      wx.showToast({ title: '已保存到云端', icon: 'success' })
    } catch (error) {
      if (!this.current(scope)) return
      if (error.isNetworkError) {
        store.enqueueShoppingOperation(operation)
        this.setData({ drafts: store.loadPendingOperations(), offline: true, formError: '已保存待确认草稿，尚未确认云端结果。可在下方重试。', errorMessage: '网络中断，云端结果待确认，清单没有被误标为已同步。' })
      } else {
        const message = flow.errorMessage(error)
        this.setData({ formError: message, errorMessage: message })
        if (error.statusCode === 409) { await this.refreshConflict(scope); this._signature = null }
      }
    } finally { if (this.current(scope)) this.setData({ busy: false }) }
  },
  async refreshConflict(scope) {
    try { const remote = await api.getShoppingList('all'); if (this.current(scope)) this.applyList(store.saveLocalShoppingList(remote)) }
    catch (error) { if (this.current(scope)) this.setData({ offline: true, errorMessage: '发生版本冲突，最新清单暂未读到。请联网刷新后确认。' }) }
  },
  saveForm() {
    const name = this.data.formName.trim(), quantityText = this.data.formQuantity.trim()
    const manual = this.data.formMode === 'manual', quantityConfirmed = manual || this.data.formQuantityEdited
    if (!name || name.length > 255 || quantityConfirmed && (!quantityText || quantityText.length > 255)) return this.setData({ formError: '请填写食材名称和用量，两者各不超过 255 字。' })
    const body = manual ? { name, quantityText, note: this.data.formNote.trim() } : { displayName: name }
    if (!manual && quantityConfirmed) body.quantityText = quantityText
    return this.perform(this.stableOperation(this.data.formMode === 'manual' ? 'manual' : 'patch', body, this.data.formMode === 'edit' ? this._editId : undefined))
  },
  onToggleItem(e) {
    const item = this.findItem(e.currentTarget.dataset.id)
    if (item) this.perform(this.stableOperation('check', { itemIds: [item.id], checked: !item.checked }))
  },
  onToggleSummary(e) {
    const row = this.data.summaryRows[e.currentTarget.dataset.index]
    if (row && row.itemIds.length) this.perform(this.stableOperation('check', { itemIds: row.itemIds, checked: row.checkedState !== 'all' }))
  },
  async onDeleteItem(e) { const id = Number(e.currentTarget.dataset.id), origin = this._scope; if (await confirm('删除这项食材？', '删除后可重新从菜谱或手动添加。', '删除') && this.current(origin)) this.perform(this.stableOperation('delete', {}, id)) },
  async clear(scope) { const origin = this._scope; if (await confirm(scope === 'all' ? '清空全部食材？' : '清空已购食材？', '该操作会保存到云端，请确认清空范围。', '清空') && this.current(origin)) this.perform(this.stableOperation('clear', { scope })) },
  onClearCompleted() { return this.clear('checked') }, onClearAll() { return this.clear('all') },
  async onRetryDrafts() {
    const scope = this._scope
    if (this.data.busy || !await confirm('重试待确认草稿？', '按原请求重试；遇到冲突会停止，不会覆盖最新数据。', '重试') || !this.current(scope)) return
    this.setData({ busy: true })
    try {
      const result = await store.flushShoppingOperations()
      if (!this.current(scope)) return
      this.setData({ drafts: store.loadPendingOperations(), errorMessage: result.remaining ? result.conflict ? '草稿版本已过期，请查看并重新确认这项修改。' : '仍有待确认草稿，联网后可重试。' : '' })
      if (result.conflict) { const first = store.loadPendingOperations()[0]; if (first) store.replacePendingOperation(first.operationId, { ...first, conflict: true }); this.setData({ drafts: store.loadPendingOperations() }) }
      await this.loadList()
      if (result.conflict) this.setData({ errorMessage: '请查看冲突草稿，重新确认后才会应用到最新清单。' })
    } finally { if (this.current(scope)) this.setData({ busy: false }) }
  },
  async onReviewDraft(e) {
    const scope = this._scope
    const operation = store.loadPendingOperations().find(item => item.operationId === e.currentTarget.dataset.id)
    if (!operation) return
    const detail = operation.type === 'manual' ? `${operation.payload.name} ${operation.payload.quantityText || ''}` : operation.type === 'batch-add' ? (operation.payload.dishes || []).map(d => `${d.sourceDate || ''} ${flow.mealNames[d.sourceMealType] || ''} ${(d.items || []).map(i => i.displayName).join('、')}`).join('；') : `${operation.type} · 原清单版本 ${operation.payload.expectedListVersion}`
    if (!operation.conflict) { await confirm('草稿内容', detail + '\n云端结果待确认，请先点击重试草稿。', '知道了'); return }
    if (!await confirm('重新确认冲突草稿？', `${detail}\n将以刚读取的清单版本 ${this.data.version} 提交。`, '应用修改') || !this.current(scope)) return
    const next = { ...operation, conflict: false, payload: { ...operation.payload, expectedListVersion: this.data.version, requestId: flow.requestId(operation.type) } }
    store.replacePendingOperation(operation.operationId, next)
    await this.onRetryDrafts()
  },
  async onDiscardDraft(e) { const scope = this._scope; if (await confirm('丢弃本地草稿？', '只移除待确认草稿；云端可能已保存的内容请刷新查看。', '丢弃') && this.current(scope)) { store.removePendingOperation(e.currentTarget.dataset.id); this.setData({ drafts: store.loadPendingOperations() }) } },
  onBackToToday() { wx.switchTab({ url: '/pages/index/index' }) },
  onAddFromRecipe() { this.setData({addVisible:false}); wx.switchTab({ url: '/pages/customize/customize' }) },
})
