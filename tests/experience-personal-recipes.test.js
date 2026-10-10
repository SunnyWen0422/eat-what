const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const plain = value => value == null ? value : JSON.parse(JSON.stringify(value))
const event = (field, value) => ({ currentTarget: { dataset: { field, id: value } }, detail: { value } })
const target = { date: '2026-10-12', mealType: 'dinner' }
const dish = { id: 7, name: '清蒸鱼', type: 'meat', userId: 'A', contentVersion: 'v1', cl: '鱼#姜', step: '洗鱼#蒸熟', cookMinutes: null }
const form = () => ({ name: '清蒸鱼', type: 'meat', ingredients: '鱼\n姜', steps: '洗鱼\n蒸熟', cookMinutes: '', cuisineCode: '', tagCodes: [], servingDescription: '', image: '' })
const menu = () => ({ id: 3, version: 2, name: '工作日晚餐', people: 4, dishIds: [7, 8], dishes: [dish, { id: 8, name: '青菜', type: 'veg', contentVersion: 'v2' }] })
function deferred() { let resolve; const promise = new Promise(ok => { resolve = ok }); return { promise, resolve } }
// Platform and HTTP boundaries only: all page handlers, journals and quality helpers are real.
function fixture(route = 'customize', overrides = {}, enabled = false) {
  const account = { id: 'A', token: 'token-A' }, memory = new Map(), navigation = [], dialogs = [], calendarWrites = [], sent = [], leaveAlerts = []
  memory.set('A:activeMealTarget', target)
  const wx = {
    getStorageSync: key => key === 'userInfo' ? { id: account.id } : key === 'token' ? account.token : plain(memory.get(key)),
    setStorageSync: (key, value) => memory.set(key, plain(value)), removeStorageSync: key => memory.delete(key),
    enableAlertBeforeUnload: value => leaveAlerts.push(value), disableAlertBeforeUnload: () => leaveAlerts.push(null),
    showToast() {}, showLoading() {}, hideLoading() {}, vibrateShort() {}, stopPullDownRefresh() {},
    showModal: value => dialogs.push(value), showActionSheet: value => dialogs.push(value),
    navigateTo: value => navigation.push(value.url), redirectTo: value => navigation.push(value.url), switchTab: value => navigation.push(value.url), navigateBack() {},
  }
  const api = { getCustomDishes: async () => [plain(dish)], getPersonalMenus: async () => [menu()], getPersonalMenu: async () => menu(),
    getDishById: async id => plain(menu().dishes.find(d => d.id === id)), getUserPreferences: async () => ({ defaultPeople: 2 }),
    createCustomDish: async body => { sent.push(plain(body)); return { id: 21, ownerId: account.id } },
    updateCustomDish: async (id, body) => { sent.push(plain(body)); return { ...plain(dish), id } },
    createPersonalMenu: async body => { sent.push(plain(body)); return { ...menu(), id: 9, ...plain(body) } },
    updatePersonalMenu: async (id, body) => { sent.push(plain(body)); return { ...menu(), id, ...plain(body) } },
    resolvePersonalMenu: async (id, body) => ({ menuId: id, menuVersion: body.expectedVersion, menuDate: body.date, menuMealType: body.mealType, people: 4, dishIds: [7, 8] }),
    getMealWorkspace: async () => ({ workspace: { id: 'workspace', revision: 6, context: { ...target, people: 2 }, draft: { dishes: [{ id: 5, name: '原来的面' }], planVersion: 3 } } }),
    confirmMealWorkspace: async body => { calendarWrites.push(body) }, saveRecipeRecord: async body => { calendarWrites.push(body) }, ...overrides }
  const util = { getUserStorageKey: key => account.id + ':' + key, getCurrentUserIdentity: () => account.id }
  let definition; const cache = {}, timers = new Map()
  const sandbox = { wx, Page: value => { definition = value }, console: { log() {}, warn() {}, error() {} }, getApp: () => ({ globalData: { loginReady: true } }),
    setTimeout: callback => { const id = timers.size + 1; timers.set(id, callback); return id }, clearTimeout: id => timers.delete(id), setInterval() {}, clearInterval() {} }
  function moduleFrom(file) {
    if (cache[file]) return cache[file]
    const basename = path.basename(file)
    if (basename === 'api.js') return api
    if (basename === 'util.js') return util
    if (basename === 'font-scale.js') return Object.assign(() => 1, { base: 16 })
    if (basename === 'config.js') return { ENABLE_MEAL_WORKSPACE: enabled }
    if (basename === 'recommendation-options.js') return { loadRecommendationOptions: async () => ({ options: { groups: {} } }) }
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { ...sandbox, module, exports: module.exports, require: name => moduleFrom(path.resolve(path.dirname(file), name + '.js')) })
    cache[file] = module.exports; return module.exports
  }
  const file = path.resolve(`pages/${route}/${route}.js`)
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { ...sandbox, require: name => moduleFrom(path.resolve(path.dirname(file), name + '.js')) })
  const page = { ...definition, data: plain(definition.data), setData(values) { for (const [key, value] of Object.entries(values)) { const parts = key.split('.'); let row = this.data; for (const p of parts.slice(0, -1)) row = row[p]; row[parts.at(-1)] = value } } }
  if (route === 'customize') { page.ensureBrowseOwner(); page._visible = true }
  if (route === 'custom-dishes') page.onLoad()
  if (route === 'dish-detail') page._scope = 'A:dishView'
  return { page, wx, api, account, memory, navigation, dialogs, sent, calendarWrites, moduleFrom, leaveAlerts }
}

