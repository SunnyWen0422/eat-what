const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

// Execute real page lifecycles, stores, and handoffs with isolated platform/API boundaries.
function fixture(now = '2026-10-08T04:00:00Z') {
  const root = path.resolve(__dirname, '..')
  let clock = Date.parse(now), definition, account = 'A'
  const memory = new Map(), navigation = [], writes = [], timers = new Map(), cache = new Map()
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])) }
    static now() { return clock }
  }
  const util = { getUserStorageKey: key => account + ':' + key, getCurrentUserIdentity: () => account }
  const response = (date, mealType) => ({ workspace: {
    id: date + ':' + mealType, revision: 1, status: 'draft',
    context: load('utils/meal-workspace.js').normalizeContext({ date, mealType }),
    draft: { dishes: [{ id: 7, name: '青菜' }], history: [], lockedDishIds: [], planVersion: 1 }
  }, planRevision: 0 })
  const api = {
    getPersonalMenus: async () => [],
    getPersonalMenu: async id => ({ id, version: 4, name: '原菜单', people: 3, dishIds: [7], dishes: [{ id: 7, name: '青菜', contentVersion: 'v1' }] }),
    getDishById: async id => ({ id, name: '青菜', type: 'veg', contentVersion: 'v1' }),
    getUserPreferences: async () => ({ defaultPeople: 2 }),
    recordBehaviorEvent: async () => {},
    getMealWorkspace: async (date, mealType) => response(date, mealType),
    commandMealWorkspace: async (id, body) => {
      writes.push({ kind: 'command', id, body })
      const split = id.lastIndexOf(':'), workspace = response(id.slice(0, split), id.slice(split + 1)).workspace
      return { ...workspace, revision: 2, draft: { ...workspace.draft, dishes: body.dishIds.map(id => ({ id })), planVersion: 2 } }
    },
    updatePersonalMenu: async (id, body) => { writes.push({ kind: 'update', id, body }); return {} },
    createPersonalMenu: async body => { writes.push({ kind: 'create', body }); return {} }
  }
  const wx = {
    getStorageSync: key => memory.get(key),
    setStorageSync: (key, value) => memory.set(key, JSON.parse(JSON.stringify(value))),
    removeStorageSync: key => memory.delete(key),
    navigateTo: value => navigation.push(value.url), switchTab: value => navigation.push(value.url),
    showModal:value=>value.success({confirm:true}),showToast() {}, getAppBaseInfo: () => ({})
  }
  const overrides = {
    'utils/api.js': api, 'utils/util.js': util,
    'utils/account-identity.js': { currentIdentity: () => account },
    'utils/font-scale.js': Object.assign(() => 1, { base: 16 }),
    'utils/recommendation-options.js': { loadRecommendationOptions: async () => ({ options: { groups: {} } }) }
  }
  function load(relative) {
    relative = relative.replace(/\\/g, '/')
    if (overrides[relative]) return overrides[relative]
    if (cache.has(relative)) return cache.get(relative)
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), {
      module, exports: module.exports, Page: value => { definition = value }, wx, console, Date: ClockDate,
      getApp: () => ({ globalData: { loginReady: true }, waitForLogin: async () => {} }),
      setTimeout: callback => { const id = timers.size + 1; timers.set(id, callback); return id },
      clearTimeout: id => timers.delete(id),
      require: name => load(path.relative(root, path.resolve(root, path.dirname(relative), name.endsWith('.js') ? name : name + '.js')))
    }, { filename: relative })
    cache.set(relative, module.exports)
    return module.exports
  }
  function page(relative) {
    load(relative)
    return { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(value) { Object.assign(this.data, value) } }
  }
  function customize() {
    const view = page('pages/customize/customize.js')
    view.loadPage = () => {} // Catalog reads are independent of the lifecycle/menu behavior under test.
    view.loadCustomMetadata = () => {}
    return view
  }
  function workspace(mode = 'today') {
    const view = load('utils/meal-workspace-page.js')({ mode })
    view.setData = value => Object.assign(view.data, value)
    return view
  }
  return { page, customize, workspace, api, memory, navigation, writes,
    advance: now => { clock = Date.parse(now) }, switchAccount: id => { account = id } }
}

test('FE-01 cached recipe tab consumes each profile menu shortcut exactly once', () => {
  const f = fixture(), view = f.customize(), profile = f.page('pages/profile/profile.js')
  view.onLoad({}); view.onShow()
  for (let visit = 0; visit < 2; visit++) {
    view.onHide()
    profile.onMenuTap({ currentTarget: { dataset: { index: 0 } } })
    view.onShow()
    assert.equal(view.data.showMenus, true)
    assert.equal(f.memory.has('A:openPersonalMenus'), false)
    view.onCloseMenus(); view.onShow()
    assert.equal(view.data.showMenus, false)
  }
})

