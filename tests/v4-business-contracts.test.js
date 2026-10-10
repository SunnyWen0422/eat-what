const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ingredients = require('../utils/shopping-ingredients')

function item(overrides = {}) {
  return { id: 1, sourceDishId: 9, selectionKey: 'dinner', canonicalName: '土豆', displayName: '土豆', unitCode: 'g', unitFamily: 'mass', parseStatus: 'PARSED', calculationStatus: 'CALCULATED', servingsVerified: true, quantityValue: 400, quantityText: '400g', sourceQuantityText: '土豆|200|g|主料', ...overrides }
}
test('unresolved numeric lines never merge with each other or contaminate a later verified line', () => {
  const raw = item({ calculationStatus: 'NEEDS_ADJUSTMENT', servingsVerified: false, quantityText: '原始200g', quantityValue: 200 })
  const rows = ingredients.mergeLocalItems([raw, raw, item()])
  assert.equal(rows.length, 3)
  assert.equal(rows[2].quantityValue, 400)
  const summary = ingredients.buildPurchaseSummary([{ dishName: '旧菜', items: [raw, item()] }])
  assert.equal(summary.mergeableItems.length, 1)
  assert.equal(summary.mergeableItems[0].quantityValue, 400)
  assert.equal(summary.separateItems.length, 1)
})
test('cached inferred servings are unresolved while explicit shopper overrides keep their original amounts', () => {
  const legacy = item({ servingsVerified: undefined })
  const manual = item({ servingsVerified: undefined, userOverride: true, calculationStatus: 'USER_OVERRIDE', quantityText: '我确认450g', quantityValue: 450 })
  const summary = ingredients.buildPurchaseSummary([{ dishName: '旧菜', items: [legacy, manual] }])
  assert.equal(summary.mergeableItems.length, 0)
  assert.equal(summary.separateItems[0].calculationStatus, 'NEEDS_ADJUSTMENT')
  assert.equal(summary.separateItems[0].quantityValue, null)
  assert.equal(summary.separateItems[0].quantityText, '土豆|200|g|主料')
  assert.equal(summary.separateItems[1].quantityValue, 450)
  assert.equal(summary.separateItems[1].quantityText, '我确认450g')
})
test('offline list reentry normalizes both meal view and summary without changing pending request bodies', () => {
  const pending = [{ payload: { requestId: 'retry-original', expectedListVersion: 2, dishes: [{ items: [item({ servingsVerified: undefined })] }] } }]
  const saved = { version: 3, dishes: [{ dishName: '旧菜', items: [item({ servingsVerified: undefined })] }] }
  const storage = new Map([['A:shoppingList', saved], ['A:shoppingListPendingOps', pending]])
  const context = { module: { exports: {} }, require: name => name === './util' ? { getUserStorageKey: name => `A:${name}` } : ingredients, wx: { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value) } }
  vm.runInNewContext(fs.readFileSync('utils/shopping-list.js', 'utf8'), context)
  const store = context.module.exports
  const loaded = store.loadLocalShoppingList()
  assert.equal(loaded.dishes[0].items[0].calculationStatus, 'NEEDS_ADJUSTMENT')
  assert.equal(loaded.dishes[0].items[0].quantityValue, null)
  assert.equal(loaded.purchaseSummary.mergeableItems.length, 0)
  assert.strictEqual(store.loadPendingOperations(), pending)
  assert.equal(pending[0].payload.dishes[0].items[0].quantityValue, 400)
  assert.equal(saved.dishes[0].items[0].quantityValue, 400)
  const rewritten = store.saveLocalShoppingList(saved)
  assert.equal(rewritten.dishes[0].items[0].calculationStatus, 'NEEDS_ADJUSTMENT')
  assert.equal(rewritten.version, 3)
})
test('label and unit edits keep server quantity warnings through cache reentry and summary rebuilding', () => {
  const unresolved = item({ displayName: '土豆大块', unitCode: 'kg', calculationStatus: 'NEEDS_ADJUSTMENT', servingsVerified: undefined, userOverride: false, quantityValue: null, quantityText: '土豆|200|g|主料', warnings: ['原始数量或份数需要核对'] })
  const confirmed = item({ calculationStatus: 'USER_OVERRIDE', servingsVerified: undefined, userOverride: true, quantityValue: 450, quantityText: '我确认450g', warnings: [] })
  const cloud = { version: 3, dishes: [{ dishName: '旧菜', items: [unresolved, confirmed] }] }
  const storage = new Map()
  const context = { module: { exports: {} }, require: name => name === './util' ? { getUserStorageKey: name => `A:${name}` } : ingredients, wx: { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value) } }
  vm.runInNewContext(fs.readFileSync('utils/shopping-list.js', 'utf8'), context)
  context.module.exports.saveLocalShoppingList(cloud)
  const loaded = context.module.exports.loadLocalShoppingList()
  const mealItem = loaded.dishes[0].items[0]
  const summaryItem = loaded.purchaseSummary.separateItems[0]
  for (const row of [mealItem, summaryItem]) {
    assert.equal(row.calculationStatus, 'NEEDS_ADJUSTMENT')
    assert.equal(row.userOverride, false)
    assert.equal(row.quantityValue, null)
    assert.equal(row.quantityText, '土豆|200|g|主料')
    assert.ok(row.warnings.includes('原始数量或份数需要核对'))
  }
  assert.equal(loaded.purchaseSummary.mergeableItems.length, 0)
  assert.equal(loaded.dishes[0].items[1].quantityValue, 450)
  assert.equal(loaded.dishes[0].items[1].quantityText, '我确认450g')
  assert.equal(loaded.purchaseSummary.separateItems[1].calculationStatus, 'USER_OVERRIDE')
})
test('actual editor retains historical indexes and sends changed selections through catalog ids', async () => {
  let page, body
  const api = { saveMealConsumption: async (date, meal, value) => { body = value } }
  const context = { Page: value => { page = value }, console, wx: {}, require: name => {
    if (name.endsWith('/meal-actual-entry')) return require('../utils/meal-actual-entry')
    if (name.endsWith('/api')) return api
    if (name.endsWith('/util')) return { getUserStorageKey: name => `A:${name}` }
    if (name.endsWith('/shopping-list')) return {}
    if (name.endsWith('/font-scale')) return () => 1
    if (name.endsWith('/meal-workflow')) return { ...require('../utils/meal-workflow'), requestId: () => 'actual-edit' }
    if (name.endsWith('/calendar-meal-presentation')) return require('../utils/calendar-meal-presentation')
    throw Error(name)
  } }
  vm.runInNewContext(fs.readFileSync('pages/calendar-detail/calendar-detail.js', 'utf8'), context)
  page.setData = value => Object.assign(page.data, value)
  page.run = operation => operation()
  page.data.selectedDate = '2026-01-01'
  page.data.formMode = 'actual'
  page.data.formMeal = 'dinner'
  page.data.formActual = '旧名鱼、外卖面、当前汤'
  page.data.meals = [{ mealType: 'dinner', actual: { revision: 2, actualDishes: [{ dishId: '9', name: '旧名鱼', type: 'meat' }, { name: '外卖面' }] }, plan: { revision: 8, dishDetails: [{ id: 12, name: '当前汤', type: 'soup' }] } }]
  await page.saveForm()
  assert.deepEqual(JSON.parse(JSON.stringify(body.dishes)), [{ retainedEntryIndex: 0 }, { retainedEntryIndex: 1 }, { dishId: 12 }])
  assert.equal(body.expectedRevision, 2)
  assert.equal(body.usePlan, false)
})
