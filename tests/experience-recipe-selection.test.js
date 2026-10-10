const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const plain = value => value == null ? value : JSON.parse(JSON.stringify(value))
const target = { date: '2026-10-12', mealType: 'dinner' }
const dishes = [
  { id: 1, name: '番茄炒蛋', type: 'meat', steps: '切番茄#炒蛋', contentVersion: 'one' },
  { id: 2, name: '青菜', type: 'veg', steps: '洗菜#炒熟', contentVersion: 'two' },
  { id: 3, name: '菌菇汤', type: 'soup', steps: '切菇#煮汤', contentVersion: 'three' },
]
const context = { ...target, people: 2, compositionMode: 'manual', counts: { meat: 1, veg: 1 }, criteria: {}, requirements: '', ownedIngredients: [] }
function workspace(ids = [1, 2], revision = 4, version = 3) {
  return { id: 'workspace-A', revision, status: 'draft', context: plain(context), draft: { dishes: ids.map(id => plain(dishes.find(d => d.id === id) || { id, name: '菜 ' + id, type: 'veg' })), planVersion: version, lockedDishIds: [], history: [] } }
}
const stateWithIds1And2 = { workspace: workspace(), context, linked: {}, dirty: false, pending: null, syncStatus: 'synced' }
const stateWithTenDishes = { ...stateWithIds1And2, workspace: workspace(Array.from({ length: 10 }, (_, i) => i + 1)) }
function selected() { assert.ok(fs.existsSync('utils/selected-meal.js'), 'shared selected meal derivation is missing'); return require('../utils/selected-meal') }

// Real pages and the real workspace store. Only fixed HTTP responses and the
// WeChat platform are substituted. No planner, gateway, runner, or model runs.
function fixture(options = {}) {
  const root = path.resolve(__dirname, '..'), cache = new Map(), memory = new Map(), navigation = [], writes = [], dialogs = [], timers = new Map()
  let account = 'A', definition, row = workspace(), failure = null, commandFailure = null, hold = null
  const replies = []
  const util = { getCurrentUserIdentity: () => account, getUserStorageKey: key => account + ':' + key }
  const wx = { getStorageSync: key => key === 'userInfo' ? { id: account } : plain(memory.get(key)), setStorageSync: (key, value) => memory.set(key, plain(value)), removeStorageSync: key => memory.delete(key),
    navigateTo: value => navigation.push(value.url), switchTab: value => navigation.push(value.url), redirectTo: value => navigation.push(value.url), showToast() {}, vibrateShort() {},
    showModal: value => { dialogs.push(value); if (options.autoConfirm !== false) value.success({ confirm: true }) }, getAppBaseInfo: () => ({ fontSizeScaleFactor: 1 }), }
  memory.set('A:activeMealTarget', target)
  const api = { getUserPreferences: async () => ({ defaultPeople: 2 }), getDishes: async () => ({ list: plain(dishes), total: 3 }), getCustomDishes: async () => plain(dishes.slice(0, 1)),
    getDishById: async id => { if (failure) throw failure; return plain(dishes.find(d => d.id === Number(id))) }, checkFavoriteDish: async () => ({}), createShoppingPreview: async () => ({ dishes: [] }), getPersonalMenus: async () => [], recordBehaviorEvent: async () => {},
    getMealWorkspace: async () => ({ workspace: plain(row), planRevision: 0 }),
    commandMealWorkspace: async (id, body) => { writes.push({ id, body: plain(body) }); if (hold) await hold; if (commandFailure || failure) throw commandFailure || failure; const next = replies.shift(); if (!next) throw Error('No declared HTTP reply'); row = plain(next); return plain(next) },
    getWorkspaceRequest: async () => null, getWorkspaceTask: async () => plain(options.task || { id: 'task-one', workspaceId: 'workspace-A', baseRevision: 5, status: 'draft' }),
    confirmMealWorkspace: () => { throw Error('Recipe browsing must never write calendar') }, saveMealPlan: () => { throw Error('Recipe browsing must never write calendar') }, }
  const overrides = { 'utils/api.js': api, 'utils/util.js': util, 'utils/account-identity.js': { currentIdentity: () => account }, 'utils/config.js': { ENABLE_MEAL_WORKSPACE: true },
    'utils/font-scale.js': Object.assign(() => 1, { base: 16 }), 'utils/recommendation-options.js': { loadRecommendationOptions: async () => ({ options: { groups: {} } }) } }
  function load(relative) {
    relative = relative.replace(/\\/g, '/')
    if (overrides[relative]) return overrides[relative]
    if (cache.has(relative)) return cache.get(relative)
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), { module, exports: module.exports, Page: value => { definition = value }, wx, console: { log() {}, error() {}, warn() {} },
      getApp: () => ({ globalData: { loginReady: true }, waitForLogin: async () => {} }), ...(options.app ? {getApp:()=>options.app} : {}), setTimeout: callback => { const id = timers.size + 1; timers.set(id, callback); return id }, clearTimeout: id => timers.delete(id),
      require: name => load(path.relative(root, path.resolve(root, path.dirname(relative), name.endsWith('.js') ? name : name + '.js'))) }, { filename: relative })
    cache.set(relative, module.exports); return module.exports
  }
  function page(relative) {
    load(relative + '.js'); return { ...definition, data: plain(definition.data), allDishesMap: {}, setData(values) { for (const [key, value] of Object.entries(values)) { const parts = key.split('.'); let out = this.data; while (parts.length > 1) out = out[parts.shift()]; out[parts[0]] = value } } }
  }
  return { page, load, api, wx, util, memory, navigation, writes, dialogs, timers, reply: value => replies.push(value), row: () => row, setRow: value => { row = plain(value) }, fail: value => { failure = value }, failCommand:value=>{commandFailure=value},hold: value => { hold = value }, switchAccount: () => { account = 'B' } }
}
const settle = () => new Promise(resolve => setImmediate(resolve))

