const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createApiMock, createWx, loadPage } = require('./wechat-runtime')

const root = path.resolve(__dirname, '../..')
const resultPage = path.join(root, 'pages/result/result.js')

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function recommendationResult(id, source = 'backend') {
  return {
    plans: [{ dishes: [{ id, name: `菜品${id}`, type: 'veg' }] }],
    source,
    warnings: [],
    appliedCriteria: {},
  }
}

function loadResultPage(generateRecommendation, apiOverrides = {}) {
  const api = createApiMock(apiOverrides)
  const wx = createWx()
  const mocks = {
    '../../utils/api': api,
    '../../utils/recommend': {
      recommendPlans: async () => [],
      getAllDishes: async () => [],
    },
    '../../utils/recommendation-flow': {
      generateRecommendation,
      refreshBackendRecommendation: async () => [],
    },
  }
  return { ...loadPage(resultPage, { wx, mocks }), api }
}

test('initial generation advances through visible progress stages', async () => {
  const request = deferred()
  const { page } = loadResultPage(() => request.promise)
  page.filteringStageDelayMs = 5
  page.fallbackStageDelayMs = 12
  page.generationTimeoutMs = 100

  const generation = page.generatePlans()
  assert.equal(page.data.loading, true)
  assert.match(page.data.loadingStage, /分析/)

  await delay(7)
  assert.match(page.data.loadingStage, /筛选/)
  await delay(8)
  assert.match(page.data.loadingStage, /本地方案/)

  request.resolve(recommendationResult(1))
  await generation
  assert.equal(page.data.loading, false)
  assert.equal(page.data.loadingStage, '')
})

test('initial generation hard timeout always ends the loading state', async () => {
  const { page } = loadResultPage(() => new Promise(() => {}))
  page.generationTimeoutMs = 15

  const outcome = await Promise.race([
    page.generatePlans().then(() => 'settled'),
    delay(80).then(() => 'hung'),
  ])

  assert.equal(outcome, 'settled')
  assert.equal(page.data.loading, false)
  assert.equal(page.data.refreshing, false)
  assert.equal(page.data.empty, true)
  assert.match(page.data.warnings[0], /超时|重试/)
})

test('result template exposes staged initial and nonblocking refresh feedback', () => {
  const template = fs.readFileSync(path.join(root, 'pages/result/result.wxml'), 'utf8')
  const styles = fs.readFileSync(path.join(root, 'pages/result/result.wxss'), 'utf8')

  assert.match(template, /loadingStage/)
  assert.match(template, /refreshing/)
  assert.match(template, /generationNotice/)
  assert.match(template, /act-regen[^>]*loading="\{\{refreshing\}\}"/)
  assert.match(template, /class="results-content"/)
  assert.match(styles, /generation-banner/)
  assert.match(styles, /\.results-content\s*\{[\s\S]*?display:\s*flex/)
  assert.match(styles, /\.plan-swiper\s*\{[^}]*flex:\s*1/)
})

test('regeneration keeps the current plan visible while the new plan is pending', async () => {
  const request = deferred()
  const { page } = loadResultPage(() => request.promise)
  page.setData({
    loading: false,
    empty: false,
    plans: recommendationResult(1).plans,
    current: 2,
  })

  const generation = page.generatePlans()

  assert.equal(page.data.loading, false)
  assert.equal(page.data.refreshing, true)
  assert.equal(page.data.plans[0].dishes[0].id, 1)

  request.resolve(recommendationResult(2))
  await generation

  assert.equal(page.data.refreshing, false)
  assert.equal(page.data.plans[0].dishes[0].id, 2)
  assert.equal(page.data.current, 0)
})

test('duplicate regenerate actions create only one recommendation request', async () => {
  const request = deferred()
  let calls = 0
  const { page } = loadResultPage(() => {
    calls += 1
    return request.promise
  })
  page.setData({ loading: false, empty: false, plans: recommendationResult(1).plans })

  const first = page.onRegenerate()
  const second = page.onRegenerate()

  try {
    assert.equal(calls, 1)
  } finally {
    request.resolve(recommendationResult(2))
    await Promise.allSettled([first, second])
  }
})

test('failed regeneration keeps the previous plan and reports nonblocking feedback', async () => {
  const { page } = loadResultPage(async () => { throw new Error('offline') })
  page.setData({ loading: false, empty: false, plans: recommendationResult(1).plans })

  await page.generatePlans()

  assert.equal(page.data.loading, false)
  assert.equal(page.data.refreshing, false)
  assert.equal(page.data.empty, false)
  assert.equal(page.data.plans[0].dishes[0].id, 1)
  assert.match(page.data.generationNotice, /仍显示上次方案/)
})

test('empty regeneration keeps the previous plan and reports nonblocking feedback', async () => {
  const { page } = loadResultPage(async () => ({
    plans: [],
    source: 'backend',
    warnings: ['候选不足'],
    appliedCriteria: {},
  }))
  page.setData({ loading: false, empty: false, plans: recommendationResult(1).plans })

  await page.generatePlans()

  assert.equal(page.data.empty, false)
  assert.equal(page.data.plans[0].dishes[0].id, 1)
  assert.match(page.data.generationNotice, /仍显示上次方案/)
})

test('cache and local recommendations explain the fallback source without hiding plans', async () => {
  const results = [recommendationResult(1, 'cache'), recommendationResult(2, 'local')]
  const { page } = loadResultPage(async () => results.shift())

  await page.generatePlans()
  assert.equal(page.data.empty, false)
  assert.match(page.data.generationNotice, /缓存菜品/)

  await page.generatePlans()
  assert.equal(page.data.empty, false)
  assert.equal(page.data.plans[0].dishes[0].id, 2)
  assert.match(page.data.generationNotice, /本地菜品/)
})

test('unloading invalidates a pending generation so its late result cannot update the page', async () => {
  const request = deferred()
  const { page } = loadResultPage(() => request.promise)
  page.generationTimeoutMs = 100

  const generation = page.generatePlans()
  page.onUnload()
  request.resolve(recommendationResult(7))
  await generation

  assert.deepEqual(page.data.plans, [])
  assert.equal(page.generationInFlight, false)
  assert.deepEqual(page.generationStageTimers, [])
})

test('a late favorite lookup cannot overwrite a newer recommendation', async () => {
  const favoriteRequest = deferred()
  const results = [recommendationResult(1, 'cache'), recommendationResult(2, 'backend')]
  const { page } = loadResultPage(
    async () => results.shift(),
    { batchCheckFavoriteDishes: () => favoriteRequest.promise }
  )

  await page.generatePlans()
  await page.generatePlans()
  favoriteRequest.resolve([1])
  await delay(0)

  assert.equal(page.data.plans[0].dishes[0].id, 2)
})
