const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
function load(api, drafts) {
  const storage = new Map([['u:shoppingListPendingOps', drafts]])
  const sandbox = { module: { exports: {} }, Date, Math, console,
    wx: { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key) },
    require: name => name === './api' ? api : name === './util' ? { getUserStorageKey: key => `u:${key}` } : { buildPurchaseSummary: () => ({}) } }
  vm.runInNewContext(fs.readFileSync('utils/shopping-list.js', 'utf8'), sandbox)
  return sandbox.module.exports
}
test('draft replay stops at conflict and preserves later operations in order', async () => {
  const sent = []
  const store = load({ batchAddShoppingItems: async body => { sent.push(body.requestId); throw { statusCode: 409 } } },
    [{ type: 'batch-add', payload: { requestId: 'first', expectedListVersion: 2 } }, { type: 'batch-add', payload: { requestId: 'second', expectedListVersion: 3 } }])
  const result = await store.flushShoppingOperations()
  assert.deepEqual(sent, ['first'])
  assert.equal(result.remaining, 2)
  assert.equal(result.conflict, true)
})
test('successful replay removes only acknowledged drafts and saves authoritative list', async () => {
  const list = { version: 3, dishes: [] }
  const store = load({ addManualShoppingItem: async () => list }, [{ type: 'manual', payload: { requestId: 'm', expectedListVersion: 2 } }])
  const result = await store.flushShoppingOperations()
  assert.equal(result.remaining, 0)
  assert.equal(store.loadLocalShoppingList().version, 3)
})