// Mutating append's prior-ID preservation or ten-dish bound would break this.
test('append deduplicates and retains all earlier dishes without truncating the eleventh', () => {
  const { appendSelectedDish } = selected()
  assert.deepEqual(appendSelectedDish(stateWithIds1And2, 2), [1, 2])
  assert.deepEqual(appendSelectedDish(stateWithIds1And2, 3), [1, 2, 3])
  assert.throws(() => appendSelectedDish(stateWithTenDishes, 11))
  assert.deepEqual(stateWithIds1And2.workspace.draft.dishes.map(d => d.id), [1, 2])
})
test('selected summary derives empty unsaved saved and changed from one workspace confirmation', () => {
  const { deriveSelectedMeal } = selected()
  const empty = deriveSelectedMeal({ workspace: null, context }, target)
  assert.equal(empty.count, 0); assert.match(empty.message, /还没选菜/)
  const unsaved = deriveSelectedMeal(stateWithIds1And2, target)
  assert.equal(unsaved.saveState, 'unsaved'); assert.match(unsaved.message, /未保存到日历/)
  const saved = plain(stateWithIds1And2); saved.workspace.confirmation = { planVersion: 3, date: '2026-10-13', mealType: 'lunch', planRevision: 2 }
  assert.equal(deriveSelectedMeal(saved, target).saveState, 'saved'); assert.match(deriveSelectedMeal(saved, target).message, /10月13日.*午餐/)
  saved.workspace.draft.planVersion++
  assert.equal(deriveSelectedMeal(saved, target).saveState, 'changed'); assert.match(deriveSelectedMeal(saved, target).message, /修改未保存/)
  assert.equal(deriveSelectedMeal({ syncStatus: 'account_changed' }, target).count, 0)
})
test('detail append keeps the original target and prior dishes, stays in detail, and changes primary action', async () => {
  const f = fixture(), page = f.page('pages/dish-detail/dish-detail')
  await page.loadDishDetail(3); await page.onShow(); f.reply(workspace([1, 2, 3], 5, 4))
  await page.onAddToCurrentMeal()
  assert.deepEqual(plain(page.data.selectedMeal.dishIds), [1, 2, 3]); assert.deepEqual(plain(page.data.selectedMeal.target), target)
  assert.equal(page.data.mealPrimaryLabel, '查看本餐'); assert.equal(f.navigation.length, 0)
  await page.onAddToCurrentMeal(); assert.equal(f.writes.length, 1); assert.match(f.navigation[0], /result.*2026-10-12/)
  assert.equal(f.memory.has('A:workspaceSelectedDishes'), false)
})
test('list return retains search filters scroll and derives newly selected dishes from the workspace', async () => {
  const f = fixture(), page = f.page('pages/customize/customize')
  page.onLoad({}); await page.onShow(); page.data.searchKeyword = '青菜'; page.data.browseCriteria.tagCodes = ['LIGHT']; page.onBrowseScroll({ detail: { scrollTop: 312 } }); page.onHide()
  f.setRow(workspace([1, 2, 3], 5, 4)); await page.onShow()
  assert.equal(page.data.searchKeyword, '青菜'); assert.deepEqual(plain(page.data.browseCriteria.tagCodes), ['LIGHT']); assert.equal(page.data.browseScrollTop, 312)
  assert.deepEqual(plain(page.data.selectedMeal.dishIds), [1, 2, 3]); assert.equal(page.data.selectedTotal, 3)
})
test('cancelled remove never changes a draft or writes calendar; confirmed remove keeps the remaining dishes', async () => {
  const f = fixture({ autoConfirm: false }), page = f.page('pages/customize/customize')
  await page.onShow(); const removing = page.onRemoveSelected({ currentTarget: { dataset: { id: 2 } } }); await settle(); f.dialogs.at(-1).success({ confirm: false }); await removing
  assert.equal(f.writes.length, 0); assert.deepEqual(plain(page.data.selectedMeal.dishIds), [1, 2])
  f.reply(workspace([1], 5, 4)); const confirmed = page.onRemoveSelected({ currentTarget: { dataset: { id: 2 } } }); await settle(); f.dialogs.at(-1).success({ confirm: true }); await confirmed
  assert.deepEqual(plain(page.data.selectedMeal.dishIds), [1]); assert.equal(f.writes[0].body.command, 'select')
})
test('last dish remains visible with an honest minimum-one limitation', async () => {
  const f = fixture(), page = f.page('pages/customize/customize'); f.setRow(workspace([1])); await page.onShow()
  await page.onRemoveSelected({ currentTarget: { dataset: { id: 1 } } })
  assert.deepEqual(plain(page.data.selectedMeal.dishIds), [1]); assert.equal(f.writes.length, 0); assert.match(page.data.saveError, /至少.*1.*继续选/)
})
test('account switch clears prior selected UI before late recipe write can render', async () => {
  const f = fixture(), page = f.page('pages/dish-detail/dish-detail'); await page.loadDishDetail(3); await page.onShow()
  let finish; f.hold(new Promise(resolve => { finish = resolve })); f.reply(workspace([1, 2, 3], 5, 4)); const adding = page.onAddToCurrentMeal(); await settle()
  f.switchAccount(); f.setRow(null); const showing = page.onShow(); await settle(); finish(); await adding; await showing
  assert.equal(page.data.selectedMeal.count, 0); assert.equal(page.data.mealPrimaryLabel, '加入本餐'); assert.equal(f.memory.has('B:workspaceSelectedDishes'), false)
})
test('manual selection shows actual composition and asks for the fixed target before any write', async () => {
  const f = fixture({ autoConfirm: false }), page = f.page('pages/dish-detail/dish-detail'); await page.loadDishDetail(3); await page.onShow(); f.reply(workspace([1, 2, 3], 5, 4))
  const adding = page.onAddToCurrentMeal(); await settle(); assert.equal(f.writes.length, 0)
  assert.match(f.dialogs.at(-1).content, /10月12日.*晚餐/); assert.match(f.dialogs.at(-1).content, /1.*荤.*1.*素.*1.*汤/)
  f.dialogs.at(-1).success({ confirm: true }); await adding; assert.deepEqual(f.writes[0].body.dishIds, [1, 2, 3]); assert.equal(f.writes[0].body.expectedWorkspaceRevision, 4)
})
test('concurrent revision changes reject selection without replacing the newer menu', async () => {
  const f = fixture(), page = f.page('pages/dish-detail/dish-detail'); await page.loadDishDetail(3); await page.onShow()
  f.api.commandMealWorkspace = async () => { f.setRow(workspace([2], 8, 6)); throw Object.assign(Error('本餐已更新，请核对最新内容'), { statusCode: 409 }) }
  await page.onAddToCurrentMeal(); assert.match(page.data.mealAddError, /已更新/); assert.deepEqual(f.row().draft.dishes.map(d => d.id), [2]); assert.notEqual(page.data.mealPrimaryLabel, '查看本餐')
})
test('queued selection retains prior dishes until exact task completion and keeps recovery visible', async () => {
  const f = fixture(), page = f.page('pages/dish-detail/dish-detail'); await page.loadDishDetail(3); await page.onShow()
  const queued = workspace(); queued.revision = 5; queued.status = 'generating'; queued.taskId = 'task-one'; f.reply(queued)
  await page.onAddToCurrentMeal(); assert.deepEqual(plain(page.data.selectedMeal.dishIds), [1, 2]); assert.equal(page.data.selectionFeedback.state, 'pending'); assert.notEqual(page.data.mealPrimaryLabel, '查看本餐')
  f.setRow({ ...workspace([1, 2, 3], 6, 4), taskId: 'task-one' }); await page.refreshSelectedMeal()
  assert.equal(page.data.selectionFeedback.state, 'success'); assert.equal(page.data.mealPrimaryLabel, '查看本餐')
})
test('unavailable private recipe shows permission error rather than an empty recipe', async () => {
  const f = fixture(), page = f.page('pages/dish-detail/dish-detail'); f.fail({ statusCode: 403, message: '无权查看' }); await page.loadDishDetail(3)
  assert.equal(page.data.errorKind, 'permission'); assert.match(page.data.detailError, /权限/); assert.equal(page.data.dish, null)
})
test('recipe UI has ordinary browse sources compact rows and explicit calendar destination', () => {
  const list = fs.readFileSync('pages/customize/customize.wxml', 'utf8'), detail = fs.readFileSync('pages/dish-detail/dish-detail.wxml', 'utf8')
  for (const text of ['全部菜谱', '我的菜谱', '常用菜单']) assert.ok(list.includes(text))
  assert.doesNotMatch(list, /选菜搭一餐/); assert.match(list, /compact-dish-row/); assert.match(list, /保存到日历/)
  assert.match(detail, /mealPrimaryLabel/); assert.match(detail, /onOpenCooking/); assert.match(detail, /还没有烹饪步骤/)
})
test('recipe cooking reuses large-step reader and preserves progress without creating a plan or actual', async () => {
  const f = fixture(), page = f.page('pages/meal-cooking/meal-cooking')
  page.onLoad({ recipeId: '3' }); await page.onShow(); page.onNextStep(); assert.equal(page.data.stepIndex, 1); await page.onShow()
  assert.equal(page.data.stepIndex, 1); assert.equal(page.data.recipeMode, true); assert.equal(f.writes.length, 0)
})
test('compact recipe row isolates detail and select events with an honest selected label', () => {
  let definition; vm.runInNewContext(fs.readFileSync('components/compact-dish-row/index.js', 'utf8'), { Component: value => { definition = value }, require: name => name.includes('ui-tokens') ? { motion: { row: 180 } } : () => ({ get: () => ({}) }) })
  const events = [], row = { properties: { dish: dishes[0], mode: 'select', selected: true }, triggerEvent: (name, detail) => events.push({ name, id: detail.id }) }
  definition.methods.onReplace.call(row); definition.methods.onView.call(row)
  assert.deepEqual(events, [{ name: 'select', id: 1 }, { name: 'view', id: 1 }])
  assert.match(fs.readFileSync('components/compact-dish-row/index.wxml', 'utf8'), /已加入/)
})
test('explicit save entry opens the existing compact date and meal panel without committing', async () => {
  const f = fixture(), page = f.load('utils/meal-workspace-page.js')({ mode: 'result' })
  page.setData = fields => Object.assign(page.data, fields); page._alive = true
  await page.initializeWorkspace({ ...target, save: '1' })
  assert.equal(page.data.confirmationVisible, true); assert.deepEqual(plain(page.data.saveTarget), target); assert.equal(f.writes.length, 0); page.onUnload()
})
test('receiving an older handoff cannot consume a newer selection while its command waits', async () => {
  const f = fixture(), page = f.load('utils/meal-workspace-page.js')({ mode: 'result' })
  page.setData = fields => Object.assign(page.data, fields); page._alive = true
  f.memory.set('A:workspaceSelectedDishes', { ...target, dishIds: [1, 2, 3], expectedWorkspaceId: 'workspace-A', expectedWorkspaceRevision: 4 })
  let finish; f.hold(new Promise(resolve => { finish = resolve })); f.reply(workspace([1, 2, 3], 5, 4))
  const loading = page.initializeWorkspace(target); await settle()
  const newer = { ...target, dishIds: [2, 3], expectedWorkspaceId: 'workspace-A', expectedWorkspaceRevision: 5 }; f.memory.set('A:workspaceSelectedDishes', newer)
  finish(); await loading; assert.deepEqual(f.memory.get('A:workspaceSelectedDishes'), newer); page.onUnload()
})
test('legacy selection with more than ten dishes is refused before a command can mutate the menu', async () => {
  const f = fixture(), page = f.load('utils/meal-workspace-page.js')({ mode: 'result' })
  page.setData = fields => Object.assign(page.data, fields); page._alive = true
  f.memory.set('A:workspaceSelectedDishes', { ...target, dishIds: Array.from({length:11},(_,i)=>i+1) })
  await page.initializeWorkspace(target); assert.equal(f.writes.length, 0); assert.match(page.data.errorMessage, /选菜信息无效/); assert.deepEqual(f.row().draft.dishes.map(d=>d.id), [1, 2]); page.onUnload()
})
test('unknown selection preserves prior dishes and recovery retries only the original request', async () => {
  const f=fixture(),page=f.page('pages/dish-detail/dish-detail');await page.loadDishDetail(3);await page.onShow();f.reply(workspace([1,2,3],5,4));f.failCommand(Object.assign(Error('network'),{statusCode:503}))
  await page.onAddToCurrentMeal();assert.equal(page.data.selectionFeedback.state,'unknown');assert.deepEqual(plain(page.data.selectedMeal.dishIds),[1,2]);const first=f.writes[0].body
  await page.onAddToCurrentMeal();assert.equal(f.writes.length,1);f.failCommand(null);await page.onRetrySelection();assert.deepEqual(f.writes[1].body,first);assert.deepEqual(plain(page.data.selectedMeal.dishIds),[1,2,3])
})
test('same-account different-meal reentry cancels a stale confirmation without leaking busy state', async () => {
  const f=fixture({autoConfirm:false}),page=f.page('pages/dish-detail/dish-detail');await page.loadDishDetail(3);await page.onShow();const pending=page.onAddToCurrentMeal();await settle()
  const original=f.dialogs.at(-1),next={date:'2026-10-13',mealType:'lunch'};f.memory.set('A:activeMealTarget',next);const newer=workspace([2],8,6);newer.context={...newer.context,...next};f.setRow(newer)
  await page.refreshSelectedMeal();original.success({confirm:true});await pending
  assert.equal(f.writes.length,0);assert.deepEqual(plain(page.data.selectedMeal.target),next);assert.deepEqual(plain(page.data.selectedMeal.dishIds),[2]);assert.equal(page.data.selectionBusy,false)
})
test('failed quantity preview never erases real original ingredients', async () => {
  const f=fixture();f.api.getDishById=async()=>({...dishes[2],ingredientsAmounts:'菌菇|200|g#水|500|ml'});const page=f.page('pages/dish-detail/dish-detail')
  await page.loadDishDetail(3);await settle();assert.ok(page.data.dish.ingredientsList.some(line=>line.includes('菌菇')));assert.match(page.data.ingredientNotice,/核对|原始/)
})
test('recipe recovery is a real visible button and component actions have reachable handlers', () => {
  for(const route of ['customize/customize','dish-detail/dish-detail','favorite-dishes/favorite-dishes']) {
    const source=fs.readFileSync('pages/'+route+'.wxml','utf8')+fs.readFileSync('templates/recipe-selected-sheet.wxml','utf8')
    assert.match(source,/label="核对原请求"[^>]*bind:action="onRetrySelection"/)
    assert.doesNotMatch(source,/bind:recover=/)
  }
})

