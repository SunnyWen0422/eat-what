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
  const account = extras.account || { id: 'A', token: 'token-A', api: '' }
  const navigation = [], dialogs = [], timers = new Map(), storage = extras.storage || new Map()
  const wx = {
    getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
    getStorageSync: key => key === 'userInfo' ? { id: account.id } : key === 'token' ? account.token : storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key),
    showToast() {}, showLoading() {}, hideLoading() {}, vibrateShort() {}, stopPullDownRefresh() {},
    showModal: value => dialogs.push(value), showActionSheet: value => dialogs.push(value),
    navigateTo: value => navigation.push(value), switchTab() {}, redirectTo() {}, ...extras.wx,
  }
  const modules = {
    '../../utils/api': api, '../../utils/font-scale': () => 1,
    '../../utils/util': { getUserStorageKey: key => `${account.id || 'guest'}${account.api || ''}:${key}` },
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
  return { page, account, storage, wx, navigation, dialogs, timers }
}

test('personal create retries one request ID and preserves form after unknown outcome', async () => {
  const sent = []
  const { page } = load('pages/customize/customize', { createCustomDish: async body => { sent.push(body); if (sent.length === 1) throw { isNetworkError: true }; return { id: 3 } } })
  page.onShow(); page.data.customForm = { name: '鱼', type: 'meat', ingredients: '鱼', steps: '蒸', cuisineCode: '', tagCodes: [], cookMinutes: '' }
  await page.onSaveCustomDish(); assert.equal(page.data.customForm.name, '鱼'); await page.onSaveCustomDish()
  assert.ok(sent[0].requestId); assert.equal(sent[0].requestId, sent[1].requestId)
})
test('detail copy checks content version and opens an unsaved source draft', async () => {
  let copies = 0
  const { page, navigation } = load('pages/dish-detail/dish-detail', { copyPersonalDish: async () => { copies++; return { id: 9 } } })
  page._scope = 'A:dishView'; page.data.dish = { id: 1, name: '鱼', contentVersion: 'v1' }
  await page.onCopyPersonal(); await page.onConfirmCopyPersonal(); assert.equal(copies, 0); assert.match(navigation[0].url, /copy=1&version=v1/)
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
  const { page } = load('pages/custom-dishes/custom-dishes', { updateCustomDish: async (id, body) => { sent.push(body); if (sent.length === 1) throw { isNetworkError: true }; return { id } }, getCustomDishes: async () => [dish] })
  page.onLoad(); page.edit(dish); assert.equal(page.data.form.steps, '洗鱼\n蒸熟')
  await page.saveEdit(); assert.equal(page.data.editPending, true); await page.saveEdit()
  assert.equal(sent[0].expectedVersion, 'v1'); assert.equal(sent[0].requestId, sent[1].requestId); assert.equal(sent[0].step, '洗鱼###蒸熟')
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
test('dish detail time uses explicit evidence without duplicate source prose', async () => {
  for (const [dish, expected] of [
    [{ cookMinutes: 10, cookTime: '45分钟' }, ''],
    [{ cookMinutes: 10, cookTime: null }, ''],
    [{ cookMinutes: null, cookTime: null }, ''],
    [{ cookMinutes: null, cookTime: '约45分钟' }, ''],
    [{ cookMinutes: 10, quality:{timeStatus:'ESTIMATED'} }, '预计 10 分钟'],
    [{ cookMinutes: 10, quality:{timeStatus:'VERIFIED',reviewStatus:'VERIFIED'} }, '10 分钟'],
    [{ cookMinutes: 10, quality:{timeStatus:'UNKNOWN',reviewStatus:'VERIFIED'} }, '']
  ]) {
    const { page } = load('pages/dish-detail/dish-detail', { getDishById: async () => ({ id: 1, name: '鱼', ...dish }), checkFavoriteDish: async () => ({}) })
    await page.loadDishDetail(1); assert.equal(page.data.dish.cookTimeDisplay, expected)
  }
  assert.match(fs.readFileSync('pages/dish-detail/dish-detail.wxml', 'utf8'), /\{\{dish\.cookTimeDisplay\}\}/)
  assert.doesNotMatch(fs.readFileSync('pages/dish-detail/dish-detail.wxml', 'utf8'), /原资料时长说明|onToggleQualitySources|onToggleSupplement/)
})

for (const kind of ['dish','menu']) test('lost '+kind+' delete receipt remains recoverable after object disappears and reuses exact request',async()=>{
 const sends=[];let gone=false,release
 const api={getCustomDishes:async()=>gone?[]:[{id:7,name:'豆腐',contentVersion:'v1'}],getPersonalMenus:async()=>gone?[]:[{id:7,name:'晚餐',version:1}]}
 api[kind==='dish'?'deleteCustomDish':'deletePersonalMenu']=async(id,body)=>{sends.push({id,body:structuredClone(body)});gone=true;if(sends.length===1)throw Error('lost');return new Promise(r=>release=r)}
 const route=kind==='dish'?'pages/custom-dishes/custom-dishes':'pages/customize/customize',f=load(route,api);let p=f.page
 if(kind==='dish'){p.onLoad();await p.onShow()}else{p.ensureBrowseOwner();await p.loadMenus()}
 p[kind==='dish'?'onDelete':'onDeleteMenu']({currentTarget:{dataset:{id:7}}});await f.dialogs.at(-1).success({confirm:true})
 const restored=load(route,api,{account:f.account,storage:f.storage});p=restored.page
 if(kind==='dish'){p.onLoad();await p.onShow()}else{p.ensureBrowseOwner();await p.loadMenus()}
 const pending=p.data.pendingDeletes;assert.equal(pending.length,1);assert.equal(sends.length,1)
 const event={currentTarget:{dataset:{id:7,generation:p.data.pendingDeleteGeneration}}}
 const first=p.onRecoverDelete(event),second=p.onRecoverDelete(event);await new Promise(setImmediate)
 release({deleted:true});await Promise.all([first,second]);assert.deepEqual(sends[1],sends[0]);assert.equal(sends.length,2);assert.equal(p.data.pendingDeletes.length,0)
})

for(const kind of ['dish','menu'])for(const change of ['account','api'])test('pending '+kind+' delete cannot cross '+change+' or accept late receipts',async()=>{
 const route=kind==='dish'?'pages/custom-dishes/custom-dishes':'pages/customize/customize';let finish,sends=0
 const api={getCustomDishes:async()=>[],getPersonalMenus:async()=>[]};api[kind==='dish'?'deleteCustomDish':'deletePersonalMenu']=async()=>{sends++;return new Promise(r=>finish=r)}
 const f=load(route,api),p=f.page
 f.storage.set('A:personalRecipeWrite:'+kind+':delete:7',{expectedVersion:kind==='dish'?'v1':1,requestId:'original'})
 if(kind==='dish'){p.onLoad();await p.onShow()}else{p.ensureBrowseOwner();await p.loadMenus()}
 const event={currentTarget:{dataset:{id:7,generation:p.data.pendingDeleteGeneration}}}
 const recovering=p.onRecoverDelete(event);await new Promise(setImmediate)
 if(change==='account')f.account.id='B';else f.account.api='other'
 p[kind==='dish'?'ensureOwner':'ensureBrowseOwner']();finish({deleted:true});await recovering
 assert.equal(p.data.pendingDeletes.length,0);assert.ok(f.storage.has('A:personalRecipeWrite:'+kind+':delete:7'))
 await p.onRecoverDelete(event);assert.equal(sends,1)
})

test('dish detail uses the shared readable legacy ingredient formatter without duplicate raw columns',async()=>{
 const {page}=load('pages/dish-detail/dish-detail',{getDishById:async()=>({id:1,name:'豆腐',cl:'豆腐|460|克|主料|切块|2名成年人总量+15%冗余|菜名+步骤',step:'煮熟'}),checkFavoriteDish:async()=>({})})
 await page.loadDishDetail(1);assert.deepEqual(Array.from(page.data.dish.ingredientsList),['豆腐 460克（切块）']);assert.equal(page.data.dish.cl,'豆腐|460|克|主料|切块|2名成年人总量+15%冗余|菜名+步骤')
})

for (const scenario of ['unknown','partial','failed']) test('detail preserves original ingredients when scaling is '+scenario,async()=>{
 const original={id:7,name:'番茄炒蛋',ingredientsAmounts:'番茄|300|克|主料|||2名成年人总量+15%冗余#鸡蛋|2|枚|主料|||2名成年人总量+15%冗余'}
 const f=load('pages/dish-detail/dish-detail',{getDishById:async()=>JSON.parse(JSON.stringify(original)),createShoppingPreview:async()=>{
  if(scenario==='failed')throw {statusCode:503}
  return {dishes:[{items:[{displayName:'番茄',quantityText:'600克',calculationStatus:scenario==='unknown'?'NEEDS_ADJUSTMENT':'CALCULATED'}]}]}
 }})
 await f.page.loadDishDetail(7);await new Promise(resolve=>setImmediate(resolve))
 assert.deepEqual(JSON.parse(JSON.stringify(f.page.data.dish.ingredientsList)),['番茄 300克','鸡蛋 2枚'])
 assert.equal(f.page.data.dish.ingredientsAmounts,original.ingredientsAmounts);assert.equal(f.page.data.ingredientNotice,'原方用量')
})
