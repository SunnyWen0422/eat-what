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

test('personal create retries one request ID and preserves form after unknown outcome', async () => {
  const sent = []
  const { page } = load('pages/customize/customize', { createCustomDish: async body => { sent.push(body); if (sent.length === 1) throw { isNetworkError: true }; return { id: 3 } } })
  page.onShow(); page.data.customForm = { name: '鱼', type: 'meat', ingredients: '鱼', steps: '蒸', cuisineCode: '', tagCodes: [], cookMinutes: '' }
  await page.onSaveCustomDish(); assert.equal(page.data.customForm.name, '鱼'); await page.onSaveCustomDish()
  assert.ok(sent[0].requestId); assert.equal(sent[0].requestId, sent[1].requestId)
})
test('detail copy checks content version and opens its own editable copy', async () => {
  let body
  const { page, navigation } = load('pages/dish-detail/dish-detail', { copyPersonalDish: async (id, value) => { body = value; return { id: 9 } } })
  page._scope = 'A:dishView'; page.data.dish = { id: 1, name: '鱼', contentVersion: 'v1' }
  await page.onCopyPersonal(); await page.onConfirmCopyPersonal(); assert.equal(body.expectedVersion, 'v1'); assert.ok(body.requestId); assert.match(navigation[0].url, /edit=9/)
})
test('menu apply binds resolved target/version/people and only opens a draft', async () => {
  const requests = []
  const { page, wx, navigation } = load('pages/customize/customize', { resolvePersonalMenu: async (id, body) => { requests.push(body); return { menuId: 3, menuVersion: 2, menuDate: body.date, menuMealType: body.mealType, people: 4, dishIds: [1, 2] } } })
  page.onShow(); page.data.menus = [{ id: 3, version: 2 }]; page.data.menuDate = '2026-10-10'; page.data.menuMealIndex = 2
  await page.onApplyMenu({ currentTarget: { dataset: { id: 3 } } })
  const handoff = wx.getStorageSync('A:workspaceSelectedDishes')
  assert.equal(handoff.menuVersion, 2); assert.equal(handoff.people, 4); assert.equal(handoff.date, '2026-10-10'); assert.equal(requests[0].expectedVersion, 2); assert.match(navigation[0].url, /result.*2026-10-10/)
})
test('menu late resolve cannot write target or navigate for another account', async () => {
  const pending = deferred()
  const { page, account, wx, navigation } = load('pages/customize/customize', { resolvePersonalMenu: () => pending.promise })
  page.onShow(); page.data.menus = [{ id: 3, version: 2 }]; page.data.menuDate = '2026-10-10'; page.data.menuMealIndex = 2
  const operation = page.onApplyMenu({ currentTarget: { dataset: { id: 3 } } }); account.id = 'B'
  pending.resolve({ menuId: 3, menuVersion: 2, menuDate: '2026-10-10', menuMealType: 'dinner', people: 4, dishIds: [1] }); await operation
  assert.equal(wx.getStorageSync('B:workspaceSelectedDishes'), undefined); assert.equal(navigation.length, 0)
})
test('copied rich recipe editor uses detailed steps and retries the exact versioned edit', async () => {
  const sent = [], dish = { id: 9, name: '鱼', type: 'meat', ingredientsAmounts: '鱼#姜', step: '旧简略', steps: '洗鱼###蒸熟', contentVersion: 'v1', cookMinutes: 20 }
  const { page } = load('pages/custom-dishes/custom-dishes', { updateCustomDish: async (id, body) => { sent.push(body); if (sent.length === 1) throw { isNetworkError: true }; return {} }, getCustomDishes: async () => [dish] })
  page.onLoad(); page.edit(dish); assert.equal(page.data.form.steps, '洗鱼\n蒸熟')
  await page.saveEdit(); assert.equal(page.data.editPending, true); await page.saveEdit()
  assert.equal(sent[0].expectedVersion, 'v1'); assert.equal(sent[0].requestId, sent[1].requestId); assert.equal(sent[0].step, '洗鱼#蒸熟')
})
test('menu save recovery restores selected IDs after reentry', async () => {
  const { page, wx } = load('pages/customize/customize', { getPersonalMenus: async () => [] })
  page.onShow(); wx.setStorageSync('A:personalRecipeWrite:menu:new', { requestId: 'prior', name: '晚餐', people: 3, dishIds: [2, 4], expectedVersion: 0 })
  await page.onOpenMenus(); assert.equal(page.data.selectedTotal, 2); assert.deepEqual(Array.from(page.data.selectedIds), [2, 4]); assert.equal(page.data.menuPending, true)
})
test('menu edit refreshes changed recipe snapshots before explicitly saving the new combination', async () => {
  let saved
  const oldDish = { id: 1, name: '旧鱼', type: 'meat', contentVersion: 'v1' }, latest = { id: 1, name: '新鱼', type: 'meat', contentVersion: 'v2' }
  const { page } = load('pages/customize/customize', { getPersonalMenu: async () => ({ id: 3, name: '晚餐', people: 2, version: 4, dishIds: [1], dishes: [oldDish] }), getDishById: async () => latest, updatePersonalMenu: async (id, body) => { saved = body; return {} }, getPersonalMenus: async () => [] })
  page.onShow(); page.allDishesMap[1] = latest
  await page.onEditMenu({ currentTarget: { dataset: { id: 3 } } })
  assert.equal(page.allDishesMap[1].contentVersion, 'v2'); assert.equal(page.data.menuReviewDishes[0].name, '新鱼'); assert.match(page.data.menuReviewNotice, /变化/)
  assert.equal(saved, undefined, 'refresh must not save until explicit user save')
  await page.onSaveMenu(); assert.equal(saved.expectedVersion, 4); assert.equal(saved.dishVersions[1], 'v2')
})
test('menu edit keeps unavailable dish selected and explains it rather than silently dropping it', async () => {
  const { page } = load('pages/customize/customize', { getPersonalMenu: async () => ({ id: 3, name: '晚餐', people: 2, version: 4, dishIds: [1, 2], dishes: [{ id: 1, name: '鱼', contentVersion: 'v1' }, { id: 2, name: '旧菜', contentVersion: 'v1' }] }), getDishById: async id => { if (id === 2) throw { statusCode: 404 }; return { id: 1, name: '鱼', contentVersion: 'v1' } } })
  page.onShow(); await page.onEditMenu({ currentTarget: { dataset: { id: 3 } } })
  assert.deepEqual(Array.from(page.data.selectedIds), [1, 2]); assert.match(page.data.menuReviewNotice, /不可用/); assert.equal(page.data.menuReviewDishes[1].unavailable, true)
})
test('late menu resolve after hiding and changing active meal cannot navigate or overwrite target', async () => {
  const pending = deferred(); const { page, wx, navigation } = load('pages/customize/customize', { resolvePersonalMenu: () => pending.promise })
  page.onShow(); wx.setStorageSync('A:activeMealTarget', { date: '2026-10-10', mealType: 'dinner' }); page.data.menus = [{ id: 3, version: 2 }]; page.data.menuDate = '2026-10-10'; page.data.menuMealIndex = 2
  const operation = page.onApplyMenu({ currentTarget: { dataset: { id: 3 } } }); page.onHide(); wx.setStorageSync('A:activeMealTarget', { date: '2026-10-11', mealType: 'lunch' })
  pending.resolve({ menuId: 3, menuVersion: 2, menuDate: '2026-10-10', menuMealType: 'dinner', people: 2, dishIds: [1] }); await operation
  assert.equal(navigation.length, 0); assert.equal(wx.getStorageSync('A:activeMealTarget').date, '2026-10-11'); assert.equal(wx.getStorageSync('A:workspaceSelectedDishes'), undefined)
})
test('dish detail prefers numeric cooking time and shows it even without legacy text', async () => {
  for (const [dish, expected] of [
    [{ cookMinutes: 10, cookTime: '45分钟' }, '10分钟'],
    [{ cookMinutes: 10, cookTime: null }, '10分钟'],
    [{ cookMinutes: null, cookTime: null }, ''],
    [{ cookMinutes: null, cookTime: '约45分钟' }, '约45分钟']
  ]) {
    const { page } = load('pages/dish-detail/dish-detail', { getDishById: async () => ({ id: 1, name: '鱼', ...dish }), checkFavoriteDish: async () => ({}) })
    await page.loadDishDetail(1); assert.equal(page.data.dish.cookTimeDisplay, expected)
  }
  assert.match(fs.readFileSync('pages/dish-detail/dish-detail.wxml', 'utf8'), /\{\{dish\.cookTimeDisplay\}\}/)
})
