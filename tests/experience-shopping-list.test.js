const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ingredients = require('../utils/shopping-ingredients')
const flow = require('../utils/meal-workflow')
const read = path => fs.readFileSync(path, 'utf8')
const plain = value => JSON.parse(JSON.stringify(value))
const shoppingView = () => require('../utils/shopping-view')
const item = (id, name, changes = {}) => ({ id, displayName: name, canonicalName: name, quantityValue: 100, quantityText: '100g', unitCode: 'g', unitFamily: 'mass', parseStatus: 'PARSED', calculationStatus: 'CALCULATED', servingsVerified: true, checked: false, warnings: [], ...changes })
const group = (key, date, items, changes = {}) => ({ selectionKey: key, dishId: 9, dishName: '番茄炒蛋', sourceDate: date, sourceMealType: 'dinner', items, ...changes })
const eightSources = () => ({ listId: 1, version: 2, expenses: { old: { amount: '9.00' } }, dishes: [
  group('day-one', '2026-10-09', [item(1, '鸡蛋', { quantityValue: 1, quantityText: '1个', unitFamily: 'count', unitCode: '个' }), item(2, '番茄'), item(3, '盐'), item(4, '油')]),
  group('day-two', '2026-10-10', [item(5, '鸡蛋', { quantityValue: 1, quantityText: '1个', unitFamily: 'count', unitCode: '个' }), item(6, '番茄'), item(7, '葱'), item(8, '蒜')]),
] })
const changedList = (list, ids, checked, version = list.version + 1) => ({ ...plain(list), version, dishes: list.dishes.map(dish => ({ ...plain(dish), items: dish.items.map(row => ({ ...plain(row), checked: ids.includes(row.id) ? checked : row.checked })) })) })
const event = (key, detail = {}) => ({ currentTarget: { dataset: { key } }, detail })

// Fixed platform/HTTP doubles exercise the real Page and shopping cache/journal.
// No generation, model/mock-model, recommendation provider or network request runs.
function pageHarness({ list = eightSources(), check, patch, readList, mutate, reducedMotion = false, drafts = [] } = {}) {
  let owner = 'A', server = plain(list), page
  const storage = new Map([['A:shoppingListPendingOps', plain(drafts)]])
  const calls = [], modals = [], timers = new Map(), scrolls = []
  let timerId = 0, priceReads = 0, capabilityReads = 0
  const util = { getUserStorageKey: key => `${owner}:${key}` }
  const wx = {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, plain(value)), removeStorageSync: key => storage.delete(key),
    showToast() {}, switchTab() {}, setClipboardData() {},
    pageScrollTo: options => scrolls.push(plain(options)),
    showModal: options => modals.push(options),
  }
  const api = {
    getShoppingList: async () => readList ? readList() : plain(server),
    checkShoppingItems: async payload => {
      calls.push({ type: 'check', payload: plain(payload) })
      const result = check ? await check(payload, plain(server)) : changedList(server, payload.itemIds, payload.checked)
      if (result) server = plain(result.list || result)
      return result
    },
    patchShoppingItemConfirmed: async (id, payload) => { calls.push({ type: 'patch', id, payload: plain(payload) }); const result = patch ? await patch(id, payload, plain(server)) : { ...plain(server), version: server.version + 1 }; server = plain(result.list || result); return result },
    clearShoppingList: async payload => { calls.push({ type: 'clear', payload: plain(payload) }); return { ...plain(server), version: server.version + 1, dishes: payload.scope === 'all' ? [] : server.dishes.map(d => ({ ...d, items: d.items.filter(i => !i.checked) })) } },
    getIngredientPriceQuotes: async () => { priceReads++; return [] },
  }
  if (mutate) for (const method of ['addManualShoppingItem', 'patchShoppingItemConfirmed', 'deleteShoppingItemConfirmed', 'clearShoppingList']) api[method] = (...args) => mutate(method, ...args)
  const storeContext = { module: { exports: {} }, wx, console, require: name => name === './api' ? api : name === './util' ? util : ingredients }
  vm.runInNewContext(read('utils/shopping-list.js'), storeContext)
  const store = storeContext.module.exports
  store.saveLocalShoppingList(list)
  function createPage() {
    const modules = {
      '../../utils/api': api, '../../utils/shopping-list': store, '../../utils/util': util,
      '../../utils/shopping-ingredients': ingredients, '../../utils/meal-workflow': flow,
      '../../utils/shopping-prices': require('../utils/shopping-prices'), '../../utils/shopping-list-presentation': require('../utils/shopping-list-presentation'),
      '../../utils/shopping-view': fs.existsSync('utils/shopping-view.js') ? shoppingView() : {},
      '../../utils/experience-preferences': () => ({ get: () => ({ reducedMotion }) }),
      '../../utils/ui-tokens': require('../utils/ui-tokens'), '../../utils/font-scale': Object.assign(() => 1, { base: 16 }),
      '../../utils/shopping-capabilities': { refresh: async () => { capabilityReads++; return { pricesEnabled: true, expensesEnabled: true } }, notice: () => '' },
    }
    vm.runInNewContext(read('pages/shopping-list/shopping-list.js'), { Page: value => { page = value }, require: name => modules[name], wx, console,
      setTimeout: fn => { timers.set(++timerId, fn); return timerId }, clearTimeout: id => timers.delete(id) })
    page.data = plain(page.data)
    page.setData = (values, callback) => { Object.assign(page.data, plain(values)); if (callback) callback() }
    page._scope = 'A:shoppingList'
    page.applyList(store.loadLocalShoppingList())
    return page
  }
  return { page: createPage(), createPage, store, calls, modals, scrolls, storage,
    answer: (confirm = true) => { const modal = modals.shift(); assert.ok(modal, 'a real confirmation must be pending'); modal.success({ confirm }) },
    settle: () => { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()) },
    switchOwner: () => { owner = 'B' }, priceReads: () => priceReads, capabilityReads: () => capabilityReads,
  }
}

