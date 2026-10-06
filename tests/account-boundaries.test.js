const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const flow = require('../utils/meal-workflow')
function load(route, api, extras = {}) {
  let scope = 'A', view
  const wx = { getStorageSync: key => key === 'userInfo' ? { id: scope, nickname: scope } : null, setStorageSync() {}, removeStorageSync() {}, showToast() {}, ...extras.wx }
  vm.runInNewContext(fs.readFileSync(route + '.js','utf8'), { Page: value => {view=value}, getApp: () => ({globalData:{}}), wx, console, require: key => {
    if (key.endsWith('/shopping-prices')) return require('../utils/shopping-prices')
    if (key.endsWith('/shopping-capabilities')) return {refresh:async()=>({pricesEnabled:false,expensesEnabled:false}),notice:()=>''}
    if (key.endsWith('/product-release')) return require('../utils/product-release')
    if(key.endsWith('/config')) return {ENABLE_MEAL_WORKSPACE:false}
    if (key.endsWith('/font-scale')) return () => 1
    if (key.endsWith('/ui-tokens')) return require('../utils/ui-tokens')
    if(key.endsWith('/api')) return api
    if(key.endsWith('/util')) return {getUserStorageKey: key => scope + ':' + key}
    if(key.endsWith('/meal-workflow')) return flow
    if(key.endsWith('/avatar')) return {resolveAvatar: value => value, uploadAvatar: async () => ({})}
    if(key.endsWith('/shopping-ingredients')) return {buildPurchaseSummary: () => ({mergeableItems:[],separateItems:[]})}
    if(key.endsWith('/shopping-list')) return {loadLocalShoppingList: () => ({dishes:[]}),loadPendingOperations: () => [],...extras}
    if (extras.modules && extras.modules[key]) return extras.modules[key]
    throw Error(key)
  } })
  view.data=structuredClone(view.data); view.setData = values => Object.assign(view.data,values)
  return {view, switchUser: value => {scope=value}}
}
test('profile draft from A cannot be written to B even before onShow', async () => {
  let writes=0
  const {view,switchUser}=load('pages/profile-edit/profile-edit',{updateUserInfo: async () => {writes++; return {success:true,user:{}}}})
  view.loadUser(); view.onNicknameInput({detail:{value:'A draft'}}); switchUser('B')
  await view.onSave(); assert.equal(writes,0)
  view.onShow(); assert.equal(view.data.nickname,'B'); assert.equal(view.data.dirty,false)
})
test('failed calendar read in B clears A meals and plan markers', async () => {
  const {view,switchUser}=load('pages/calendar/calendar',{getMealOverview: async () => {throw {isNetworkError:true}}})
  view._viewScope='A:mealView'; view.data.overview={plans:[{recordDate:flow.today(),recipeName:'A private'}],consumptions:[]}
  switchUser('B'); await view.loadRecipeRecords(); assert.equal(view.data.overview.plans.length,0)
})
test('failed report read in B clears A report', async () => {
  const {view,switchUser}=load('pages/statistics/statistics',{getDietReview: async () => {throw {isNetworkError:true}}})
  view._viewScope='A:dietReview'; view.data.report={mealCount:99}; view.data.recordRows=[{names:'A private'}]
  switchUser('B'); await view.loadStatistics(); assert.equal(view.data.report,null); assert.equal(view.data.recordRows.length,0)
})
test('shopping retry retains original version until explicit conflict, resets on account change', async () => {
  const {view,switchUser}=load('pages/shopping-list/shopping-list',{getShoppingList:async () => ({version:9,dishes:[]})})
  view._scope='A:shoppingList'; view.data.version=1
  const first=view.stableOperation('manual',{name:'盐',quantityText:'1袋'})
  view.data.version=2
  assert.equal(view.stableOperation('manual',{name:'盐',quantityText:'1袋'}).payload.expectedListVersion,1)
  assert.equal(view.stableOperation('manual',{name:'盐',quantityText:'1袋'}).payload.requestId,first.payload.requestId)
  switchUser('B'); await view.loadList()
  assert.notEqual(view.stableOperation('manual',{name:'盐',quantityText:'1袋'}).payload.requestId,first.payload.requestId)
})

