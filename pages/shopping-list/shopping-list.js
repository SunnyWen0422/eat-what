const api = require('../../utils/api')
const store = require('../../utils/shopping-list')
const { getUserStorageKey } = require('../../utils/util')
const { buildShoppingView, createCheckUndo } = require('../../utils/shopping-view')
const experiencePreferences = require('../../utils/experience-preferences')
const tokens = require('../../utils/ui-tokens')
const flow = require('../../utils/meal-workflow')
const pricing = require('../../utils/shopping-prices')
const {decorateShoppingRows}=require('../../utils/shopping-list-presentation')
const confirm = (title, content, confirmText = '确认') => new Promise(resolve => wx.showModal({ title, content, confirmText, success: r => resolve(r.confirm), fail: () => resolve(false) }))
const emptyFeedback = () => ({ requestId: '', state: '', message: '', undoAvailable: false })
const clone = value => JSON.parse(JSON.stringify(value))
const operationSignature = (type, payload, itemId) => { const { requestId, expectedListVersion, ...body } = payload; return JSON.stringify([type, body, itemId]) }
Page({
  data: { feedback:emptyFeedback(),reducedMotion:false,summaryRowCount:0,pricingRows:[],pendingPrice:'—',actualSpend:'—',priceNotice:'',expensesEnabled:false,expenseVisible:false,expenseAmount:'',expenseChannel:'',channels:pricing.CHANNELS,moreVisible:false, fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(), loading: true, refreshing: false, busy: false, errorMessage: '', offline: false, statusFilter: 'pending', viewMode: 'summary', dishes: [], summaryRows: [], drafts: [], pendingCount: 0, checkedCount: 0, version: 0, formVisible: false, formMode: 'manual', formName: '', formQuantity: '', formQuantityEdited: false, formNote: '', formError: '' },
  onShow() { this.loadList() },
  onHide() { this.finishTransition() },
  onUnload() { this._unloaded = true; this._epoch = (this._epoch || 0) + 1; this.finishTransition() },
  onPageScroll(e) { this._scrollTop = Number(e.scrollTop) || 0 },
  restoreScroll(top = this._scrollTop || 0) { if (wx.pageScrollTo) wx.pageScrollTo({ scrollTop: top, duration: 0 }) },
  finishTransition() { if (this._transitionTimer) clearTimeout(this._transitionTimer); this._transitionTimer = null; this._settlingCheck = null; if (this._full && !this._unloaded) this.renderList() },
  invalidateUndo() {
    if (!this._undo) return
    this._undo = null
    this.setData({ feedback: { ...this.data.feedback, undoAvailable: false, message: '撤销已失效，可去已买改回。' } })
  },
  current(scope) { return !this._unloaded && scope === getUserStorageKey('shoppingList') },
  async loadList() {
    const scope = getUserStorageKey('shoppingList'), epoch = this._epoch = (this._epoch || 0) + 1
    this.finishTransition(); this.invalidateUndo()
    this.setData({ reducedMotion: experiencePreferences().get().reducedMotion })
    if (this._scope !== scope) { this._undo=null;this._expandedDishes=[];this._expandedSources=[];this.setData({feedback:emptyFeedback(),statusFilter:'pending',viewMode:'summary'});this.setData({detailsExpanded:false,moreVisible:false,addVisible:false});this._signature = null; this._pendingMutation = null; this.setData({ expenseVisible:false,pricingRows:[],actualSpend:'—',formVisible: false, formName: '', formQuantity: '', formQuantityEdited: false, formNote: '', busy: false }) }
    this._scope = scope
    this.applyList(store.loadLocalShoppingList())
    this.setData({ loading: !this._full.dishes.length, refreshing: true, errorMessage: '', drafts: store.loadPendingOperations() })
    try {
      const list = await api.getShoppingList('all')
      if (epoch !== this._epoch || !this.current(scope) || Number(list.version) < this.data.version) return
      this.applyList(store.saveLocalShoppingList(list)); this.setData({ offline: false })
    } catch (error) {
      if (epoch === this._epoch && this.current(scope)) this.setData({ offline: true, errorMessage: flow.errorMessage(error, '暂时无法读取云端，显示上次清单。新增内容可保存为待确认草稿。') })
    } finally { if (epoch === this._epoch && this.current(scope)) this.setData({ loading: false, refreshing: false }) }
  },
  applyList(list) {
    const next = { version: 0, dishes: [], ...list }
    if (this._undo && Number(next.version) !== this._undo.expectedListVersion) this.invalidateUndo()
    if (this._settlingCheck && Number(next.version) !== this._settlingCheck.version) this.finishTransition()
    this._full = next
    this.setData({ version: Number(next.version) || 0 }); this.renderList()
  },
  renderList() {
    const view = buildShoppingView(this._full, this.data.statusFilter)
    const transition = this._settlingCheck
    const display = transition && transition.status === this.data.statusFilter ? buildShoppingView(transition.before, this.data.statusFilter) : view
    const decorate = row => {
      const justChecked = !!(transition && row.itemIds.some(id => transition.itemIds.includes(id)))
      return { ...row, sourceExpanded: (this._expandedSources || []).includes(row.key), justChecked, checkedState: justChecked ? 'all' : row.checkedState }
    }
    const dishes = display.groups.map(group => ({ ...group, expanded: (this._expandedDishes || []).includes(group.key), items: group.items.map(decorate) }))
    this.setData({ pendingCount: view.pendingCount, checkedCount: view.checkedCount, summaryRowCount: view.summaryRowCount,
      dishes, summaryRows: decorateShoppingRows(display.rows.map(decorate), [], this._expandedSources || []) })
  },
  // Pricing remains available in its utilities/backend, but this page has no price entry or automatic read.
  async loadPrices(scope, epoch) { if (this.current(scope) && epoch === this._epoch) this.setData({ expensesEnabled: false, priceNotice: '' }) },
  onEditExpense(e) {const row=this.data.pricingRows.find(r=>r.ingredientKey===e.currentTarget.dataset.key);if(!row||!this.current(this._scope)||!this.data.expensesEnabled)return;this._expenseKey=row.ingredientKey;this.setData({expenseVisible:true,expenseName:row.displayName,expenseAmount:row.expense?String(row.expense.amount):'',expenseChannel:row.channel||'',formError:''})},
  onExpenseAmount(e){this.setData({expenseAmount:e.detail.value})},
  onExpenseChannel(e){this.setData({expenseChannel:pricing.CHANNELS[Number(e.detail.value)]})},
  closeExpense(){if(!this.data.busy)this.setData({expenseVisible:false})},
  saveExpense(){try{pricing.amountCents(this.data.expenseAmount)}catch(error){return this.setData({formError:error.message})}return this.perform(this.stableOperation('expense',{ingredientKey:this._expenseKey,amount:String(this.data.expenseAmount).trim(),channel:this.data.expenseChannel}))},
  removeExpense(){return this.perform(this.stableOperation('expense',{ingredientKey:this._expenseKey,remove:true}))},
  onCopyList(){wx.setClipboardData({data:pricing.copyPending(this._full)})},
  onMore(){this.setData({moreVisible:!this.data.moreVisible})},
  onPriceDetails(){this.setData({detailsExpanded:!this.data.detailsExpanded})},
  onSourceDetails(e){const key=e.detail && e.detail.key || e.currentTarget.dataset.key;this._expandedSources=this._expandedSources||[];this._expandedSources=this._expandedSources.includes(key)?this._expandedSources.filter(k=>k!==key):[...this._expandedSources,key];this.renderList()},
  onFilterChange(e) { const status=e.currentTarget.dataset.status; if (!['pending','checked'].includes(status)) return; this.finishTransition(); this.setData({ statusFilter: status }); this.renderList() },
  onViewMode(e) { const mode=e.currentTarget.dataset.mode; if (!['summary','byDish'].includes(mode)) return; this.finishTransition(); this.setData({ viewMode: mode }) },
  onToggleDish(e) { const key=e.currentTarget.dataset.key; this._expandedDishes=this._expandedDishes || []; this._expandedDishes=this._expandedDishes.includes(key) ? this._expandedDishes.filter(value=>value!==key) : [...this._expandedDishes,key]; this.renderList() },
  onEditRow(e) {
    if (this.data.busy) return
    const row=this.data.summaryRows.find(value=>value.key===e.currentTarget.dataset.key)
    if (!row) return
    if (row.itemIds.length===1) return this.onEditItem({currentTarget:{dataset:{id:row.itemIds[0]}}})
    if (!(this._expandedSources || []).includes(row.key)) this.onSourceDetails({currentTarget:{dataset:{key:row.key}}})
  },
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
    const signature = operationSignature(type, body, itemId)
    if (signature !== this._signature) {
      this._signature = signature
      // A page reentry must reuse an unresolved journal request, including its old version.
      const pending = store.loadPendingOperations().find(operation => (!operation.scope || operation.scope === this._scope) && operationSignature(operation.type, operation.payload || {}, operation.itemId) === signature)
      this._pendingMutation = pending || { scope: this._scope, type, itemId, payload: { ...body, expectedListVersion: this.data.version, requestId: flow.requestId(type) } }
    }
    return this._pendingMutation
  },
  async perform(operation) {
    if (!operation || this.data.busy || !this.current(this._scope) || operation.scope && operation.scope !== this._scope) return
    const scope = this._scope, before = clone(this._full), status = this.data.statusFilter
    const scrollTop = this._scrollTop || 0, viewMode = this.data.viewMode, invalidatedUndo = !!this._undo
    this.finishTransition(); this.invalidateUndo()
    this.setData({ busy: true, errorMessage: '', formError: '', feedback: { requestId: operation.payload.requestId, state: 'pending', message: '正在保存清单修改…', undoAvailable: false } })
    // Persist before dispatch: navigation and ambiguous server failures must never
    // lose the original request/version (including inverse-check context).
    try { store.enqueueShoppingOperation(operation) }
    catch (error) {
      this.setData({ busy: false, formError: '待确认草稿未保存，请重试。', feedback: { requestId: operation.payload.requestId, state: 'error', message: '待确认草稿未保存，尚未提交修改。', undoAvailable: false } })
      return
    }
    const stillPending = () => store.loadPendingOperations().some(value => value.payload && value.payload.requestId === operation.payload.requestId)
    try {
      let response
      if (operation.type === 'expense') response = await api.saveShoppingExpense(operation.payload)
      else if (operation.type === 'manual') response = await api.addManualShoppingItem(operation.payload)
      else if (operation.type === 'check') response = await api.checkShoppingItems(operation.payload)
      else if (operation.type === 'patch') response = await api.patchShoppingItemConfirmed(operation.itemId, operation.payload)
      else if (operation.type === 'delete') response = await api.deleteShoppingItemConfirmed(operation.itemId, operation.payload)
      else if (operation.type === 'clear') response = await api.clearShoppingList(operation.payload)
      if (!this.current(scope) || !stillPending()) return
      const list = response && (response.list || response)
      if (!response || response.success === false || !list || !Array.isArray(list.dishes) || !Number.isSafeInteger(list.version) || list.version <= operation.payload.expectedListVersion) throw { isNetworkError: true, message: '尚未读到可靠的清单结果' }
      const stale = list.version < this.data.version
      const undo = !stale && !operation.isUndo && operation.type === 'check' && before.version === operation.payload.expectedListVersion ? createCheckUndo(before, response, operation.payload.itemIds) : null
      if (operation.type === 'check') {
        const afterItems = new Map(list.dishes.flatMap(group => group.items || []).map(item => [String(item.id), item.checked]))
        if (operation.payload.itemIds.some(id => afterItems.get(String(id)) !== operation.payload.checked)) throw { isNetworkError: true, message: '勾选结果尚未确认' }
      }
      if (!stale) {
        const reducedMotion = experiencePreferences().get().reducedMotion
        this.setData({ reducedMotion })
        if (undo && operation.payload.checked && status === 'pending' && this.data.statusFilter === status && !reducedMotion) this._settlingCheck = { before, itemIds: undo.itemIds, status, version: list.version }
        if (operation.isUndo && operation.restoreView) this.setData(operation.restoreView)
        this.applyList(store.saveLocalShoppingList(list))
      }
      store.removePendingOperation(null, operation.payload.requestId)
      this._signature = null; this._pendingMutation = null
      this._undo = undo && { ...undo, scope, requestId: operation.payload.requestId, statusFilter: status, viewMode, scrollTop }
      const message = stale ? '这次修改已确认；清单已有更新，可去已买查看并改回。' : operation.type === 'check' ? operation.isUndo ? '已撤销勾选，回到原来的清单位置。' : operation.payload.checked ? '已标为已买' : '已移回待买' : '已保存到云端' + (invalidatedUndo ? '，撤销已失效，可去已买改回。' : '')
      this.setData({ expenseVisible: false, formVisible: false, offline: false, drafts: store.loadPendingOperations(), feedback: { requestId: operation.payload.requestId, state: 'success', message, undoAvailable: !!undo, undoLabel: '撤销勾选' } })
      if (this._settlingCheck) this._transitionTimer = setTimeout(() => { if (this.current(scope)) { this.finishTransition(); this.restoreScroll() } }, tokens.motion.row)
      if (operation.isUndo && !stale) this.restoreScroll(operation.restoreScroll == null ? scrollTop : operation.restoreScroll)
    } catch (error) {
      if (!this.current(scope) || !stillPending()) return
      if (error.isNetworkError || !error.statusCode || error.statusCode >= 500 || [401, 403, 408, 429].includes(error.statusCode)) {
        this.setData({ drafts: store.loadPendingOperations(), offline: true, formError: '已保存待确认草稿，尚未确认云端结果。可在下方重试。', errorMessage: '网络中断，云端结果待确认，清单没有被误标为已同步。', feedback: { requestId: operation.payload.requestId, state: 'unknown', message: '云端结果待确认，请按原草稿重试。', undoAvailable: false } })
      } else {
        if (error.statusCode !== 409) {
          store.removePendingOperation(null, operation.payload.requestId)
          this._signature = null; this._pendingMutation = null
          this.setData({ drafts: store.loadPendingOperations() })
        }
        const message = flow.errorMessage(error)
        this.setData({ formError: message, errorMessage: message, feedback: { requestId: operation.payload.requestId, state: 'error', message: operation.isUndo ? '撤销未完成，可去已买查看并改回。' : message, undoAvailable: false } })
        if (error.statusCode === 409) {
          const pending = store.loadPendingOperations().find(value => value.payload && value.payload.requestId === operation.payload.requestId)
          if (pending) store.replacePendingOperation(pending.operationId, { ...pending, conflict: true })
          await this.refreshConflict(scope); this._signature = null; this._pendingMutation = null
          this.setData({ drafts: store.loadPendingOperations() })
        }
      }
    } finally { if (this.current(scope)) this.setData({ busy: false }) }
  },
  async onUndoCheck(e) {
    const undo = this._undo
    if (!undo || this.data.busy || !this.current(undo.scope) || e.detail.requestId !== undo.requestId || this.data.version !== undo.expectedListVersion) { this.invalidateUndo(); return }
    const operation = { scope: undo.scope, type: 'check', isUndo: true, restoreView: { statusFilter: undo.statusFilter, viewMode: undo.viewMode }, restoreScroll: undo.scrollTop,
      payload: { itemIds: [...undo.itemIds], checked: undo.previousChecked, expectedListVersion: undo.expectedListVersion, requestId: flow.requestId('check-undo') } }
    this._undo = null
    return this.perform(operation)
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
    if (item && (item.checked === true) === (this.data.statusFilter === 'checked')) return this.perform(this.stableOperation('check', { itemIds: [item.id], checked: this.data.statusFilter === 'pending' }))
  },
  onToggleSummary(e) {
    const row = this.data.summaryRows.find(value => value.key === e.currentTarget.dataset.key)
    if (!row || !row.itemIds.length || row.justChecked) return
    const visible = row.itemIds.filter(id => { const item = this.findItem(id); return item && (item.checked === true) === (this.data.statusFilter === 'checked') })
    if (visible.length) return this.perform(this.stableOperation('check', { itemIds: visible, checked: this.data.statusFilter === 'pending' }))
  },
  async onDeleteItem(e) { const id = Number(e.currentTarget.dataset.id), origin = this._scope; if (await confirm('删除这项食材？', '删除后可重新从菜谱或手动添加。', '删除') && this.current(origin)) this.perform(this.stableOperation('delete', {}, id)) },
  async clear(scope) {
    if (this.data.busy || !['all','checked'].includes(scope)) return
    const origin=this._scope, version=this.data.version
    const count = scope === 'all' ? `待买 ${this.data.pendingCount} 项、已买 ${this.data.checkedCount} 项，共 ${this.data.pendingCount + this.data.checkedCount} 项` : `${this.data.checkedCount} 项已买食材`
    if (await confirm(scope === 'all' ? '删除全部食材？' : '移除已买食材？', `将移除${count}。不会改动日历、菜谱或实际饮食记录。`, '移除') && this.current(origin) && this.data.version === version) return this.perform(this.stableOperation('clear', { scope }))
  },
  onClearCompleted() { return this.clear('checked') }, onClearAll() { return this.clear('all') },
  async onRetryDrafts() {
    const scope = this._scope
    if (this.data.busy || !await confirm('重试待确认草稿？', '按原请求重试；遇到冲突会停止，不会覆盖最新数据。', '重试') || !this.current(scope)) return
    this.finishTransition(); this.invalidateUndo()
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
    if (operation.isUndo && operation.conflict) { await confirm('撤销版本已过期', '请刷新清单，到已买中查看并改回。原撤销不会强行应用到新版清单。', '知道了'); return }
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