test('missing detail route id degrades without throwing', () => {
  const f = fixture(), page = f.page('pages/dish-detail/dish-detail')
  assert.doesNotThrow(() => page.onLoad({}))
  assert.equal(page.data.errorKind, 'unavailable')
})
test('favorite selection unknown result exposes original-request recovery immediately', async () => {
  const f = fixture(), page = f.page('pages/favorite-dishes/favorite-dishes')
  page._viewScope = 'A:favoriteView'; await page.refreshSelectedMeal()
  f.failCommand(Object.assign(Error('network'), {statusCode:503}))
  await page.onAddToMeal({detail:{id:3}})
  assert.equal(page.data.selectionFeedback.state, 'unknown')
  assert.equal(page.data.selectionBlocked, true)
})
test('recipe cooking reads the same JSON step array as detail', async () => {
  const f = fixture(), page = f.page('pages/meal-cooking/meal-cooking')
  f.api.getDishById = async () => ({...dishes[2], steps: JSON.stringify(['清洗菌菇','煮汤'])})
  page.onLoad({recipeId:'3'}); await page.onShow()
  assert.deepEqual(plain(page.data.steps), ['清洗菌菇','煮汤'])
})
test('personal menu edit still selects from compact row event without changing meal draft', async () => {
  const f = fixture(), page = f.page('pages/customize/customize')
  await page.onShow(); page.data.menuEditingId = 10; page.data.selectedIds = [1]; page.allDishesMap[3] = dishes[2]
  page.onToggleSelect({detail:{id:3},currentTarget:{dataset:{}}})
  assert.deepEqual(plain(page.data.selectedIds), [1,3]); assert.equal(f.writes.length,0)
})
test('recipe templates contain no malformed opening tag and provide shared responsive row styles', () => {
  for (const route of ['customize/customize','dish-detail/dish-detail','favorite-dishes/favorite-dishes']) {
    assert.doesNotMatch(fs.readFileSync('pages/'+route+'.wxml','utf8'), /<</)
    assert.match(fs.readFileSync('pages/'+route+'.wxss','utf8'), /recipe-selection.wxss/)
  }
  assert.match(fs.readFileSync('pages/dish-detail/dish-detail.wxss','utf8'), /\.container \.detail-bottom\s*\{[^}]*position:\s*static/s)
})

