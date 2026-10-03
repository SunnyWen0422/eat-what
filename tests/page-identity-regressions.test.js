const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const flow = require('../utils/meal-workflow')

function deferred() {
  let resolve, reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

function load(route, api = {}, extras = {}) {
  let definition
  const account = { id: 'A', token: 'token-A' }
  const navigation = [], dialogs = [], timers = new Map(), storage = new Map()
  const wx = {
    getStorageSync: key => key === 'userInfo' ? { id: account.id } : key === 'token' ? account.token : storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key),
    showToast() {}, showLoading() {}, hideLoading() {}, vibrateShort() {}, stopPullDownRefresh() {},
    showModal: value => dialogs.push(value), showActionSheet: value => dialogs.push(value),
    navigateTo: value => navigation.push(value), switchTab() {}, redirectTo() {}, ...extras.wx,
  }
  const modules = {
    '../../utils/api': api, '../../utils/font-scale': () => 1,
    '../../utils/util': { getUserStorageKey: key => `${account.id || 'guest'}:${key}` },
    '../../utils/config': { ENABLE_MEAL_WORKSPACE: false }, '../../utils/meal-workflow': flow,
    '../../utils/recommendation-options': { loadRecommendationOptions: async () => ({ options: { groups: {} } }) },
    '../../utils/preference-store': { createPreferenceStore: () => ({ readCache: () => ({}) }) },
    '../../utils/recommendation-matcher': { filterAndRankDishes: dishes => dishes },
    '../../utils/recommend': { getAllDishes: async () => [] },
    '../../utils/shopping-list': { beginShoppingSelection() {} }, ...extras.modules,
  }
  const sandbox = {
    Page: value => { definition = value }, wx, console: { log() {}, warn() {}, error() {} },
    getApp: () => ({ globalData: { loginReady: true } }),
    setTimeout: callback => { const id = timers.size + 1; timers.set(id, callback); return id },
    clearTimeout: id => timers.delete(id), setInterval() {}, clearInterval() {},
  }
  const cache = {}
  function moduleFrom(file) {
    if (cache[file]) return cache[file]
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { ...sandbox, module, exports: module.exports, require: name => {
      const resolved = path.resolve(path.dirname(file), name + '.js')
      if (path.basename(resolved) === 'api.js') return api
      if (path.basename(resolved) === 'util.js') return modules['../../utils/util']
      if (path.basename(resolved) === 'meal-workflow.js') return flow
      return moduleFrom(resolved)
    } })
    cache[file] = module.exports
    return module.exports
  }
  sandbox.require = name => name in modules ? modules[name] : moduleFrom(path.resolve(path.dirname(route + '.js'), name + '.js'))
  vm.runInNewContext(fs.readFileSync(route + '.js', 'utf8'), sandbox)
  const page = { ...definition, data: structuredClone(definition.data), setData(values) {
    for (const [key, value] of Object.entries(values)) {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
      let target = this.data
      for (const part of parts.slice(0, -1)) target = target[part]
      target[parts.at(-1)] = value
    }
  } }
  return { page, account, wx, navigation, dialogs, timers }
}

const privateForm = () => ({ name: 'A private dish', type: 'soup', ingredients: 'A ingredients', steps: 'A steps', cuisineCode: 'SICHUAN', cuisineLabel: '川菜', tagCodes: ['SPICY'], cookMinutes: '30' })

for (const beforeShow of [true, false]) test(`F01 account change clears private form and blocks save ${beforeShow ? 'before' : 'after'} onShow`, async () => {
  const writes = []
  const { page, account } = load('pages/customize/customize', { createCustomDish: async value => writes.push(value), getDishes: async () => ({ list: [], total: 0 }) })
  page.onShow(); page.data.customForm = privateForm(); page.data.customTagOptions = [{ code: 'SPICY', selected: true }]
  page.data.customError = 'A failure'; account.id = 'B'
  if (!beforeShow) page.onShow()
  await page.onSaveCustomDish()
  assert.equal(writes.length, 0)
  assert.equal(page.data.customForm.name, '')
  assert.equal(page.data.customForm.cuisineCode, '')
  assert.equal(page.data.customTagOptions[0].selected, false)
  assert.equal(page.data.customError, '')
})