test('saving one dish opens returned detail ID with a clear destination and unknown time stays null', async () => {
  const f = fixture(); f.page.data.customForm = form(); await f.page.onSaveCustomDish()
  assert.match(f.navigation[0] || '', /dish-detail.*id=21/)
  assert.equal(f.sent[0].cookMinutes, null)
  assert.match(f.page.data.personalSaveMessage || '', /我的菜谱/)
})
for (const field of ['name', 'ingredients', 'steps']) test(`missing ${field} focuses that field and retains input`, async () => {
  const f = fixture(); f.page.data.customForm = { ...form(), [field]: '' }; await f.page.onSaveCustomDish()
  assert.equal(f.page.data.customFocus, field); assert.equal(f.sent.length, 0)
  assert.match(f.page.data.customError, /请输入/)
})
test('unknownOutcomeReusesOriginalRequest after reentry and same name never updates existing dish', async () => {
  const sent = []; let updates = 0
  const f = fixture('customize', { createCustomDish: async body => { sent.push(plain(body)); if (sent.length === 1) throw { isNetworkError: true }; return { id: 21 } }, updateCustomDish: async () => { updates++ } })
  f.page.data.customForm = form(); await f.page.onSaveCustomDish(); f.page._writeJournal = null
  await f.page.onShow(); f.page.onCustomInput(event('name', '别的名字')); await f.page.onSaveCustomDish()
  assert.deepEqual(sent[1], sent[0]); assert.equal(updates, 0); assert.match(f.navigation[0], /id=21/)
})
test('clean create exit is immediate; dirty create exit offers keep or discard', () => {
  const f = fixture(); f.page.data.showCustomForm = true; f.page.onCancelCustom(); assert.equal(f.dialogs.length, 0)
  f.page.data.showCustomForm = true; f.page.onCustomInput(event('name', '鱼')); f.page.onCancelCustom()
  assert.equal(f.dialogs.length, 1); f.dialogs[0].success({ confirm: false }); assert.equal(f.page.data.customForm.name, '鱼')
  f.page.onCancelCustom(); f.dialogs[1].success({ confirm: true }); assert.equal(f.page.data.customForm.name, '')
})
test('structured rename sends exact rich recipe content without losing object fields', async () => {
  const f = fixture('custom-dishes'), rich = { ...dish, ingredientsAmounts: '[{"name":"鱼","quantity":1,"unit":"条","note":"去鳞"}]', steps: '[{"text":"蒸熟","image":"https://example.com/step.jpg","minutes":8}]' }
  f.page.edit(rich); f.page.onInput(event('name', '我的鱼')); await f.page.saveEdit()
  assert.equal(f.sent[0].cl, rich.ingredientsAmounts); assert.equal(f.sent[0].step, rich.steps)
  assert.match(f.navigation[0] || '', /dish-detail.*id=7/)
})
test('editor validates focus and dirty cancel keeps or discards while clean cancel needs no dialog', async () => {
  const f = fixture('custom-dishes'); f.page.edit(dish); f.page.cancelEdit(); assert.equal(f.dialogs.length, 0)
  f.page.edit(dish); f.page.onInput(event('steps', '')); await f.page.saveEdit(); assert.equal(f.page.data.formFocus, 'steps')
  f.page.cancelEdit(); assert.equal(f.dialogs.length, 1); f.dialogs[0].success({ confirm: false }); assert.equal(f.page.data.editing, true)
  f.page.cancelEdit(); f.dialogs[1].success({ confirm: true }); assert.equal(f.page.data.editing, false)
})
test('optional existing serving description and image use explicit update flags, including clear', async () => {
  const f = fixture('custom-dishes'); f.page.edit({ ...dish, fl: '原配方2人份', image: 'https://example.com/fish.jpg' })
  f.page.onInput(event('servingDescription', '')); f.page.onInput(event('image', '')); await f.page.saveEdit()
  assert.equal(f.sent[0].editServingDescription, true); assert.equal(f.sent[0].fl, null)
  assert.equal(f.sent[0].editImage, true); assert.equal(f.sent[0].image, null)
})
test('recipe changes revoke verified preview without changing original quality evidence', () => {
  const f = fixture('custom-dishes'), verified = { ...dish, quality: { reviewStatus: 'VERIFIED', servingsStatus: 'VERIFIED', basePeople: 2, ingredients: [{ name: '鱼', identityStatus: 'VERIFIED', quantityStatus: 'VERIFIED', quantityValue: 1, unit: '条' }] } }
  f.page.edit(verified); f.page.onInput(event('ingredients', '鱼\n盐'))
  assert.doesNotMatch(f.page.data.editQualityNotice || '', /已核对/); assert.match(f.page.data.editQualityNotice || '', /核实/)
  assert.equal(verified.quality.reviewStatus, 'VERIFIED')
})
test('public copy delegates authenticated ownership to server, preserves source and opens own editor', async () => {
  const authenticatedUserId = 'A'; let createdDish, request
  const source = { ...dish, userId: null }, before = plain(source)
  const f = fixture('dish-detail', { copyPersonalDish: async (id, body) => { request = body; createdDish = { id: 22, ownerId: authenticatedUserId }; return createdDish } })
  f.page.data.dish = source; await f.page.onCopyPersonal()
  assert.equal(createdDish.ownerId, authenticatedUserId)
  assert.equal(request.ownerId, undefined); assert.equal(request.expectedVersion, 'v1'); assert.deepEqual(source, before)
  assert.match(f.navigation[0], /edit=22/); assert.match(f.page.data.copyMessage || '', /我的菜谱/)
})
test('saving reusable menu only writes a template and preserves historical snapshots', async () => {
  const f = fixture(), historyBeforeTemplateEdit = [{ date: '2026-10-01', dishes: [plain(dish)] }]
  f.memory.set('A:history', historyBeforeTemplateEdit); f.page.data.selectedIds = [7, 8]; f.page.data.menuName = '工作日晚餐'; f.page.data.menuPeople = 4
  await f.page.onSaveMenu()
  const calendarWrites = f.calendarWrites, historyAfterTemplateEdit = f.wx.getStorageSync('A:history')
  assert.equal(calendarWrites.length, 0)
  assert.deepEqual(historyAfterTemplateEdit, historyBeforeTemplateEdit)
  assert.match(f.page.data.personalSaveMessage || '', /常用菜单/); assert.equal(f.page.data.showMenus, true)
})
test('naming menu inherits selected meal people and dishes without reselection', () => {
  const f = fixture(); f.page.data.selectedMeal = { target, dishIds: [7, 8], people: 4 }; f.page.data.selectedIds = [7, 8]; f.page.data.selectedTotal = 2; f.page.data.mealSelectedDishes = menu().dishes
  f.page.onOpenMenuForm(); assert.equal(f.page.data.menuPeople, 4); assert.deepEqual(plain(f.page.data.selectedIds), [7, 8])
  assert.deepEqual(plain(f.page.data.menuReviewDishes.map(d => d.id)), [7, 8])
})
test('menu create/edit use separate canonical journal keys and legacy unknown requests migrate intact', async () => {
  const f = fixture(); const pending = { requestId: 'original-menu', name: '晚餐', dishIds: [7, 8], people: 4, expectedVersion: 0 }
  f.wx.setStorageSync('A:personalRecipeWrite:menu:new', pending); await f.page.onOpenMenus()
  assert.deepEqual(f.wx.getStorageSync('A:personalRecipeWrite:menu:create'), pending)
  assert.equal(f.wx.getStorageSync('A:personalRecipeWrite:menu:new'), undefined)
  await f.page.onSaveMenu(); assert.equal(f.sent[0].requestId, 'original-menu')
})
test('reuse with current draft requires old/new summary and cancellation changes nothing', async () => {
  const f = fixture('customize', {}, true); f.page.data.menus = [menu()]; f.page.data.menuDate = target.date; f.page.data.menuMealIndex = 2
  const before = plain([...f.memory]); const operation = f.page.onApplyMenu(event('id', 3)); await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.dialogs.length, 1); assert.match(f.dialogs[0].content, /原来的面/); assert.match(f.dialogs[0].content, /清蒸鱼/)
  f.dialogs[0].success({ confirm: false }); await operation; assert.deepEqual(plain([...f.memory]), before); assert.equal(f.navigation.length, 0)
})
test('confirmed menu handoff is immutable and revision-bound, with no calendar write', async () => {
  const f = fixture('customize', {}, true); f.page.data.menus = [menu()]; f.page.data.menuDate = target.date; f.page.data.menuMealIndex = 2
  const operation = f.page.onApplyMenu(event('id', 3)); await new Promise(resolve => setImmediate(resolve)); f.dialogs[0].success({ confirm: true }); await operation
  const handoff = f.wx.getStorageSync('A:workspaceSelectedDishes'); assert.equal(handoff.expectedWorkspaceRevision, 6); assert.equal(handoff.expectedWorkspaceId, 'workspace')
  f.page.data.menus[0].dishIds.push(9); assert.deepEqual(handoff.dishIds, [7, 8]); assert.equal(f.calendarWrites.length, 0)
})
test('deletedTemplateDishBlocksSilentApply lists missing dishes and never silently shrinks selection', async () => {
  const f = fixture('customize', { getDishById: async id => { if (id === 8) throw { statusCode: 404 }; return plain(dish) }, resolvePersonalMenu: async () => ({ menuId: 3, menuVersion: 2, menuDate: target.date, menuMealType: 'dinner', people: 4, dishIds: [7] }) }, true)
  f.page.data.menus = [menu()]; f.page.data.menuDate = target.date; f.page.data.menuMealIndex = 2
  await f.page.onApplyMenu(event('id', 3)); assert.equal(f.navigation.length, 0); assert.equal(f.wx.getStorageSync('A:workspaceSelectedDishes'), undefined)
  assert.match(f.page.data.menuError, /青菜/); assert.equal(f.page.data.menuMissingDishes.length, 1)
})
test('menu editor save and delete cannot mutate historical snapshots; save-as-new preserves original template', async () => {
  let edits = 0; const f = fixture('customize', { updatePersonalMenu: async () => { edits++; return menu() } })
  const historyBeforeTemplateEdit = [{ date: '2026-10-01', menu: menu() }]; f.wx.setStorageSync('A:history', historyBeforeTemplateEdit)
  await f.page.onEditMenu(event('id', 3)); assert.equal(f.page.data.menuFormVisible, true)
  f.page.onSaveMenuAsNew(); await f.page.onSaveMenu(); assert.equal(edits, 0); assert.deepEqual(f.sent[0].dishIds, [7, 8])
  const historyAfterTemplateEdit = f.wx.getStorageSync('A:history'); assert.deepEqual(historyAfterTemplateEdit, historyBeforeTemplateEdit)
})
test('menu replacement dialog cannot complete under another account or changed target', async () => {
  const f = fixture('customize', {}, true); f.page.data.menus = [menu()]; f.page.data.menuDate = target.date; f.page.data.menuMealIndex = 2
  const operation = f.page.onApplyMenu(event('id', 3)); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.dialogs.length, 1)
  f.account.id = 'B'; f.dialogs[0].success({ confirm: true }); await operation; assert.equal(f.navigation.length, 0); assert.equal(f.wx.getStorageSync('B:workspaceSelectedDishes'), undefined)
})
test('menu edit cancel confirms only actual changes and retain leaves draft intact', async () => {
  const f = fixture(); await f.page.onEditMenu(event('id', 3)); f.page.onExitMenuEdit(); assert.equal(f.dialogs.length, 0)
  await f.page.onEditMenu(event('id', 3)); f.page.onMenuInput(event('menuName', '新晚餐')); f.page.onExitMenuEdit()
  assert.equal(f.dialogs.length, 1); f.dialogs[0].success({ confirm: false }); assert.equal(f.page.data.menuName, '新晚餐')
})
test('editor optional panels, focus binding, three save labels and ignorable guide are wired', () => {
  const create = fs.readFileSync('pages/customize/customize.wxml', 'utf8'), edit = fs.readFileSync('pages/custom-dishes/custom-dishes.wxml', 'utf8'), workspace = fs.readFileSync('templates/meal-workspace.wxml', 'utf8')
  assert.match(create, /customExtrasVisible/); assert.match(edit, /editExtrasVisible/); assert.match(create, /customFocus === 'name'/); assert.match(edit, /formFocus === 'steps'/)
  assert.match(create, /保存菜谱/); assert.match(create, /保存常用菜单/); assert.match(workspace, /存为常用菜单/); assert.match(create, /onDismissPersonalGuide/)
})