test('first recipe in an empty meal creates only a workspace then selects into that target', async () => {
  const f = fixture(); f.setRow(null)
  f.api.createMealWorkspace = async body => { f.writes.push({kind:'create',body:plain(body)}); const created=workspace([],1,0);created.context=body.context;f.setRow(created);return created }
  const page = f.page('pages/dish-detail/dish-detail'); await page.loadDishDetail(3); await page.onShow(); f.reply(workspace([3],2,1))
  await page.onAddToCurrentMeal()
  assert.deepEqual(plain(page.data.selectedMeal.dishIds),[3]); assert.equal(f.writes.length,2)
  assert.equal(f.writes[0].body.context.date,target.date); assert.equal(f.writes[1].body.command,'select')
  assert.equal(f.writes[1].body.expectedWorkspaceRevision,1)
})
test('leaving menu editing restores authoritative meal choices without writing either object', async () => {
  const f=fixture(),page=f.page('pages/customize/customize');await page.onShow()
  page.data.menuEditingId=10;page.data.menuFormVisible=true;page.data.selectedIds=[3]
  assert.equal(typeof page.onExitMenuEdit,'function');page.onExitMenuEdit()
  assert.equal(page.data.menuFormVisible,false);assert.equal(page.data.menuEditingId,null)
  assert.deepEqual(plain(page.data.selectedIds),[1,2]);assert.equal(f.writes.length,0)
  assert.match(fs.readFileSync('pages/customize/customize.wxml','utf8'),/bindtap="onExitMenuEdit"/)
})

