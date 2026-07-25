const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createApiMock, createWx, loadPage, pageFiles } = require('./wechat-runtime')

const root = path.resolve(__dirname, '../..')
const pages = pageFiles(root)

function handlerNames(wxml) {
  const names = new Set()
  const expression = /(?:bind|catch)(?::)?[a-zA-Z-]+\s*=\s*"([a-zA-Z_$][\w$]*)"/g
  for (const match of wxml.matchAll(expression)) names.add(match[1])
  return [...names]
}

function pageMocks(apiMock) {
  return {
    '../../utils/api': apiMock,
    '../../utils/recommend': { recommendPlans: async () => [], getAllDishes: async () => [] },
    '../../utils/recommendation-flow': {
      generateRecommendation: async () => ({ plans: [], source: 'local', dishPool: [], shouldRefresh: false }),
      refreshBackendRecommendation: async () => [],
    },
  }
}

for (const entry of pages) {
  test(`${entry.route} has complete files and all WXML handlers`, async () => {
    for (const extension of ['js', 'json', 'wxml', 'wxss']) {
      assert.ok(fs.existsSync(path.join(root, `${entry.route}.${extension}`)), `${extension} missing`)
    }
    const apiMock = createApiMock()
    const wx = createWx({ initialStorage: { token: 'token', userInfo: { id: 1, nickname: '测试用户' } } })
    const app = {
      globalData: {
        loginReady: true,
        isLoggedIn: true,
        userInfo: { id: 1, nickname: '测试用户' },
        allDishes: [
          { id: 1, name: 'meat', type: 'meat', tags: [] },
          { id: 2, name: 'veg', type: 'veg', tags: [] },
          { id: 3, name: 'soup', type: 'soup', tags: [] },
        ],
      },
      waitForLogin: () => Promise.resolve(),
    }
    const { page } = loadPage(entry.js, { wx, app, mocks: pageMocks(apiMock) })
    const wxml = fs.readFileSync(entry.wxml, 'utf8')
    for (const handler of handlerNames(wxml)) {
      assert.equal(typeof page[handler], 'function', `${handler} is not implemented`)
    }
    const lifecycle = page.onLoad || page.onShow
    if (lifecycle) await lifecycle.call(page, {})
    await new Promise(resolve => setImmediate(resolve))
  })
}

test('result page replaces a failed image with its local placeholder state', () => {
  const apiMock = createApiMock()
  const wx = createWx()
  const { page } = loadPage(path.join(root, 'pages/result/result.js'), { wx, mocks: pageMocks(apiMock) })
  page.data.plans = [{ dishes: [{ id: 1, image: 'https://example.com/failed.jpg' }] }]

  page.onImgError({ currentTarget: { dataset: { planIndex: 0, dishIndex: 0 } } })
  assert.equal(page.data.plans[0].dishes[0].image, '')
})

test('result empty state renders backend shortage warnings', () => {
  const source = fs.readFileSync(path.join(root, 'pages/result/result.wxml'), 'utf8')
  assert.match(source, /wx:elif="\{\{empty\}\}"[\s\S]*wx:for="\{\{warnings\}\}"/)
})

test('result page summarizes the effective criteria returned by the backend', async () => {
  const apiMock = createApiMock()
  const wx = createWx()
  const mocks = pageMocks(apiMock)
  mocks['../../utils/recommendation-flow'] = {
    generateRecommendation: async () => ({
      plans: [{ dishes: [{ id: 1, name: 'server dish', type: 'veg' }] }],
      source: 'backend',
      warnings: [],
      appliedCriteria: {
        cuisineCodes: ['NORTHEAST'],
        includeTagCodes: ['STEAM'],
        maxCookMinutes: 30,
      },
    }),
  }
  const { page } = loadPage(path.join(root, 'pages/result/result.js'), { wx, mocks })
  page.data.params = { criteria: {} }

  await page.generatePlans()

  assert.equal(page.data.filterSummary, '东北菜、蒸、30 分钟内')
})

test('result page replacement keeps the active hard recommendation filters', async () => {
  const apiMock = createApiMock()
  const wx = createWx({ initialStorage: { token: 'token', userInfo: { id: 1 } } })
  const { page } = loadPage(path.join(root, 'pages/result/result.js'), { wx, mocks: pageMocks(apiMock) })
  page.data.params = { criteria: { cuisineCodes: ['SICHUAN'] }, useSavedPreferences: true }
  page.data.plans = [{ dishes: [{ id: 1, name: 'target', type: 'meat' }] }]
  page.allDishes = [
    { id: 2, name: 'cantonese', type: 'meat', cuisineCode: 'CANTONESE', tagCodes: '' },
    { id: 3, name: 'sichuan', type: 'meat', cuisineCode: 'SICHUAN', tagCodes: '' },
  ]
  const originalRandom = Math.random
  Math.random = () => 0
  try {
    await page.onRefreshDish({ currentTarget: { dataset: { planIndex: 0, dishIndex: 0 } } })
  } finally {
    Math.random = originalRandom
  }

  assert.equal(page.data.plans[0].dishes[0].id, 3)
})

test('all static mini-program navigation targets are registered pages', () => {
  const registered = new Set(pages.map(page => page.route))
  const missing = []
  for (const entry of pages) {
    const source = fs.readFileSync(entry.js, 'utf8')
    for (const match of source.matchAll(/['"`]\/(pages\/[a-z0-9-]+\/[a-z0-9-]+)/gi)) {
      if (!registered.has(match[1])) missing.push(`${entry.route} -> ${match[1]}`)
    }
  }
  assert.deepEqual(missing, [])
})

test('app JSON, sitemap, and all page JSON files parse', () => {
  const jsonFiles = [path.join(root, 'app.json'), path.join(root, 'sitemap.json'), ...pages.map(page => path.join(root, `${page.route}.json`))]
  for (const file of jsonFiles) assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, 'utf8')), file)
})

test('unsupported shopping-list feature is absent from the Mini Program bundle', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  assert.ok(!appConfig.pages.includes('pages/shopping-list/shopping-list'))
  assert.ok(!fs.existsSync(path.join(root, 'pages/shopping-list')))
})

test('profile keeps the admin page unreachable for non-admin users', () => {
  const wx = createWx()
  const apiMock = createApiMock()
  const { page } = loadPage(path.join(root, 'pages/profile/profile.js'), {
    wx,
    mocks: pageMocks(apiMock),
  })

  for (let index = 0; index < 5; index += 1) page.onVersionTap()
  assert.equal(wx.calls.filter(call => call[0] === 'navigateTo').length, 0)

  page.setData({ isAdmin: true })
  for (let index = 0; index < 5; index += 1) page.onVersionTap()
  assert.ok(wx.calls.some(call => call[0] === 'navigateTo' && call[1].url === '/pages/admin/admin'))
})