test('summaryCountsRemainSourceCounts', () => {
  const list = eightSources(), view = shoppingView().buildShoppingView(list, 'pending')
  assert.equal(view.pendingCount, 8)
  assert.equal(view.summaryRowCount, 6)
  assert.equal(view.groups.flatMap(g => g.items).length, 8)
  const h = pageHarness({ list })
  assert.equal(h.page.data.pendingCount, 8)
  assert.equal(h.page.data.summaryRowCount, 6)
  h.page.onViewMode({ currentTarget: { dataset: { mode: 'byDish' } } })
  assert.equal(h.page.data.pendingCount, 8)
  assert.equal(h.page.data.dishes.flatMap(g => g.items).length, 8)
  assert.match(read('pages/shopping-list/shopping-list.wxml'), /已合并为\s*\{\{summaryRowCount\}\}\s*行/)
})

test('mixedUnitsNeverCoerce', () => {
  const manual = item(4, '番茄', { userOverride: true, calculationStatus: 'USER_OVERRIDE', quantityValue: 2, quantityText: '我确认2个', unitFamily: 'count', unitCode: '个' })
  const unknown = item(3, '盐', { quantityValue: null, quantityText: '适量', sourceQuantityText: '适量', calculationStatus: 'NEEDS_ADJUSTMENT', servingsVerified: false })
  const list = { version: 2, dishes: [group('one', '2026-10-09', [item(1, '番茄', { quantityValue: 1, quantityText: '1个', unitFamily: 'count', unitCode: '个' }), item(2, '番茄'), unknown, manual])] }
  const view = shoppingView().buildShoppingView(list, 'pending')
  assert.equal(view.rows.length, 4)
  assert.deepEqual(view.rows.map(row => row.quantityLabel), ['1个', '100g', '适量', '我确认2个'])
  assert.equal(view.rows[2].quantityValue, null)
  assert.deepEqual(ingredients.scaleLocalQuantity(manual, 2, 8), manual)
  assert.equal(ingredients.scaleLocalQuantity(unknown, null, 8).quantityText, '适量')
  const unknownUnit = item(5, '葱', { unitFamily: 'unknown', unitCode: '把', quantityText: '1把' })
  assert.equal(ingredients.scaleLocalQuantity(unknownUnit, 2, 8).quantityText, '1把')
})

test('legacy source objects preserve dish name date and meal rather than saying manual', () => {
  const source = shoppingView().normalizeShoppingSource({ date: '2026-10-09', mealType: 'lunch', dishName: '清蒸鱼', dishId: 9 })
  assert.equal(source.sourceDate, '2026-10-09'); assert.equal(source.sourceMealType, 'lunch'); assert.equal(source.dishName, '清蒸鱼')
  const view = shoppingView().buildShoppingView({ dishes: [{ date: '2026-10-09', mealType: 'lunch', dishName: '清蒸鱼', items: [item(1, '鱼')] }] }, 'pending')
  assert.match(view.rows[0].sourceLabel, /10月9日.*午餐.*清蒸鱼/)
  assert.doesNotMatch(view.rows[0].sourceLabel, /手动添加/)
})

test('same dish on different dates or meals has distinct stable group keys and starts collapsed', () => {
  const list = eightSources()
  list.dishes.push(group('day-one', '2026-10-09', [item(9, '米')], { sourceMealType: 'lunch' }))
  const view = shoppingView().buildShoppingView(list, 'pending')
  assert.equal(new Set(view.groups.map(g => g.key)).size, 3)
  const h = pageHarness({ list })
  assert.equal(h.page.data.dishes.every(g => g.expanded === false), true)
  const key = h.page.data.dishes[0].key
  h.page.onToggleDish(event(key))
  assert.equal(h.page.data.dishes.filter(g => g.expanded).length, 1)
  const reordered = shoppingView().buildShoppingView({ ...list, dishes: [...list.dishes].reverse() }, 'pending')
  assert.deepEqual(new Set(reordered.groups.map(g => g.key)), new Set(view.groups.map(g => g.key)))
})

test('summary checks only visible pending sources without reversing already purchased sources', async () => {
  const list = eightSources(); list.dishes[1].items[0].checked = true
  const h = pageHarness({ list }), row = h.page.data.summaryRows.find(r => r.displayName === '鸡蛋')
  const visiblePendingSourceIds = [1]
  await h.page.onToggleSummary(event(row.key, { itemIds: [1, 5] }))
  const checkRequest = h.calls[0].payload
  assert.deepEqual(checkRequest.itemIds, visiblePendingSourceIds)
  assert.equal(checkRequest.checked, true)
  assert.equal(h.page.findItem(5).checked, true)
  h.settle()
  h.page.onFilterChange({ currentTarget: { dataset: { status: 'checked' } } })
  const bought = h.page.data.summaryRows.find(r => r.displayName === '鸡蛋')
  await h.page.onToggleSummary(event(bought.key))
  assert.deepEqual(h.calls[1].payload.itemIds, [1, 5]); assert.equal(h.calls[1].payload.checked, false)
})

