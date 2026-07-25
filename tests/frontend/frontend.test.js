const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { createWx, freshRequire, installGlobals, loadApp } = require('./wechat-runtime')

const root = path.resolve(__dirname, '../..')

test('user storage keys are isolated by authenticated identity and guest fallback', () => {
  const wx = createWx({ initialStorage: { userInfo: { id: 42 } } })
  installGlobals({ wx })
  const util = freshRequire(path.join(root, 'utils/util.js'))
  assert.equal(util.getCurrentUserIdentity(), 'id_42')
  assert.equal(util.getUserStorageKey('recipeRecords'), 'user:id_42:recipeRecords')
  wx.removeStorageSync('userInfo')
  assert.equal(util.getCurrentUserIdentity(), 'guest')
})

test('default and custom dishes are combined per user', () => {
  const wx = createWx({ initialStorage: { userInfo: { id: 7 } } })
  installGlobals({ wx })
  const dishes = freshRequire(path.join(root, 'utils/dishes.js'))
  const before = dishes.getDefaultDishes().length
  dishes.addCustomDish({ id: 9001, name: '测试私房菜', type: 'veg' })
  const combined = dishes.getAllDishes()
  assert.equal(combined.length, before + 1)
  assert.equal(combined.at(-1).name, '测试私房菜')
  assert.equal(wx.getStorageSync('user:id_7:customDishes').length, 1)
})

test('recommendation engine produces three nonempty plans with selected dish priority', async () => {
  const wx = createWx({ initialStorage: { userInfo: { id: 8 } } })
  installGlobals({ wx })
  const recommendation = freshRequire(path.join(root, 'utils/recommend.js'))
  const allDishes = []
  for (const type of ['meat', 'veg', 'soup', 'dessert', 'staple']) {
    for (let index = 0; index < 15; index += 1) {
      allDishes.push({ id: `${type}-${index}`, name: `${type}-${index}`, type, tags: ['家常'] })
    }
  }
  const selected = { id: 'selected', name: '指定荤菜', type: 'meat', tags: ['家常'] }
  const plans = await recommendation.recommendPlans({ meat: 2, veg: 2, soup: 1, dessert: 1, staple: 1, userSelectedDishes: [selected] }, allDishes)
  assert.equal(plans.length, 3)
  for (const plan of plans) {
    assert.equal(plan.dishes.length, 7)
    assert.ok(plan.dishes.some(dish => dish.name === selected.name))
    assert.equal(new Set(plan.dishes.map(dish => dish.name)).size, plan.dishes.length)
  }
})

test('API client sends bearer token and reuses ETag response data', async () => {
  let requestCount = 0
  const headers = []
  const wx = createWx({
    initialStorage: { token: 'token-123' },
    request(options) {
      requestCount += 1
      headers.push(options.header)
      if (requestCount === 1) {
        queueMicrotask(() => options.success({ statusCode: 200, data: { value: 1 }, header: { ETag: 'v1' } }))
      } else {
        queueMicrotask(() => options.success({ statusCode: 304, data: null, header: {} }))
      }
    },
  })
  installGlobals({ wx })
  const api = freshRequire(path.join(root, 'utils/api.js'))
  assert.deepEqual(await api.request('/test', 'GET'), { value: 1 })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(await api.request('/test', 'GET'), { value: 1 })
  assert.equal(headers[0].Authorization, 'Bearer token-123')
  assert.equal(headers[1]['If-None-Match'], 'v1')
})

test('API client resolves its base URL from the shared configuration', async () => {
  let requestedUrl = ''
  const wx = createWx({
    request(options) {
      requestedUrl = options.url
      queueMicrotask(() => options.success({ statusCode: 200, data: {}, header: {} }))
    },
  })
  installGlobals({ wx })
  const api = freshRequire(path.join(root, 'utils/api.js'), {
    './config': { getApiBaseUrl: () => 'https://contract.test/api' },
  })

  await api.request('/dishes', 'GET')

  assert.equal(requestedUrl, 'https://contract.test/api/dishes')
})