test('menu naming opens with pinned target and loads the destination templates', async () => {
  const f = fixture(); await f.page.onOpenMenuForm()
  assert.equal(f.page.data.menuDate, target.date); assert.equal(f.page.data.menuMealIndex, 2); assert.equal(f.page.data.menus.length, 1)
})
test('pending menu editor survives a fresh selected-meal initialization', async () => {
  const f = fixture('customize', {}, true), pending = { requestId: 'menu-pending', name: '原模板', dishIds: [7, 8], people: 4, expectedVersion: 0 }
  f.wx.setStorageSync('A:personalRecipeWrite:menu:create', pending); await f.page.onOpenMenus(); await f.page.onShow()
  assert.deepEqual(plain(f.page.data.selectedIds), [7, 8]); assert.equal(f.page.data.menuPeople, 4); await f.page.onSaveMenu()
  assert.equal(f.sent[0].requestId, 'menu-pending'); assert.deepEqual(f.sent[0].dishIds, [7, 8])
})
test('pending menu edit can recover the original receipt even if current template read is unavailable', async () => {
  const f = fixture('customize', { getPersonalMenu: async () => { throw { statusCode: 404 } } })
  const pending = { requestId: 'prior-edit', expectedVersion: 2, name: '原输入', people: 4, dishIds: [7, 8], dishVersions: { 7: 'v1', 8: 'v2' } }
  f.wx.setStorageSync('A:personalRecipeWrite:menu:edit:3', pending); await f.page.onEditMenu(event('id', 3))
  assert.equal(f.page.data.menuPending, true); await f.page.onSaveMenu(); assert.equal(f.sent[0].requestId, 'prior-edit')
})
test('another account cannot see old recipe quality notice or save destination', () => {
  const f = fixture('custom-dishes'); f.page.edit(dish); f.page.data.personalSaveMessage = 'A私房菜目的地'; f.account.id = 'B'; f.page.ensureOwner()
  assert.equal(f.page.data.editQualityNotice, ''); assert.equal(f.page.data.personalSaveMessage, '')
  const menus = fixture(); menus.page.data.personalSaveMessage = 'A模板'; menus.page.data.menuMissingDishes = [{ id: 8, name: 'A的私房菜' }]; menus.account.id = 'B'; menus.page.ensureBrowseOwner()
  assert.equal(menus.page.data.personalSaveMessage, ''); assert.deepEqual(plain(menus.page.data.menuMissingDishes), [])
})
test('changing target while replacement dialog is open preserves the old handoff and blocks apply', async () => {
  const f = fixture('customize', {}, true); f.page.data.menus = [menu()]; f.page.data.menuDate = target.date; f.page.data.menuMealIndex = 2
  const operation = f.page.onApplyMenu(event('id', 3)); await new Promise(resolve => setImmediate(resolve)); f.page.data.menuDate = '2026-10-13'; f.dialogs[0].success({ confirm: true }); await operation
  assert.equal(f.navigation.length, 0); assert.equal(f.wx.getStorageSync('A:workspaceSelectedDishes'), undefined)
})
test('template delete is isolated from stored actual history and calendar writes', async () => {
  const deleted = [], f = fixture('customize', { deletePersonalMenu: async (id, body) => { deleted.push({ id, body }); return {} } })
  f.page.data.menus = [menu()]; const historyBeforeTemplateEdit = [{ actual: menu() }]; f.wx.setStorageSync('A:history', historyBeforeTemplateEdit)
  f.page.onDeleteMenu(event('id', 3)); await f.dialogs[0].success({ confirm: true })
  const historyAfterTemplateEdit = f.wx.getStorageSync('A:history'), calendarWrites = f.calendarWrites
  assert.deepEqual(historyAfterTemplateEdit, historyBeforeTemplateEdit); assert.equal(calendarWrites.length, 0); assert.equal(deleted[0].body.expectedVersion, 2)
})
test('menu apply refuses unresolved current local writes even when destination is a different target', async () => {
  const f = fixture('customize', {}, true); f.page.data.menus = [menu()]; f.page.data.menuDate = '2026-10-13'; f.page.data.menuMealIndex = 2
  f.page._recipeSelection = { view: () => ({ selectedMeal: { target, dishIds: [5] }, state: { pending: { type: 'command' }, dirty: false, syncStatus: 'unknown' } }) }
  const operation = f.page.onApplyMenu(event('id', 3)); await new Promise(resolve => setImmediate(resolve)); if (f.dialogs[0]) f.dialogs[0].success({ confirm: false }); await operation
  assert.equal(f.dialogs.length, 0); assert.equal(f.navigation.length, 0); assert.match(f.page.data.menuError, /待确认/)
})