test('menu shortcut preserves initial flag and explicit route entry', () => {
  for (const routeEntry of [false, true]) {
    const f = fixture(), view = f.customize()
    if (!routeEntry) f.memory.set('A:openPersonalMenus', true)
    view.onLoad(routeEntry ? { menus: '1' } : {}); view.onShow()
    assert.equal(view.data.showMenus, true)
    assert.equal(f.memory.has('A:openPersonalMenus'), false)
  }
})

test('FE-01 menu shortcut is consumed only for the current account after ownership changes', () => {
  const f = fixture(), view = f.customize()
  view.onLoad({}); view.onShow(); view.onHide()
  f.memory.set('A:openPersonalMenus', true); f.switchAccount('B'); view.onShow()
  assert.equal(view.data.showMenus, false)
  assert.equal(f.memory.get('A:openPersonalMenus'), true)
  f.memory.set('B:openPersonalMenus', true); view.onShow()
  assert.equal(view.data.showMenus, true)
  assert.equal(f.memory.has('B:openPersonalMenus'), false)
  assert.equal(f.memory.get('A:openPersonalMenus'), true)
})

test('FE-02 an empty Today meal picker follows the new China day after midnight', async () => {
  const f = fixture(), view = f.workspace(), read = f.api.getMealWorkspace
  f.api.getMealWorkspace = async (...args) => { const result = await read(...args); result.workspace.status = 'empty'; result.workspace.draft.dishes = []; return result }
  await view.onLoad({}); await view.onMealTarget({ detail: { value: '2' } })
  assert.equal(view.data.context.mealType, 'dinner')
  await view.onShow()
  assert.equal(view.data.context.mealType, 'dinner', 'same-day choice must remain selected')
  view.onHide(); f.advance('2026-10-08T16:01:00Z'); await view.onShow()
  assert.equal(view.data.context.date, '2026-10-09')
  assert.equal(view.data.context.mealType, 'breakfast')
  assert.equal(view.data.todayDate, '2026-10-09')
})

test('explicit historical and future meal edits remain pinned after meal selection and midnight', async () => {
  for (const date of ['2026-09-30', '2026-10-12']) {
    const f = fixture(), view = f.workspace()
    await view.onLoad({ date, mealType: 'lunch' })
    await view.onMealTarget({ detail: { value: '2' } })
    f.advance('2026-10-08T16:01:00Z'); await view.onShow()
    assert.equal(view.data.context.date, date)
    assert.equal(view.data.context.mealType, 'dinner')
  }
})

test('meal picker preserves a pending calendar edit target instead of treating it as following Today', async () => {
  const f = fixture(), view = f.workspace()
  f.memory.set('A:pendingRecipeRecord', { date: '2026-09-30', mealType: 'lunch' })
  await view.onLoad({}); await view.onMealTarget({ detail: { value: '2' } })
  assert.equal(view.data.context.date, '2026-09-30')
  assert.equal(view.data.context.mealType, 'dinner')
  f.advance('2026-10-08T16:01:00Z'); await view.onShow()
  assert.equal(view.data.context.date, '2026-09-30')
  assert.equal(view.data.context.mealType, 'dinner')
})

test('meal picker keeps a saved explicit future target pinned rather than following Today', async () => {
  const f = fixture(), view = f.workspace()
  f.memory.set('A:activeMealTarget', { date: '2026-10-12', mealType: 'lunch', selectedOn: '2026-10-08' })
  await view.onLoad({}); await view.onMealTarget({ detail: { value: '2' } })
  f.advance('2026-10-08T16:01:00Z'); await view.onShow()
  assert.equal(view.data.context.date, '2026-10-12')
  assert.equal(view.data.context.mealType, 'dinner')
})

