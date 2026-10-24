const {canonicalDish,canonicalApi}=require('./fixtures/canonical-dish')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const plain = value => value == null ? value : JSON.parse(JSON.stringify(value))
const dish = { id: 7, name: '清蒸鱼', type: 'meat', contentVersion: 'v1', cl: '鱼#姜', step: '洗鱼#蒸熟', cookMinutes: null }
function deferred() { let resolve; const promise = new Promise(ok => { resolve = ok }); return { promise, resolve } }
// Real page, storage scoping, identity, journal and recipe helpers. Only platform/HTTP boundaries are fake.
function fixture(overrides = {}, shared = {}) {
  const account = shared.account || { id: 'A', token: 'token-A', environment: 'https://example.test/api' }
  const memory = shared.memory || new Map(), leaveAlerts = []
  const wx = {
    getStorageInfoSync: () => ({ keys: [...memory.keys()] }),
    getStorageSync: key => key === 'userInfo' ? { id: account.id } : key === 'token' ? account.token : plain(memory.get(key)),
    setStorageSync: (key, value) => memory.set(key, plain(value)), removeStorageSync: key => memory.delete(key),
    enableAlertBeforeUnload(value) { leaveAlerts.push(value.message) }, disableAlertBeforeUnload() { leaveAlerts.push(null) }, showToast() {}, navigateTo() {}, showModal() {},
  }
  const api = { getCustomDishes: async () => [plain(dish)], getDishById: async () => plain(dish), ...overrides }
  let definition; const cache = {}
  const sandbox = { wx, Page: value => { definition = value }, console: { log() {}, warn() {}, error() {} } }
  function moduleFrom(file) {
    if (cache[file]) return cache[file]
    if (path.basename(file) === 'api.js') return canonicalApi(api)
    if (path.basename(file) === 'font-scale.js') return Object.assign(() => 1, { base: 16 })
    if (path.basename(file) === 'config.js') return { getApiBaseUrl: () => account.environment }
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { ...sandbox, module, exports: module.exports, require: name => moduleFrom(path.resolve(path.dirname(file), name + '.js')) })
    cache[file] = module.exports; return module.exports
  }
  moduleFrom(path.resolve('pages/custom-dishes/custom-dishes.js'))
  const page = { ...definition, data: plain(definition.data), setData(values) { Object.assign(this.data, values) } }
  page.onLoad()
  return { page, wx, api, account, memory, moduleFrom, leaveAlerts }
}
const pendingBody = () => ({ requestId: 'original-copy-request', expectedVersion: 'v1', editCopy: true, name: '我的鱼', type: 'meat', cl: '鱼#姜', step: '蒸熟', cookMinutes: null })
const seed = (f, body = pendingBody(), id = 7) => { const key = f.moduleFrom(path.resolve('utils/util.js')).getUserStorageKey('personalRecipeWrite:dish:copy:' + id); f.memory.set(key, plain(body)); return key }
const recoveryEvent = page => ({ currentTarget: { dataset: { id: 7, generation: page.data.pendingCopyGeneration } } })
test('restart discovers unknown copy outcome without replay, even when cloud list and source fail', async () => {
  const sends = []
  const api = { getCustomDishes: async () => { throw { isNetworkError: true } }, getDishById: async () => { throw { statusCode: 404 } }, copyEditedPersonalDish: async (id, body) => { sends.push(plain(body)); return { id: 22 } } }
  const old = fixture(api); const key = seed(old); old.page.onUnload()
  const f = fixture(api, old); await f.page.onShow()
  assert.equal(f.page.data.pendingCopies.length, 1); assert.equal(f.page.data.pendingCopies[0].name, '我的鱼'); assert.equal(sends.length, 0)
  await f.page.onRecoverCopy(recoveryEvent(f.page))
  assert.equal(f.page.data.editPending, true); assert.equal(f.page.data.form.name, '我的鱼'); assert.equal(sends.length, 0)
  await f.page.saveEdit(); assert.deepEqual(sends, [pendingBody()]); assert.equal(f.memory.has(key), false)
})
test('account and API environment scope restrict discovery and reject stale recovery actions', async () => {
  const f = fixture(); seed(f); f.account.id = 'B'; seed(f, { ...pendingBody(), name: 'B private' })
  f.account.id = 'A'; f.account.environment = 'https://other.test/api'; seed(f, { ...pendingBody(), name: 'Other environment' })
  f.account.environment = 'https://example.test/api'; await f.page.onShow()
  assert.deepEqual(plain(f.page.data.pendingCopies).map(x => x.name), ['我的鱼'])
  const stale = recoveryEvent(f.page); f.account.id = 'B'; await f.page.onRecoverCopy(stale)
  assert.equal(f.page.data.editing, false); assert.deepEqual(plain(f.page.data.pendingCopies), [])
  await f.page.onShow(); assert.equal(f.page.data.pendingCopies[0].name, 'B private')
  await f.page.onRecoverCopy(stale); assert.equal(f.page.data.editing, false)
  f.account.id = 'A'; f.account.environment = 'https://other.test/api'; await f.page.onShow()
  assert.equal(f.page.data.pendingCopies[0].name, 'Other environment')
})
for (const legacy of [false, true]) test(`recovery double click keeps one exact ${legacy ? 'legacy' : 'edited'} request and legacy opens its returned editor`, async () => {
  const source = deferred(), saved = deferred(); let reads = 0, updates = 0; const sends = []
  const body = legacy ? { expectedVersion: 'v1', requestId: 'legacy-request' } : pendingBody()
  const f = fixture({ getDishById: async () => { reads++; return source.promise }, copyPersonalDish: async (id, value) => { assert.equal(legacy, true); sends.push(plain(value)); return saved.promise }, copyEditedPersonalDish: async (id, value) => { assert.equal(legacy, false); sends.push(plain(value)); return saved.promise }, updateCustomDish: async () => { updates++ } })
  seed(f, body); await f.page.onShow(); const e = recoveryEvent(f.page)
  const first = f.page.onRecoverCopy(e), second = f.page.onRecoverCopy(e)
  source.resolve(null); await Promise.all([first, second]); assert.equal(reads, 1); assert.equal(sends.length, 0)
  const a = f.page.saveEdit(), b = f.page.saveEdit(); saved.resolve({ ...dish, id: 22 }); await Promise.all([a, b])
  assert.deepEqual(sends, [body]); assert.equal(updates, 0)
  if (legacy) { assert.equal(f.page.data.editing, true); assert.equal(f.page.data.copyDraft, false); assert.equal(f.page._original.id, 22) }
})
test('late source response after environment switch never opens old pending form', async () => {
  const source = deferred(); const f = fixture({ getDishById: () => source.promise }); seed(f); await f.page.onShow()
  const opening = f.page.onRecoverCopy(recoveryEvent(f.page)); f.account.environment = 'https://other.test/api'; await f.page.onShow(); source.resolve(dish); await opening
  assert.equal(f.page.data.editing, false); assert.deepEqual(plain(f.page.data.pendingCopies), []); assert.equal(f.page.data.form.name, undefined)
})
test('removed journal cannot turn a stale recovery entry into a new draft', async () => {
  const f = fixture(); const key = seed(f); await f.page.onShow(); const e = recoveryEvent(f.page); f.memory.delete(key)
  await f.page.onRecoverCopy(e); assert.equal(f.page.data.editing, false); assert.deepEqual(plain(f.page.data.pendingCopies), [])
})
test('copy cancellation and unknown recovery stay independent: unsaved cancellation leaves no recovery entry or write', async () => {
  const f = fixture(); f.page.onLoad({ copy: '7', version: 'v1' }); await f.page.onShow(); f.page.cancelEdit(); await f.page.onShow()
  assert.deepEqual(plain(f.page.data.pendingCopies), []); assert.equal([...f.memory.keys()].some(x => x.includes('personalRecipeWrite:')), false)
})
test('recovery UI is available outside the editor and labels unknown results separately', () => {
  const markup = fs.readFileSync('pages/custom-dishes/custom-dishes.wxml', 'utf8')
  assert.match(markup, /bindtap="onRecoverCopy"/); assert.match(markup, /data-generation="{{pendingCopyGeneration}}"/); assert.match(markup, /结果待确认/)
})
test('a request settled during source read never becomes a fresh copy draft', async () => {
  const source = deferred(); let sends = 0
  const f = fixture({ getDishById: () => source.promise, copyEditedPersonalDish: async () => { sends++; return { id: 22 } } })
  const key = seed(f); await f.page.onShow(); const opening = f.page.onRecoverCopy(recoveryEvent(f.page))
  f.memory.delete(key); source.resolve(dish); await opening
  assert.equal(f.page.data.editing, false); assert.equal(f.page._requestedCopy, null)
  await f.page.saveEdit(); assert.equal(sends, 0)
})
for (const replacement of [null, { ...pendingBody(), name: 'Changed request' }]) test(`settled or changed request after opening cannot be replayed as new copy: ${replacement ? 'changed' : 'removed'}`, async () => {
  let sends = 0
  const f = fixture({ copyEditedPersonalDish: async () => { sends++; return { id: 22 } } })
  const key = seed(f); await f.page.onShow(); await f.page.onRecoverCopy(recoveryEvent(f.page))
  if (replacement) f.memory.set(key, replacement); else f.memory.delete(key)
  await f.page.saveEdit(); assert.equal(sends, 0); assert.equal(f.page.data.editing, false)
})

test('an initial unknown save survives restart with exact request and warns of unknown outcome', async () => {
  const sends = []; let confirmed = false
  const api = { copyEditedPersonalDish: async (id, body) => { sends.push(plain(body)); if (!confirmed) throw { isNetworkError: true }; return { id: 22 } } }
  const f = fixture(api); f.page.onLoad({ copy: '7', version: 'v1' }); await f.page.onShow(); await f.page.saveEdit()
  assert.match(f.leaveAlerts.at(-1) || '', /结果待确认/); assert.equal(f.page.data.editPending, true)
  f.page.onUnload(); confirmed = true
  const next = fixture(api, f); await next.page.onShow(); assert.equal(sends.length, 1)
  await next.page.onRecoverCopy(recoveryEvent(next.page)); await next.page.saveEdit()
  assert.equal(sends.length, 2); assert.deepEqual(sends[1], sends[0])
})