test('F01 late custom save clears old ownership without changing the new draft', async () => {
  const pending = deferred()
  const { page, account } = load('pages/customize/customize', { createCustomDish: () => pending.promise, getDishes: async () => ({ list: [], total: 0 }) })
  page.onShow(); page.data.customForm = privateForm()
  const saving = page.onSaveCustomDish(); account.id = 'B'; page.onShow()
  page.onCustomInput({ currentTarget: { dataset: { field: 'name' } }, detail: { value: 'B draft' } })
  pending.resolve({}); await saving
  assert.equal(page.data.customForm.name, 'B draft'); assert.equal(page.data.savingCustom, false)
})

test('F01 same-account failed save and cancel preserve typed inputs', async () => {
  const { page } = load('pages/customize/customize', { createCustomDish: async () => { throw { statusCode: 500 } } })
  page.onShow(); page.data.customForm = privateForm(); await page.onSaveCustomDish(); page.onCancelCustom()
  assert.equal(page.data.customForm.name, 'A private dish'); assert.equal(page.data.customForm.tagCodes[0], 'SPICY')
})

test('F01 a calendar action sheet cannot submit a new account selection', async () => {
  let writes = 0
  const { page, account, dialogs } = load('pages/customize/customize')
  page.onShow(); page.data.selectedIds = [1]; page.doSave = () => { writes++ }
  await page.onSaveToCalendar(); account.id = 'B'; dialogs[0].success({ tapIndex: 1 })
  assert.equal(writes, 0)
})

test('F01 plan overwrite confirmation rejects a token switch without a user ID', async () => {
  let writes = 0
  const { page, account, dialogs } = load('pages/customize/customize', {
    getMealOverview: async () => ({ plans: [{ recordDate: flow.today(), mealType: 'dinner', recipeName: 'existing', revision: 1 }], consumptions: [] }),
    saveMealPlan: async () => { writes++ },
  })
  account.id = null; page.onShow(); page.data.selectedIds = [1]; page.allDishesMap = { 1: { id: 1, name: 'A private dish' } }
  const saving = page.doSave('dinner', [1]); await new Promise(resolve => setImmediate(resolve))
  assert.equal(dialogs.length, 1)
  account.token = 'token-B'; dialogs[0].success({ confirm: true }); await saving
  assert.equal(writes, 0); assert.equal(page._pendingPlanWrite, null)
})

const admins = [
  { route: 'admin', method: 'loadUsers', api: 'getAdminUsers', response: { list: [{ id: 1, phone: 'A private phone' }], total: 1 }, field: 'users', seed: [] },
  { route: 'admin-dashboard', method: 'load', api: 'getAdminOverview', response: { totalUsers: 1, recentAudits: [] }, field: 'overview', seed: null },
  { route: 'admin-users', method: 'load', api: 'getAdminUsers', response: { list: [{ id: 1, phone: 'A private phone' }], total: 1 }, field: 'users', seed: [] },
  { route: 'admin-user-detail', method: 'load', api: 'getAdminUser', response: { user: { id: 1, phone: 'A private phone' }, customDishes: [] }, field: 'user', seed: null },
  { route: 'admin-dishes', method: 'load', api: 'getAdminDishes', response: { list: [{ id: 1, name: 'A private dish' }], total: 1 }, field: 'dishes', seed: [] },
  { route: 'admin-audit', method: 'load', api: 'getAdminAuditLogs', response: { list: [{ id: 1, detailJson: '{}' }], total: 1 }, field: 'logs', seed: [] },
]
for (const fixture of admins) {
  test(`F02 ${fixture.route} rejects late account data and unload callbacks`, async () => {
    for (const unload of [false, true]) {
      const pending = deferred()
      const { page, account } = load(`pages/${fixture.route}/${fixture.route}`, { [fixture.api]: () => pending.promise })
      const reading = page[fixture.method](true)
      if (unload) { if (page.onUnload) page.onUnload() } else account.id = 'B'
      pending.resolve(fixture.response); await reading
      assert.deepEqual(JSON.parse(JSON.stringify(page.data[fixture.field])), fixture.seed)
    }
  })
  for (const statusCode of [401, 403]) test(`F02 ${fixture.route} clears protected data for HTTP ${statusCode}`, async () => {
    const { page } = load(`pages/${fixture.route}/${fixture.route}`, { [fixture.api]: async () => { throw { statusCode, isAuthError: statusCode === 401 } } })
    page.data[fixture.field] = fixture.field === 'overview' || fixture.field === 'user' ? { secret: 'private' } : [{ secret: 'private' }]
    page.data.ready = true; page.data.listReady = true
    await page[fixture.method](true)
    assert.deepEqual(JSON.parse(JSON.stringify(page.data[fixture.field])), fixture.seed)
    assert.equal(page.data.authStatus, statusCode === 401 ? 'auth' : 'permission')
  })
}