test('unknown first workspace creation remains recoverable without inventing selection success', async () => {
  const f=fixture();f.setRow(null)
  f.api.createMealWorkspace=async()=>{throw Object.assign(Error('network'),{statusCode:503})}
  const page=f.page('pages/dish-detail/dish-detail');await page.loadDishDetail(3);await page.onShow();await page.onAddToCurrentMeal()
  assert.equal(page.data.selectionFeedback.state,'unknown');assert.equal(page.data.selectedMeal.count,0)
  assert.equal(page.data.mealPrimaryLabel,'加入本餐');assert.equal(page.data.selectionBlocked,true)
})
test('original array ingredients remain readable when quantity preview is empty', async () => {
  const f=fixture();f.api.getDishById=async()=>({...dishes[2],ingredientsAmounts:['菌菇 200g','水 500ml']})
  const page=f.page('pages/dish-detail/dish-detail');await page.loadDishDetail(3);await settle()
  assert.deepEqual(plain(page.data.dish.ingredientsList),['菌菇 200g','水 500ml'])
})

test('filtering favorites keeps the authoritative already-added markers', async () => {
  const f=fixture(),page=f.page('pages/favorite-dishes/favorite-dishes');page._viewScope='A:favoriteView';await page.refreshSelectedMeal()
  page.data.favorites=plain(dishes);page.data.searchKeyword='青菜';page.doFilter()
  assert.equal(page.data.filtered.length,1);assert.equal(page.data.filtered[0].isSelected,true)
})

