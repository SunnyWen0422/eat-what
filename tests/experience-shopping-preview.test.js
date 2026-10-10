const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const view = require('../utils/shopping-view')
const clone = value => JSON.parse(JSON.stringify(value))
function fixture() { return { dishes: [{ dishId: 9, dishName: '土豆', targetPeople: 2, items: [0, 1, 2].map(sourceLineNo => ({ sourceDishId: 9, sourceLineNo, displayName: '盐', quantityText: '少许', sourceQuantityText: '少许', calculationStatus: 'NEEDS_ADJUSTMENT' })) }], warnings: [] } }
function harness(options = {}) {
  const storage = options.storage || new Map(), sent = [], saved = [], pending = [], modals = [], redirects = []
  let definition, selection = options.selection === null ? null : { dishIds: [9], targetPeople: 2 }, id = 0, scope = 'u:'
  const store = { beginShoppingSelection: value => storage.set('next-selection', clone(value)), consumeShoppingSelection: () => { const s = selection; selection = null; return s }, saveLocalShoppingList: list => { saved.push(clone(list)); storage.set('list', clone(list)) }, loadLocalShoppingList: () => storage.get('list') || { version: 0, dishes: [] }, enqueueShoppingOperation: op => pending.push(clone(op)), removePendingOperation: () => pending.splice(0) }
  const api = { createShoppingPreview: async () => fixture(), getShoppingList: async () => options.remote || { version: 2, dishes: [] }, batchAddShoppingItems: async body => { sent.push(clone(body)); return options.respond ? options.respond(body, sent.length) : { list: { version: 3, dishes: [] }, addedItemCount: 6, mergedItemCount: 2 } } }
  vm.runInNewContext(fs.readFileSync('pages/shopping-preview/shopping-preview.js', 'utf8'), { Page: p => { definition = p }, require: name => name.endsWith('/api') ? api : name.endsWith('/shopping-list') ? store : name.endsWith('/shopping-view') ? view : name.endsWith('/shopping-ingredients') ? require('../utils/shopping-ingredients') : name.endsWith('/util') ? { getUserStorageKey: key => scope + key } : name.endsWith('/meal-workflow') ? { requestId: () => 'request-' + ++id, mealNames: {}, errorMessage: e => e.message || '失败' } : Object.assign(() => 1, { base: 16 }), wx: { getStorageSync: k => storage.get(k), setStorageSync: (k, v) => storage.set(k, clone(v)), removeStorageSync: k => storage.delete(k), showModal: o => { modals.push(o.content); o.success({ confirm: options.approve !== false }) }, showToast() {}, redirectTo: o => redirects.push(o), navigateBack() {} }, console })
  const page = { ...definition, data: clone(definition.data), setData(value) { Object.assign(this.data, value) } }
  return { page, sent, saved, pending, modals, redirects, storage, changeAccount: () => { scope = 'other:' } }
}
async function loaded(options) { const h = harness(options); h.page.onLoad(); await new Promise(resolve => setImmediate(resolve)); return h }
const event = (dishIndex = 0, itemIndex = 0) => ({ currentTarget: { dataset: { dishIndex, itemIndex } } })
test('read-only initial quantities and unknown source counts permit one-page confirmation', async () => {
  const { page } = await loaded()
  assert.equal(page.data.formVisible, false)
  assert.equal(page.data.itemCount, 3)
  assert.equal(page.data.unknownMessage, '3项待确认，可先加入')
  await page.onConfirm()
  assert.match(page.data.resultMessage, /新增6项.*合并2项/)
})
test('home ingredients only leave this payload; success stays readable and cannot resubmit', async () => {
  const h = await loaded(); h.page.onRemoveItem(event()); await h.page.onConfirm(); await h.page.onConfirm()
  assert.equal(h.sent.length, 1); assert.equal(h.sent[0].dishes[0].items.length, 2)
  assert.equal(h.redirects.length, 0); assert.equal(h.page.data.itemCount, 2)
})
test('old receipt counts stay unknown', async () => {
  const h = await loaded({ respond: () => ({ list: { version: 3, dishes: [] } }) }); await h.page.onConfirm()
  const oldReceiptMessage = h.page.data.resultMessage
  assert.equal(oldReceiptMessage, '已加入购物清单')
  assert.equal(oldReceiptMessage.includes('合并2项'), false)
})
test('unknownOutcomeReusesOriginalRequest across unload and return with edits frozen', async () => {
  const h = await loaded({ respond: () => { throw { isNetworkError: true } } })
  h.page.onEditItem(event()); h.page.onQuantity({ detail: { value: '半袋' } }); h.page.saveForm(); await h.page.onConfirm()
  const firstRequest = h.sent[0]; h.page.onRemoveItem(event()); h.page.onUnload()
  const returned = await loaded({ storage: h.storage, selection: null }); await returned.page.onConfirm()
  const secondRequest = returned.sent[0]
  assert.equal(secondRequest.requestId, firstRequest.requestId)
  assert.deepEqual(secondRequest, firstRequest); assert.equal(secondRequest.dishes[0].items[0].quantityText, '半袋')
})
test('409 preserves edits and reconfirms against latest checked list', async () => {
  let version = 2
  const h = await loaded({ remote: { get version() { return version }, dishes: [{ items: [{ id: 8, checked: true }] }] }, respond: (body, n) => { if (n === 1) { version = 7; throw { statusCode: 409 } } return { list: { version: 8, dishes: [{ items: [{ id: 8, checked: true }] }] }, addedItemCount: 1, mergedItemCount: 2 } } })
  h.page.onEditItem(event()); h.page.onQuantity({ detail: { value: '半袋' } }); h.page.saveForm(); await h.page.onConfirm(); await h.page.onConfirm()
  assert.equal(h.sent[1].expectedListVersion, 7); assert.notEqual(h.sent[0].requestId, h.sent[1].requestId)
  assert.equal(h.sent[1].dishes[0].items[0].quantityText, '半袋'); assert.equal(h.saved.at(-1).dishes[0].items[0].checked, true)
})
test('people change explains replacement first; missing servings retain original unknown text', async () => {
  const h = await loaded(); h.page.onEditItem(event()); h.page.onQuantity({ detail: { value: '半袋' } }); h.page.saveForm()
  await h.page.onPeopleChange({ detail: { value: '4' } }); await new Promise(resolve => setImmediate(resolve))
  assert.match(h.modals[0], /编辑/); assert.equal(h.page.data.dishes[0].items[0].quantityText, '少许'); assert.equal(h.page.data.unknownMessage, '3项待确认，可先加入')
})
for (const receipt of [null, { success: false, list: { version: 3, dishes: [] } }, { list: { version: 2, dishes: [] } }, { list: { dishes: [] } }]) test('unreliable receipt cannot clear original payload or report success ' + JSON.stringify(receipt), async () => {
  const h = await loaded({ respond: () => receipt }); await h.page.onConfirm()
  assert.equal(h.page.data.resultMessage, ''); assert.equal(h.pending.length, 1); assert.equal(h.page.data.outcomeUnknown, true)
})
test('older valid replay acknowledges without rewinding newer cache', async () => {
  const h = await loaded({ respond: () => { h.storage.set('list', { version: 9, dishes: [{ items: [{ checked: true }] }] }); return { list: { version: 3, dishes: [] } } } }); await h.page.onConfirm()
  assert.equal(h.storage.get('list').version, 9); assert.equal(h.pending.length, 0)
})
test('compact summary and by-dish use the same source counts without auto inputs', async () => {
  const h = await loaded(); assert.equal(h.page.data.viewMode, 'summary'); assert.equal(h.page.data.shoppingView.pendingCount, 3)
  h.page.onViewMode({ currentTarget: { dataset: { mode: 'dish' } } }); assert.equal(h.page.data.viewMode, 'dish')
  const markup = fs.readFileSync('pages/shopping-preview/shopping-preview.wxml', 'utf8')
  assert.match(markup, /加入购物清单（/); assert.doesNotMatch(markup, /bindtap="onRemoveItem"[^>]*>移除/)
})
test('by-dish groups start folded, retain fold choice on return and do not mutate preparation',async()=>{
 const h=await loaded();const original=clone(h.page.data.dishes),group=h.page.data.shoppingView.groups[0];assert.equal(group.expanded,false);assert.equal(group.sourceCount,3);assert.equal(h.page.data.peopleVisible,false)
 h.page.onToggleDish({currentTarget:{dataset:{key:group.selectionKey}}});assert.equal(h.page.data.shoppingView.groups[0].expanded,true);assert.deepEqual(clone(h.page.data.dishes),original);h.page.onUnload()
 const returned=await loaded({storage:h.storage,selection:null});assert.equal(returned.page.data.shoppingView.groups[0].expanded,true);assert.equal(returned.page.data.itemCount,3)
 returned.page.onToggleDish({currentTarget:{dataset:{key:group.selectionKey}}});assert.equal(returned.page.data.shoppingView.groups[0].expanded,false)
})
test('read-only single quantity opens only that source; multi-source quantity opens sources without redistribution',async()=>{
 const h=await loaded();h.page.onEditRow({currentTarget:{dataset:{key:h.page.data.shoppingView.rows[0].key}}});assert.equal(h.page.data.formVisible,true);assert.equal(h.page._edit.itemIndex,0);h.page.closeForm()
 const safe={calculationStatus:'CALCULATED',servingsVerified:true,parseStatus:'PARSED',quantityValue:20,quantityText:'20g',unitFamily:'mass',unitCode:'g'};Object.assign(h.page.data.dishes[0].items[0],safe);Object.assign(h.page.data.dishes[0].items[1],safe);h.page.refreshView()
 const row=h.page.data.shoppingView.rows.find(row=>row.sourceCount===2);h.page.onEditRow({currentTarget:{dataset:{key:row.key}}});assert.equal(h.page.data.formVisible,false);assert.equal(h.page.data.sourcesVisible,true);assert.equal(h.page.data.sourceRows.length,2)
 h.page.onEditItem({currentTarget:{dataset:{dishIndex:h.page.data.sourceRows[1].dishIndex,itemIndex:h.page.data.sourceRows[1].itemIndex}}});h.page.onQuantity({detail:{value:'半袋'}});h.page.saveForm();assert.equal(h.page.data.dishes[0].items[0].quantityText,'20g');assert.equal(h.page.data.dishes[0].items[1].quantityText,'半袋');assert.equal(h.page.data.itemCount,3)
})
test('on-demand people edit keeps preparation intact when recalculation is canceled',async()=>{
 const h=await loaded({approve:false});h.page.onRemoveItem(event());const original=clone(h.page.data.dishes);h.page.onPeopleOptions();assert.equal(h.page.data.peopleVisible,true);h.page.onPeopleDraft({detail:{value:'4'}});await h.page.onApplyPeople();assert.deepEqual(clone(h.page.data.dishes),original);assert.equal(h.page.data.targetPeople,2);assert.equal(h.page.data.itemCount,2)
})
test('returning before submission restores editable preparation without loading forever', async () => {
  const h = await loaded(); h.page.onRemoveItem(event()); h.page.onUnload()
  const returned = await loaded({ storage: h.storage, selection: null })
  assert.equal(returned.page.data.previewLoading, false); assert.equal(returned.page.data.itemCount, 2)
  await returned.page.onConfirm(); assert.equal(returned.sent.length, 1)
})
test('late receipt after account change never writes or reports success', async () => {
  let finish
  const h = await loaded({ respond: () => new Promise(resolve => { finish = resolve }) })
  const saving = h.page.onConfirm(); await new Promise(resolve => setImmediate(resolve)); const saves = h.saved.length
  h.changeAccount(); finish({ list: { version: 3, dishes: [] }, addedItemCount: 6, mergedItemCount: 2 }); await saving
  assert.equal(h.saved.length, saves); assert.equal(h.page.data.resultMessage, ''); assert.equal(h.pending.length, 1)
})
test('a server timeout retains the original immutable request', async () => {
  const h = await loaded({ respond: () => { throw { statusCode: 504 } } }); await h.page.onConfirm(); const firstRequest = h.sent[0]
  h.page.onRemoveItem(event()); await h.page.onConfirm(); const secondRequest = h.sent[1]
  assert.equal(secondRequest.requestId, firstRequest.requestId); assert.deepEqual(secondRequest, firstRequest)
})
test('new selection is retained while an older unknown confirmation resolves', async () => {
  const h = await loaded({ respond: () => { throw { isNetworkError: true } } }); await h.page.onConfirm(); h.page.onUnload()
  const returned = await loaded({ storage: h.storage }); assert.deepEqual(returned.storage.get('next-selection'), { dishIds: [9], targetPeople: 2 })
  assert.equal(returned.page._confirmedPayload.requestId, h.sent[0].requestId)
})
test('partial or invalid receipt counts never invent numeric success', () => {
  for (const receipt of [{ addedItemCount: 6 }, { addedItemCount: '6', mergedItemCount: 2 }, { addedItemCount: 6, mergedItemCount: -1 }]) assert.equal(view.shoppingAddMessage(receipt), '已加入购物清单')
})
test('source row editing stays attached after an earlier dish becomes empty', async () => {
  const h = await loaded(); const duplicate = clone(h.page.data.dishes[0]); duplicate.selectionKey = 'other'; duplicate.items.forEach(item => { item.clientKey = 'other-' + item.sourceLineNo })
  h.page.data.dishes[0].items = []; h.page.data.dishes.push(duplicate); h.page.refreshView()
  const key = h.page.data.shoppingView.groups[0].items[0].key
  h.page.onRemoveSource({ currentTarget: { dataset: { key } } }); assert.equal(h.page.data.dishes[1].items.length, 2)
})