test('assistant settings replace the previous date/meal prefix and retain the typed requirement', () => {
  const {view}=load('pages/chat/chat',{})
  view.data.settingDate='2026-10-20'; view.data.settingMealIndex=0; view.data.settingPeople='4'
  view._settingsPrefix='2026-10-10 晚餐，2个人。'; view.data.inputText=view._settingsPrefix+'不要花生'
  view.onApplySettings(); assert.equal(view.data.inputText,'2026-10-20 早餐，4个人。不要花生')
  view.data.settingMealIndex=1; view.onApplySettings()
  assert.equal(view.data.inputText,'2026-10-20 午餐，4个人。不要花生')
})


test('assistant confirmation dialogs cannot act for an account switched before confirm', async () => {
  for (const method of ['confirmSaveCalendar', 'confirmShoppingList', 'onClearSession']) {
    let confirm, writes = 0
    const {view, switchUser} = load('pages/chat/chat', {
      saveRecipeRecord: async () => { writes++ },
      deleteAssistantSession: async () => { writes++ }
    }, { wx: { showModal: options => { confirm = options.success } }, beginShoppingSelection: () => { writes++ } })
    view.sessionKey = 'A:assistantSessionId'; view.data.sessionId = 'session-A'
    view.data.plan = {version: 1, meals: [{date: '2026-10-20', meal_type: 'dinner', dishes: [{id: 1, name: 'A dish'}]}]}
    const operation = view[method]()
    switchUser('B'); confirm({confirm: true}); await operation
    assert.equal(writes, 0, method)
  }
})

test('assistant shopping selection uses the verified plan for all source rows', async () => {
  let selection
  const verified = {version: 2, period: {people: 4}, meals: [{date: '2026-10-21', meal_type: 'lunch', dishes: [{id: 2, name: 'new'}]}]}
  const {view} = load('pages/chat/chat', {previewAssistantAction: async () => ({success: true, plan: verified})}, {
    wx: {showModal: options => options.success({confirm: true}), navigateTo() {}},
    beginShoppingSelection: value => {selection = value}
  })
  view.sessionKey = 'A:assistantSessionId'; view.data.sessionId = 'session-A'
  view.data.plan = {version: 1, meals: [{date: '2026-10-20', meal_type: 'dinner', dishes: [{id: 1, name: 'old'}]}]}
  await view.confirmShoppingList()
  assert.equal(selection.sources[0].sourceDate, '2026-10-21')
  assert.deepEqual(Array.from(selection.sources[0].dishIds), [2])
  assert.equal(selection.sources[0].targetPeople, 4)
})


test('result dialogs discard their captured plan and pending date after account switch', async () => {
  let modal, sheet, writes = 0
  const pending = {date: '2026-10-20', mealType: 'dinner'}
  const {view, switchUser} = load('pages/result/result', {}, {
    wx: {
      getStorageSync: key => key === 'A:pendingRecipeRecord' ? pending : null,
      showModal: options => {modal = options.success},
      showActionSheet: options => {sheet = options.success}
    }, modules: {
      '../../utils/recommend': {}, '../../utils/recommendation-flow': {},
      '../../utils/recommendation-criteria': {}, '../../utils/recommendation-matcher': {}, '../../utils/preference-store': {}
    }
  })
  view.data.plans = [{dishes: [{id: 1, name: 'A dish'}]}]
  view.saveRecipeToCalendar = async () => {writes++}
  view.checkPendingRecipeRecord(); switchUser('B'); await modal({confirm: true})
  assert.equal(writes, 0)
  switchUser('A'); view.selectMealType(view.data.plans[0], pending.date); switchUser('B'); sheet({tapIndex: 2})
  assert.equal(writes, 0)
})

test('assistant calendar confirmation retains its idempotency key after unknown network result', async () => {
  const keys = []
  const {view} = load('pages/chat/chat', {
    previewAssistantAction: async () => ({success: true, action: {preview_token: 'token'}}),
    confirmAssistantAction: async (id, body) => {
      keys.push(body.idempotencyKey)
      if (keys.length === 1) throw {isNetworkError: true}
      return {success: true, executed: true}
    }
  }, {wx: {showModal: options => options.success({confirm: true})}})
  view.sessionKey = 'A:assistantSessionId'; view.data.sessionId = 'session-A'
  view.data.plan = {version: 1, meals: [{date: '2026-10-20', meal_type: 'dinner', dishes: [{id: 1, name: 'dish'}]}]}
  await view.confirmSaveCalendar(); await view.confirmSaveCalendar()
  assert.equal(keys.length, 2); assert.equal(keys[0], keys[1])
})