test('API client merges identical in-flight requests', async () => {
  let requestCount = 0
  const wx = createWx({
    request(options) {
      requestCount += 1
      setImmediate(() => options.success({ statusCode: 200, data: { ok: true }, header: {} }))
    },
  })
  installGlobals({ wx })
  const api = freshRequire(path.join(root, 'utils/api.js'))
  const [first, second] = await Promise.all([api.request('/same', 'GET'), api.request('/same', 'GET')])
  assert.deepEqual(first, second)
  assert.equal(requestCount, 1)
})

test('API wrappers target the documented endpoint families', async () => {
  const urls = []
  const wx = createWx({ request(options) { urls.push(`${options.method} ${options.url}`); queueMicrotask(() => options.success({ statusCode: 200, data: {}, header: {} })) } })
  installGlobals({ wx })
  const api = freshRequire(path.join(root, 'utils/api.js'))
  await api.getDishes({ type: 'meat', page: 1, pageSize: 20, cuisineCodes: ['SICHUAN'], methodCodes: ['STEAM'] })
  await api.getDishById(3)
  await api.getRecommendations({ meat: 2 })
  await api.saveRecipeRecord({ mealType: 'lunch' })
  await api.addFavoriteDish(3)
  await api.sendChat('你好', 1)
  await api.getAdminUsers({ keyword: '张三', page: 2, pageSize: 20 })
  await api.getAdminUser(7)
  await api.createAdminUserDish(7, { name: '测试菜' })
  await api.deleteAdminUserDish(7, 9)
  assert.ok(urls.some(value => value.includes('/api/dishes?type=meat')))
  assert.ok(urls.some(value => value.includes('cuisineCodes=SICHUAN') && value.includes('methodCodes=STEAM')))
  assert.ok(urls.some(value => value.endsWith('/api/dishes/3')))
  assert.ok(urls.some(value => value.endsWith('/api/recommend')))
  assert.ok(urls.some(value => value.endsWith('/api/recipe-records')))
  assert.ok(urls.some(value => value.endsWith('/api/favorite-dishes')))
  assert.ok(urls.some(value => value.endsWith('/api/chat/sync')))
  assert.ok(urls.some(value => value.includes('/api/admin/users?') && value.includes('keyword=%E5%BC%A0%E4%B8%89') && value.includes('page=2')))
  assert.ok(urls.some(value => value.endsWith('/api/admin/users/7')))
  assert.ok(urls.some(value => value.endsWith('/api/admin/users/7/dishes')))
  assert.ok(urls.some(value => value.endsWith('/api/admin/users/7/dishes/9')))
})

test('API client exposes only endpoint families implemented by Java controllers', () => {
  const source = require('node:fs').readFileSync(path.join(root, 'utils/api.js'), 'utf8')
  const controllers = require('node:fs')
    .readdirSync(path.join(root, 'backend/src/main/java/com/eatwhat/controller'))
    .filter(name => name.endsWith('Controller.java'))
    .map(name => require('node:fs').readFileSync(path.join(root, 'backend/src/main/java/com/eatwhat/controller', name), 'utf8'))
    .join('\n')

  const endpointFamilies = [...source.matchAll(/(?:request|requestSilent|doRequest)\(\s*[`'"]\/(?!\/)([a-z][a-z-]*)/g)]
    .map(match => match[1])
  const controllerFamilies = new Set([...controllers.matchAll(/@RequestMapping\(\s*"\/([a-z][a-z-]*)"\s*\)/g)]
    .map(match => match[1]))
  const missing = [...new Set(endpointFamilies.filter(family => !controllerFamilies.has(family)))]

  assert.deepEqual(missing, [])
})

test('application launch records a log and uses cached login data', async () => {
  const wx = createWx({
    initialStorage: { token: 'cached', userInfo: { id: 1 } },
    request(options) {
      queueMicrotask(() => options.success({ statusCode: 200, data: [], header: {} }))
    },
  })
  const apiMock = {
    requestSilent: async () => ({ success: true }),
    getDishesLiteByType: async () => [],
    getDishesLite: async () => [],
  }
  const { appDefinition } = loadApp(path.join(root, 'app.js'), {
    wx,
    mocks: { './utils/api': apiMock, './utils/config': { ENABLE_LOGIN: true } },
  })
  appDefinition.globalData = { ...appDefinition.globalData }
  appDefinition.onLaunch()
  await appDefinition.waitForLogin()
  assert.equal(appDefinition.globalData.isLoggedIn, true)
  assert.equal(wx.getStorageSync('logs').length, 1)
})
