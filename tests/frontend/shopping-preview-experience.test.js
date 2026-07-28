const assert = require('node:assert/strict')
const test = require('node:test')
const path = require('node:path')
const { createWx, loadPage } = require('./wechat-runtime')

const root = path.resolve(__dirname, '../..')

test('preview drops stale responses when a newer request completes first', async () => {
  const wx = createWx()
  let resolveFirst
  const api = {
    createShoppingPreview: (payload) => payload.targetPeople === 2
      ? new Promise(resolve => { resolveFirst = resolve })
      : Promise.resolve({ dishes: [{ selectionKey: 'new', dishName: '新方案', items: [] }], warnings: [] }),
  }
  const { page } = loadPage(path.join(root, 'pages/shopping-preview/shopping-preview.js'), { wx, mocks: { '../../utils/api': api } })
  page.selection = { dishIds: [1], targetPeople: 2, source: 'test', dishes: [] }
  page.setData({ targetPeople: 2 })
  const first = page.loadPreview()
  page.setData({ targetPeople: 4 })
  const second = page.loadPreview()
  await second
  resolveFirst({ dishes: [{ selectionKey: 'old', dishName: '旧方案', items: [] }], warnings: [] })
  await first
  assert.equal(page.data.dishes[0].dishName, '新方案')
})

test('preview confirmation is guarded against duplicate clicks', async () => {
  const wx = createWx()
  let calls = 0
  const api = {
    batchAddShoppingItems: async () => { calls += 1; return { list: { dishes: [] } } },
    createShoppingPreview: async () => ({ dishes: [], warnings: [] }),
  }
  const { page } = loadPage(path.join(root, 'pages/shopping-preview/shopping-preview.js'), { wx, mocks: { '../../utils/api': api } })
  page.setData({ dishes: [{ selectionKey: 'dish-a', dishName: '炸猪排', items: [{ clientKey: 'i', displayName: '猪排', quantityText: '300g' }] }] })
  await Promise.all([page.onConfirm(), page.onConfirm()])
  assert.equal(calls, 1)
})
