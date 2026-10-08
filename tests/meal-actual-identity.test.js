const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const flow = require('../utils/meal-workflow')
const { createMealActualEntry } = require('../utils/meal-actual-entry')
const day = '2026-10-06', target = { date: day, mealType: 'dinner' }
const clone = value => JSON.parse(JSON.stringify(value))
function overview(dishes, actual, revision = 3) {
  return {
    plans: dishes ? [{ recordDate: day, mealType: 'dinner', revision, dishIds: dishes.map(d => d.dishId || d.id), dishDetails: dishes }] : [],
    planRevisions: { [day + '|dinner']: revision },
    consumptions: actual ? [{ mealDate: day, mealType: 'dinner', revision: 4, status: 'eaten', actualDishes: actual }] : [],
  }
}
function fixture(initial) {
  let account = 'A', data = initial
  const memory = new Map(), sent = []
  const wx = { getStorageSync: k => memory.get(k), setStorageSync: (k, v) => memory.set(k, clone(v)), removeStorageSync: k => memory.delete(k), showToast() {} }
  const api = { getMealOverview: async () => clone(data), saveMealConsumption: async (date, meal, body) => { sent.push(clone(body)); return { status: body.status } } }
  const page = { data: {}, setData(v) { Object.assign(this.data, v) } }
  Object.assign(page, createMealActualEntry({ api, wx, scope: () => account + ':mealActual', today: () => day }))
  let calendar
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../pages/calendar-detail/calendar-detail.js'), 'utf8'), {
    Page: value => { calendar = value }, wx, console,
    require: name => name.endsWith('/api') ? api : name.endsWith('/util') ? { getUserStorageKey: k => account + ':' + k }
      : require(path.resolve(__dirname, '../pages/calendar-detail', name)),
  })
  calendar.setData = v => Object.assign(calendar.data, v)
  Object.assign(calendar.data, { selectedDate: day, meals: flow.mealViews(initial, day), formMode: 'actual', formMeal: 'dinner' })
  calendar._viewScope = account + ':mealView'
  return { page, calendar, api, sent, memory, replace: value => { data = value }, switchAccount: () => { account = 'B' } }
}
async function saveQuick(f, text, options = {}) {
  await f.page.openMealActual({ ...target, ...options })
  f.page.onActualMode({ currentTarget: { dataset: { mode: 'changed' } } })
  f.page.onActualText({ detail: { value: text } })
  await f.page.onConfirmActual()
}

test('first changed actual keeps unique planned dish IDs and free text in both entry points', async () => {
  const f = fixture(overview([{ id: 7, name: '青菜' }, { dishId: 8, name: '蛋汤' }]))
  await saveQuick(f, '青菜、蛋汤、外食拉面', { planRevision: 3 })
  f.calendar.data.formActual = '青菜、蛋汤、外食拉面'
  await f.calendar.saveForm()
  for (const body of f.sent) {
    assert.deepEqual(body.dishes, [{ dishId: 7 }, { dishId: 8 }, { name: '外食拉面' }])
    assert.equal(body.expectedRevision, 0)
    assert.equal(body.expectedPlanRevision, 3)
  }
  assert.equal(f.sent.length, 2)
})

test('retained actual snapshot wins over a current plan with the same dish name', async () => {
  const f = fixture(overview([{ id: 8, name: '青菜' }, { id: 9, name: '蛋汤' }], [{ dishId: 7, name: '青菜', kcal: 99 }]))
  await saveQuick(f, '青菜、蛋汤、外食拉面')
  assert.deepEqual(f.sent[0].dishes, [{ retainedEntryIndex: 0 }, { dishId: 9 }, { name: '外食拉面' }])
  assert.equal(f.sent[0].expectedRevision, 4)
})

test('duplicate planned names never arbitrarily choose a dish identity in either entry point', async () => {
  const f = fixture(overview([{ id: 7, name: '青菜' }, { id: 8, name: '青菜' }]))
  await saveQuick(f, '青菜')
  f.calendar.data.formActual = '青菜'
  await f.calendar.saveForm()
  assert.equal(f.sent.length, 2)
  for (const body of f.sent) assert.deepEqual(body.dishes, [{ name: '青菜' }])
})

test('duplicate actual names retain separate snapshot indexes before planned identity', async () => {
  const f = fixture(overview([{ id: 9, name: '青菜' }], [{ dishId: 7, name: '青菜' }, { name: '青菜' }]))
  await saveQuick(f, '青菜、青菜、青菜')
  assert.deepEqual(f.sent[0].dishes, [{ retainedEntryIndex: 0 }, { retainedEntryIndex: 1 }, { dishId: 9 }])
})

test('deleted plan preserves actual snapshot identity and leaves unrelated input as free text', async () => {
  const f = fixture(overview(null, [{ dishId: 7, name: '青菜' }], 5))
  await saveQuick(f, '青菜、蛋汤', { planRevision: 3, displayedPlanNames: '青菜、蛋汤' })
  assert.deepEqual(f.sent[0].dishes, [{ retainedEntryIndex: 0 }, { name: '蛋汤' }])
  assert.equal(f.sent[0].expectedPlanRevision, 5)
  assert.equal(f.sent[0].expectedRevision, 4)
})

