const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function fixture(route, api, handoff) {
  let definition
  const wx = { getStorageSync: () => null, setStorageSync() {}, showToast() {} }
  vm.runInNewContext(fs.readFileSync(`pages/${route}/${route}.js`, 'utf8'), {
    Page: value => { definition = value }, wx, console,
    require: name => name.endsWith('/api') ? api
      : name.endsWith('/util') ? { getUserStorageKey: key => `A:${key}` }
      : name.endsWith('/font-scale') ? Object.assign(() => 1, { base: 16 })
      : name.endsWith('/dish-workspace-handoff') ? handoff
      : require(path.resolve('pages', route, name))
  })
  return { ...definition, data: { ...definition.data }, setData(value) { Object.assign(this.data, value) } }
}

const technicalError = { statusCode: 500, message: '数据库 SQL Exception at /www/backend/controller.java' }

test('history read failure gives a retry instruction without exposing server internals', async () => {
  const page = fixture('assistant-history', { getAssistantSessions: async () => { throw technicalError } })
  page.onLoad()
  await page.onShow()
  assert.equal(page.data.errorMessage, '历史暂未读到，请重新读取。')
  assert.equal(page.data.loading, false)
})

test('cooking read failure stays visible and plan changes keep the return-to-meal action', async () => {
  const page = fixture('meal-cooking', { getMealOverview: async () => { throw technicalError } })
  page.onLoad({ date: '2026-10-10', mealType: 'dinner', planRevision: '2' })
  await page.onShow()
  assert.equal(page.data.errorMessage, '做法暂未读到，请重新读取。')
  assert.equal(page.data.planChanged, false)
  const changed = fixture('meal-cooking', { getMealOverview: async () => ({ plans: [] }) })
  changed.onLoad({ date: '2026-10-10', mealType: 'dinner', planRevision: '2' })
  await changed.onShow()
  assert.match(changed.data.errorMessage, /安排已变化/)
  assert.equal(changed.data.planChanged, true)
})

test('favorite addition failure preserves the choice and reports the failed action safely', async () => {
  const page = fixture('favorite-dishes', {}, { addDishToWorkspace: async () => { throw technicalError } })
  page._viewScope = 'A:favoriteView'
  page.data.selectedMeal = { dishIds: [] }
  await page.onAddToMeal({ currentTarget: { dataset: { id: 7 } } })
  assert.equal(page.data.mealAddError, '暂未加入本餐，原选择仍保留，请重试。')
  assert.deepEqual(page.data.selectedMeal.dishIds, [])
  assert.equal(page.data.addingId, null)
})