for (const fixture of admins.filter(item => ['admin', 'admin-users', 'admin-dishes', 'admin-audit'].includes(item.route))) {
  test(`F02 ${fixture.route} keeps the latest authorized response when an older request fails`, async () => {
    const old = deferred(), latest = deferred(); let calls = 0
    const { page } = load(`pages/${fixture.route}/${fixture.route}`, { [fixture.api]: () => (++calls === 1 ? old.promise : latest.promise) })
    const first = page[fixture.method](true)
    page.data.keyword = 'latest search'; page.data.targetUserId = '2'
    const second = page[fixture.method](true)
    latest.resolve(fixture.response); await second
    old.reject({ statusCode: 403 }); await first
    assert.equal(page.data[fixture.field].length, 1); assert.equal(page.data.authStatus, '')
  })
}

for (const fixture of [
  { route: 'admin-users', method: 'toggleStatus', data: { users: [{ id: 1, status: 1 }] }, write: 'updateAdminUserStatus' },
  { route: 'admin-user-detail', method: 'toggleStatus', data: { userId: 1, user: { id: 1, status: 1 } }, write: 'updateAdminUserStatus' },
  { route: 'admin-user-detail', method: 'deleteDish', data: { userId: 1 }, write: 'deleteAdminUserDish' },
  { route: 'admin-dishes', method: 'togglePublished', data: { dishes: [{ id: 1, isPublished: 1 }] }, write: 'updateAdminDishStatus' },
  { route: 'admin', method: 'onDeleteDish', data: { selectedUser: { id: 1 } }, write: 'deleteAdminUserDish' },
]) test(`F02 ${fixture.route} ${fixture.method} discards confirmation from the previous account`, async () => {
  let writes = 0
  const { page, account, dialogs } = load(`pages/${fixture.route}/${fixture.route}`, { [fixture.write]: async () => { writes++; return {} } })
  Object.assign(page.data, fixture.data)
  page[fixture.method]({ currentTarget: { dataset: { id: 1 } } })
  account.id = 'B'; await dialogs[0].success({ confirm: true })
  assert.equal(writes, 0)
})

for (const fallback of [false, true]) test(`F04 ${fallback ? 'local' : 'backend'} replacement cannot overwrite a newer generation`, async () => {
  const pending = deferred()
  const { page } = load('pages/result/result', { getSingleRecommendation: () => fallback ? Promise.reject(new Error('offline')) : pending.promise }, { modules: { '../../utils/recommend': { getAllDishes: () => pending.promise } } })
  page.data.plans = [{ dishes: [{ id: 1, name: 'old', type: 'meat' }] }]
  const oldPlans = page.data.plans
  const replacing = page.onRefreshDish({ currentTarget: { dataset: { planIndex: 0, dishIndex: 0 } } })
  await new Promise(resolve => setImmediate(resolve))
  page.data.plans = [{ dishes: [{ id: 9, name: 'new', type: 'meat' }] }]; page.generationVersion++
  pending.resolve(fallback ? [{ id: 2, name: 'late', type: 'meat' }] : { success: true, dish: { id: 2, name: 'late', type: 'meat' } })
  await replacing
  assert.equal(page.data.plans[0].dishes[0].id, 9); assert.equal(oldPlans[0].dishes[0].id, 1)
})

test('F04 replacement rejects an account change before onShow', async () => {
  const pending = deferred()
  const { page, account } = load('pages/result/result', { getSingleRecommendation: () => pending.promise })
  page.data.plans = [{ dishes: [{ id: 1, name: 'old', type: 'meat' }] }]
  const replacing = page.onRefreshDish({ currentTarget: { dataset: { planIndex: 0, dishIndex: 0 } } })
  account.id = 'B'; pending.resolve({ success: true, dish: { id: 2, name: 'late', type: 'meat' } }); await replacing
  assert.equal(page.data.plans[0].dishes[0].id, 1)
})

