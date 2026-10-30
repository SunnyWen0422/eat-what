const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
const { canonicalDish } = require('./fixtures/canonical-dish')

function fixture(details, getDishById, options = {}) {
  let definition, owner = 'A'
  const memory = new Map(), calls = [], navigations = []
  const wx = { getStorageSync: key => memory.get(key), setStorageSync: (key, value) => memory.set(key, value), navigateTo: value => navigations.push(value), switchTab: value => navigations.push(value) }
  const api = {
    getMealOverview: async () => ({ plans: [{ recordDate: '2026-10-25', mealType: 'dinner', revision: 3, dishIds: [1, 2], dishDetails: details }] }),
    getDishById: async id => { calls.push(id); return getDishById(id) }
  }
  vm.runInNewContext(fs.readFileSync('pages/meal-cooking/meal-cooking.js', 'utf8'), {
    Page: value => { definition = value }, wx, console,
    require: name => name.endsWith('/api') ? api : name.endsWith('/util') ? { getUserStorageKey: key => owner + ':' + key } : require(path.resolve('pages/meal-cooking', name))
  })
  const page = { ...definition, data: structuredClone(definition.data), setData(value, callback) { Object.assign(this.data, value); callback?.() } }
  page.onLoad({ date: '2026-10-25', mealType: 'dinner', planRevision: '3', ...options })
  return { page, calls, navigations, switchOwner() { owner = 'B' } }
}

const saved = () => [
  canonicalDish({ id: 1, name: '已保存的豆腐', ingredientsAmounts: '豆腐 200g', steps: '切块###煮熟' }),
  canonicalDish({ id: 2, name: '已保存的青菜', ingredientsAmounts: '青菜 150g', steps: '洗净###炒熟' })
]

test('whole meal reads saved recipe even when the public recipe has been retired', async () => {
  const f = fixture(saved(), async () => { throw { statusCode: 410 } })
  await f.page.onShow()
  assert.equal(f.page.data.errorMessage, '')
  assert.equal(f.page.data.dishes.length, 2)
  assert.equal(f.page.data.dishName, '已保存的豆腐')
  assert.match(f.page.data.ingredients[0], /200克/)
  assert.deepEqual(f.calls, [])
})

test('new catalog amounts and steps cannot silently replace a saved meal recipe', async () => {
  const f = fixture(saved(), async id => canonicalDish({ id, name: '新配方', ingredientsAmounts: '豆腐 900g', steps: '新的做法' }))
  await f.page.onShow()
  assert.equal(f.page.data.steps[0], '切块')
  assert.match(f.page.data.ingredients[0], /200克/)
  assert.equal(f.page.data.dishes[1].name, '已保存的青菜')
  assert.deepEqual(f.calls, [])
})

test('legacy record without a full recipe explicitly identifies current-catalog fallback', async () => {
  const f = fixture([{ id: 1, name: '只有菜名的旧记录' }, saved()[1]], async id => canonicalDish({ id, name: '当前可用配方' }))
  await f.page.onShow()
  assert.equal(f.page.data.errorMessage, '')
  assert.deepEqual(f.calls, [1])
  assert.match(f.page.data.recipeSourceNotice, /当前菜谱/)
})

test('late legacy recipe response cannot enter a switched account', async () => {
  const pending = []
  const f = fixture([], id => new Promise(done => { pending.push(() => done(canonicalDish({ id, name: '旧账号配方' }))) }))
  const running = f.page.onShow()
  await new Promise(done => setImmediate(done))
  f.switchOwner()
  pending.forEach(done => done())
  await running
  assert.equal(f.page.data.dishes.length, 0)
})
