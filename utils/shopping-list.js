const { getUserStorageKey } = require('./util')
const { buildPurchaseSummary } = require('./shopping-ingredients')

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
  return saved && typeof saved === 'object' ? saved : defaultList()
}

function saveLocalShoppingList(list) {
  const next = { ...defaultList(), ...(list || {}) }
  next.purchaseSummary = buildPurchaseSummary(next.dishes)
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
      if (operation.type === 'batch-add') result = await api.batchAddShoppingItems(operation.payload)
      else if (operation.type === 'manual') result = await api.addManualShoppingItem(operation.payload)
      else if (operation.type === 'check') result = await api.checkShoppingItems(operation.payload)
      else if (operation.type === 'patch') result = await api.patchShoppingItemConfirmed(operation.itemId, operation.payload)
      else if (operation.type === 'delete') result = await api.deleteShoppingItemConfirmed(operation.itemId, operation.payload)
      else if (operation.type === 'clear') result = await api.clearShoppingList(operation.payload)
      else throw new Error('无法识别该草稿，请重新确认内容')
      if (scope !== key('pendingOps')) return { remaining: operations.length, accountChanged: true }
      saveLocalShoppingList(result.list || result)
      removePendingOperation(operation.operationId, operation.payload && operation.payload.requestId)
    } catch (error) {
      return { remaining: loadPendingOperations().length, conflict: error.statusCode === 409, error }
    }
  }
  return { remaining: loadPendingOperations().length, conflict: false }
}

function removePendingOperation(operationId, requestId) {
  wx.setStorageSync(key('pendingOps'), loadPendingOperations().filter(item => operationId
    ? item.operationId !== operationId : !item.payload || item.payload.requestId !== requestId))
}

function replacePendingOperation(operationId, operation) {
  wx.setStorageSync(key('pendingOps'), loadPendingOperations().map(item => item.operationId === operationId ? operation : item))
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