test('F04 fallback cannot cross two tokens without a user ID', async () => {
  const pending = deferred()
  const { page, account } = load('pages/result/result', { getSingleRecommendation: () => pending.promise })
  account.id = null; page.data.plans = [{ dishes: [{ id: 1, name: 'old', type: 'meat' }] }]
  page.allDishes = [{ id: 2, name: 'cached A private', type: 'meat' }]
  const replacing = page.onRefreshDish({ currentTarget: { dataset: { planIndex: 0, dishIndex: 0 } } })
  account.token = 'token-B'; pending.reject({ isAccountChanged: true }); await replacing
  assert.equal(page.data.plans[0].dishes[0].id, 1)
})

test('F04 replacement preserves a concurrent change to another plan and stops on unload', async () => {
  for (const unload of [false, true]) {
    const pending = deferred()
    const { page } = load('pages/result/result', { getSingleRecommendation: () => pending.promise })
    page.data.plans = [{ dishes: [{ id: 1, name: 'old', type: 'meat' }] }, { dishes: [{ id: 5, name: 'other', type: 'veg' }] }]
    const replacing = page.onRefreshDish({ currentTarget: { dataset: { planIndex: 0, dishIndex: 0 } } })
    page.data.plans = [page.data.plans[0], { dishes: [{ id: 9, name: 'new other', type: 'veg' }] }]
    if (unload) page.onUnload()
    pending.resolve({ success: true, dish: { id: 2, name: 'replace', type: 'meat' } }); await replacing
    assert.equal(page.data.plans[1].dishes[0].id, 9); assert.equal(page.data.plans[0].dishes[0].id, unload ? 1 : 2)
  }
})

test('F01 an old selection event cannot create B shopping work before onShow', () => {
  let writes = 0
  const { page, account, navigation } = load('pages/customize/customize', {}, { modules: { '../../utils/shopping-list': { beginShoppingSelection: () => { writes++ } } } })
  page.onShow(); page.data.selectedIds = [1]; page.allDishesMap = { 1: { id: 1, name: 'A private dish' } }
  account.id = 'B'; page.onAddSelectedToShoppingList()
  assert.equal(writes, 0); assert.equal(navigation.length, 0)
})

for (const action of ['onShowSelected', 'onRemoveSelected', 'onHideSelected', 'onTapDish']) {
  for (const missingId of [false, true]) test(`round1 F01 ${action} rejects account changes before onShow ${missingId ? 'without user ID' : 'with user ID'}`, () => {
    const { page, account, navigation } = load('pages/customize/customize')
    if (missingId) account.id = null
    page.onShow(); page.data.selectedIds = [1, 2]; page.data.selectedTotal = 2
    page.allDishesMap = { 1: { id: 1, name: 'A first private dish' }, 2: { id: 2, name: 'A second private dish' } }
    page.data.selectedList = [{ id: 1, name: 'A first private dish' }]
    if (missingId) account.token = 'token-B'
    else account.id = 'B'
    page[action]({ currentTarget: { dataset: { id: 1, dish: page.allDishesMap[1] } } })
    assert.equal(page.data.selectedIds.length, 0); assert.equal(page.data.selectedList.length, 0)
    assert.equal(page.data.showSelectedPanel, false); assert.equal(navigation.length, 0)
  })
  test(`round1 F01 ${action} ignores events after unload`, () => {
    const { page, navigation } = load('pages/customize/customize')
    page.onShow(); page.data.selectedIds = [1, 2]
    page.allDishesMap = { 1: { id: 1, name: 'A first private dish' }, 2: { id: 2, name: 'A second private dish' } }
    page.onUnload(); let updates = 0; const setData = page.setData
    page.setData = function (values) { updates++; setData.call(this, values) }
    page[action]({ currentTarget: { dataset: { id: 1, dish: page.allDishesMap[1] } } })
    assert.equal(updates, 0); assert.equal(navigation.length, 0)
  })
}

test('round1 F01 same-account panel display and removal retain the remaining selection', () => {
  const { page } = load('pages/customize/customize')
  page.onShow(); page.data.selectedIds = [1, 2]; page.data.selectedTotal = 2
  page.allDishesMap = { 1: { id: 1, name: 'first' }, 2: { id: 2, name: 'second' } }
  page.onShowSelected(); assert.equal(page.data.showSelectedPanel, true); assert.equal(page.data.selectedList.length, 2)
  page.onRemoveSelected({ currentTarget: { dataset: { id: 1 } } })
  assert.equal(page.data.selectedIds[0], 2); assert.equal(page.data.selectedTotal, 1); assert.equal(page.data.selectedList[0].name, 'second')
  page.onHideSelected(); assert.equal(page.data.showSelectedPanel, false); assert.equal(page.data.selectedIds[0], 2)
})