for (const switchOwner of [false,true]) test(`deferred login initializes detail and current meal together without a second onShow (${switchOwner ? 'new account':'first authorization'})`, async () => {
  let finish;const app={globalData:{loginReady:false},waitForLogin:()=>new Promise(resolve=>{finish=resolve})}
  const f=fixture({app}),page=f.page('pages/dish-detail/dish-detail');let reads=0
  const original=f.api.getMealWorkspace;f.api.getMealWorkspace=async(...args)=>{reads++;if(!app.globalData.loginReady)throw {statusCode:401};return original(...args)}
  page.onLoad({id:'3'});await page.onShow()
  assert.equal(reads,0);assert.equal(page.data.selectedMeal,null);assert.equal(page.data.selectionBlocked,true)
  if(switchOwner)f.switchAccount()
  f.memory.set((switchOwner?'B':'A')+':activeMealTarget',target);f.setRow(workspace([2]));app.globalData.loginReady=true;finish();await settle();await settle()
  assert.deepEqual(plain(page.data.selectedMeal.dishIds),[2]);assert.match(page._recipeSignature,new RegExp('^'+(switchOwner?'B':'A')+':'))
  f.reply(workspace([2,3],5,4));await page.onAddToCurrentMeal()
  assert.equal(f.writes.length,1);assert.deepEqual(plain(page.data.selectedMeal.dishIds),[2,3]);assert.equal(page.data.mealPrimaryLabel,'查看本餐')
})
test('permission retry reloads the authorized current meal as well as the recipe', async () => {
  const f=fixture(),page=f.page('pages/dish-detail/dish-detail');page._dishId=3;await page.loadDishDetail(3);await page.onShow()
  f.switchAccount();f.memory.set('B:activeMealTarget',target);f.setRow(workspace([2]));await page.onRetry();await settle()
  assert.match(page._recipeSignature,/^B:/);assert.deepEqual(plain(page.data.selectedMeal.dishIds),[2])
})
test('late login cannot initialize an unloaded recipe page', async () => {
  let finish;const app={globalData:{loginReady:false},waitForLogin:()=>new Promise(resolve=>{finish=resolve})}
  const f=fixture({app}),page=f.page('pages/dish-detail/dish-detail');let reads=0;f.api.getMealWorkspace=async()=>{reads++;return {workspace:workspace()}}
  page.onLoad({id:3});await page.onShow();page.onUnload();app.globalData.loginReady=true;finish();await settle()
  assert.equal(reads,0);assert.equal(page.data.dish,null);assert.equal(page._recipeSelection,null)
})
for(const boundary of [{date:'2026-10-13',mealType:'breakfast'},{date:'2026-10-12',mealType:'dinner'}]) test(`recipe-only pending selection pins its original target across ${boundary.date} ${boundary.mealType}`,async()=>{
  const f=fixture();f.memory.delete('A:activeMealTarget');const rules=f.load('utils/meal-workspace.js');let now={date:'2026-10-12',mealType:'lunch'};rules.defaultTarget=()=>now
  const initial=workspace();initial.context={...initial.context,...now};f.setRow(initial)
  const page=f.page('pages/dish-detail/dish-detail');await page.loadDishDetail(3);await page.onShow()
  f.failCommand(Object.assign(Error('network'),{statusCode:503}));await page.onAddToCurrentMeal();const pending=plain(page._recipeSelection.view().state.pending)
  const original=plain(now);now=boundary;page.onHide();page.onContinueSelecting();const list=f.page('pages/customize/customize');await list.onShow()
  assert.deepEqual(plain(list.data.selectedMeal.target),original);assert.deepEqual(plain(list.data.selectedMeal.dishIds),[1,2]);assert.deepEqual(plain(list._recipeSelection.view().state.pending),pending)
  assert.deepEqual(f.memory.get('A:activeMealTarget'),original);assert.equal(f.writes.length,1)
})
test('calendar target overrides a pinned recipe target and account switch never inherits either',async()=>{
  const f=fixture(),page=f.page('pages/dish-detail/dish-detail');await page.loadDishDetail(3);await page.onShow()
  const calendar={date:'2026-12-31',mealType:'breakfast'};f.memory.set('A:pendingRecipeRecord',calendar);const row=workspace([2]);row.context={...row.context,...calendar};f.setRow(row);await page.refreshSelectedMeal()
  assert.deepEqual(plain(page.data.selectedMeal.target),calendar);assert.deepEqual(f.memory.get('A:activeMealTarget'),calendar)
  f.switchAccount();f.setRow(null);const next={date:'2027-01-01',mealType:'lunch'};f.load('utils/meal-workspace.js').defaultTarget=()=>next;await page.onShow()
  assert.deepEqual(plain(page.data.selectedMeal.target),next);assert.equal(page.data.selectedMeal.count,0);assert.deepEqual(f.memory.get('A:activeMealTarget'),calendar);assert.deepEqual(f.memory.get('B:activeMealTarget'),next)
})