test('changed displayed plan cannot relabel old text with a newly matching dish ID', async () => {
  const f = fixture(overview([{ id: 8, name: '青菜' }], null, 4))
  await saveQuick(f, '青菜', { planRevision: 3, displayedPlanNames: '青菜' })
  assert.deepEqual(f.sent[0].dishes, [{ name: '青菜' }])
  assert.equal(f.sent[0].expectedPlanRevision, 4)
})

test('conflict reload keeps the initially displayed plan identity boundary without a caller revision', async () => {
  const f = fixture(overview([{ id: 7, name: '青菜' }]))
  const save = f.api.saveMealConsumption
  f.api.saveMealConsumption = async (date, meal, body) => { await save(date, meal, body); throw { statusCode: 409 } }
  await saveQuick(f, '青菜')
  f.replace(overview([{ id: 8, name: '青菜' }], null, 4))
  await f.page.onActualReload()
  assert.equal(f.page.data.actualPlanChanged, true)
  assert.equal(f.page.data.actualText, '青菜')
  f.api.saveMealConsumption = save
  await f.page.onConfirmActual()
  assert.deepEqual(f.sent[1].dishes, [{ name: '青菜' }])
  assert.equal(f.sent[1].expectedPlanRevision, 4)
  assert.notEqual(f.sent[0].requestId, f.sent[1].requestId)
})

for (const hasPlan of [true, false]) {
  test(`first successful reload after a failed initial read preserves its ${hasPlan ? 'plan' : 'no-plan'} identity boundary`, async () => {
    const f = fixture(overview(hasPlan ? [{ id: 7, name: '青菜' }] : null, null, hasPlan ? 3 : 0))
    const read = f.api.getMealOverview, save = f.api.saveMealConsumption
    f.api.getMealOverview = async () => { throw Error('temporary read failure') }
    await f.page.openMealActual(target)
    assert.equal(f.page.data.actualNeedsReload, true)
    f.api.getMealOverview = read
    await f.page.onActualReload()
    assert.equal(f.page.data.actualNeedsReload, false)
    f.page.onActualText({ detail: { value: '青菜' } })
    f.api.saveMealConsumption = async (date, meal, body) => { await save(date, meal, body); throw { statusCode: 409 } }
    await f.page.onActualChanged()
    assert.deepEqual(f.sent[0].dishes, [hasPlan ? { dishId: 7 } : { name: '青菜' }])
    f.replace(overview([{ id: 8, name: '青菜' }], null, 4))
    await f.page.onActualReload()
    assert.equal(f.page.data.actualPlanChanged, true)
    assert.equal(f.page.data.actualText, '青菜')
    f.api.saveMealConsumption = save
    await f.page.onActualChanged()
    assert.deepEqual(f.sent[1].dishes, [{ name: '青菜' }])
    assert.equal(f.sent[1].expectedPlanRevision, 4)
  })
}

test('first successful reload never replaces a caller-supplied displayed plan revision', async () => {
  const f = fixture(overview([{ id: 8, name: '青菜' }], null, 4)), read = f.api.getMealOverview
  f.api.getMealOverview = async () => { throw Error('temporary read failure') }
  await f.page.openMealActual({ ...target, planRevision: 3, displayedPlanNames: '青菜' })
  f.api.getMealOverview = read
  await f.page.onActualReload()
  assert.equal(f.page.data.actualPlanChanged, true)
  f.page.onActualText({ detail: { value: '青菜' } })
  await f.page.onActualChanged()
  assert.deepEqual(f.sent[0].dishes, [{ name: '青菜' }])
})

test('unknown changed-actual retry preserves the original IDs, versions and request ID', async () => {
  const f = fixture(overview([{ id: 7, name: '青菜' }]))
  const save = f.api.saveMealConsumption
  f.api.saveMealConsumption = async (date, meal, body) => { await save(date, meal, body); throw { statusCode: 503 } }
  await saveQuick(f, '青菜、外食拉面')
  assert.equal(f.page.data.actualUnknown, true)
  f.replace(overview([{ id: 8, name: '青菜' }], null, 4))
  f.page.onActualText({ detail: { value: 'other text' } })
  f.api.saveMealConsumption = save
  await f.page.onActualRetry()
  assert.deepEqual(f.sent[0].dishes, [{ dishId: 7 }, { name: '外食拉面' }])
  assert.deepEqual(f.sent[1], f.sent[0])
  assert.equal(f.memory.size, 0)
})

test('an account switch blocks a pending changed-actual retry', async () => {
  const f = fixture(overview([{ id: 7, name: '青菜' }]))
  const save = f.api.saveMealConsumption
  f.api.saveMealConsumption = async (date, meal, body) => { await save(date, meal, body); throw { statusCode: 503 } }
  await saveQuick(f, '青菜')
  f.switchAccount()
  await f.page.onActualRetry()
  assert.equal(f.sent.length, 1)
  assert.equal(f.memory.size, 1)
})
