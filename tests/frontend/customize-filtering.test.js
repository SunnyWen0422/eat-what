const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { createWx, loadPage } = require('./wechat-runtime')

const root = path.resolve(__dirname, '../..')

test('browse filters use canonical API parameters without clearing selected dishes', async () => {
  const requests = []
  const api = {
    async getDishes(params) {
      requests.push(params)
      return { list: [], total: 0 }
    },
    async searchDishes() { return [] },
  }
  const options = {
    groups: {
      cuisine: [{ code: 'SICHUAN', label: 'Sichuan', count: 162 }],
      flavor: [{ code: 'SPICY', label: 'Spicy', count: 126 }],
      scene: [],
      diet: [],
      method: [{ code: 'STEAM', label: 'Steam', count: 342 }],
    },
  }
  const wx = createWx({ initialStorage: { token: 'token', userInfo: { id: 1 } } })
  const { page } = loadPage(path.join(root, 'pages/customize/customize.js'), {
    wx,
    mocks: {
      '../../utils/api': api,
      '../../utils/recommendation-options': { loadRecommendationOptions: async () => ({ options, synced: true }) },
    },
  })
  page.data.selectedIds = [99]
  page.allDishesMap[99] = { id: 99, name: 'selected', type: 'meat' }
  await page.loadCustomMetadata()

  await page.onBrowseOptionTap({ currentTarget: { dataset: { group: 'cuisine', code: 'SICHUAN' } } })
  await page.onBrowseOptionTap({ currentTarget: { dataset: { group: 'method', code: 'STEAM' } } })

  const last = requests[requests.length - 1]
  assert.deepEqual(last.cuisineCodes, ['SICHUAN'])
  assert.deepEqual(last.methodCodes, ['STEAM'])
  assert.deepEqual(page.data.selectedIds, [99])
  assert.equal(page.data.browseFilterCount, 2)
})

test('browse search uses the ownership-aware paged endpoint', async () => {
  const requests = []
  let legacySearchCalls = 0
  const api = {
    async getDishes(params) {
      requests.push(params)
      return { list: [{ id: 88, name: 'my custom dish', type: 'veg' }], total: 1 }
    },
    async searchDishes() {
      legacySearchCalls += 1
      return []
    },
  }
  const { page } = loadPage(path.join(root, 'pages/customize/customize.js'), {
    wx: createWx(),
    mocks: {
      '../../utils/api': api,
      '../../utils/recommendation-options': { loadRecommendationOptions: async () => ({ options: { groups: {} } }) },
    },
  })
  page.data.searchKeyword = 'custom'

  await page.loadPage('veg', 1)

  assert.equal(legacySearchCalls, 0)
  assert.equal(requests[0].keyword, 'custom')
  assert.equal(requests[0].type, 'veg')
  assert.equal(page.data.currentDishes[0].id, 88)
})