test('dirty custom form tab exit confirms keep/discard while unchanged editor needs no native guard', () => {
  const f = fixture(); f.page.data.showCustomForm = true
  f.page.onCustomInput(event('name', '鱼')); assert.ok(f.leaveAlerts.some(Boolean))
  f.page.onTabChange({ currentTarget: { dataset: { tab: 'veg' } } }); assert.equal(f.dialogs.length, 1)
  f.dialogs[0].success({ confirm: false }); assert.equal(f.page.data.customForm.name, '鱼')
  assert.equal(f.page.data.showCustomForm, false)
  const edit = fixture('custom-dishes'); edit.page.edit(dish); assert.equal(edit.leaveAlerts.filter(Boolean).length, 0)
  edit.page.onInput(event('name', '别名')); assert.ok(edit.leaveAlerts.at(-1)); edit.page.onInput(event('name', dish.name)); assert.equal(edit.leaveAlerts.at(-1), null)
})
test('unknown edits cannot be canceled or changed while receipt recovery is pending', async () => {
  const f = fixture('custom-dishes', { updateCustomDish: async () => { throw { isNetworkError: true } } }); f.page.edit(dish); await f.page.saveEdit()
  const before = plain(f.page.data.form); f.page.cancelEdit(); f.page.onInput(event('name', '误改'))
  assert.deepEqual(plain(f.page.data.form), before); assert.equal(f.page.data.editing, true); assert.equal(f.dialogs.length, 0)
})
test('pending template selections stay read-only through selected-panel handlers', () => {
  const f = fixture(); f.page.data.menuPending = true; f.page.data.selectedIds = [7, 8]; f.page.data.selectedTotal = 2
  f.page.onRemoveSelected(event('id', 7)); f.page.onClearSelected()
  assert.deepEqual(plain(f.page.data.selectedIds), [7, 8]); assert.equal(f.dialogs.length, 0)
})