test('summary and source row identities survive filtering and use keys rather than render indices', () => {
  const list = eightSources(), before = shoppingView().buildShoppingView(list, 'pending')
  const after = shoppingView().buildShoppingView(changedList(list, [3], true), 'pending')
  assert.equal(before.rows.find(r => r.displayName === '油').key, after.rows.find(r => r.displayName === '油').key)
  const markup = read('pages/shopping-list/shopping-list.wxml')
  assert.doesNotMatch(markup, /data-index=|summary-\{\{index/)
  assert.match(markup, /wx:key="key"/)
})

test('single-source quantity opens the real editor while a merged row only expands its editable sources', () => {
  const h = pageHarness(), merged = h.page.data.summaryRows.find(r => r.displayName === '鸡蛋')
  h.page.onEditRow(event(merged.key))
  assert.equal(h.page.data.formVisible, false)
  assert.equal(h.page.data.summaryRows.find(r => r.key === merged.key).sourceExpanded, true)
  assert.deepEqual(h.page.data.summaryRows.find(r => r.key === merged.key).sources.map(s => s.itemId), [1, 5])
  const one = h.page.data.summaryRows.find(r => r.displayName === '盐')
  h.page.onEditRow(event(one.key))
  assert.equal(h.page.data.formVisible, true); assert.equal(h.page._editId, 3)
  assert.match(read('pages/shopping-list/shopping-list.wxml'), /data-id="\{\{source.itemId\}\}"[^>]*bindtap="onEditItem"/)
})

test('unconfirmed check never moves or marks an item and success briefly displays bought before removing it', async () => {
  let finish
  const h = pageHarness({ check: (payload, list) => new Promise(resolve => { finish = () => resolve(changedList(list, payload.itemIds, payload.checked)) }) })
  const row = h.page.data.summaryRows.find(r => r.displayName === '鸡蛋'), beforeKeys = h.page.data.summaryRows.map(r => r.key)
  const waiting = h.page.onToggleSummary(event(row.key))
  assert.equal(h.page.findItem(1).checked, false)
  assert.deepEqual(h.page.data.summaryRows.map(r => r.key), beforeKeys)
  assert.equal(h.page.data.feedback.state, 'pending')
  finish(); await waiting
  assert.equal(h.page.findItem(1).checked, true)
  assert.equal(h.page.data.feedback.state, 'success')
  assert.equal(h.page.data.feedback.undoAvailable, true)
  assert.equal(h.page.data.summaryRows.find(r => r.key === row.key).justChecked, true)
  h.settle()
  assert.equal(h.page.data.summaryRows.some(r => r.key === row.key), false)
})

test('bought then undo returns to the original row and scroll position using the receipt version', async () => {
  const h = pageHarness(), initialKeys = h.page.data.summaryRows.map(r => r.key)
  h.page.onPageScroll({ scrollTop: 420 })
  const row = h.page.data.summaryRows.find(r => r.displayName === '鸡蛋')
  await h.page.onToggleSummary(event(row.key)); h.settle()
  const receiptVersion = h.page.data.version
  await h.page.onUndoCheck({ detail: { requestId: h.page.data.feedback.requestId } })
  assert.equal(h.calls[1].payload.expectedListVersion, receiptVersion)
  assert.deepEqual(h.calls[1].payload.itemIds, [1, 5]); assert.equal(h.calls[1].payload.checked, false)
  assert.deepEqual(h.page.data.summaryRows.map(r => r.key), initialKeys)
  assert.equal(h.page.data.feedback.undoAvailable, false)
  assert.equal(h.scrolls.at(-1).scrollTop, 420)
})

test('createCheckUndo requires a successful homogeneous state transition and an authoritative newer version', () => {
  const before = eightSources(), good = changedList(before, [1, 5], true, 3)
  assert.deepEqual(shoppingView().createCheckUndo(before, good, [1, 5]), { itemIds: [1, 5], previousChecked: false, expectedListVersion: 3 })
  assert.equal(shoppingView().createCheckUndo(changedList(before, [5], true), good, [1, 5]), null)
  assert.equal(shoppingView().createCheckUndo(before, { ...good, version: 2 }, [1, 5]), null)
  assert.equal(shoppingView().createCheckUndo(before, before, [1, 5]), null)
  assert.equal(shoppingView().createCheckUndo(before, { success: false, list: good }, [1, 5]), null)
  assert.equal(shoppingView().createCheckUndo(before, good, [1, 99]), null)
  assert.equal(shoppingView().createCheckUndo(before, { version: 3 }, [1, 5]), null)
})

test('409 undo refreshes without force-rebasing or reversing a newer shopper choice', async () => {
  let attempts = 0
  const h = pageHarness({ check: (payload, list) => { if (++attempts === 2) throw { statusCode: 409, message: '版本冲突' }; return changedList(list, payload.itemIds, payload.checked) } })
  await h.page.onToggleSummary(event(h.page.data.summaryRows[0].key)); h.settle()
  await h.page.onUndoCheck({ detail: { requestId: h.page.data.feedback.requestId } })
  assert.equal(h.calls.length, 2)
  assert.equal(h.page.findItem(1).checked, true)
  assert.equal(h.page.data.feedback.undoAvailable, false)
  assert.match(h.page.data.feedback.message, /已买.*改回/)
})

for (const kind of ['refresh', 'other-write', 'new-version']) test(`${kind} invalidates an old undo and explains how to change purchased items back`, async () => {
  const h = pageHarness()
  await h.page.onToggleSummary(event(h.page.data.summaryRows[0].key)); h.settle()
  const old = h.page.data.feedback.requestId
  if (kind === 'refresh') await h.page.loadList()
  else if (kind === 'other-write') { h.page.onEditItem({ currentTarget: { dataset: { id: 3 } } }); h.page.onName({ detail: { value: '食盐' } }); await h.page.saveForm() }
  else h.page.applyList({ ...plain(h.page._full), version: h.page.data.version + 1 })
  assert.equal(h.page.data.feedback.undoAvailable, false)
  assert.match(h.page.data.feedback.message, /已买.*改回/)
  const count = h.calls.length
  await h.page.onUndoCheck({ detail: { requestId: old } })
  assert.equal(h.calls.length, count)
})

test('reduced motion commits and moves the row immediately without suppressing the success result', async () => {
  const h = pageHarness({ reducedMotion: true }), key = h.page.data.summaryRows[0].key
  await h.page.onToggleSummary(event(key))
  assert.equal(h.page.data.summaryRows.some(r => r.key === key), false)
  assert.equal(h.page.data.feedback.state, 'success'); assert.equal(h.page.data.feedback.undoAvailable, true)
})

test('unknownOutcomeReusesOriginalRequest across page reentry and a changed local version', async () => {
  let count = 0
  const h = pageHarness({ check: (payload, list) => { if (++count <= 2) throw { isNetworkError: true }; return changedList(list, payload.itemIds, payload.checked) } })
  await h.page.onToggleSummary(event(h.page.data.summaryRows[0].key))
  const original = plain(h.calls[0].payload)
  assert.equal(h.page.findItem(1).checked, false); assert.equal(h.page.data.feedback.state, 'unknown')
  assert.equal(h.store.loadPendingOperations().length, 1)
  const next = h.createPage(); next.applyList({ ...plain(next._full), version: 9 })
  await next.onToggleSummary(event(next.data.summaryRows[0].key))
  assert.deepEqual(h.calls[1].payload, original)
  assert.equal(h.store.loadPendingOperations().length, 1)
})

test('network failure keeps the inverse operation original and does not offer another undo', async () => {
  let count = 0
  const h = pageHarness({ check: (payload, list) => { if (++count === 2) throw { isNetworkError: true }; return changedList(list, payload.itemIds, payload.checked) } })
  await h.page.onToggleSummary(event(h.page.data.summaryRows[0].key)); h.settle()
  await h.page.onUndoCheck({ detail: { requestId: h.page.data.feedback.requestId } })
  assert.equal(h.page.findItem(1).checked, true)
  const pending = h.store.loadPendingOperations()[0]
  assert.equal(pending.isUndo, true); assert.equal(pending.payload.checked, false)
  assert.equal(h.page.data.feedback.undoAvailable, false)
})

test('a stale late receipt cannot replace a newer list or create a usable undo', async () => {
  let finish
  const h = pageHarness({ check: (payload, list) => new Promise(resolve => { finish = () => resolve(changedList(list, payload.itemIds, payload.checked)) }) })
  const waiting = h.page.onToggleSummary(event(h.page.data.summaryRows[0].key))
  h.page.applyList({ ...eightSources(), version: 7 })
  finish(); await waiting
  assert.equal(h.page.data.version, 7)
  assert.equal(h.page.data.feedback.undoAvailable, false)
  assert.equal(h.store.loadLocalShoppingList().version, 2)
})

test('account changes reject late receipts and clear the previous owners transition feedback and undo', async () => {
  let finish
  const h = pageHarness({ check: (payload, list) => new Promise(resolve => { finish = () => resolve(changedList(list, payload.itemIds, payload.checked)) }), readList: async () => ({ version: 0, dishes: [] }) })
  const waiting = h.page.onToggleSummary(event(h.page.data.summaryRows[0].key))
  h.switchOwner(); await h.page.loadList(); finish(); await waiting; h.settle()
  assert.equal(h.page.data.version, 0); assert.equal(h.page.data.summaryRows.length, 0)
  assert.equal(h.page.data.feedback.undoAvailable, false)
  assert.equal(h.page.data.feedback.message, '')
  assert.equal(h.storage.has('B:shoppingListPendingOps'), false)
})

test('the page only has pending and bought states and reuses compact rows and persistent action feedback', () => {
  const source = read('pages/shopping-list/shopping-list.wxml')
  assert.doesNotMatch(source, /data-status="all"/)
  assert.match(source, /<compact-ingredient-row/); assert.match(source, /<action-feedback[^>]*bind:undo="onUndoCheck"/)
  assert.doesNotMatch(source, /需要确认/)
  const h = pageHarness(); h.page.onFilterChange({ currentTarget: { dataset: { status: 'all' } } })
  assert.equal(h.page.data.statusFilter, 'pending')
})

test('cost UI and automatic capability or quote reads are hidden without deleting old expenses', async () => {
  const h = pageHarness(); await h.page.loadList()
  assert.equal(h.priceReads(), 0); assert.equal(h.capabilityReads(), 0)
  assert.deepEqual(plain(h.page._full.expenses), { old: { amount: '9.00' } })
  assert.deepEqual(plain(h.store.loadLocalShoppingList().expenses), { old: { amount: '9.00' } })
  assert.doesNotMatch(read('pages/shopping-list/shopping-list.wxml'), /cost-overview|实际花费|记实付|参考价格|pricingRows|expenseVisible/)
})

for (const scope of ['checked', 'all']) test(`clear ${scope} confirms the exact source count and leaves calendar recipe and actual records outside the write`, async () => {
  const list = changedList(eightSources(), [1, 2, 3], true), h = pageHarness({ list })
  const waiting = h.page.clear(scope)
  assert.equal(h.calls.length, 0)
  assert.match(h.modals[0].content, scope === 'all' ? /待买\s*5\s*项.*已买\s*3\s*项.*共\s*8\s*项/ : /3\s*项已买/)
  assert.match(h.modals[0].content, /日历.*菜谱.*实际/)
  h.answer(); await waiting
  assert.equal(h.calls[0].type, 'clear'); assert.equal(h.calls[0].payload.scope, scope)
})

test('manual notes remain visible in source details and a dish-source detail button expands that item only', () => {
  const list = { version: 2, dishes: [group('manual-one', '', [item(1, '鸡蛋', { userOverride: true, calculationStatus: 'USER_DEFINED', sourceQuantityText: '买小包装' })], { dishId: null, dishName: '手动添加', sourceMealType: '' })] }
  const h = pageHarness({ list }), row = h.page.data.summaryRows[0]
  assert.equal(row.sources[0].note, '买小包装')
  h.page.onViewMode({ currentTarget: { dataset: { mode: 'byDish' } } })
  h.page.onToggleDish(event(h.page.data.dishes[0].key))
  h.page.onSourceDetails(event(h.page.data.dishes[0].items[0].key))
  assert.equal(h.page.data.dishes[0].items[0].sourceExpanded, true)
  assert.match(read('pages/shopping-list/shopping-list.wxml'), /source.note/)
})

test('a second concurrent check cannot run until the first receipt arrives', async () => {
  let finish
  const h = pageHarness({ check: (payload, list) => new Promise(resolve => { finish = () => resolve(changedList(list, payload.itemIds, payload.checked)) }) })
  const first = h.page.onToggleSummary(event(h.page.data.summaryRows[0].key))
  await h.page.onToggleSummary(event(h.page.data.summaryRows[1].key))
  assert.equal(h.calls.length, 1)
  finish(); await first; h.settle()
  assert.equal(h.page.data.busy, false)
})

test('an unusable check receipt keeps the original request pending and never manufactures success or undo', async () => {
  const h = pageHarness({ check: () => ({ version: 3 }) })
  await h.page.onToggleSummary(event(h.page.data.summaryRows[0].key))
  assert.equal(h.page.findItem(1).checked, false)
  assert.equal(h.page.data.feedback.state, 'unknown'); assert.equal(h.page.data.feedback.undoAvailable, false)
  assert.deepEqual(plain(h.store.loadPendingOperations()[0].payload), h.calls[0].payload)
})

test('a clear confirmation cannot silently authorize a changed count or another account', async () => {
  const h = pageHarness(), first = h.page.clear('all')
  h.page.applyList({ ...eightSources(), version: 4 })
  h.answer(); await first
  assert.equal(h.calls.length, 0)
  const next = h.page.clear('all'); h.switchOwner(); h.answer(); await next
  assert.equal(h.calls.length, 0)
})

test('undo from purchased view restores its prior purchased state rather than assuming unchecked', async () => {
  const h = pageHarness({ list: changedList(eightSources(), [1, 5], true, 2), reducedMotion: true })
  h.page.onFilterChange({ currentTarget: { dataset: { status: 'checked' } } })
  await h.page.onToggleSummary(event(h.page.data.summaryRows[0].key))
  assert.equal(h.page.findItem(1).checked, false)
  await h.page.onUndoCheck({ detail: { requestId: h.page.data.feedback.requestId } })
  assert.equal(h.calls[1].payload.checked, true)
  assert.equal(h.page.data.statusFilter, 'checked'); assert.equal(h.page.findItem(1).checked, true)
})

test('display-only merges never expand the itemIds or origins of individual by-dish rows', () => {
  const view = shoppingView().buildShoppingView(eightSources(), 'pending')
  assert.deepEqual(view.rows[0].itemIds, [1, 5])
  assert.deepEqual(view.groups[0].items[0].itemIds, [1])
  assert.deepEqual(view.groups[1].items[0].itemIds, [5])
  assert.equal(view.groups[0].items[0].sources.length, 1)
  assert.equal(view.groups[1].items[0].sources[0].sourceDate, '2026-10-10')
})

test('undo rejects an unversioned prior list rather than assuming that any new receipt is safe', () => {
  const before = eightSources(); delete before.version
  assert.equal(shoppingView().createCheckUndo(before, changedList(eightSources(), [1], true), [1]), null)
})

test('compact wrapper adds no vertical padding around the 52px ingredient row', () => {
  const css = read('pages/shopping-list/shopping-list.wxss')
  assert.match(css, /\.shopping-row\s*\{[^}]*padding:\s*0\s+\d+px/)
  assert.match(css, /\.dish-header\s*\{[^}]*display:\s*flex/)
})

test('explicit failed receipts never mark success even when they carry a newer snapshot', async () => {
  const h = pageHarness({ check: (payload, list) => ({ success: false, list: changedList(list, payload.itemIds, true) }) })
  await h.page.onToggleSummary(event(h.page.data.summaryRows[0].key))
  assert.equal(h.page.findItem(1).checked, false)
  assert.equal(h.page.data.feedback.state, 'unknown')
  assert.equal(h.store.loadPendingOperations().length, 1)
})

test('a refresh begun before a successful check cannot rewind the confirmed list or cache', async () => {
  let finishRead
  const h = pageHarness({ readList: () => new Promise(resolve => { finishRead = resolve }) })
  const refreshing = h.page.loadList()
  await h.page.onToggleSummary(event(h.page.data.summaryRows[0].key)); h.settle()
  finishRead(eightSources()); await refreshing
  assert.equal(h.page.data.version, 3)
  assert.equal(h.page.findItem(1).checked, true)
  assert.equal(h.store.loadLocalShoppingList().version, 3)
})

test('folded dish source headers use an existing icon rather than the unknown-icon fallback', () => {
  const markup = read('pages/shopping-list/shopping-list.wxml')
  assert.doesNotMatch(markup, /chevron-down/)
  assert.match(markup, /dish-chevron/)
})

for (const inverse of [false, true]) test(`visible draft retry preserves newer confirmed state for ${inverse ? 'inverse' : 'forward'} checks`, async () => {
  let attempt = 0
  const first = changedList(eightSources(), [1, 5], true, 3)
  const receipt = inverse ? changedList(first, [1, 5], false, 4) : first
  const h = pageHarness({ check: () => {
    attempt++
    if (inverse && attempt === 1) return first
    if (attempt === (inverse ? 2 : 1)) throw { isNetworkError: true }
    return receipt
  }, readList: () => { throw { isNetworkError: true } } })
  await h.page.onToggleSummary(event(h.page.data.summaryRows[0].key)); h.settle()
  if (inverse) await h.page.onUndoCheck({ detail: { requestId: h.page.data.feedback.requestId } })
  const original = plain(h.calls.at(-1).payload)
  if (inverse) assert.equal(h.store.loadPendingOperations()[0].isUndo, true)
  const newest = changedList(receipt, [2], true, 9)
  h.page.applyList(h.store.saveLocalShoppingList(newest))
  const retry = h.page.onRetryDrafts(); h.answer(); await retry
  assert.deepEqual(h.calls.at(-1).payload, original)
  assert.equal(h.page.data.version, 9); assert.equal(h.store.loadLocalShoppingList().version, 9)
  assert.equal(h.page.findItem(2).checked, true)
  assert.equal(h.store.loadPendingOperations().length, 0)
  assert.equal(h.page.data.offline, true)
})

const unusableReplays = {
  failed: before => ({ success: false, list: changedList(before, [1, 5], true, 3) }),
  missingList: () => ({ version: 3 }),
  null: () => null,
  missingVersion: before => ({ dishes: changedList(before, [1, 5], true).dishes }),
  oldVersion: before => changedList(before, [1, 5], true, 2),
  wrongCheckedState: before => ({ ...before, version: 3 }),
  missingItem: before => ({ ...before, version: 3, dishes: [] }),
}
for (const [kind, result] of Object.entries(unusableReplays)) test(`visible draft retry retains the original operation after ${kind} receipt`, async () => {
  let attempt = 0
  const h = pageHarness({ check: () => { if (++attempt === 1) throw { isNetworkError: true }; return result(eightSources()) }, readList: () => { throw { isNetworkError: true } } })
  await h.page.onToggleSummary(event(h.page.data.summaryRows[0].key))
  const original = plain(h.store.loadPendingOperations()[0])
  const retry = h.page.onRetryDrafts(); h.answer(); await retry
  assert.deepEqual(plain(h.store.loadPendingOperations()), [original])
  assert.deepEqual(h.calls[1].payload, original.payload)
  assert.equal(h.page.findItem(1).checked, false)
  assert.equal(h.page.data.version, 2); assert.equal(h.store.loadLocalShoppingList().version, 2)
  assert.equal(h.page.data.feedback.state, 'unknown')
  assert.equal(h.page.data.feedback.undoAvailable, false)
})

test('merged quantity remains unknown after overflow even when later sources are small', () => {
  const list = { version: 2, dishes: [group('overflow', '', [item(1, '盐', { quantityValue: Number.MAX_VALUE }), item(2, '盐', { quantityValue: Number.MAX_VALUE }), item(3, '盐', { quantityValue: 1 })])] }
  const row = shoppingView().buildShoppingView(list).rows[0]
  assert.equal(row.quantityValue, null)
  assert.equal(row.quantityLabel, '用量待确认')
  assert.deepEqual(row.itemIds, [1, 2, 3])
})

test('failed inverse replay retains the exact inverse request and purchased state', async () => {
  let attempt = 0
  const checked = changedList(eightSources(), [1, 5], true, 3)
  const h = pageHarness({ check: () => {
    if (++attempt === 1) return checked
    if (attempt === 2) throw { isNetworkError: true }
    return { success: false, list: changedList(checked, [1, 5], false, 4) }
  }, readList: () => { throw { isNetworkError: true } } })
  await h.page.onToggleSummary(event(h.page.data.summaryRows[0].key)); h.settle()
  await h.page.onUndoCheck({ detail: { requestId: h.page.data.feedback.requestId } })
  const original = plain(h.store.loadPendingOperations()[0])
  const retry = h.page.onRetryDrafts(); h.answer(); await retry
  assert.equal(original.isUndo, true)
  assert.deepEqual(plain(h.store.loadPendingOperations()), [original])
  assert.deepEqual(h.calls.at(-1).payload, original.payload)
  assert.equal(h.page.findItem(1).checked, true)
  assert.equal(h.page.data.version, 3)
  assert.equal(h.page.data.feedback.undoAvailable, false)
})

for (const [kind, value] of [['missing', undefined], ['null', null], ['string', 'false'], ['number', 0]]) {
  for (const replay of [false, true]) test(`${replay ? 'replayed' : 'direct'} inverse rejects ${kind} checked state`, async () => {
    let attempt = 0
    const checked = changedList(eightSources(), [1, 5], true, 3)
    const invalid = changedList(checked, [1, 5], false, 4)
    for (const dish of invalid.dishes) for (const row of dish.items) if ([1, 5].includes(row.id)) {
      if (kind === 'missing') delete row.checked
      else row.checked = value
    }
    const h = pageHarness({ check: () => {
      if (++attempt === 1) return checked
      if (replay && attempt === 2) throw { isNetworkError: true }
      return invalid
    }, readList: () => { throw { isNetworkError: true } } })
    await h.page.onToggleSummary(event(h.page.data.summaryRows[0].key)); h.settle()
    await h.page.onUndoCheck({ detail: { requestId: h.page.data.feedback.requestId } })
    const request = plain(h.calls[1].payload)
    if (replay) { const retry = h.page.onRetryDrafts(); h.answer(); await retry }
    const journal = plain(h.store.loadPendingOperations())
    assert.equal(journal.length, 1)
    assert.equal(journal[0].isUndo, true)
    assert.deepEqual(journal[0].payload, request)
    assert.deepEqual(h.calls.at(-1).payload, request)
    assert.equal(h.page.findItem(1).checked, true)
    assert.equal(h.page.data.version, 3); assert.equal(h.store.loadLocalShoppingList().version, 3)
    assert.equal(h.page.data.feedback.state, 'unknown')
    assert.equal(h.page.data.feedback.undoAvailable, false)
  })
}

test('undo construction requires explicit boolean before and after states', () => {
  const before = eightSources(), after = changedList(before, [1], true, 3)
  delete before.dishes[0].items[0].checked
  assert.equal(shoppingView().createCheckUndo(before, after, [1]), null)
  before.dishes[0].items[0].checked = true
  delete after.dishes[0].items[0].checked
  assert.equal(shoppingView().createCheckUndo(before, after, [1]), null)
})

for (const failure of [{ isNetworkError: true }, { statusCode: 503 }]) test(`original check survives unload before ${JSON.stringify(failure)} and exact reentry replay`, async () => {
  let reject
  const h = pageHarness({ check: () => new Promise((resolve, no) => { reject = no }) })
  const operation = h.page.stableOperation('check', { itemIds: [1], checked: true })
  const work = h.page.perform(operation)
  assert.deepEqual(plain(h.store.loadPendingOperations()[0]?.payload || null), plain(operation.payload), 'journal must exist before response')
  h.page.onUnload(); reject(failure); await work
  const returned = h.createPage().stableOperation('check', { itemIds: [1], checked: true })
  assert.deepEqual(plain(returned.payload), plain(operation.payload))
})
for (const statusCode of [500, 502, 503, 504]) test(`HTTP ${statusCode} keeps original shopping request unknown`, async () => {
  const h = pageHarness({ check: async () => { throw { statusCode } } })
  await h.page.onToggleSummary(event(h.page.data.summaryRows[0].key))
  assert.equal(h.page.data.feedback.state, 'unknown')
  assert.deepEqual(plain(h.store.loadPendingOperations()[0].payload), h.calls[0].payload)
})
test('inverse check is durable before unload and keeps restore context through replay', async () => {
  let reject, count = 0
  const h = pageHarness({ check: (payload, server) => ++count === 1 ? changedList(server, payload.itemIds, payload.checked) : new Promise((resolve, no) => { reject = no }) })
  h.page._scrollTop = 120
  await h.page.onToggleSummary(event(h.page.data.summaryRows[0].key))
  const work = h.page.onUndoCheck({ detail: { requestId: h.page.data.feedback.requestId } })
  const pending = plain(h.store.loadPendingOperations()[0] || null)
  assert.equal(pending?.isUndo, true)
  assert.equal(pending.restoreScroll, 120)
  h.page.onUnload(); reject({ statusCode: 503 }); await work
  assert.deepEqual(plain(h.store.loadPendingOperations()[0]), pending)
  const page = h.createPage(), recovered = page.stableOperation('check', pending.payload)
  assert.deepEqual(plain(recovered), pending)
})
test('pending original remains in account A when account switches before rejection', async () => {
  let reject
  const h = pageHarness({ check: () => new Promise((resolve, no) => { reject = no }) })
  const work = h.page.onToggleSummary(event(h.page.data.summaryRows[0].key))
  h.switchOwner(); reject({ statusCode: 503 }); await work
  assert.equal(h.storage.get('A:shoppingListPendingOps').length, 1)
  assert.equal(h.store.loadPendingOperations().length, 0)
})
test('late direct completion cannot retire or apply over a replacement journal request', async () => {
  let resolve
  const h = pageHarness({ check: () => new Promise(yes => { resolve = yes }) })
  const before = plain(h.page._full), work = h.page.onToggleSummary(event(h.page.data.summaryRows[0].key))
  const original = h.store.loadPendingOperations()[0]
  assert.ok(original, 'dispatched operation must be durable')
  const replacement = { ...plain(original), payload: { ...plain(original.payload), requestId: 'replacement', expectedListVersion: 9 } }
  h.store.replacePendingOperation(original.operationId, replacement)
  resolve(changedList(before, original.payload.itemIds, true)); await work
  assert.deepEqual(plain(h.store.loadPendingOperations()[0] || null), replacement)
  assert.equal(h.page.data.version, before.version)
  assert.notEqual(h.page.data.feedback.state, 'success')
})
test('late journal replay cannot remove the replacement that shares its operation ID', async () => {
  let resolve
  const h = pageHarness({ check: () => new Promise(yes => { resolve = yes }) })
  h.store.enqueueShoppingOperation({ type: 'check', payload: { requestId: 'original', expectedListVersion: 2, itemIds: [1], checked: true } })
  const original = plain(h.store.loadPendingOperations()[0]), work = h.store.flushShoppingOperations()
  const replacement = { ...original, payload: { ...original.payload, requestId: 'replacement', expectedListVersion: 9 } }
  h.store.replacePendingOperation(original.operationId, replacement)
  resolve(changedList(eightSources(), [1], true)); await work
  assert.deepEqual(plain(h.store.loadPendingOperations()[0] || null), replacement)
  assert.equal(h.store.loadLocalShoppingList().version, 2)
})
for (const type of ['manual', 'patch', 'delete', 'clear']) test(`${type} journals immutable original before boundary dispatch`, async () => {
  let h, submitted
  h = pageHarness({ mutate: (method, ...args) => {
    submitted = plain(args.at(-1))
    assert.deepEqual(plain(h.store.loadPendingOperations()[0].payload), submitted)
    throw { statusCode: 503 }
  } })
  const op = h.page.stableOperation(type, type === 'manual' ? { name: '盐', quantityText: '适量' } : type === 'clear' ? { scope: 'checked' } : { displayName: '盐' }, 1)
  await h.page.perform(op)
  assert.deepEqual(submitted, plain(op.payload))
  assert.deepEqual(plain(h.createPage().stableOperation(type, op.payload, 1).payload), submitted)
})
test('storage failure prevents shopping dispatch', async () => {
  const h = pageHarness()
  h.store.enqueueShoppingOperation = () => { throw new Error('storage full') }
  await h.page.onToggleSummary(event(h.page.data.summaryRows[0].key))
  assert.equal(h.calls.length, 0)
  assert.equal(h.page.data.busy, false)
  assert.equal(h.page.data.feedback.state, 'error')
  assert.match(h.page.data.feedback.message, /尚未提交/)
})
test('explicit terminal rejection removes only original request and permits fresh corrected intent', async () => {
  const h = pageHarness({ check: async () => { throw { statusCode: 400 } } })
  const original = h.page.stableOperation('check', { itemIds: [1], checked: true })
  await h.page.perform(original)
  assert.equal(h.store.loadPendingOperations().length, 0)
  assert.equal(h.page.data.feedback.state, 'error')
  assert.notEqual(h.page.stableOperation('check', { itemIds: [1], checked: true }).payload.requestId, original.payload.requestId)
})
test('late replay conflict cannot mark the replacement as conflicted', async () => {
  let reject
  const h = pageHarness({ check: () => new Promise((yes, no) => { reject = no }) })
  h.store.enqueueShoppingOperation({ type: 'check', payload: { requestId: 'old', expectedListVersion: 2, itemIds: [1], checked: true } })
  const original = plain(h.store.loadPendingOperations()[0]), work = h.store.flushShoppingOperations()
  const replacement = { ...original, payload: { ...original.payload, requestId: 'new', expectedListVersion: 9 } }
  h.store.replacePendingOperation(original.operationId, replacement)
  reject({ statusCode: 409 }); const result = await work
  assert.notEqual(result.conflict, true)
  assert.deepEqual(plain(h.store.loadPendingOperations()[0]), replacement)
})
for (const statusCode of [401, 403, 408, 429]) test(`retry HTTP ${statusCode} cannot resolve an earlier uncertain shopping request`, async () => {
  let attempts = 0
  const h = pageHarness({ check: async () => { throw ++attempts === 1 ? { isNetworkError: true } : { statusCode } } })
  const op = h.page.stableOperation('check', { itemIds: [1], checked: true })
  await h.page.perform(op); await h.page.perform(op)
  assert.deepEqual(plain(h.store.loadPendingOperations()[0]?.payload || null), plain(op.payload))
  assert.equal(h.page.data.feedback.state, 'unknown')
})
test('an older malformed check receipt cannot acknowledge the durable original request', async () => {
  let resolve
  const h = pageHarness({ check: () => new Promise(yes => { resolve = yes }) })
  const work = h.page.onToggleSummary(event(h.page.data.summaryRows[0].key))
  const original = plain(h.calls[0].payload)
  h.page.applyList({ ...eightSources(), version: 9 })
  resolve({ ...eightSources(), version: 3 }); await work
  assert.deepEqual(plain(h.store.loadPendingOperations()[0]?.payload || null), original)
  assert.equal(h.page.data.feedback.state, 'unknown')
  assert.equal(h.page.data.version, 9)
})
test('unloaded inverse recovers via original journal replay with no duplicate inverse intent', async () => {
  let reject, attempt = 0
  const h = pageHarness({ check: (payload, server) => ++attempt === 2 ? new Promise((yes, no) => { reject = no }) : changedList(server, payload.itemIds, payload.checked) })
  await h.page.onToggleSummary(event(h.page.data.summaryRows[0].key))
  const work = h.page.onUndoCheck({ detail: { requestId: h.page.data.feedback.requestId } })
  const original = plain(h.store.loadPendingOperations()[0])
  h.page.onUnload(); reject({ statusCode: 503 }); await work
  const returned = h.createPage()
  const retry = returned.onRetryDrafts(); h.answer(); await retry
  assert.deepEqual(h.calls[2].payload, original.payload)
  assert.equal(h.store.loadPendingOperations().length, 0)
  assert.equal(returned.data.checkedCount, 0)
  assert.equal(returned.data.version, 4)
})
