const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
const plain = x => x == null ? x : JSON.parse(JSON.stringify(x))
const event = (dataset = {}, value) => ({ currentTarget: { dataset }, detail: { ...dataset, value } })
const settle = () => new Promise(resolve => setImmediate(resolve))
// This is a UI command-contract journey. Literal HTTP receipts are NOT generated
// menus: no planner, model service, mocked model, transport, network or child process.
function journey() {
  const memory = new Map(), navigation = [], commands = [], planWrites = [], shoppingWrites = [], recipeWrites = [], menuWrites = [], workspaceReads = []
  const target = { date: '2026-10-09', mealType: 'dinner' }
  const dishes = [{ id: 7, name: '清蒸鱼', type: 'meat' }, { id: 8, name: '炖鸡', type: 'meat' }, { id: 9, name: '炒青菜', type: 'veg' }, { id: 10, name: '冬瓜汤', type: 'soup' }].map(d => ({ ...d, cl: '食材', step: '洗净#煮熟', contentVersion: 'v1' }))
  const rows = new Map(), plans = new Map(); let shopping = { version: 1, dishes: [] }, personalMenu
  const key = t => t.date + ':' + t.mealType
  const row = (t = target) => { if (!rows.has(key(t))) rows.set(key(t), { id: key(t), revision: 1, status: 'empty', context: { ...t, people: 2, compositionMode: 'auto', counts: { meat: 1, veg: 1 } }, draft: { planVersion: 0, dishes: [], lockedDishIds: [], history: [] } }); return rows.get(key(t)) }
  const wx = { getStorageSync: k => k === 'userInfo' ? { id: 'A' } : k === 'token' ? 'fixture-token' : plain(memory.get(k)), setStorageSync: (k, v) => memory.set(k, plain(v)), removeStorageSync: k => memory.delete(k), getAppBaseInfo: () => ({ fontSizeScaleFactor: 2 }),
    navigateTo: o => navigation.push(o.url), redirectTo: o => navigation.push(o.url), switchTab: o => navigation.push(o.url), navigateBack: () => navigation.push('back'),
    showModal: o => o.success({ confirm: true }), showToast() {}, showLoading() {}, hideLoading() {}, pageScrollTo() {}, enableAlertBeforeUnload() {}, disableAlertBeforeUnload() {}, stopPullDownRefresh() {} }
  const api = {
    checkFavoriteDish: async () => false, getUserPreferences: async () => ({ defaultPeople: 2 }), recordBehaviorEvent: async () => {}, getWorkspaceRequest: async () => null,
    getMealWorkspace: async (date, mealType) => { workspaceReads.push({ date, mealType }); return ({ workspace: plain(row({ date, mealType })), plan: plain(plans.get(date + ':' + mealType)), planRevision: plans.get(date + ':' + mealType)?.revision || 0 }) },
    saveWorkspaceContext: async (id, body) => { const r = rows.get(id); r.context = plain(body.context); r.revision++; r.status = r.draft.dishes.length ? 'needs_regeneration' : 'empty'; return plain(r) },
    commandMealWorkspace: async (id, body) => { commands.push({ id, ...plain(body) }); const r = rows.get(id), before = plain(r.draft); r.revision++; r.status = 'draft';
      if (['generate', 'regenerate'].includes(body.command)) r.draft.dishes = plain(r.context.compositionMode === 'manual' ? dishes : [dishes[0], dishes[2]])
      if (body.command === 'replace') { r.draft.history.push(before); r.draft.dishes = r.draft.dishes.map(d => d.id === body.dishId ? { ...d, id: 11, name: '蒸蛋' } : d) }
      if (body.command === 'undo') r.draft = r.draft.history.pop()
      if (body.command === 'select') r.draft.dishes = body.dishIds.map(id => plain(dishes.find(d => d.id === id)))
      r.draft.planVersion = before.planVersion + 1; return plain(r) },
    confirmMealWorkspace: async (id, body) => { const r = rows.get(id), date = body.targetDate, mealType = body.targetMealType; const plan = { recordDate: date, mealType, revision: 1, targetPeople: r.context.people, dishIds: r.draft.dishes.map(d => d.id), dishDetails: plain(r.draft.dishes), recipeName: '本餐菜单' }; planWrites.push({ date, mealType, ...plain(body) }); plans.set(date + ':' + mealType, plan); r.revision++; r.status = 'planned'; r.confirmation = { date, mealType, planRevision: 1, planVersion: body.planVersion, requestId: body.requestId }; return plain(r) },
    getMealOverview: async date => ({ plans: [...plans.values()].filter(p => p.recordDate === date).map(plain), consumptions: [] }),
    getDishById: async id => plain(dishes.find(d => d.id === Number(id))), getCustomDishes: async () => dishes.filter(d => d.userId), getPersonalMenus: async () => personalMenu ? [plain(personalMenu)] : [], getPersonalMenu: async () => plain(personalMenu),
    createCustomDish: async body => { recipeWrites.push(plain(body)); const d = { ...plain(body), id: 21, userId: 'A', contentVersion: 'v1' }; dishes.push(d); return plain(d) },
    createPersonalMenu: async body => { menuWrites.push(plain(body)); personalMenu = { ...plain(body), id: 31, version: 1, dishes: body.dishIds.map(id => plain(dishes.find(d => d.id === id))) }; return plain(personalMenu) },
    resolvePersonalMenu: async (id, body) => ({ menuId: id, menuVersion: body.expectedVersion, menuDate: body.date, menuMealType: body.mealType, people: personalMenu.people, dishIds: plain(personalMenu.dishIds) }),
    createShoppingPreview: async body => ({ dishes: body.dishIds.map(id => ({ dishId: id, dishName: dishes.find(d => d.id === id).name, items: [{ sourceLineNo: 1, displayName: '食材' + id, quantityText: '适量', parseStatus: 'UNKNOWN', checked: false }] })) }),
    getShoppingList: async () => plain(shopping),
    batchAddShoppingItems: async body => { shoppingWrites.push(plain(body)); shopping = { version: shopping.version + 1, dishes: body.dishes.map((d, i) => ({ ...plain(d), items: d.items.map((r, j) => ({ ...r, id: i * 10 + j + 1, checked: false })) })) }; return { list: plain(shopping), addedItemCount: 4, mergedItemCount: 0 } },
    checkShoppingItems: async body => { shopping.version++; shopping.dishes.forEach(d => d.items.forEach(i => { if (body.itemIds.includes(i.id)) i.checked = body.checked })); return plain(shopping) },
  }
  const util = { getUserStorageKey: k => 'A:' + k, getCurrentUserIdentity: () => 'A' }, cache = {}
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-09T10:00:00Z'])) } static now() { return new Date('2026-10-09T10:00:00Z').getTime() } }
  const sandbox = { Date: FixedDate, wx, console, setTimeout, clearTimeout, getApp: () => ({ globalData: { loginReady: true } }) }
  function read(file) { file = path.resolve(file); if (cache[file]) return cache[file]; const name = path.basename(file)
    if (name === 'api.js') return api
    if (name === 'util.js') return util
    if (name === 'config.js') return { ENABLE_MEAL_WORKSPACE: true }
    if (name === 'font-scale.js') return Object.assign(() => 2, { base: 16 })
    if (name === 'recommendation-options.js') return { loadRecommendationOptions: async () => ({ options: { groups: {} } }) }
    const module = { exports: {} }; cache[file] = module.exports
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { ...sandbox, module, exports: module.exports, require: n => read(path.resolve(path.dirname(file), n + '.js')) }, { filename: file }); return cache[file] = module.exports
  }
  function mount(file, type = 'Page', properties = {}) { let definition
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { ...sandbox, [type]: d => { definition = d }, require: n => read(path.resolve(path.dirname(file), n + '.js')) }, { filename: file })
    const instance = { ...definition, ...definition.methods, properties, data: plain(definition.data || {}), setData(patch, callback) { for (const [key, value] of Object.entries(patch)) { const parts = key.split('.'); let obj = this.data; for (const part of parts.slice(0, -1)) obj = obj[part]; obj[parts.at(-1)] = value } if (callback) callback() } }
    return instance
  }
  return { page: route => mount(`pages/${route}/${route}.js`), component: (name, props) => mount(`components/${name}/index.js`, 'Component', props), target, row, read, wx, memory, navigation, commands, planWrites, shoppingWrites, recipeWrites, menuWrites, workspaceReads }
}
test('first use through tomorrow, shopping undo, own recipe and next menu application', async t => {
  const h = journey(), home = h.page('index'); home._alive = true; t.after(() => home.onUnload())
  await home.onLoad(h.target)
  assert.equal(home.data.requirementsDraft, ''); assert.equal(home.data.primaryAction, 'onGenerate')
  await home.onPrimaryAction(); assert.equal(h.commands[0].command, 'generate'); assert.deepEqual(plain(home.data.draft.dishes).map(d => d.id), [7, 9]); assert.equal(h.planWrites.length, 0)
  home.onOpenComposition(); for (const [type, count] of Object.entries({ meat: 2, veg: 1, soup: 1, staple: 0, dessert: 0, side: 0 })) home.onCompositionInput(event({ type }, String(count)))
  await home.onApplyComposition(); assert.equal(home.data.context.counts.meat, 2); assert.equal(home.data.context.counts.soup, 1)
  assert.deepEqual(plain(home.data.draft.dishes).map(d => d.id), [7, 9]); await home.onRegenerate(); assert.deepEqual(plain(home.data.draft.dishes).map(d => d.id), [7, 8, 9, 10])
  const row = h.component('compact-dish-row', { dish: home.data.draft.dishes[0], reducedMotion: true }); row.updateDish(); row.updateMotion(); row.onImageError(); assert.equal(row.data.imageFailed, true); assert.equal(row.data.motionDuration, 0)
  let emitted; row.triggerEvent = (name, detail) => { emitted = { name, detail } }; row.onReplace(); assert.equal(emitted.name, 'replace'); await home.onReplace({ ...event(), detail: emitted.detail }); assert.equal(home.data.draft.dishes[0].id, 11)
  const feedback = h.component('action-feedback', { feedback: home.data.actionFeedback }); feedback.triggerEvent = (name, detail) => { emitted = { name, detail } }; feedback.onUndo(); assert.equal(emitted.name, 'undo'); await home.onUndo({ detail: emitted.detail }); assert.equal(home.data.draft.dishes[0].id, 7)
  const menuBeforeOpeningRecipe = plain(home.data.draft.dishes)
  row.triggerEvent = (name, detail) => { emitted = { name, detail } }; row.onView(); home.onDishOpen({ ...event(), detail: emitted.detail }); assert.match(h.navigation.at(-1), /id=7&people=2/)
  home.onHide()
  const detail = h.page('dish-detail'); detail.onLoad({ id: '7', people: '2' }); await detail.onShow(); await settle()
  assert.equal(detail._detailInitialization, null, 'detail navigation initialization must finish')
  assert.equal(detail.data.dish.id, 7); assert.equal(detail.data.loading, false)
  const readsBeforeReturn = h.workspaceReads.length, writesBeforeReturn = h.planWrites.length
  detail.onHide(); detail.onUnload(); h.wx.navigateBack(); await home.onShow()
  assert.equal(h.workspaceReads.length, readsBeforeReturn + 1, 'foreground return must reread the original workspace')
  const menuAfterReturningFromRecipe = plain(home.data.draft.dishes)
  assert.deepEqual(menuAfterReturningFromRecipe, menuBeforeOpeningRecipe)
  assert.deepEqual(plain(h.workspaceReads.at(-1)), h.target)
  assert.equal(home.data.context.date, h.target.date); assert.equal(home.data.context.mealType, h.target.mealType)
  assert.equal(h.planWrites.length, writesBeforeReturn); assert.equal(writesBeforeReturn, 0)
  assert.equal(home.data.primaryAction, 'onConfirmPlan'); assert.equal(home.data.busy, false); assert.equal(home.data.loading, false)
  await home.onConfirmPlan(); await home.onSaveTargetDate(event({}, '2026-10-10')); await home.onApproveReplacement()
  const planWrites = h.planWrites
  assert.equal(planWrites.length, 1)
  assert.equal(planWrites[0].date, '2026-10-10')
  assert.equal(planWrites[0].targetMealType, 'dinner'); assert.equal(home.data.savedTarget.date, '2026-10-10'); home.onViewSavedMeal(); assert.match(h.navigation.at(-1), /date=2026-10-10&mealType=dinner/)
  const calendar = h.page('calendar-detail'); calendar.onLoad({ date: '2026-10-10', mealType: 'dinner' }); await calendar.loadMealRecords(); assert.deepEqual(plain(calendar.meal('dinner').plan.dishIds), [7, 8, 9, 10]); assert.equal(calendar.meal('dinner').actual, null)
  calendar.onAddMealToShoppingList(event({ meal: 'dinner' })); assert.match(h.navigation.at(-1), /shopping-preview/)
  const preview = h.page('shopping-preview'); preview.onLoad(); await settle(); assert.equal(preview.data.itemCount, 4); await preview.onConfirm(); await preview.onConfirm(); assert.equal(h.shoppingWrites.length, 1); assert.match(preview.data.resultMessage, /已加入/)
  const shopping = h.page('shopping-list'); await shopping.loadList(); assert.equal(shopping.data.pendingCount, 4); await shopping.onToggleSummary(event({ key: shopping.data.summaryRows[0].key })); assert.equal(shopping.data.checkedCount, 1); await shopping.onUndoCheck({ detail: { requestId: shopping.data.feedback.requestId } }); assert.equal(shopping.data.checkedCount, 0)
  const recipes = h.page('customize'); recipes.ensureBrowseOwner(); recipes._visible = true
  for (const [field, value] of Object.entries({ name: '自家蒸蛋', ingredients: '鸡蛋\n水', steps: '搅匀\n蒸熟' })) recipes.onCustomInput(event({ field }, value))
  await recipes.onSaveCustomDish(); assert.equal(h.recipeWrites.length, 1); assert.equal(h.recipeWrites[0].name, '自家蒸蛋'); assert.match(h.navigation.at(-1), /id=21/); assert.equal(planWrites.length, 1)
  home.onSaveReusableMenu(); await recipes.onShow(); assert.deepEqual(plain(recipes.data.selectedIds), [7, 8, 9, 10]); recipes.onMenuInput(event({ field: 'menuName' }, '家常晚餐')); await recipes.onSaveMenu(); assert.equal(h.menuWrites.length, 1); assert.equal(h.menuWrites[0].name, '家常晚餐'); assert.equal(planWrites.length, 1)
  recipes.onMenuDate(event({}, '2026-10-11')); recipes.onMenuMeal(event({}, '2')); await recipes.onApplyMenu(event({ id: 31 })); const next = h.page('index'); next._alive = true; t.after(() => next.onUnload()); await next.initializeWorkspace({ date: '2026-10-11', mealType: 'dinner' }); assert.deepEqual(plain(next.data.draft.dishes).map(d => d.id), [7, 8, 9, 10]); assert.equal(next.data.context.date, '2026-10-11'); assert.equal(planWrites.length, 1)
})
test('registered ordinary pages have accessible root scaling, including the startup log', () => {
  const routes = JSON.parse(fs.readFileSync('app.json')).pages.filter(p => !p.startsWith('pages/admin'))
  for (const route of routes) { const text = fs.readFileSync(route + '.wxml', 'utf8'); assert.match(text, /fontBase \* fontScale/, route); assert.doesNotMatch(text, /聊聊这餐|选菜搭一餐|需要确认|待买参考|本次实付/, route) }
})
test('ordinary tappable views and text expose button semantics to assistive technology', () => {
  const routes = JSON.parse(fs.readFileSync('app.json')).pages.filter(p => !p.startsWith('pages/admin'))
  const files = [...routes.map(p => p + '.wxml'), 'templates/meal-workspace.wxml', 'templates/recipe-selected-sheet.wxml']
  for (const file of files) for (const match of fs.readFileSync(file, 'utf8').matchAll(/<(?:view|text)\b[^>]*>/g)) {
    if (/\b(?:bind|catch):?tap="[^"]+"/.test(match[0])) assert.match(match[0], /aria-role="(?:button|checkbox|tab)"/, `${file}: ${match[0]}`)
  }
})
test('bounded acceptance verifier exists without model/default suite runners', () => {
  assert.equal(fs.existsSync('scripts/verify_miniapp_experience.py'), true)
  const source = fs.readFileSync('scripts/verify_miniapp_experience.py', 'utf8')
  assert.doesNotMatch(source, /rglob\(|os\.walk\(|shell=True/)
  assert.match(source, /NODE_TESTS/)
})
test('calendar and reusable menus use readable image-fallback rows without replacement actions', () => {
  const h = journey(), row = h.component('compact-dish-row', { mode: 'read', dish: { dishId: 7, name: '历史鱼', type: 'meat' } }); const emitted = []
  row.triggerEvent = (name, detail) => emitted.push({ name, detail }); row.updateDish(); row.onView(); row.onReplace()
  assert.deepEqual(plain(emitted), [{ name: 'view', detail: { id: 7 } }])
  assert.match(fs.readFileSync('components/compact-dish-row/index.wxml', 'utf8'), /wx:if="\{\{mode !== 'read'\}\}"/)
  assert.match(fs.readFileSync('pages/calendar-detail/calendar-detail.wxml', 'utf8'), /<compact-dish-row[^>]*mode="read"/)
  assert.match(fs.readFileSync('pages/customize/customize.wxml', 'utf8'), /<compact-dish-row[^>]*menuDish[^>]*mode="read"/)
  const recipes = h.page('customize'); recipes.ensureBrowseOwner(); recipes.onMenuDish(event({ id: 7, people: 4 })); assert.match(h.navigation.at(-1), /id=7&people=4/)
})