test('workspace more-panel naming handoff reuses current draft/target and never stores another dish list', async () => {
  const f = fixture('customize', {}, true), create = f.moduleFrom(path.resolve('utils/meal-workspace-page.js'))
  const definition = create({ mode: 'result' }), workspace = { ...definition, data: plain(definition.data), setData: f.page.setData, _alive: true }
  await workspace.initializeWorkspace(target); workspace.onSaveReusableMenu()
  assert.equal(f.wx.getStorageSync('A:openPersonalMenuForm'), true); assert.deepEqual(f.wx.getStorageSync('A:activeMealTarget'), target)
  assert.equal(f.wx.getStorageSync('A:workspaceSelectedDishes'), undefined); assert.equal(f.calendarWrites.length, 0)
  await f.page.onShow(); assert.equal(f.page.data.menuFormVisible, true); assert.deepEqual(plain(f.page.data.selectedIds), [5]); assert.equal(f.page.data.menuPeople, 2)
  assert.equal(f.wx.getStorageSync('A:openPersonalMenuForm'), undefined)
})
test('guide is dismissible once per account and does not create a preference or extra write', async () => {
  const f = fixture(); await f.page.onShow(); assert.equal(f.page.data.personalGuideVisible, true); f.page.onDismissPersonalGuide(); await f.page.onShow()
  assert.equal(f.page.data.personalGuideVisible, false); assert.equal(f.sent.length, 0); f.account.id = 'B'; await f.page.onShow(); assert.equal(f.page.data.personalGuideVisible, true)
})

test('template editor cannot expose calendar save for its independent selection', () => {
  const source = fs.readFileSync('pages/customize/customize.wxml', 'utf8')
  const calendar = source.match(/<button([^>]+)bindtap="onSaveToCalendar"/)[1]
  assert.match(calendar, /wx:if="\{\{!menuFormVisible && !menuEditingId && !menuPending && selectedTotal\}\}"/)
  assert.equal(vm.runInNewContext(calendar.match(/wx:if="\{\{([^}]+)\}\}"/)[1], {menuFormVisible:true,menuEditingId:3,menuPending:false}), false)
})

test('renaming a legacy recipe preserves untouched HTTP image without forcing an optional edit', async () => {
  const f = fixture('custom-dishes'); f.page.edit({ ...dish, image: 'http://legacy.example.com/fish.jpg' }); f.page.onInput(event('name', '别名'))
  await f.page.saveEdit(); assert.equal(f.sent.length, 1); assert.equal(f.sent[0].editImage, undefined)
})