for (const entry of ['detail', 'favorite']) {
  test(`FE-03 ${entry} addition uses the Today meal shown after a cold-start rollover`, async () => {
    const f = fixture('2026-10-08T16:01:00Z'), today = f.workspace()
    f.memory.set('A:activeMealTarget', { date: '2026-10-08', mealType: 'dinner', selectedOn: '2026-10-08' })
    await today.onLoad({})
    assert.equal(today.data.context.date, '2026-10-09')
    assert.equal(today.data.context.mealType, 'breakfast')
    if (entry === 'detail') {
      today.onDishOpen({ currentTarget: { dataset: { id: 9 } } })
      const detail = f.page('pages/dish-detail/dish-detail.js')
      detail._scope = 'A:dishView'; detail.data.dish = { id: 9 }
      await detail.onAddToCurrentMeal()
    } else {
      const favorite = f.page('pages/favorite-dishes/favorite-dishes.js')
      favorite._viewScope = 'A:favoriteView'
      await favorite.onAddToMeal({ currentTarget: { dataset: { id: 9 } } })
    }
    // Recipe actions now write the shared draft directly and stay on the recipe.
    // Keep the original midnight target and exact optimistic-lock assertions.
    assert.equal(f.memory.has('A:workspaceSelectedDishes'), false)
    const selected=f.memory.get(`user:A:meal-workspace:${today.data.context.date}:${today.data.context.mealType}`)
    assert.equal(selected.context.date,today.data.context.date)
    assert.equal(selected.context.mealType,today.data.context.mealType)
    assert.deepEqual(selected.workspace.draft.dishes.map(d=>d.id),[7,9])
    assert.equal(f.writes[0].kind,'command')
    assert.equal(f.writes[0].id,'2026-10-09:breakfast')
    assert.equal(f.writes[0].body.expectedWorkspaceRevision,1)
    assert.equal(f.writes[0].body.command,'select')
    assert.deepEqual(Array.from(f.writes[0].body.dishIds),[7,9])
    assert.ok(!f.navigation.some(url=>url.startsWith('/pages/result/result')))
  })
}

test('add-to-meal preserves an explicitly displayed historical target across midnight', async () => {
  const f = fixture(), view = f.workspace()
  f.memory.set('A:activeMealTarget', { date: '2026-09-30', mealType: 'dinner', selectedOn: '2026-10-08' })
  await view.onLoad({ date: '2026-09-30', mealType: 'dinner' })
  f.advance('2026-10-08T16:01:00Z'); await view.onShow()
  view.onDishOpen({ currentTarget: { dataset: { id: 9 } } })
  const detail = f.page('pages/dish-detail/dish-detail.js')
  detail._scope = 'A:dishView'; detail.data.dish = { id: 9 }
  await detail.onAddToCurrentMeal()
  assert.equal(f.memory.get('user:A:meal-workspace:2026-09-30:dinner').context.date,'2026-09-30')
  assert.equal(f.writes[0].id,'2026-09-30:dinner')
  assert.equal(f.writes[0].body.expectedWorkspaceRevision,1)
  assert.deepEqual(Array.from(f.writes[0].body.dishIds),[7,9])
  assert.ok(!f.navigation.some(url=>url.startsWith('/pages/result/result')))
})

for (const reopen of [false, true]) {
  test(`FE-04 save selected dishes as a new menu clears an existing edit${reopen ? ' after sheet reentry' : ''}`, async () => {
    const f = fixture(), view = f.customize()
    view.ensureBrowseOwner(); await view.onEditMenu({ currentTarget: { dataset: { id: 3 } } })
    if (reopen) { view.onCloseMenus(); await view.onOpenMenus() }
    view.onOpenMenuForm()
    view.onMenuInput({ currentTarget: { dataset: { field: 'menuName' } }, detail: { value: '新的组合' } })
    await view.onSaveMenu()
    assert.equal(f.writes.length, 1)
    assert.equal(f.writes[0].kind, 'create')
    assert.equal(f.writes[0].body.expectedVersion, 0)
    assert.equal(f.writes[0].body.name, '新的组合')
    assert.deepEqual(Array.from(f.writes[0].body.dishIds), [7])
  })
}

test('new-menu action cannot discard an unresolved edit write and retry retains the exact request', async () => {
  const f = fixture(), view = f.customize()
  f.api.updatePersonalMenu = async (id, body) => {
    f.writes.push({ kind: 'update', id, body })
    if (f.writes.length === 1) throw { isNetworkError: true }
    return {}
  }
  view.ensureBrowseOwner(); await view.onEditMenu({ currentTarget: { dataset: { id: 3 } } })
  await view.onSaveMenu()
  assert.equal(view.data.menuPending, true)
  view.onOpenMenuForm()
  assert.equal(view.data.menuEditingId, 3)
  assert.equal(view.data.menuName, '原菜单')
  await view.onSaveMenu()
  assert.equal(f.writes.length, 2)
  assert.equal(f.writes[1].kind, 'update')
  assert.equal(f.writes[1].id, 3)
  assert.deepEqual(f.writes[1].body, f.writes[0].body)
})

test('an unsaved Today menu retains its source after midnight without an open save panel', async () => {
  const f = fixture(), view = f.workspace()
  await view.onLoad({}); f.advance('2026-10-08T16:01:00Z'); await view.onShow()
  assert.equal(view.data.context.date, '2026-10-08'); assert.equal(view.data.draft.dishes[0].id, 7)
  assert.equal(view.data.todayDate, '2026-10-09'); assert.match(view.data.midnightNotice, /仍归属2026-10-08/)
})
