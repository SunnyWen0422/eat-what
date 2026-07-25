const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { createWx, loadPage } = require('./wechat-runtime')

const root = path.resolve(__dirname, '../..')

test('home exposes exactly three requested quick choices with selected feedback', () => {
  const wx = createWx({ initialStorage: { token: 'token', userInfo: { id: 1 } } })
  const { page } = loadPage(path.join(root, 'pages/index/index.js'), { wx })

  assert.deepEqual(page.data.homeQuickOptions.map(option => option.label), ['家常菜', '川菜', '粤菜'])
  page.onQuickFilterTap({ currentTarget: { dataset: { id: 'sichuan' } } })

  assert.deepEqual(page.data.sessionCriteria.cuisineCodes, ['SICHUAN'])
  assert.equal(page.data.filterSummary, '川菜')
  assert.equal(page.data.homeQuickOptions.find(option => option.id === 'sichuan').selected, true)
  assert.ok(wx.calls.some(call => call[0] === 'vibrateShort'))

  page.onQuickFilterTap({ currentTarget: { dataset: { id: 'sichuan' } } })
  assert.deepEqual(page.data.sessionCriteria.cuisineCodes, [])
  assert.equal(page.data.filterSummary, '')
})

test('home forwards current hard criteria into recommendation params', () => {
  const wx = createWx({ initialStorage: { token: 'token', userInfo: { id: 1 } } })
  const { page } = loadPage(path.join(root, 'pages/index/index.js'), { wx })
  page.onQuickFilterTap({ currentTarget: { dataset: { id: 'home' } } })
  page.onQuickFilterTap({ currentTarget: { dataset: { id: 'cantonese' } } })

  page._doNavigate()

  const navigation = wx.calls.find(call => call[0] === 'navigateTo')
  const encoded = navigation[1].url.split('params=')[1]
  const params = JSON.parse(decodeURIComponent(encoded))
  assert.deepEqual(params.criteria.includeTagCodes, ['HOME_STYLE'])
  assert.deepEqual(params.criteria.cuisineCodes, ['CANTONESE'])
  assert.equal(params.useSavedPreferences, true)
})

test('home lets the user disable saved preference ranking for one recommendation', () => {
  const wx = createWx({ initialStorage: { token: 'token', userInfo: { id: 1 } } })
  const { page } = loadPage(path.join(root, 'pages/index/index.js'), { wx })

  page.onUseSavedPreferencesChange({ detail: { value: false } })
  page._doNavigate()

  const navigation = wx.calls.find(call => call[0] === 'navigateTo')
  const params = JSON.parse(decodeURIComponent(navigation[1].url.split('params=')[1]))
  assert.equal(page.data.useSavedPreferences, false)
  assert.equal(params.useSavedPreferences, false)
})
