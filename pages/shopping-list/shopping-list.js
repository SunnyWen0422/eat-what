const api = require('../../utils/api')
const { loadLocalShoppingList, saveLocalShoppingList, enqueueShoppingOperation, flushShoppingOperations, loadPendingOperations, beginShoppingSelection } = require('../../utils/shopping-list')
const { buildPurchaseSummary } = require('../../utils/shopping-ingredients')

Page({
  data: {
    dishes: [],
    statusFilter: 'pending',
    loading: true,
    refreshing: false,
    syncState: 'unknown',
    pendingCount: 0,
    checkedCount: 0,
    version: 0,
    summaryExpanded: false,
    purchaseSummary: { mergeableItems: [], separateItems: [] },
    errorMessage: '',
  },

  onShow() {
    this.loadList()
  },

  async loadList() {
    const local = loadLocalShoppingList()
    this.applyList(local, 'local')
    this.setData({ loading: this.data.dishes.length === 0, refreshing: true, errorMessage: '' })
    try {
      const pending = await flushShoppingOperations()
      const remote = await api.getShoppingList(this.data.statusFilter)
      this.applyList(remote, pending ? 'pending' : 'synced')
    } catch (error) {
      const pending = loadPendingOperations().length
      this.setData({ syncState: pending ? `待同步 ${pending} 项` : '离线模式', errorMessage: '已保留本地清单，待联网同步' })
    } finally {
      this.setData({ loading: false, refreshing: false })
    }
  },

  applyList(list, syncState) {
    const dishes = (list && Array.isArray(list.dishes)) ? list.dishes : []
    const summary = list && list.purchaseSummary ? list.purchaseSummary : buildPurchaseSummary(dishes)
    this.setData({ version: Number(list.version) || 0, dishes, purchaseSummary: summary, pendingCount: list.pendingCount || countItems(dishes, false), checkedCount: list.checkedCount || countItems(dishes, true), syncState })
  },

  onFilterChange(e) {
    this.setData({ statusFilter: e.currentTarget.dataset.status })
    this.loadList()
  },

  onToggleSummary() { this.setData({ summaryExpanded: !this.data.summaryExpanded }) },

  async onToggleItem(e) {
    const { dishIndex, itemIndex } = e.currentTarget.dataset
    const item = this.data.dishes[dishIndex].items[itemIndex]
    await this.mutateItem(dishIndex, itemIndex, { checked: !item.checked })
  },

  onEditItem(e) {
    const { dishIndex, itemIndex } = e.currentTarget.dataset
    const item = this.data.dishes[dishIndex].items[itemIndex]
    wx.showModal({
      title: `调整${item.displayName || '食材'}用量`,
      editable: true,
      content: item.quantityText || '',
      success: (result) => {
        if (result.confirm && String(result.content || '').trim()) this.mutateItem(dishIndex, itemIndex, { quantityText: result.content.trim(), userOverride: true })
      },
    })
  },

  async mutateItem(dishIndex, itemIndex, patch) {
    const dishes = this.data.dishes.map((dish, dIdx) => dIdx === Number(dishIndex)
      ? { ...dish, items: dish.items.map((item, iIdx) => iIdx === Number(itemIndex) ? { ...item, ...patch } : item) }
      : dish)
    const local = saveLocalShoppingList({ ...loadLocalShoppingList(), dishes, purchaseSummary: buildPurchaseSummary(dishes) })
    this.applyList(local, 'pending')
    const item = dishes[dishIndex].items[itemIndex]
    if (!item.id) return
    try {
      const remote = await api.patchShoppingItem(item.id, { ...patch, expectedListVersion: local.version })
      this.applyList(remote, 'synced')
    } catch (error) {
      enqueueShoppingOperation({ type: 'patch', itemId: item.id, payload: { ...patch, expectedListVersion: local.version } })
      this.setData({ syncState: '本地已更新，等待同步' })
    }
  },

  async onDeleteItem(e) {
    const { dishIndex, itemIndex } = e.currentTarget.dataset
    const item = this.data.dishes[dishIndex].items[itemIndex]
    const dishes = this.data.dishes.map((dish, index) => index === Number(dishIndex) ? { ...dish, items: dish.items.filter((_, i) => i !== Number(itemIndex)) } : dish)
    saveLocalShoppingList({ ...loadLocalShoppingList(), dishes })
    this.applyList({ ...loadLocalShoppingList(), dishes }, 'pending')
    if (!item.id) return
    const payload = { expectedListVersion: loadLocalShoppingList().version || 0 }
    try { await api.deleteShoppingItem(item.id, payload) } catch (error) { enqueueShoppingOperation({ type: 'delete', itemId: item.id, payload }) }
  },

  onClearCompleted() { this.clearItems('completed') },

  onClearAll() {
    wx.showModal({ title: '清空全部清单', content: '清空后将删除所有菜品明细，确定继续吗？', success: (result) => { if (result.confirm) this.clearItems('all') } })
  },

  async clearItems(scope) {
    const payload = { requestId: `clear-${Date.now()}-${Math.random().toString(16).slice(2)}`, scope, expectedListVersion: loadLocalShoppingList().version || 0 }
    try {
      const remote = await api.clearShoppingList(payload)
      this.applyList(remote, 'synced')
      saveLocalShoppingList(remote)
    } catch (error) {
      const local = loadLocalShoppingList()
      const dishes = scope === 'all' ? [] : local.dishes.map(dish => ({ ...dish, items: dish.items.filter(item => !item.checked) }))
      saveLocalShoppingList({ ...local, dishes })
      enqueueShoppingOperation({ type: 'clear', payload })
      this.applyList({ ...local, dishes }, 'pending')
    }
  },

  onAddFromRecipe() { wx.switchTab({ url: '/pages/customize/customize' }) },
  onAddManual() {
    wx.showModal({ title: '手动添加食材', editable: true, placeholderText: '例如：鸡蛋 6个', success: (result) => {
      if (!result.confirm || !String(result.content || '').trim()) return
      const item = { clientKey: `manual-${Date.now()}`, displayName: result.content.trim(), quantityText: '需调整', parseStatus: 'NEEDS_ADJUSTMENT', calculationStatus: 'NEEDS_ADJUSTMENT', userOverride: true, checked: false }
      const dishes = [...this.data.dishes, { selectionKey: `manual-${Date.now()}`, dishName: '手动添加', targetPeople: null, items: [item] }]
      saveLocalShoppingList({ ...loadLocalShoppingList(), dishes })
      this.applyList({ ...loadLocalShoppingList(), dishes }, 'pending')
    } })
  },

  onBack() { wx.navigateBack() },
})

function countItems(dishes, checked) {
  return (dishes || []).reduce((sum, dish) => sum + (dish.items || []).filter(item => !!item.checked === checked).length, 0)
}
