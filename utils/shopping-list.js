const { getUserStorageKey } = require('./util')
const { buildPurchaseSummary, normalizeQuantitySafety } = require('./shopping-ingredients')

const STORAGE_KEYS = {
  list: 'shoppingList',
  pendingOps: 'shoppingListPendingOps',
  syncMeta: 'shoppingListSyncMeta',
  pendingSelection: 'pendingShoppingSelection',
}

function key(name) { return getUserStorageKey(STORAGE_KEYS[name]) }

function defaultList() {
  return {
    listId: null,
    version: 0,
    dishes: [],
    purchaseSummary: { mergeableItems: [], separateItems: [] },
    pendingCount: 0,
    checkedCount: 0,
    metadataVersion: 1,
  }
}

function loadLocalShoppingList() {
  const saved = wx.getStorageSync(key('list'))
  return normalizeList(saved && typeof saved === 'object' ? saved : defaultList())
}

function normalizeList(list) {
  const next = { ...defaultList(), ...(list || {}) }
  next.dishes = (next.dishes || []).map(dish => ({ ...dish, items: (dish.items || []).map(normalizeQuantitySafety) }))
  next.purchaseSummary = buildPurchaseSummary(next.dishes)
  return next
}

function saveLocalShoppingList(list) {
  const next = normalizeList(list)
  wx.setStorageSync(key('list'), next)
  return next
}

function loadPendingOperations() { return wx.getStorageSync(key('pendingOps')) || [] }

function enqueueShoppingOperation(operation) {
  const operations = loadPendingOperations()
  if (!operations.some(item => item.payload && operation.payload && item.payload.requestId === operation.payload.requestId))
    operations.push({ operationId: `op-${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: Date.now(), ...operation })
  wx.setStorageSync(key('pendingOps'), operations)
  return operations.length
}

async function flushShoppingOperations() {
  const api = require('./api')
  const scope = key('pendingOps')
  const operations = loadPendingOperations()
  for (const operation of operations) {
    try {
      let result
      if (operation.type === 'expense') result = await api.saveShoppingExpense(operation.payload)
      else if (operation.type === 'batch-add') result = await api.batchAddShoppingItems(operation.payload)
      else if (operation.type === 'manual') result = await api.addManualShoppingItem(operation.payload)
      else if (operation.type === 'check') result = await api.checkShoppingItems(operation.payload)
      else if (operation.type === 'patch') result = await api.patchShoppingItemConfirmed(operation.itemId, operation.payload)
      else if (operation.type === 'delete') result = await api.deleteShoppingItemConfirmed(operation.itemId, operation.payload)
      else if (operation.type === 'clear') result = await api.clearShoppingList(operation.payload)
      else throw new Error('无法识别该草稿，请重新确认内容')
      if (scope !== key('pendingOps')) return { remaining: operations.length, accountChanged: true }
      if (!loadPendingOperations().some(item => item.operationId === operation.operationId && item.payload && item.payload.requestId === operation.payload.requestId)) return { remaining: loadPendingOperations().length, superseded: true }
      const list = result && (result.list || result)
      // A replay resolves the original request; its stored receipt need not be
      // the newest list. Validate before acknowledging, then never rewind cache.
      const expected = operation.payload && operation.payload.expectedListVersion
      if (!result || result.success === false || !list || !Array.isArray(list.dishes)
        || !Number.isSafeInteger(list.version) || list.version < 0
        || (Number.isSafeInteger(expected) && list.version <= expected)
        || list.dishes.some(dish => !dish || !Array.isArray(dish.items || []) || (dish.items || []).some(item => !item))) {
        throw { isNetworkError: true, message: '尚未读到可靠的清单结果，保留原草稿重试。' }
      }
      if (operation.type === 'check') {
        const payload = operation.payload || {}
        const checked = new Map(list.dishes.flatMap(dish => dish.items || []).map(item => [String(item.id), item.checked]))
        if (!Array.isArray(payload.itemIds) || !payload.itemIds.length || typeof payload.checked !== 'boolean'
          || payload.itemIds.some(id => checked.get(String(id)) !== payload.checked)) {
          throw { isNetworkError: true, message: '勾选结果尚未确认，保留原草稿重试。' }
        }
      }
      const current = loadLocalShoppingList()
      if (list.version >= current.version) saveLocalShoppingList(list)
      removePendingOperation(operation.operationId, operation.payload && operation.payload.requestId)
    } catch (error) {
      if (scope !== key('pendingOps')) return { remaining: operations.length, accountChanged: true }
      if (!loadPendingOperations().some(item => item.operationId === operation.operationId && item.payload && item.payload.requestId === operation.payload.requestId)) return { remaining: loadPendingOperations().length, superseded: true }
      return { remaining: loadPendingOperations().length, conflict: error.statusCode === 409, error }
    }
  }
  return { remaining: loadPendingOperations().length, conflict: false }
}

// Explicit journal lifecycle transitions reconcile the matching preparation only.
// A missing journal entry alone is never evidence that a request was resolved.
function reconcilePreparation(requestId, replacement) {
  const preparationKey = getUserStorageKey('shoppingPreparation')
  const saved = wx.getStorageSync(preparationKey)
  if (!saved || !saved.payload || saved.payload.requestId !== requestId) return
  wx.setStorageSync(preparationKey, replacement
    ? { ...saved, payload: replacement, retired: false }
    : { ...saved, payload: null, retired: true, retiredRequestId: requestId })
}

function removePendingOperation(operationId, requestId) {
  const matches = item => (!operationId || item.operationId === operationId) && (!requestId || item.payload && item.payload.requestId === requestId) && !!(operationId || requestId)
  const operations = loadPendingOperations()
  for (const item of operations.filter(matches)) if (item.payload) reconcilePreparation(item.payload.requestId, null)
  wx.setStorageSync(key('pendingOps'), operations.filter(item => !matches(item)))
}

function replacePendingOperation(operationId, operation) {
  const operations = loadPendingOperations()
  const previous = operations.find(item => item.operationId === operationId)
  if (previous && previous.payload && operation.payload) reconcilePreparation(previous.payload.requestId, operation.payload)
  wx.setStorageSync(key('pendingOps'), operations.map(item => item.operationId === operationId ? operation : item))
}

function beginShoppingSelection(selection) { wx.setStorageSync(key('pendingSelection'), selection); return selection }
function consumeShoppingSelection() {
  const selection = wx.getStorageSync(key('pendingSelection')) || null
  wx.removeStorageSync(key('pendingSelection'))
  return selection
}

module.exports = {
  STORAGE_KEYS,
  loadLocalShoppingList,
  saveLocalShoppingList,
  enqueueShoppingOperation,
  flushShoppingOperations,
  beginShoppingSelection,
  consumeShoppingSelection,
  loadPendingOperations,
  removePendingOperation,
  replacePendingOperation,
}