test('an initially unauthorized detail can retry after deferred login and use the new account meal',async()=>{
  let finish;const app={globalData:{loginReady:true},waitForLogin:()=>new Promise(resolve=>{finish=resolve})}
  const f=fixture({app}),page=f.page('pages/dish-detail/dish-detail');page._dishId=3
  f.fail({statusCode:401});const read=f.api.getMealWorkspace;f.api.getMealWorkspace=async(...args)=>{if(!app.globalData.loginReady)throw {statusCode:401};return read(...args)}
  await page.loadDishDetail(3);await page.onShow();assert.equal(page.data.errorKind,'permission')
  app.globalData.loginReady=false;const retry=page.onRetry();assert.equal(page.data.selectedMeal,null)
  f.switchAccount();f.fail(null);f.setRow(workspace([2]));const explicit={date:'2026-12-31',mealType:'breakfast'};f.memory.set('B:pendingRecipeRecord',explicit)
  const row=workspace([2]);row.context={...row.context,...explicit};f.setRow(row);app.globalData.loginReady=true;finish();await retry
  assert.equal(page.data.error,false);assert.match(page._recipeSignature,/^B:/);assert.deepEqual(plain(page.data.selectedMeal.dishIds),[2]);assert.deepEqual(plain(page.data.selectedMeal.target),explicit)
  const after=workspace([2,3],5,4);after.context={...after.context,...explicit};f.reply(after);await page.onAddToCurrentMeal();assert.equal(f.writes.length,1)
})
test('account switch during post-login recipe read cannot render or initialize the old account',async()=>{
  let finish;const app={globalData:{loginReady:true},waitForLogin:async()=>{}}
  const f=fixture({app});f.api.getDishById=()=>new Promise(resolve=>{finish=resolve});const page=f.page('pages/dish-detail/dish-detail')
  page.onLoad({id:3});await page.onShow();f.switchAccount();finish(plain(dishes[2]));await settle();await settle()
  assert.equal(page.data.dish,null);assert.equal(page.data.selectedMeal,null);assert.equal(page._recipeSelection,undefined);assert.equal(f.memory.has('B:activeMealTarget'),false)
})