// Cross-page integration uses the actual cache/journal and both actual Page modules.
function integratedShopping() {
  const storage = new Map(), sent = [], modals = []
  let nextOutcome = 'unknown', server = { version: 2, dishes: [] }
  const wx = { getStorageSync: k => storage.get(k), setStorageSync: (k, v) => storage.set(k, clone(v)), removeStorageSync: k => storage.delete(k), showModal: o => { modals.push(o); o.success({ confirm: true }) }, navigateBack() {}, redirectTo() {}, pageScrollTo() {} }
  const ingredients = require('../utils/shopping-ingredients'), util = { getUserStorageKey: key => 'u:' + key }
  const api = { createShoppingPreview: async request => ({ dishes: request.dishIds.map(id => ({ ...fixture().dishes[0], dishId: id, dishName: 'dish-' + id, items: fixture().dishes[0].items.map(item => ({ ...item, sourceDishId: id })) })) }), getShoppingList: async () => clone(server), batchAddShoppingItems: async payload => { sent.push(clone(payload)); if (typeof nextOutcome === 'function') return nextOutcome(payload); if (nextOutcome === 'unknown') throw { isNetworkError: true }; if (nextOutcome === 'conflict') throw { statusCode: 409 }; server = { version: payload.expectedListVersion + 1, dishes: [] }; return { list: clone(server), addedItemCount: 3, mergedItemCount: 0 } } }
  const context = { module: { exports: {} }, wx, require: name => name === './api' ? api : name === './util' ? util : ingredients }
  vm.runInNewContext(fs.readFileSync('utils/shopping-list.js', 'utf8'), context)
  const store = context.module.exports
  function page(route) {
    let definition
    vm.runInNewContext(fs.readFileSync('pages/' + route + '/' + route + '.js', 'utf8'), { Page: value => { definition = value }, wx, console, setTimeout, clearTimeout, require: name => name.endsWith('/api') ? api : name.endsWith('/shopping-list') ? store : name.endsWith('/util') ? util : name.endsWith('/font-scale') ? Object.assign(() => 1, { base: 16 }) : name.endsWith('/experience-preferences') ? () => ({ get: () => ({ reducedMotion: true }) }) : require('../utils/' + name.split('/').at(-1)) })
    return { ...definition, data: clone(definition.data), setData(update) { Object.assign(this.data, update) } }
  }
  async function preview(dishId) { if (dishId) store.beginShoppingSelection({ dishIds: [dishId], targetPeople: 2 }); const p = page('shopping-preview'); p.onLoad(); await new Promise(resolve => setImmediate(resolve)); return p }
  async function list() { const p = page('shopping-list'); await p.loadList(); return p }
  return { preview, list, store, sent, storage, outcome: value => { nextOutcome = value }, serverVersion: value => { server.version = value } }
}
test('verified public CALCULATED previews are not unknown; mixed/range/unit rows remain honest', async () => {
  const h = await loaded(); const safe = { calculationStatus: 'CALCULATED', servingsVerified: true, parseStatus: 'PARSED', quantityValue: 20, quantityText: '20g', unitFamily: 'mass', unitCode: 'g' }
  Object.assign(h.page.data.dishes[0].items[0], safe); h.page.refreshView(); assert.equal(h.page.data.unknownMessage, '2项待确认，可先加入')
  h.page.data.dishes[0].items.forEach(item => Object.assign(item, safe)); h.page.refreshView(); assert.equal(h.page.data.unknownMessage, '')
  Object.assign(h.page.data.dishes[0].items[1], { quantityValue: null, quantityMin: 2, quantityMax: 3 }); Object.assign(h.page.data.dishes[0].items[2], { unitFamily: 'unknown' }); h.page.refreshView(); assert.equal(h.page.data.unknownMessage, '2项待确认，可先加入')
})
test('actual confirmed draft discard frees preparation for a new selection without resurrection', async () => {
  const h = integratedShopping(), first = await h.preview(9); await first.onConfirm(); first.onUnload()
  const list = await h.list(); await list.onDiscardDraft({ currentTarget: { dataset: { id: h.store.loadPendingOperations()[0].operationId } } })
  const next = await h.preview(55); assert.equal(next.data.dishes[0].dishId, 55); assert.equal(next.data.outcomeUnknown, false); assert.equal(h.store.loadPendingOperations().length, 0)
})
test('actual successful draft replay retires its preparation snapshot and accepts a new selection', async () => {
  const h = integratedShopping(), first = await h.preview(9); await first.onConfirm(); first.onUnload(); h.outcome('success')
  const list = await h.list(); await list.onRetryDrafts(); const next = await h.preview(55)
  assert.equal(next.data.dishes[0].dishId, 55); assert.equal(next.data.outcomeUnknown, false); assert.equal(h.sent.length, 2); assert.equal(h.sent[1].requestId, h.sent[0].requestId)
})
test('actual conflict reconfirmation replaces preparation request and retains edits for unknown retry', async () => {
  const h = integratedShopping(), first = await h.preview(9); first.onEditItem(event()); first.onQuantity({ detail: { value: '半袋' } }); first.saveForm(); await first.onConfirm(); first.onUnload()
  h.outcome('conflict'); h.serverVersion(7); const list = await h.list(); await list.onRetryDrafts(); h.outcome('unknown')
  await list.onReviewDraft({ currentTarget: { dataset: { id: h.store.loadPendingOperations()[0].operationId } } })
  const replaced = h.store.loadPendingOperations()[0].payload; const returned = await h.preview(); assert.equal(returned._confirmedPayload.requestId, replaced.requestId); assert.notEqual(replaced.requestId, h.sent[0].requestId); assert.equal(replaced.expectedListVersion, 7); assert.equal(returned.data.dishes[0].items[0].quantityText, '半袋')
  await returned.onConfirm(); assert.deepEqual(h.sent.at(-1), clone(replaced))
})
test('missing journal entry alone never certifies a pending preparation was discarded', async () => {
  const h = integratedShopping(), first = await h.preview(9); await first.onConfirm(); first.onUnload(); h.storage.delete('u:shoppingListPendingOps')
  const returned = await h.preview(); assert.equal(returned._confirmedPayload.requestId, h.sent[0].requestId); assert.equal(returned.data.outcomeUnknown, true)
})
test('a still-mounted preparation cannot resurrect an explicitly discarded draft on unload or retry', async () => {
  const h = integratedShopping(), first = await h.preview(9); await first.onConfirm(); const list = await h.list()
  await list.onDiscardDraft({ currentTarget: { dataset: { id: h.store.loadPendingOperations()[0].operationId } } }); await first.onConfirm(); first.onUnload()
  assert.equal(h.sent.length, 1); const next = await h.preview(55); assert.equal(next.data.dishes[0].dishId, 55)
})
test('retired mounted page cannot overwrite a later new preparation on unload', async () => {
  const h = integratedShopping(), first = await h.preview(9); await first.onConfirm(); const list = await h.list()
  await list.onDiscardDraft({ currentTarget: { dataset: { id: h.store.loadPendingOperations()[0].operationId } } })
  const next = await h.preview(55); first.onUnload(); assert.equal(h.storage.get('u:shoppingPreparation').data.dishes[0].dishId, 55); next.onUnload(); const returned = await h.preview()
  assert.equal(returned.data.dishes[0].dishId, 55); assert.equal(returned.data.outcomeUnknown, false)
})
test('queued new selection survives old preparation retirement', async () => {
  const h = integratedShopping(), first = await h.preview(9); await first.onConfirm(); first.onUnload()
  const blocked = await h.preview(55); assert.equal(blocked.data.dishes[0].dishId, 9); blocked.onUnload()
  const list = await h.list(); await list.onDiscardDraft({ currentTarget: { dataset: { id: h.store.loadPendingOperations()[0].operationId } } })
  const next = await h.preview(); assert.equal(next.data.dishes[0].dishId, 55)
})

