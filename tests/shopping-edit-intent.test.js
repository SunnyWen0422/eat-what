const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ingredients = require('../utils/shopping-ingredients')
const flow = require('../utils/meal-workflow')
const read = file => fs.readFileSync(file, 'utf8')
const plain = value => JSON.parse(JSON.stringify(value))
const unresolved = (changes = {}) => ({ id: 5, displayName: '土豆', canonicalName: '土豆', quantityText: '原始200g', sourceQuantityText: '原始200g', quantityValue: null, calculationStatus: 'NEEDS_ADJUSTMENT', servingsVerified: false, userOverride: false, warnings: ['原始数量或份数需要核对'], checked: false, ...changes })
const listOf = (item, version = 2) => ({ version, dishes: [{ dishId: 9, dishName: '炖菜', selectionKey: 'meal-one', items: [item] }] })

function shoppingPage({ item = unresolved(), patch, drafts = [] } = {}) {
  let account = 'A'
  const storage = new Map([['A:shoppingListPendingOps', plain(drafts)]])
  const sent = []
  const util = { getUserStorageKey: key => `${account}:${key}` }
  const wx = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key), showToast() {} }
  let store
  const api = {
    patchShoppingItemConfirmed: async (id, payload) => {
      sent.push({ type: 'patch', id, payload: plain(payload) })
      return patch ? patch(id, payload) : { list: listOf(item, 3) }
    },
    addManualShoppingItem: async payload => { sent.push({ type: 'manual', payload: plain(payload) }); return { list: listOf(unresolved({ userOverride: true, calculationStatus: 'USER_OVERRIDE', quantityText: '2个', warnings: [] }), 3) } },
    getShoppingList: async () => store.loadLocalShoppingList(),
  }
  const sandbox = { module: { exports: {} }, wx, console, require: name => name === './api' ? api : name === './util' ? util : ingredients }
  vm.runInNewContext(read('utils/shopping-list.js'), sandbox)
  store = sandbox.module.exports
  store.saveLocalShoppingList(listOf(item))
  function createPage() {
    let page
    const modules = { '../../utils/shopping-list-presentation': require('../utils/shopping-list-presentation'), '../../utils/shopping-prices': require('../utils/shopping-prices'), '../../utils/shopping-capabilities': {refresh:async()=>({}),notice:()=>''}, '../../utils/api': api, '../../utils/shopping-list': store, '../../utils/util': util, '../../utils/shopping-ingredients': ingredients, '../../utils/meal-workflow': flow, '../../utils/font-scale': Object.assign(() => 1, { base: 14 }) }
    vm.runInNewContext(read('pages/shopping-list/shopping-list.js'), { Page: value => { page = value }, wx, console, require: name => modules[name] })
    page.data = structuredClone(page.data)
    page.setData = values => Object.assign(page.data, values)
    page._scope = 'A:shoppingList'
    page.applyList(store.loadLocalShoppingList())
    return page
  }
  return { page: createPage(), createPage, store, storage, sent, switchAccount: () => { account = 'B' } }
}

function warningsInBothViews(page, expected) {
  const expressions = [...read('pages/shopping-list/shopping-list.wxml').matchAll(/<view wx:if="([^"]+)" class="quantity-warning">/g)].map(match => match[1].slice(2, -2))
  assert.equal(expressions.length, 2)
  const rows = [page.data.summaryRows[0], page.data.dishes[0].items[0]]
  expressions.forEach((expression, index) => assert.equal(vm.runInNewContext(expression, { item: rows[index] }), expected))
}

test('real shopping name-only edit sends no prefilled quantity and preserves both warnings through cache reentry', async () => {
  const view = shoppingPage({ patch: async (id, payload) => {
    assert.equal(id, 5)
    assert.equal(payload.displayName, '土豆大块')
    for (const field of ['quantityText', 'quantityValue', 'quantityMin', 'quantityMax']) assert.equal(Object.hasOwn(payload, field), false, `untouched ${field} must be absent`)
    // Fixture from V4ShoppingContractTest: a label-only service patch retains unresolved source text.
    return { list: listOf(unresolved({ displayName: '土豆大块' }), 3) }
  } })
  view.page.onEditItem({ currentTarget: { dataset: { id: 5 } } })
  assert.equal(view.page.data.formQuantity, '原始200g')
  view.page.onName({ detail: { value: '土豆大块' } })
  view.page.onNote({ detail: { value: '非数量字段' } })
  await view.page.saveForm()
  assert.equal(view.sent.length, 1)
  assert.equal(Object.hasOwn(view.sent[0].payload, 'quantityText'), false)
  warningsInBothViews(view.page, true)
  const reentry = view.createPage()
  await reentry.loadList()
  warningsInBothViews(reentry, true)
  assert.equal(reentry.data.dishes[0].items[0].userOverride, false)
})

test('actively confirming the identical prefilled quantity sends a quantity patch and removes warnings in both cached views', async () => {
  const view = shoppingPage({ patch: async (id, payload) => {
    assert.equal(payload.quantityText, '原始200g')
    return { list: listOf(unresolved({ userOverride: true, calculationStatus: 'USER_OVERRIDE', warnings: [] }), 3) }
  } })
  view.page.onEditItem({ currentTarget: { dataset: { id: 5 } } })
  view.page.onQuantity({ detail: { value: '原始200g' } })
  await view.page.saveForm()
  warningsInBothViews(view.page, false)
  const reentry = view.createPage()
  await reentry.loadList()
  warningsInBothViews(reentry, false)
})