for (const fixture of admins) for (const statusCode of [401, 403]) {
  test(`round1 F02 ${fixture.route} clears HTTP ${statusCode} status only after a current successful retry`, async () => {
    const pending = deferred(); let calls = 0
    const { page, account } = load(`pages/${fixture.route}/${fixture.route}`, { [fixture.api]: () => ++calls === 1 ? Promise.reject({ statusCode }) : pending.promise })
    await page[fixture.method](true)
    const status = statusCode === 401 ? 'auth' : 'permission'
    assert.equal(page.data.authStatus, status); assert.ok(page.data.authMessage)
    const retry = page[fixture.method](true)
    assert.equal(page.data.authStatus, status); assert.ok(page.data.authMessage)
    account.token = 'refreshed-same-A'
    pending.resolve(fixture.response); await retry
    assert.equal(page.data.authStatus, ''); assert.equal(page.data.authMessage, '')
    assert.equal(fixture.field === 'overview' ? page.data.overview.totalUsers : fixture.field === 'user' ? page.data.user.id : page.data[fixture.field].length, 1)
  })
}

for (const fixture of admins.filter(item => ['admin', 'admin-users', 'admin-dishes', 'admin-audit'].includes(item.route))) {
  test(`round1 F02 ${fixture.route} retains the latest permission denial when an older success arrives`, async () => {
    const old = deferred(), latest = deferred(); let calls = 0
    const { page } = load(`pages/${fixture.route}/${fixture.route}`, { [fixture.api]: () => ++calls === 1 ? old.promise : latest.promise })
    const first = page[fixture.method](true)
    page.data.keyword = 'latest search'; page.data.targetUserId = '2'
    const second = page[fixture.method](true)
    latest.reject({ statusCode: 403 }); await second
    old.resolve(fixture.response); await first
    assert.equal(page.data.authStatus, 'permission'); assert.ok(page.data.authMessage); assert.equal(page.data[fixture.field].length, 0)
  })
}

for (const fixture of admins) test(`F02 ${fixture.route} account change clears filters/forms before a new action`, () => {
  const { page, account } = load(`pages/${fixture.route}/${fixture.route}`)
  const event = fixture.route === 'admin' ? 'onSearchInput' : fixture.route === 'admin-users' ? 'onInput' : fixture.route === 'admin-dishes' ? 'onKeyword' : fixture.route === 'admin-audit' ? 'onUser' : null
  if (event) page[event]({ detail: { value: 'A filter' } })
  else page.beginAdminOperation()
  if ('form' in page.data) page.data.form = { name: 'A draft' }
  if ('newDish' in page.data) page.data.newDish = { name: 'A draft' }
  account.id = 'B'
  if (event) page[event]({ detail: { value: 'stale event' } })
  else page.beginAdminOperation()
  assert.notEqual(page.data.form && page.data.form.name, 'A draft')
  assert.notEqual(page.data.newDish && page.data.newDish.name, 'A draft')
  if (fixture.route === 'admin-users') assert.equal(page.data.keywordInput, '')
})

test('F05 search pagination keeps keyword/filter and suppresses duplicate and stale pages', async () => {
  const calls = [], pending = deferred()
  const { page } = load('pages/customize/customize', { getDishes: value => { calls.push(value); return value.page === 1 ? Promise.resolve({ list: [{ id: 1, name: '鸡' }], total: 45 }) : pending.promise } })
  page.onShow(); page.data.searchKeyword = '鸡'; page.data.browseCriteria.tagCodes = ['SPICY']
  await page.loadPage('meat', 1)
  const paging = page.onScrollToLower(); page.onScrollToLower()
  assert.equal(calls.length, 2); assert.equal(calls[1].page, 2); assert.equal(calls[1].keyword, '鸡'); assert.equal(calls[1].tagCodes[0], 'SPICY')
  page.onSearchInput({ detail: { value: '鱼' } })
  pending.resolve({ list: [{ id: 2, name: '旧关键词鸡' }], total: 45 }); await paging
  assert.equal(page.data.currentDishes.some(dish => dish.id === 2), false)
})

