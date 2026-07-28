const assert = require('node:assert/strict')
const test = require('node:test')
const { createWx, loadPage } = require('./wechat-runtime')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')

test('shopping list loads local content before remote failure', async () => {
  const wx = createWx({ initialStorage: { userInfo: { id: 7 }, token: 'token' } })
  global.wx = wx
  const local = require('../../utils/shopping-list')
  local.saveLocalShoppingList({ dishes: [{ selectionKey: 'dish-a', dishName: '炸猪排', items: [{ clientKey: 'a', displayName: '猪排', quantityText: '300g' }] }] })
  const { page } = loadPage(path.join(root, 'pages/shopping-list/shopping-list.js'), {
    wx,
    mocks: { '../../utils/api': { getShoppingList: async () => { throw new Error('offline') } } },
  })
  await page.loadList()
  assert.equal(page.data.dishes[0].dishName, '炸猪排')
  assert.match(page.data.errorMessage, /本地清单/)
})

test('shopping list state keeps dish groups independent', () => {
  const ingredients = require('../../utils/shopping-ingredients')
  const summary = ingredients.buildPurchaseSummary([
    { dishName: '炸猪排', items: [{ canonicalName: '猪排', quantityValue: 300, quantityText: '300g', unitCode: 'g', unitFamily: 'mass', parseStatus: 'PARSED' }] },
    { dishName: '葱烧大排', items: [{ canonicalName: '猪排', quantityValue: 400, quantityText: '400g', unitCode: 'g', unitFamily: 'mass', parseStatus: 'PARSED' }] },
  ])
  assert.equal(summary.mergeableItems[0].quantityValue, 700)
})