test('failed quantity confirmation retains typed input and intent for an identical-key retry', async () => {
  let attempts = 0
  const view = shoppingPage({ patch: async () => { if (++attempts === 1) throw { statusCode: 500 }; return { list: listOf(unresolved({ quantityText: '我确认半袋', userOverride: true, calculationStatus: 'USER_OVERRIDE', warnings: [] }), 3) } } })
  view.page.onEditItem({ currentTarget: { dataset: { id: 5 } } })
  view.page.onName({ detail: { value: '土豆大块' } })
  view.page.onQuantity({ detail: { value: '我确认半袋' } })
  await view.page.saveForm()
  assert.equal(view.page.data.formVisible, true)
  assert.equal(view.page.data.formName, '土豆大块')
  assert.equal(view.page.data.formQuantity, '我确认半袋')
  assert.equal(view.page.data.busy, false)
  assert.ok(view.page.data.formError)
  await view.page.saveForm()
  assert.deepEqual(view.sent[1].payload, view.sent[0].payload)
  assert.equal(view.sent[1].payload.quantityText, '我确认半袋')
})

test('cancel never edits a list and reopening does not inherit an abandoned quantity confirmation', async () => {
  const view = shoppingPage()
  const before = plain(view.page._full)
  view.page.onEditItem({ currentTarget: { dataset: { id: 5 } } })
  view.page.onName({ detail: { value: '取消的名称' } })
  view.page.onQuantity({ detail: { value: '取消的数量' } })
  view.page.closeForm()
  assert.deepEqual(plain(view.page._full), before)
  assert.equal(view.sent.length, 0)
  view.page.onEditItem({ currentTarget: { dataset: { id: 5 } } })
  view.page.onName({ detail: { value: '土豆大块' } })
  await view.page.saveForm()
  assert.equal(Object.hasOwn(view.sent[0].payload, 'quantityText'), false)
})

for (const item of [unresolved({ calculationStatus: 'CALCULATED', servingsVerified: true, quantityValue: 450, quantityText: '450g', sourceQuantityText: '450g', unitFamily: 'mass', unitCode: 'g', parseStatus: 'PARSED', warnings: [] }), unresolved({ userOverride: true, calculationStatus: 'USER_OVERRIDE', quantityValue: 450, quantityText: '我确认450g', warnings: [] })]) test(`name-only edits preserve ${item.calculationStatus} quantity compatibility`, async () => {
  const view = shoppingPage({ item, patch: async () => ({ list: listOf({ ...item, displayName: '我的食材', userOverride: true, calculationStatus: 'USER_OVERRIDE' }, 3) }) })
  view.page.onEditItem({ currentTarget: { dataset: { id: 5 } } })
  view.page.onName({ detail: { value: '我的食材' } })
  await view.page.saveForm()
  assert.equal(Object.hasOwn(view.sent[0].payload, 'quantityText'), false)
  assert.equal(view.page.data.dishes[0].items[0].quantityValue, 450)
  assert.equal(view.page.data.dishes[0].items[0].quantityText, item.quantityText)
  warningsInBothViews(view.page, false)
})

test('manual add keeps explicit quantity and note fields', async () => {
  const view = shoppingPage()
  view.page.onAddManual()
  view.page.onName({ detail: { value: '鸡蛋' } })
  view.page.onQuantity({ detail: { value: '2个' } })
  view.page.onNote({ detail: { value: '小包装' } })
  await view.page.saveForm()
  assert.equal(view.sent[0].type, 'manual')
  assert.equal(view.sent[0].payload.name, '鸡蛋')
  assert.equal(view.sent[0].payload.quantityText, '2个')
  assert.equal(view.sent[0].payload.note, '小包装')
})

test('new metadata-only drafts preserve old pending payloads and retain their own original key/version on retry', async () => {
  const old = { operationId: 'legacy-op', scope: 'A:shoppingList', type: 'patch', itemId: 5, payload: { displayName: '旧名称', quantityText: '原始200g', requestId: 'legacy-patch', expectedListVersion: 1 } }
  const view = shoppingPage({ drafts: [old], patch: async (id, payload) => { throw payload.requestId === 'legacy-patch' ? { statusCode: 409 } : { isNetworkError: true } } })
  view.page.onEditItem({ currentTarget: { dataset: { id: 5 } } })
  view.page.onName({ detail: { value: '新名称' } })
  await view.page.saveForm()
  const first = view.sent[0].payload
  assert.equal(Object.hasOwn(first, 'quantityText'), false)
  assert.deepEqual(plain(view.store.loadPendingOperations()[0]), old)
  view.page.applyList(listOf(unresolved(), 9))
  await view.page.saveForm()
  assert.deepEqual(view.sent[1].payload, first)
  assert.equal(view.store.loadPendingOperations().length, 2)
  const replay = await view.store.flushShoppingOperations()
  assert.equal(replay.conflict, true)
  assert.deepEqual(view.sent[2].payload, old.payload)
  assert.deepEqual(plain(view.store.loadPendingOperations()[0]), old)
})
