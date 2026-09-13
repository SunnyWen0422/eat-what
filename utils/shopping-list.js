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
  operations.push({ operationId: `op-${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: Date.now(), ...operation })
  wx.setStorageSync(key('pendingOps'), operations)
  return operations.length
}

async function flushShoppingOperations() {
  const api = require('./api')
  const operations = loadPendingOperations()
  const remaining = []
  for (const operation of operations) {
    try {
      if (operation.type === 'batch-add') await api.batchAddShoppingItems(operation.payload)
      else if (operation.type === 'patch') await api.patchShoppingItem(operation.itemId, operation.payload)
      else if (operation.type === 'delete') await api.deleteShoppingItem(operation.itemId, operation.payload)
      else if (operation.type === 'clear') await api.clearShoppingList(operation.payload)
    } catch (error) {
      remaining.push(operation)
    }
  }
  wx.setStorageSync(key('pendingOps'), remaining)
  return remaining.length
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
}