function visibleCondition(source, pattern, data) {
  const match = source.match(pattern); assert.ok(match, 'expected rendered entry is present')
  return !!vm.runInNewContext(match[1], data)
}
test('review F1: reachable template selected-list repairs deleted dish and saves same template', async () => {
  const f = fixture('customize', { getDishById: async id => { if (id === 8) throw { statusCode: 404 }; return plain(dish) } }, true)
  await f.page.onEditMenu(event('id', 3)); f.page.onCloseMenus()
  const source = fs.readFileSync('pages/customize/customize.wxml', 'utf8')
  assert.equal(visibleCondition(source, /class="bottom-bar" wx:if="\{\{([^}]+)\}\}"/, f.page.data), true)
  const bottom = source.slice(source.indexOf('class="bottom-bar"'), source.indexOf('</view>\n\n  </view>', source.indexOf('class="bottom-bar"')))
  const entryHandler = bottom.match(/bindtap="(onShowSelected)"/)[1]; f.page[entryHandler]()
  assert.equal(f.page.data.showSelectedPanel, true); assert.ok(f.page.data.selectedList.some(row => row.id === 8))
  const panel = source.slice(source.indexOf('class="panel-list'), source.indexOf('<ui-sheet visible="{{showMenus}}"'))
  const remove = panel.match(/data-id="\{\{item.id\}\}"[^>]*bindtap="([^"]+)"/)[1]
  f.page[remove](event('id', 8)); assert.deepEqual(plain(f.page.data.selectedIds), [7]); assert.equal(f.page.data.menuReviewDishes.some(row => row.id === 8), false)
  f.page.onHideSelected(); const resume = bottom.match(/bindtap="([^"]+)">继续命名与保存/)[1]; await f.page[resume](); assert.equal(f.page.data.menuEditingId, 3)
  await f.page.onSaveMenu(); assert.deepEqual(f.sent[0].dishIds, [7]); assert.equal(f.sent[0].expectedVersion, 2); assert.equal(f.calendarWrites.length, 0)
})
test('review F2: explicit new-menu entry asks before replacing edited name, people, IDs and identity', async () => {
  const f = fixture(); await f.page.onEditMenu(event('id', 3)); f.page.onMenuInput(event('menuName', '周五晚餐')); f.page.onMenuInput(event('menuPeople', '6')); f.page.onCloseMenus()
  const source = fs.readFileSync('pages/customize/customize.wxml', 'utf8'), handler = source.match(/bindtap="([^"]+)">把已选菜品存为新菜单/)[1]
  await f.page[handler](); assert.equal(f.dialogs.length, 1); await f.dialogs[0].success({ confirm: false }); assert.equal(f.page.data.menuName, '周五晚餐'); assert.equal(Number(f.page.data.menuPeople), 6); assert.equal(f.page.data.menuEditingId, 3); assert.deepEqual(plain(f.page.data.selectedIds), [7, 8])
})
for (const confirm of [false, true]) test(`review F2: actual workspace naming entry ${confirm ? 'discard opens meal IDs' : 'keep preserves editor'}`, async () => {
  const f = fixture('customize', {}, true); await f.page.onShow(); await f.page.onEditMenu(event('id', 3)); f.page.onMenuInput(event('menuName', '未保存名称'))
  const create = f.moduleFrom(path.resolve('utils/meal-workspace-page.js')), def = create({ mode: 'result' }), workspace = { ...def, data: plain(def.data), setData: f.page.setData, _alive: true }
  await workspace.initializeWorkspace(target)
  const source = fs.readFileSync('templates/meal-workspace.wxml', 'utf8'), handler = source.match(/label="存为常用菜单"[^>]*bind:action="([^"]+)"/)[1]
  workspace[handler](); await f.page.onShow(); assert.equal(f.dialogs.length, 1); assert.equal(f.page.data.menuName, '未保存名称'); assert.equal(f.page.data.menuEditingId, 3)
  await f.dialogs[0].success({ confirm })
  if (confirm) {
    assert.deepEqual(plain(f.page.data.selectedIds), [5]); assert.equal(f.page.data.menuPeople, 2); assert.equal(f.page.data.menuEditingId, null)
    f.page.onMenuInput(event('menuName', '本餐模板')); await f.page.onSaveMenu(); assert.deepEqual(f.sent[0].dishIds, [5])
  } else { assert.deepEqual(plain(f.page.data.selectedIds), [7, 8]); assert.equal(f.page.data.menuName, '未保存名称') }
  assert.equal(f.wx.getStorageSync('A:openPersonalMenuForm'), undefined); assert.equal(f.calendarWrites.length, 0)
})
for (const invalid of [null, {}, { id: 0 }, { id: -1 }, { id: 'bad' }]) test(`review F3: invalid create receipt ${JSON.stringify(invalid)} keeps original journal until replay succeeds`, async () => {
  const attempts = [], f = fixture('customize', { createCustomDish: async body => { attempts.push(plain(body)); return attempts.length === 1 ? invalid : { id: 21 } } })
  f.page.data.customForm = form(); await f.page.onSaveCustomDish()
  assert.equal(f.page.data.customPending, true); assert.ok(f.page.writeJournal().pending('dish:create')); assert.equal(f.navigation.length, 0)
  f.page.onCustomInput(event('name', '不能重写')); await f.page.onSaveCustomDish(); assert.deepEqual(attempts[1], attempts[0]); assert.match(f.navigation[0], /id=21/); assert.equal(f.page.writeJournal().pending('dish:create'), null)
})
test('review F4: menu name/people/IDs changes arm supported leave guard, revert and save clear it', async () => {
  const f = fixture(); await f.page.onEditMenu(event('id', 3)); assert.equal(f.leaveAlerts.filter(Boolean).length, 0)
  const input = fs.readFileSync('pages/customize/customize.wxml', 'utf8').match(/data-field="menuName"[^>]*bindinput="([^"]+)"/)[1]
  f.page[input](event('menuName', '新名')); assert.ok(f.leaveAlerts.at(-1)); f.page[input](event('menuName', '工作日晚餐')); assert.equal(f.leaveAlerts.at(-1), null)
  f.page.onMenuInput(event('menuPeople', '6')); assert.ok(f.leaveAlerts.at(-1)); f.page.onMenuInput(event('menuPeople', '4')); assert.equal(f.leaveAlerts.at(-1), null)
  f.page.onShowSelected(); f.page.onRemoveSelected(event('id', 8)); assert.ok(f.leaveAlerts.at(-1)); await f.page.onSaveMenu(); assert.equal(f.leaveAlerts.at(-1), null)
})
test('review F4: explicit page back offers keep/discard for changed template and cannot abandon pending write', async () => {
  const f = fixture(); let back = 0; f.wx.navigateBack = () => { back++ }; await f.page.onEditMenu(event('id', 3)); f.page.onMenuInput(event('menuName', '未保存'))
  f.page.onBack(); assert.equal(f.dialogs.length, 1); await f.dialogs[0].success({ confirm: false }); assert.equal(back, 0); assert.equal(f.page.data.menuName, '未保存')
  f.page.onBack(); await f.dialogs[1].success({ confirm: true }); assert.equal(back, 1); assert.equal(f.leaveAlerts.at(-1), null)
  const unknown = fixture('customize', { updatePersonalMenu: async () => { throw { isNetworkError: true } } }); await unknown.page.onEditMenu(event('id', 3)); await unknown.page.onSaveMenu()
  assert.equal(unknown.page.data.menuPending, true); assert.ok(unknown.leaveAlerts.at(-1)); unknown.page.onBack(); assert.equal(unknown.dialogs.length, 0); assert.equal(unknown.page.data.menuEditingId, 3)
})