for (const lateError of [{ statusCode: 409 }, { statusCode: 400 }, { isNetworkError: true }]) test('late failed confirmation cannot resurrect a confirmed discarded preparation ' + JSON.stringify(lateError), async () => {
  const h = integratedShopping(), first = await h.preview(9)
  await first.onConfirm()
  let rejectRequest
  h.outcome(() => new Promise((resolve, reject) => { rejectRequest = reject }))
  const confirming = first.onConfirm(); await new Promise(resolve => setImmediate(resolve))
  const list = await h.list()
  await list.onDiscardDraft({ currentTarget: { dataset: { id: h.store.loadPendingOperations()[0].operationId } } })
  const retired = clone(h.storage.get('u:shoppingPreparation'))
  assert.equal(retired.retired, true)
  rejectRequest(lateError); await confirming
  assert.deepEqual(h.storage.get('u:shoppingPreparation'), retired)
  assert.equal(first.data.canConfirm, false)
  assert.equal(first.data.outcomeUnknown, false)
  await first.onConfirm(); first.onUnload()
  assert.equal(h.sent.length, 2)
  const returned = await h.preview()
  assert.equal(returned.data.dishes.length, 0)
  const next = await h.preview(55)
  assert.equal(next.data.dishes[0].dishId, 55)
  assert.equal(h.store.loadPendingOperations().length, 0)
})