for(const oldFirst of [true,false]) test(`visible account reentry supersedes old detail initialization (${oldFirst?'old response first':'new response first'})`,async()=>{
  const f=fixture();const requests=[];f.api.getDishById=()=>new Promise(resolve=>requests.push(resolve))
  const page=f.page('pages/dish-detail/dish-detail');page.onLoad({id:3});await page.onShow();await page.onShow();assert.equal(requests.length,1,'same-owner onShow coalesces')
  const oldOperation=page._detailInitialization;page.onHide();f.switchAccount();f.memory.set('B:activeMealTarget',target);f.setRow(workspace([2]));const showing=page.onShow()
  assert.equal(requests.length,2,'new owner starts immediately');const currentOperation=page._detailInitialization;assert.notEqual(currentOperation,oldOperation)
  if(oldFirst){requests[0]({...dishes[2],name:'private A'});await settle();assert.equal(page._detailInitialization,currentOperation);assert.equal(page.data.dish,null);assert.equal(page.data.loading,true)}
  requests[1]({...dishes[2],name:'current B'});await showing;await settle();await settle()
  assert.equal(page.data.dish.name,'current B');assert.equal(page.data.loading,false);assert.match(page._recipeSignature,/^B:/);assert.deepEqual(plain(page.data.selectedMeal.dishIds),[2])
  if(!oldFirst){requests[0]({...dishes[2],name:'private A'});await settle();assert.equal(page.data.dish.name,'current B');assert.equal(page.data.loading,false)}
  assert.equal(page._detailInitialization,null)
})
test('same-account explicit retry owns initialization even when the older read completes',async()=>{
  const f=fixture();const requests=[];f.api.getDishById=()=>new Promise(resolve=>requests.push(resolve))
  const page=f.page('pages/dish-detail/dish-detail');page.onLoad({id:3});await page.onShow();const retry=page.onRetry();const current=page._detailInitialization
  requests[0]({...dishes[2],name:'older'});await settle();assert.equal(page._detailInitialization,current);assert.equal(page.data.dish,null)
  requests[1]({...dishes[2],name:'retry'});await retry;assert.equal(page.data.dish.name,'retry');assert.equal(page.data.loading,false);assert.equal(page._detailInitialization,null)
})

test('a changed same-account read epoch restarts visible initialization instead of coalescing stale work',async()=>{
  const f=fixture(),requests=[];f.api.getDishById=()=>new Promise(resolve=>requests.push(resolve))
  const page=f.page('pages/dish-detail/dish-detail');page.onLoad({id:3});await page.onShow();const manual=page.loadDishDetail(3);await page.onShow()
  assert.equal(requests.length,3);const latest=page._detailInitialization
  requests[0]({...dishes[2],name:'old initialization'});requests[1]({...dishes[2],name:'old manual read'});await manual;await settle()
  assert.equal(page._detailInitialization,latest);assert.equal(page.data.dish,null)
  requests[2]({...dishes[2],name:'visible read'});await settle();await settle();assert.equal(page.data.dish.name,'visible read');assert.equal(page.data.loading,false);assert.equal(page._detailInitialization,null)
})
test('new-account initialization failure ends loading with a visible current-account retry',async()=>{
  const f=fixture(),requests=[];f.api.getDishById=()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))
  const page=f.page('pages/dish-detail/dish-detail');page.onLoad({id:3});await page.onShow();page.onHide();f.switchAccount();await page.onShow()
  requests[1].reject({statusCode:403});await settle();await settle();assert.equal(page.data.loading,false);assert.equal(page.data.error,true);assert.equal(page.data.errorKind,'permission');assert.match(page.data.detailError,/权限/)
  requests[0].resolve({...dishes[2],name:'old account'});await settle();assert.equal(page.data.dish,null);assert.equal(page.data.errorKind,'permission');assert.equal(page._detailInitialization,null)
})