for (const change of ['account', 'target', 'selection', 'form', 'selection_status']) test(`review F2 guard: ${change} change during naming approval preserves current state`, async () => {
  const f = fixture('customize', {}, true); await f.page.onShow(); await f.page.onEditMenu(event('id', 3)); f.page.onMenuInput(event('menuName', '原修改'))
  f.wx.setStorageSync('A:openPersonalMenuForm', true); await f.page.onShow(); assert.equal(f.dialogs.length, 1)
  if (change === 'account') f.account.id = 'B'
  if (change === 'target') f.wx.setStorageSync('A:activeMealTarget', { date: '2026-10-13', mealType: 'lunch' })
  if (change === 'selection') f.page.data.selectedMeal = { ...f.page.data.selectedMeal, dishIds: [6] }
  if (change === 'selection_status') f.page.data.selectionBlocked = true
  if (change === 'form') f.page.onMenuInput(event('menuName', '后来的输入'))
  await f.dialogs[0].success({ confirm: true })
  assert.equal(f.sent.length, 0); assert.equal(f.wx.getStorageSync('B:openPersonalMenuForm'), undefined)
  if (change !== 'account') { assert.deepEqual(plain(f.page.data.selectedIds), [7, 8]); assert.equal(f.page.data.menuName, change === 'form' ? '后来的输入' : '原修改') }
})
test('review F4 guard: pending recovery success clears alert and owner switch clears old guard', async () => {
  let attempts = 0; const f = fixture('customize', { updatePersonalMenu: async () => { if (!attempts++) throw { isNetworkError: true }; return menu() } })
  await f.page.onEditMenu(event('id', 3)); await f.page.onSaveMenu(); assert.ok(f.leaveAlerts.at(-1)); await f.page.onSaveMenu(); assert.equal(f.leaveAlerts.at(-1), null)
  await f.page.onEditMenu(event('id', 3)); f.page.onMenuInput(event('menuName', 'A输入')); assert.ok(f.leaveAlerts.at(-1)); f.account.id = 'B'; f.page.ensureBrowseOwner(); assert.equal(f.leaveAlerts.at(-1), null); assert.equal(f.page.data.menuName, '')
})
test('review F2 guard: selecting another template prompts before replacing dirty editor', async () => {
  const f = fixture(); await f.page.onEditMenu(event('id', 3)); f.page.onMenuInput(event('menuName', '保留修改')); await f.page.onEditMenu(event('id', 4))
  assert.equal(f.dialogs.length, 1); await f.dialogs[0].success({ confirm: false }); assert.equal(f.page.data.menuEditingId, 3); assert.equal(f.page.data.menuName, '保留修改')
})

test('review F4 guard: a stale leave confirmation cannot discard an edit that became pending', async () => {
  const f = fixture('customize', { updatePersonalMenu: async () => { throw { isNetworkError: true } } }); await f.page.onEditMenu(event('id', 3)); f.page.onMenuInput(event('menuName', '新名'))
  f.page.onBack(); assert.equal(f.dialogs.length, 1); await f.page.onSaveMenu(); assert.equal(f.page.data.menuPending, true)
  await f.dialogs[0].success({ confirm: true }); assert.equal(f.page.data.menuEditingId, 3); assert.equal(f.page.data.menuPending, true)
})