test('F06 initial edit route opens the requested dish, account changes clear the form', async () => {
  const { page, account } = load('pages/custom-dishes/custom-dishes', { getCustomDishes: async () => [{ id: 42, userId: 'A', name: 'A dish', type: 'meat', cl: '蛋', step: '蒸' }] })
  page.onLoad({ edit: '42' }); page.onShow(); await new Promise(resolve => setImmediate(resolve))
  assert.equal(page.data.editing, true); assert.equal(page.data.form.name, 'A dish')
  account.id = 'B'; page.onShow()
  assert.equal(page.data.editing, false); assert.equal(page.data.form.name, undefined)
})

test('F06 remote owner controls the detail edit entry and navigation', async () => {
  for (const owner of ['A', 'B', null]) {
    const { page, navigation } = load('pages/dish-detail/dish-detail', { getDishById: async () => ({ id: 42, userId: owner, name: '菜' }), checkFavoriteDish: async () => ({}) })
    await page.loadDishDetail(42); page.onEditCustom()
    assert.equal(page.data.canEditCustom, owner === 'A'); assert.equal(navigation.length, owner === 'A' ? 1 : 0)
    if (owner === 'A') assert.equal(navigation[0].url, '/pages/custom-dishes/custom-dishes?edit=42')
  }
  const template = fs.readFileSync('pages/dish-detail/dish-detail.wxml', 'utf8')
  assert.match(template, /<button\b[^>]*wx:if="\{\{canEditCustom\}\}"[^>]*bindtap="onEditCustom"/)
})

test('F07 calendar recipe navigation passes plan and actual people to the real detail preview', async () => {
  const template = fs.readFileSync('pages/calendar-detail/calendar-detail.wxml', 'utf8')
  const links = [...template.matchAll(/<text\b[^>]*bindtap="onViewDish"[^>]*>/g)].map(match => match[0])
  for (const fixture of [
    { meal: 'breakfast', source: 'plan', planPeople: 6, want: 6 },
    { meal: 'lunch', source: 'plan', planPeople: 4, want: 4 },
    { meal: 'dinner', source: 'actual', planPeople: 6, actualPeople: 3, want: 3 },
  ]) {
    const { page, navigation } = load('pages/calendar-detail/calendar-detail')
    const item = { mealType: fixture.meal, plan: { targetPeople: fixture.planPeople }, actual: { plannedSnapshot: { targetPeople: fixture.actualPeople } } }
    page.data.meals = [item]
    const binding = links.find(link => link.includes(`data-source="${fixture.source}"`))
    assert.ok(binding, `${fixture.source} recipe link must exist`)
    const dataset = {}
    for (const attribute of binding.matchAll(/data-([a-z]+)="([^"]+)"/g)) {
      const value = attribute[2]
      dataset[attribute[1]] = value.startsWith('{{') ? vm.runInNewContext(value.slice(2, -2), { item, dish: { id: 42, dishId: 42 } }) : value
    }
    page.onViewDish({ currentTarget: { dataset } })
    const query = Object.fromEntries(new URL('https://local' + navigation[0].url).searchParams)
    let preview
    const detail = load('pages/dish-detail/dish-detail', { getDishById: async () => ({ id: 42, name: '菜' }), checkFavoriteDish: async () => ({}), createShoppingPreview: async value => { preview = value; return { dishes: [] } } }).page
    detail.onLoad(query); await new Promise(resolve => setImmediate(resolve))
    assert.equal(preview.targetPeople, fixture.want)
  }
  assert.ok(links.some(link => link.includes('data-source="plan"') && link.includes('data-meal="{{item.mealType}}"')))
  assert.ok(links.some(link => link.includes('data-source="actual"') && link.includes('data-meal="{{item.mealType}}"')))
})

test('F07 generic browse retains the explicit two-person preview default', async () => {
  let preview
  const { page } = load('pages/dish-detail/dish-detail', { getDishById: async () => ({ id: 42, name: '菜' }), checkFavoriteDish: async () => ({}), createShoppingPreview: async body => { preview = body; return { dishes: [] } } })
  page.onLoad({ id: 42 }); await new Promise(resolve => setImmediate(resolve))
  assert.equal(preview.targetPeople, 2)
})