test('late conflict cannot clear an externally reconfirmed replacement request', async () => {
  const h = integratedShopping(), first = await h.preview(9); await first.onConfirm()
  let rejectRequest
  h.outcome(() => new Promise((resolve, reject) => { rejectRequest = reject }))
  const confirming = first.onConfirm(); await new Promise(resolve => setImmediate(resolve))
  const operation = h.store.loadPendingOperations()[0]
  const replacement = { ...operation.payload, requestId: 'replacement-request', expectedListVersion: 7 }
  h.store.replacePendingOperation(operation.operationId, { ...operation, payload: replacement })
  rejectRequest({ statusCode: 409 }); await confirming
  assert.deepEqual(clone(h.storage.get('u:shoppingPreparation').payload), clone(replacement))
  assert.deepEqual(clone(h.store.loadPendingOperations()[0].payload), clone(replacement))
  first.onUnload(); const returned = await h.preview()
  assert.equal(returned._confirmedPayload.requestId, replacement.requestId)
  assert.equal(returned.data.outcomeUnknown, true)
})
test('late terminal error cannot overwrite a newer preparation after successful draft replay', async () => {
  const h = integratedShopping(), first = await h.preview(9); await first.onConfirm()
  let rejectRequest
  h.outcome(() => new Promise((resolve, reject) => { rejectRequest = reject }))
  const confirming = first.onConfirm(); await new Promise(resolve => setImmediate(resolve))
  h.outcome('success'); const list = await h.list(); await list.onRetryDrafts()
  const next = await h.preview(55), snapshot = clone(h.storage.get('u:shoppingPreparation'))
  rejectRequest({ statusCode: 400 }); await confirming; first.onUnload()
  assert.deepEqual(h.storage.get('u:shoppingPreparation'), snapshot)
  assert.equal(next.data.dishes[0].dishId, 55)
  assert.equal(h.store.loadPendingOperations().length, 0)
})