for (const confirm of [false, true]) test(`rereview R1: visible same-template edit after 409 ${confirm ? 'approved latest read permits explicit save' : 'keep preserves dirty inputs'}`, async () => {
  let version = 2, reads = 0; const attempts = []
  const f = fixture('customize', { getPersonalMenu: async () => { reads++; return { ...menu(), version, name: version === 2 ? '工作日晚餐' : '云端新版', people: version === 2 ? 4 : 5 } }, getPersonalMenus: async () => [{ ...menu(), version }], updatePersonalMenu: async (id, body) => { attempts.push(plain(body)); if (body.expectedVersion !== version) throw { statusCode: 409, data: { message: '菜单已在另一处修改，请重新读取' } }; return { ...menu(), version: version + 1 } } })
  await f.page.onEditMenu(event('id', 3)); f.page.onMenuInput(event('menuName', '待保留的本地名称')); version = 3; await f.page.onSaveMenu()
  assert.equal(f.page.data.menuPending, false); assert.equal(f.page.writeJournal().pending('menu:edit:3'), null)
  const source = fs.readFileSync('pages/customize/customize.wxml', 'utf8'), reload = source.match(/bindtap="([^"]+)">重新读取菜单/)[1]
  await f.page[reload](); assert.equal(f.page.data.menus[0].version, 3); assert.equal(f.page._menuVersion, 2); assert.equal(f.page.data.menuName, '待保留的本地名称')
  await f.page.onResumeMenuForm(); assert.equal(reads, 1); assert.equal(f.page.data.menuName, '待保留的本地名称')
  const edit = source.match(/bindtap="([^"]+)">编辑组合/)[1]; await f.page[edit](event('id', 3))
  assert.equal(f.dialogs.length, 1); assert.match(f.dialogs[0].title, /重新读取/); assert.equal(reads, 1); assert.equal(f.page.data.menuName, '待保留的本地名称')
  await f.dialogs[0].success({ confirm }); assert.equal(attempts.length, 1, 'refresh decision must not auto-save')
  if (!confirm) { assert.equal(reads, 1); assert.equal(f.page._menuVersion, 2); assert.equal(f.page.data.menuName, '待保留的本地名称'); assert.equal(Number(f.page.data.menuPeople), 4) }
  else {
    assert.equal(reads, 2); assert.equal(f.page._menuVersion, 3); assert.equal(f.page.data.menuName, '云端新版'); assert.equal(Number(f.page.data.menuPeople), 5)
    f.page.onMenuInput(event('menuName', '确认后重新输入')); await f.page.onSaveMenu(); assert.deepEqual(attempts.map(body => body.expectedVersion), [2, 3]); assert.notEqual(attempts[0].requestId, attempts[1].requestId); assert.equal(f.page.data.menuPending, false)
  }
})
test('rereview Back: clean menu plus dirty custom form offers keep/discard before navigation', async () => {
  const f = fixture(); let back = 0; f.wx.navigateBack = () => { back++ }; await f.page.onEditMenu(event('id', 3)); f.page.onCloseMenus()
  f.page.onTabChange({ currentTarget: { dataset: { tab: 'custom' } } }); f.page.onCustomInput(event('name', '未保存的新菜'))
  f.page.onBack(); assert.equal(back, 0); assert.equal(f.dialogs.length, 1); assert.match(f.dialogs[0].title, /菜谱输入/)
  await f.dialogs[0].success({ confirm: false }); assert.equal(back, 0); assert.equal(f.page.data.customForm.name, '未保存的新菜'); assert.equal(f.page.data.showCustomForm, true)
  f.page.onBack(); await f.dialogs[1].success({ confirm: true }); assert.equal(back, 1); assert.equal(f.page.data.customForm.name, '')
})
test('rereview Back: both dirty editors must resolve before navigation', async () => {
  const f = fixture(); let back = 0; f.wx.navigateBack = () => { back++ }; await f.page.onEditMenu(event('id', 3)); f.page.onMenuInput(event('menuName', '模板输入'))
  f.page.onTabChange({ currentTarget: { dataset: { tab: 'custom' } } }); f.page.onCustomInput(event('name', '菜谱输入'))
  f.page.onBack(); assert.equal(f.dialogs.length, 1); await f.dialogs[0].success({ confirm: true }); assert.equal(back, 0); assert.equal(f.dialogs.length, 2)
  await f.dialogs[1].success({ confirm: false }); assert.equal(back, 0); assert.equal(f.page.data.customForm.name, '菜谱输入')
})

test('rereview R1 guard: account change during refresh decision cannot reread or overwrite another owner', async () => {
  let reads = 0; const f = fixture('customize', { getPersonalMenu: async () => { reads++; return menu() } })
  await f.page.onEditMenu(event('id', 3)); f.page.onMenuInput(event('menuName', 'A本地输入')); await f.page.onEditMenu(event('id', 3)); assert.equal(f.dialogs.length, 1)
  f.account.id = 'B'; await f.dialogs[0].success({ confirm: true }); assert.equal(reads, 1); assert.equal(f.page.data.menuName, ''); assert.equal(f.page.data.menuEditingId, null); assert.equal(f.sent.length, 0)
})
test('rereview R1 guard: late latest-template read is rejected after account changes', async () => {
  let reads = 0; const wait = deferred(), f = fixture('customize', { getPersonalMenu: async () => { reads++; return reads === 1 ? menu() : wait.promise } })
  await f.page.onEditMenu(event('id', 3)); f.page.onMenuInput(event('menuName', 'A输入')); await f.page.onEditMenu(event('id', 3)); const refresh = f.dialogs[0].success({ confirm: true })
  assert.equal(reads, 2); f.account.id = 'B'; f.page.ensureBrowseOwner(); wait.resolve({ ...menu(), version: 3, name: 'A新版' }); await refresh
  assert.equal(f.page.data.menuEditingId, null); assert.equal(f.page.data.menuName, ''); assert.equal(f.page._menuVersion, null); assert.equal(f.sent.length, 0)
})
test('rereview R1 guard: unknown write blocks explicit refresh and still retries original version/request', async () => {
  let reads = 0; const attempts = [], f = fixture('customize', { getPersonalMenu: async () => { reads++; return menu() }, updatePersonalMenu: async (id, body) => { attempts.push(plain(body)); if (attempts.length === 1) throw { isNetworkError: true }; return menu() } })
  await f.page.onEditMenu(event('id', 3)); f.page.onMenuInput(event('menuName', '原请求')); await f.page.onSaveMenu(); await f.page.onEditMenu(event('id', 3))
  assert.equal(reads, 1); assert.equal(f.dialogs.length, 0); assert.equal(f.page.data.menuPending, true); await f.page.onSaveMenu(); assert.deepEqual(attempts[1], attempts[0])
})
test('rereview R1 guard: failed snapshot reread retains local form and version until a complete read succeeds', async () => {
  let failRead = false; const f = fixture('customize', { getPersonalMenu: async () => ({ ...menu(), version: failRead ? 3 : 2 }), getDishById: async id => { if (failRead) throw { isNetworkError: true }; return plain(menu().dishes.find(d => d.id === id)) } })
  await f.page.onEditMenu(event('id', 3)); f.page.onMenuInput(event('menuName', '不能丢的输入')); failRead = true; await f.page.onEditMenu(event('id', 3)); await f.dialogs[0].success({ confirm: true })
  assert.equal(f.page._menuVersion, 2); assert.equal(f.page.data.menuName, '不能丢的输入'); assert.equal(f.page.data.menuBusy, false); assert.ok(f.leaveAlerts.at(-1)); assert.equal(f.sent.length, 0)
})
