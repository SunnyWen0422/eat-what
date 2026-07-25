const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { createWx, freshRequire, installGlobals } = require('./wechat-runtime')

const root = path.resolve(__dirname, '../..')

function createFlow({ cachedDishes = null, backendResult, backendError, localPlans = [{ dishes: [{ id: 9 }] }], loadedDishes = [{ id: 8 }], backendTimeoutMs } = {}) {
  const wx = createWx({ initialStorage: cachedDishes ? { cachedAllDishes: cachedDishes } : {} })
  const app = { globalData: { allDishes: null } }
  installGlobals({ wx, app })
  const api = {
    async getRecommendations() {
      if (backendError) throw backendError
      return backendResult
    },
  }
  const localRecommend = async (_params, dishes) => {
    localRecommend.dishes = dishes
    return localPlans
  }
  const getAllDishes = async () => loadedDishes
  const module = freshRequire(path.join(root, 'utils/recommendation-flow.js'), {
    './api': api,
    './recommend': { recommendPlans: localRecommend, getAllDishes },
  })
  return {
    flow: module.createRecommendationFlow({ api, localRecommend, getAllDishes, wx, appProvider: () => app, backendTimeoutMs }),
    localRecommend,
  }
}

test('backend recommendation responses are normalized once at the flow boundary', () => {
  const { flow } = createFlow()
  const plans = flow.normalizeBackendPlans({
    success: true,
    favoriteIds: [2],
    plans: [{ dishes: [
      { id: 1, name: 'A', tags: '家常,快手', image: 'http://img/a.jpg' },
      { id: 2, name: 'B', tags: ['清淡'] },
    ] }],
  })

  assert.deepEqual(plans[0].dishes[0].tags, ['家常', '快手'])
  assert.equal(plans[0].dishes[0].image, 'https://img/a.jpg')
  assert.equal(plans[0].dishes[0].isFavorite, false)
  assert.equal(plans[0].dishes[1].isFavorite, true)
})

test('cached dishes are used only after the authoritative backend has no plans', async () => {
  const cached = [{ id: 1, name: 'cached' }]
  const { flow, localRecommend } = createFlow({
    cachedDishes: cached,
    backendResult: { success: true, plans: [], warnings: ['候选不足'] },
  })

  const result = await flow.generate({ meat: 1 })

  assert.equal(result.source, 'cache')
  assert.equal(result.shouldRefresh, false)
  assert.deepEqual(result.dishPool, cached)
  assert.deepEqual(localRecommend.dishes, cached)
  assert.deepEqual(result.warnings, ['候选不足'])
})

test('a slow backend response falls back to cached dishes without replacing the visible result', async () => {
  const cached = [{ id: 5, name: 'cached' }]
  const { flow } = createFlow({
    cachedDishes: cached,
    backendResult: new Promise(resolve => setTimeout(() => resolve({ success: true, plans: [] }), 40)),
    backendTimeoutMs: 1,
  })

  const result = await flow.generate({ meat: 1 })

  assert.equal(result.source, 'cache')
  assert.equal(result.shouldRefresh, false)
})

test('without cache a valid backend result is authoritative', async () => {
  const { flow } = createFlow({
    backendResult: {
      success: true,
      plans: [{ dishes: [{ id: 3, name: 'server' }] }],
      favoriteIds: [],
      appliedCriteria: { excludeTagCodes: ['FRY'], maxCookMinutes: 30 },
    },
  })

  const result = await flow.generate({ meat: 1 })

  assert.equal(result.source, 'backend')
  assert.equal(result.shouldRefresh, false)
  assert.equal(result.plans[0].dishes[0].name, 'server')
  assert.deepEqual(result.appliedCriteria, { excludeTagCodes: ['FRY'], maxCookMinutes: 30 })
})

test('backend failure falls back to the local engine and loaded dish pool', async () => {
  const loaded = [{ id: 4, name: 'loaded' }]
  const { flow, localRecommend } = createFlow({ backendError: new Error('offline'), loadedDishes: loaded })

  const result = await flow.generate({ veg: 1 })

  assert.equal(result.source, 'local')
  assert.equal(result.shouldRefresh, false)
  assert.deepEqual(localRecommend.dishes, loaded)
})

test('an empty offline fallback explains why no recommendation is available', async () => {
  const { flow } = createFlow({ backendError: new Error('offline'), localPlans: [], loadedDishes: [] })

  const result = await flow.generate({ meat: 1, criteria: { cuisineCodes: ['SICHUAN'] } })

  assert.equal(result.source, 'local')
  assert.deepEqual(result.plans, [])
  assert.deepEqual(result.warnings, ['网络暂时不可用，本地菜品也没有同时满足当前条件。'])
})
