const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const LOCAL = 'http://127.0.0.1:18780/api'
const ONLINE = 'https://chishenme.icu/api'
const dish = id => ({ id, name: `菜${id}`, type: 'meat' })
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

function fixture(api = {}, initial = {}) {
  let environment = initial.environment || ONLINE
  const storage = new Map(Object.entries(initial.storage || {})), modules = new Map()
  const app = { globalData: { ...(initial.globalData || {}) } }
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => { if (initial.storageFull) throw new Error('storage full'); storage.set(key, value) },
    removeStorageSync: key => storage.delete(key),
  }
  function load(relative) {
    const filename = path.resolve(relative)
    if (modules.has(filename)) return modules.get(filename).exports
    const module = { exports: {} }; modules.set(filename, module)
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      module, wx, getApp: () => app, App: value => Object.assign(app, value),
      console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
      require: name => {
        const resolved = path.resolve(path.dirname(filename), name) + '.js'
        if (resolved.endsWith('/utils/api.js') || resolved.endsWith('\\utils\\api.js')) return api
        if (resolved.endsWith('/utils/config.js') || resolved.endsWith('\\utils\\config.js')) return { getApiBaseUrl: () => environment }
        return load(resolved)
      },
    }, { filename })
    return module.exports
  }
  return { app, wx, storage, load, online: () => { environment = ONLINE }, local: () => { environment = LOCAL } }
}

test('recommendation loading ignores retained catalog rows with no API source', async () => {
  let reads = 0
  const old = [dish(1)]
  const f = fixture({ getDishesLite: async () => { reads++; return [dish(101)] } }, { storage: { cachedAllDishes: old } })
  const rows = await f.load('utils/recommend.js').getAllDishes()
  assert.equal(rows[0].id, 101); assert.equal(reads, 1)
  assert.equal(f.storage.get('cachedAllDishes'), old, 'unscoped data is retained without activation')
})

test('fallback flow cannot treat untagged global or legacy storage rows as the current online catalog', () => {
  const f = fixture({}, { globalData: { allDishes: [dish(1)] }, storage: { cachedAllDishes: [dish(2)] } })
  const flow = f.load('utils/recommendation-flow.js').createRecommendationFlow({ wx: f.wx, appProvider: () => f.app })
  assert.equal(flow.getCachedDishPool(), null)
})

test('catalogs are reusable only within their API source while both stored versions survive switching', async () => {
  let reads = 0
  const f = fixture({ getDishesLite: async () => [dish(++reads)] }, { environment: LOCAL })
  const recommend = f.load('utils/recommend.js')
  assert.equal((await recommend.getAllDishes())[0].id, 1)
  f.online(); assert.equal((await recommend.getAllDishes())[0].id, 2)
  f.local(); assert.equal((await recommend.getAllDishes())[0].id, 1)
  assert.equal(reads, 2)
})

test('an old catalog response cannot be rendered or write a cache after switching API', async () => {
  const pending = deferred(), f = fixture({ getDishesLite: () => pending.promise }, { environment: LOCAL })
  const loading = f.load('utils/recommend.js').getAllDishes()
  f.online(); pending.resolve([dish(1)])
  await assert.rejects(loading, /环境已切换/)
  assert.equal(f.app.globalData.allDishes, undefined)
  assert.equal(f.storage.size, 0)
})

test('a late prefetch cannot replace the catalog in a different API environment', async () => {
  const pending = deferred(), f = fixture({ getDishesLiteByType: () => pending.promise }, { environment: LOCAL })
  f.load('app.js')
  const loading = f.app.precacheDishes()
  f.online(); pending.resolve([dish(1)]); await loading
  assert.equal(f.app.globalData.allDishes, null)
  assert.equal(f.storage.size, 0)
})

test('a late backend recommendation is rejected instead of becoming a plan in the next environment', async () => {
  const pending = deferred(), f = fixture({}, { environment: LOCAL })
  const flow = f.load('utils/recommendation-flow.js').createRecommendationFlow({
    api: { getRecommendations: () => pending.promise }, wx: f.wx, appProvider: () => f.app,
  })
  const loading = flow.generate({ people: 2 })
  f.online(); pending.resolve({ success: true, plans: [{ dishes: [dish(1)] }] })
  await assert.rejects(loading, /环境已切换/)
})

test('storage capacity failures preserve successful catalog data in memory', async () => {
  const f = fixture({ getDishesLite: async () => [dish(101)] }, { storageFull: true })
  const rows = await f.load('utils/recommend.js').getAllDishes()
  assert.equal(rows[0].id, 101)
  assert.equal(f.app.globalData.allDishes[0].id, 101)
})

test('offline fallback uses only a successfully cached catalog from the current API', async () => {
  const f = fixture({ getDishesLite: async () => [dish(101)] })
  await f.load('utils/recommend.js').getAllDishes()
  const flow = f.load('utils/recommendation-flow.js').createRecommendationFlow({
    api: { getRecommendations: async () => { throw new Error('offline') } },
    localRecommend: async (_, rows) => [{ dishes: rows }], wx: f.wx, appProvider: () => f.app,
  })
  const result = await flow.generate({ people: 2 })
  assert.equal(result.source, 'cache'); assert.equal(result.plans[0].dishes[0].id, 101)
  assert.equal(f.app.globalData.allDishesSource, ONLINE)
})

test('successful prefetch creates source-labelled global and persistent rows for recommendation fallback', async () => {
  const f = fixture({ getDishesLiteByType: async () => [dish(101)] })
  f.load('app.js'); await f.app.precacheDishes()
  assert.equal(f.app.globalData.allDishesSource, ONLINE)
  const values = [...f.storage.values()]
  assert.equal(values.length, 1)
  assert.equal(values[0].source, ONLINE)
  assert.equal(values[0].dishes.length, 4)
})
