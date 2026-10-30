const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
const rules = require('../utils/meal-workspace')
const save = fs.existsSync('utils/meal-save-target.js') ? require('../utils/meal-save-target') : {}
const plain = value => value == null ? value : JSON.parse(JSON.stringify(value))
const source = { date: '2026-10-09', mealType: 'dinner' }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
// Real page and store; only the HTTP/platform boundary is replaced. A and B are
// different static drafts, not model output. Reading a target never mutates it.
function fixture(initial = source, mode = 'today') {
  let account = 'A', now = new Date('2026-10-09T15:59:00Z')
  const memory = new Map(), rows = new Map(), plans = new Map(), calls = [], reads = [], navigation = []
  const key = target => `${account}:${target.date}:${target.mealType}`
  function row(target = initial) {
    const id = key(target)
    if (!rows.has(id)) rows.set(id, { id, revision: 1, status: 'draft', context: rules.normalizeContext({ ...target, people: 2 }),
      draft: { planVersion: 3, dishes: [{ id: target.date === initial.date ? 7 : 9, name: target.date === initial.date ? '菜单A' : '菜单B', type: 'veg' }], lockedDishIds: [], history: [] } })
    return rows.get(id)
  }
  const api = {
    getUserPreferences: async () => ({ defaultPeople: 2 }), recordBehaviorEvent: async () => {},
    getMealWorkspace: async (date, mealType) => { reads.push({ date, mealType }); const workspace = row({ date, mealType }), plan = plans.get(key({ date, mealType })) || null; return plain({ workspace, plan, planRevision: plan ? plan.revision : 0 }) },
    confirmMealWorkspace: async (id, body) => {
      calls.push({ id, body: plain(body) })
      const old = rows.get(id), target = { date: body.targetDate || old.context.date, mealType: body.targetMealType || old.context.mealType }
      const plan = { revision: body.expectedPlanRevision + 1, dishIds: old.draft.dishes.map(d => d.id), dishDetails: plain(old.draft.dishes) }
      plans.set(key(target), plan)
      const next = { ...old, revision: old.revision + 1, status: 'planned', confirmation: { ...target, requestId: body.requestId, planVersion: body.planVersion, planRevision: plan.revision } }; rows.set(id, next); return plain(next)
    },
    getWorkspaceRequest: async () => null,
    commandMealWorkspace: async (id, body) => { const old = rows.get(id), next = { ...old, revision: old.revision + 1, status: 'draft', draft: { ...old.draft, planVersion: old.draft.planVersion + 1 } }; rows.set(id, next); return plain(next) },
  }
  const util = { getCurrentUserIdentity: () => account, getUserStorageKey: k => `user:${account}:${k}` }
  const wx = { getStorageSync: k => plain(memory.get(k)), setStorageSync: (k,v) => memory.set(k,plain(v)), removeStorageSync: k => memory.delete(k), getAppBaseInfo: () => ({}), navigateTo: o => navigation.push(o.url) }
  const sandbox = { module: { exports: {} }, wx, console, setTimeout, clearTimeout,
    require: name => name === './api' ? api : name === './util' ? util : name === './meal-workspace' ? { ...rules,
      defaultTarget: () => rules.defaultTarget(now), resolveActiveTarget: (mode,params,stored) => rules.resolveActiveTarget(mode,params,stored,now),
      createWorkspaceStore: () => rules.createWorkspaceStore({ api, identity: util.getCurrentUserIdentity, read: wx.getStorageSync, write: wx.setStorageSync }) } : require(path.resolve('utils', name)) }
  vm.runInNewContext(fs.readFileSync('utils/meal-workspace-page.js','utf8'), sandbox)
  const page = sandbox.module.exports({mode}); page.setData = patch => Object.assign(page.data,patch); page._alive = true
  const store = rules.createWorkspaceStore({ api, identity: util.getCurrentUserIdentity, read: wx.getStorageSync, write: wx.setStorageSync })
  return { page, store, row, rows, plans, calls, reads, api, navigation, switchAccount: () => { account = 'B' }, midnight: () => { now = new Date('2026-10-09T16:01:00Z') } }
}
const dateEvent = date => ({ detail: { value: date } })
test('local wait timing separates tap state feedback and result from backend and native display', async t => {
  const f=fixture(), page=f.page; t.after(()=>page.onUnload()); await page.initializeWorkspace(source);page.onOpenSaveTarget()
  const gate=deferred(), original=f.api.confirmMealWorkspace;f.api.confirmMealWorkspace=async(...args)=>{await gate.promise;return original(...args)}
  const {performance}=require('node:perf_hooks');const started=performance.now();let feedback=null
  const apply=page.setData;page.setData=patch=>{apply(patch);if(patch.busy===true&&feedback===null)feedback=performance.now()}
  const pending=page.onApproveReplacement();assert.equal(page.data.busy,true);assert.notEqual(feedback,null);assert.equal(f.calls.length,0)
  await new Promise(resolve=>setTimeout(resolve,20));gate.resolve();await pending;const ready=performance.now()
  assert.equal(page.data.saveState,'saved');assert.ok(ready>=feedback&&feedback>=started)
  t.diagnostic(JSON.stringify({scope:'Node VM, real page/store, mocked HTTP; setData state only',tapToStateFeedbackMs:feedback-started,tapToResultAvailableMs:ready-started,tapToVisibleFeedbackMs:null,nativeDisplay:'not-run',backendStage:'not-measured',mockGateMinimumMs:20}))
})
// Break: returning references to a mutable draft/context or accepting an impossible day.
test('save snapshot is a deeply immutable source copy with real full-year dates', async () => {
  assert.equal(typeof save.freezeSaveSnapshot, 'function'); assert.equal(typeof save.saveTargetView, 'function')
  const f = fixture(); await f.store.load(source.date, source.mealType)
  const state = f.store.state(), snapshot = save.freezeSaveSnapshot(state,'A')
  state.context.date = '2026-10-10'; state.workspace.draft.dishes[0].id = 99
  assert.equal(snapshot.sourceTarget.date, '2026-10-09'); assert.deepEqual(snapshot.dishIds,[7])
  assert.ok(Object.isFrozen(snapshot)); assert.ok(Object.isFrozen(snapshot.sourceTarget)); assert.ok(Object.isFrozen(snapshot.dishIds))
  assert.throws(() => save.saveTargetView(snapshot,{ date:'2026-02-30', mealType:'lunch' }), /日期/)
  const view = save.saveTargetView(snapshot,{date:'2027-01-01',mealType:'lunch'},new Date('2026-12-31T16:01:00Z'))
  assert.equal(view.fullDate,'2027-01-01'); assert.equal(view.label,'1月1日午餐'); assert.match(view.crossDayNotice,/北京时间/)
})
// Explicitly opening a historical meal retains its target; default Today follows the date.
test('an explicitly opened meal keeps its frozen snapshot across midnight and rejects account changes', async t => {
  const f = fixture(source,'result'), page = f.page; t.after(() => page.onUnload())
  await page.initializeWorkspace(source); page._params = {...source}; await page.onOpenSaveTarget()
  assert.equal(page.data.confirmationVisible,true); assert.equal(f.calls.length,0)
  f.midnight(); await page.onShow(); assert.equal(page.data.context.date,source.date)
  await page.onSaveTargetDate(dateEvent(source.date))
  assert.equal(page.data.saveTarget.date,source.date); assert.deepEqual(plain(page.data.draft.dishes).map(d=>d.id),[7])
  f.switchAccount(); await page.onApproveReplacement(); assert.equal(f.calls.length,0)
  await assert.rejects(page.store.confirm(0,{date:source.date,mealType:'dinner'}),/账号/)
})
// Break: switching the store to target B or dropping year/optimistic revisions.
test('a year-boundary save belongs to the displayed day and leaves the other day untouched', async t => {
 const from={date:'2026-12-31',mealType:'dinner'},f=fixture(from),page=f.page;t.after(()=>page.onUnload())
 const other=f.row({date:'2027-01-01',mealType:'dinner'}),before=plain(other)
 await page.initializeWorkspace(from);await page.onConfirmPlan()
 assert.equal(f.calls[0].body.targetDate,from.date);assert.equal(f.plans.has('A:2027-01-01:dinner'),false)
 assert.deepEqual(f.rows.get(other.id),before);assert.equal(page.data.savedTarget.date,from.date)
})
test('the current meal with an existing menu requires one explicit review and its own revision', async t => {
  const f = fixture(), page = f.page; t.after(() => page.onUnload())
  f.plans.set('A:2026-10-09:dinner',{revision:6,recipeName:'原目标菜单',dishDetails:[{id:9,name:'菜单B'}]})
  await page.initializeWorkspace(source); await page.onOpenSaveTarget(); await page.onSaveTargetDate(dateEvent(source.date))
  assert.match(page.data.confirmationText,/原目标菜单/); assert.equal(page.data.saveNeedsReplacement,true)
  assert.equal(f.calls.length,0); assert.equal(page.data.confirmationLabel,'确认替换')
  await page.onApproveReplacement(); assert.equal(f.calls.length,1); assert.equal(f.calls[0].body.expectedPlanRevision,6)
})
test('target 409 retains panel and A; refreshing only the destination allows explicit replacement', async t => {
  const f = fixture(), page = f.page; t.after(() => page.onUnload())
  const original = f.api.confirmMealWorkspace; f.api.confirmMealWorkspace = async (id,body) => { f.calls.push({id,body:plain(body)}); throw Object.assign(Error('原安排已更新'),{statusCode:409}) }
  await page.initializeWorkspace(source); await page.onOpenSaveTarget(); await page.onSaveTargetDate(dateEvent(source.date)); await page.onApproveReplacement()
  assert.equal(page.data.confirmationVisible,true); assert.deepEqual(plain(page.data.draft.dishes).map(d=>d.id),[7]); assert.equal(page.data.context.date,source.date)
  f.plans.set('A:2026-10-09:dinner',{revision:4,recipeName:'其他设备新菜单'})
  await page.onRefreshSaveTarget(); assert.equal(page.data.saveNeedsReplacement,true); assert.equal(page.data.confirmationLabel,'确认替换')
  f.api.confirmMealWorkspace = original; await page.onApproveReplacement()
  assert.equal(f.calls[1].body.expectedPlanRevision,4); assert.notEqual(f.calls[1].body.requestId,f.calls[0].body.requestId)
})
test('unknownOutcomeReusesOriginalRequest and locks a pending target against retargeting', async t => {
  const f = fixture(), page = f.page; t.after(() => page.onUnload())
  const original = f.api.confirmMealWorkspace; f.api.confirmMealWorkspace = async (id,body) => { f.calls.push({id,body:plain(body)}); throw Object.assign(Error('超时'),{statusCode:503}) }
  await page.initializeWorkspace(source); await page.onOpenSaveTarget(); await page.onSaveTargetDate(dateEvent(source.date)); await page.onApproveReplacement()
  const sent = f.calls[0]; assert.equal(page.data.confirmationVisible,true); assert.equal(page.data.saveTargetLocked,true)
  await page.onSaveTargetDate(dateEvent('2026-10-11')); assert.equal(page.data.saveTarget.date,source.date)
  f.api.confirmMealWorkspace = original; await page.onRetryWorkspace(); const retried = f.calls[1]
  assert.equal(retried.body.requestId, sent.body.requestId)
  assert.deepEqual(retried.body,sent.body); assert.equal(page.data.confirmationVisible,false); assert.equal(page.data.savedTarget.date,source.date)
})
test('cancel writes nothing and target controls cannot redirect the current menu', async t => {
  const f=fixture(),page=f.page;t.after(()=>page.onUnload());await page.initializeWorkspace(source)
  page.onOpenSaveTarget();page.onCloseConfirmation();await page.onApproveReplacement();assert.equal(f.calls.length,0)
  page.onOpenSaveTarget();const reads=f.reads.length
  await page.onSaveTargetDate(dateEvent('2026-02-30'));await page.onSaveTargetDate(dateEvent('2026-10-11'))
  assert.equal(page.data.saveTarget.date,source.date);assert.equal(f.reads.length,reads)
  await page.onApproveReplacement();assert.equal(f.calls[0].body.targetDate,source.date)
})
test('busy confirmation locks changes, close, and duplicate submit; stale frozen menu cannot save', async t => {
  const f = fixture(), page = f.page; t.after(() => page.onUnload())
  await page.initializeWorkspace(source); await page.onOpenSaveTarget()
  await page.runCommand('undo'); await page.onApproveReplacement(); assert.equal(f.calls.length,0); assert.match(page.data.saveError,/菜单|方案/)
  page.onCloseConfirmation(); await page.onOpenSaveTarget()
  const wait = deferred(), original = f.api.confirmMealWorkspace; f.api.confirmMealWorkspace = async (id,body) => { await wait.promise; return original(id,body) }
  const saving = page.onApproveReplacement(); await page.onSaveTargetDate(dateEvent(source.date)); page.onCloseConfirmation(); await page.onApproveReplacement()
  assert.equal(page.data.confirmationVisible,true); assert.equal(page.data.saveTarget.date,source.date)
  wait.resolve(); await saving; assert.equal(f.calls.length,1)
})
test('legacy confirm omits optional targets and explicit targets validate before the HTTP boundary', async () => {
  const f = fixture(); await f.store.load(source.date,source.mealType); await f.store.confirm(0)
  assert.equal('targetDate' in f.calls[0].body,false); assert.equal('targetMealType' in f.calls[0].body,false)
  await assert.rejects(f.store.confirm(0,{date:'2026-02-30',mealType:'lunch'}),/日期/)
  assert.equal(f.calls.length,1)
})
test('shared save sheet displays the fixed meal without date or meal pickers', () => {
  const template = fs.readFileSync('templates/meal-workspace.wxml','utf8')
  const sheet = template.split('visible="{{confirmationVisible}}"')[1] || ''
  assert.doesNotMatch(sheet, /bindchange="onSaveTargetDate"/); assert.doesNotMatch(sheet, /bindchange="onSaveTargetMeal"/)
  assert.match(sheet, /saveDishSummary/); assert.match(sheet, /saveTargetLocked/); assert.match(sheet,/onRefreshSaveTarget/)
  assert.match(template, /bindtap="onViewSavedMeal"[^>]*>查看这餐/)
})
// Break: trusting an unrelated success response, or replacing A with the privacy-minimized receipt.
test('only the matching request version and exact target can acknowledge a calendar save', async t => {
  for (const field of ['requestId','planVersion','date','mealType','planRevision']) {
    const f = fixture(), page = f.page; t.after(() => page.onUnload())
    await page.initializeWorkspace(source); await page.onOpenSaveTarget(); await page.onSaveTargetDate(dateEvent(source.date))
    f.api.confirmMealWorkspace = async (id,body) => ({ ...plain(f.row()), revision:2, status:'planned', confirmation:{requestId:body.requestId,planVersion:body.planVersion,planRevision:1,date:body.targetDate,mealType:body.targetMealType,[field]:field.endsWith('Version') || field.endsWith('Revision') ? 88 : 'wrong'} })
    await page.onApproveReplacement()
    assert.equal(page.data.syncStatus,'unknown',field); assert.equal(page.data.savedTarget,null,field); assert.equal(page.data.confirmationVisible,true,field)
    assert.equal(page.store.state().pending.body.targetDate,source.date); assert.deepEqual(page.store.state().workspace.draft.dishes.map(d=>d.id),[7])
  }
})
test('a minimized request receipt retains A even when the subsequent source refresh is offline', async t => {
  const f = fixture(), page = f.page; t.after(() => page.onUnload())
  await page.initializeWorkspace(source); await page.onOpenSaveTarget(); await page.onSaveTargetDate(dateEvent(source.date))
  f.api.confirmMealWorkspace = async () => { throw Object.assign(Error('超时'),{statusCode:503}) }; await page.onApproveReplacement()
  const original = page.store.state().pending.body
  f.api.getWorkspaceRequest = async () => ({id:f.row().id,revision:2,status:'planned',context:{...f.row().context,requirements:'',criteria:{}},draft:{planVersion:3,dishes:[]},confirmation:{requestId:original.requestId,planVersion:3,planRevision:1,date:source.date,mealType:'dinner'}})
  f.api.getMealWorkspace = async () => { throw Error('刷新离线') }
  await page.onRetryWorkspace(); assert.deepEqual(page.store.state().workspace.draft.dishes.map(d=>d.id),[7]); assert.equal(page.data.context.date,source.date)
  assert.equal(page.data.savedMessage,'已保存到10月9日晚餐'); assert.equal(page.data.confirmationVisible,false)
})
test('a source-side 409 cannot be cleared by merely refreshing a new destination', async t => {
  const f = fixture(), page = f.page; t.after(() => page.onUnload())
  await page.initializeWorkspace(source); await page.onOpenSaveTarget(); await page.onSaveTargetDate(dateEvent(source.date))
  f.row().revision = 9
  f.api.confirmMealWorkspace = async () => { throw Object.assign(Error('本餐已更新'),{statusCode:409}) }
  await page.onApproveReplacement(); await page.onRefreshSaveTarget(); await page.onApproveReplacement()
  assert.equal(page.data.syncStatus,'conflict'); assert.match(page.data.saveError,/原菜单已在另一处变化/); assert.equal(page.data.confirmationVisible,true)
  assert.deepEqual(page.store.state().workspace.draft.dishes.map(d=>d.id),[7]); assert.equal(page.store.state().workspace.revision,1)
})
test('a late target read after account replacement cannot modify the new account panel', async t => {
  const f = fixture(), page = f.page; t.after(() => page.onUnload())
  await page.initializeWorkspace(source); await page.onOpenSaveTarget()
  const old = deferred(), read = f.api.getMealWorkspace
  f.api.getMealWorkspace = async (date,meal) => date === source.date ? old.promise : read(date,meal)
  const reading = page.onSaveTargetDate(dateEvent(source.date)); f.api.getMealWorkspace=read; f.switchAccount(); await page.initializeWorkspace(source); await page.onOpenSaveTarget()
  old.resolve({plan:{recipeName:'旧账户敏感菜单',revision:99},planRevision:99}); await reading
  assert.equal(page.data.saveTarget.date,source.date); assert.equal(page.data.saveNeedsReplacement,false); assert.doesNotMatch(page.data.confirmationText,/旧账户/)
})
test('Today follows the new day while an explicit old meal recovers the original pending save', async t => {
  const f = fixture(), page = f.page; t.after(() => page.onUnload())
  await page.initializeWorkspace({}); await page.onOpenSaveTarget(); await page.onSaveTargetDate(dateEvent('2026-10-10'))
  const original = f.api.confirmMealWorkspace
  f.api.confirmMealWorkspace = async (id,body) => { f.calls.push({id,body:plain(body)}); throw Object.assign(Error('超时'),{statusCode:503}) }
  await page.onApproveReplacement(); const sent = f.calls[0]
  f.midnight(); await page.initializeWorkspace({})
  assert.equal(page.data.context.date,'2026-10-10'); assert.equal(page.data.confirmationVisible,false)
  assert.equal(page.store.state().pending,null); assert.equal(f.calls.length,1)
  await page.initializeWorkspace(source)
  assert.equal(page.data.context.date,source.date); assert.equal(page.data.confirmationVisible,true); assert.equal(page.data.saveTarget.date,source.date)
  assert.equal(page.data.saveTargetLocked,true); assert.equal(page.store.state().pending.body.requestId,sent.body.requestId)
  f.api.confirmMealWorkspace = original; await page.onRetryWorkspace(); assert.deepEqual(f.calls[1].body,sent.body)
})
test('Today advances after midnight and the previous draft stays available only in its own account and date', async t => {
  const f = fixture(), page = f.page; t.after(() => page.onUnload())
  await page.initializeWorkspace({}); f.midnight(); await page.initializeWorkspace({})
  assert.equal(page.data.context.date,'2026-10-10'); assert.deepEqual(page.store.state().workspace.draft.dishes.map(d=>d.id),[9])
  await page.initializeWorkspace(source); assert.deepEqual(page.store.state().workspace.draft.dishes.map(d=>d.id),[7])
  f.switchAccount(); await page.initializeWorkspace({}); assert.equal(page.data.context.date,'2026-10-10'); assert.ok(page.store.state().workspace.id.startsWith('B:'))
})
// Declared WXML visibility only; the real page/store provide values and handlers.
// Native rendering/accessibility remains separate device acceptance.
function visibleSaveRecoveryActions(page) {
  const sheet = fs.readFileSync('templates/meal-workspace.wxml','utf8').split('visible="{{confirmationVisible}}"')[1].split('</ui-sheet>')[0]
  return Array.from(sheet.matchAll(/<ui-button wx:if="\{\{(.*?)\}\}"[^>]*bind:action="([^"]+)"/g))
    .filter(match => vm.runInNewContext(match[1],plain(page.data))).map(match => match[2])
}
// Break: gating retry on network status instead of the unresolved operation.
test('offline reopening offers the original pending save recovery inside the sheet', async t => {
  const f = fixture(), page = f.page; t.after(() => page.onUnload())
  await page.initializeWorkspace({}); await page.onOpenSaveTarget(); await page.onSaveTargetDate(dateEvent('2026-10-10'))
  const confirm = f.api.confirmMealWorkspace, read = f.api.getMealWorkspace
  f.api.confirmMealWorkspace = async (id,body) => { f.calls.push({id,body:plain(body)}); throw Object.assign(Error('保存超时'),{statusCode:503}) }
  await page.onApproveReplacement(); const sent = f.calls[0]
  f.api.getMealWorkspace = async () => { throw Error('原菜单读取离线') }
  await page.initializeWorkspace({})
  assert.equal(page.data.confirmationVisible,true); assert.equal(page.data.saveTargetLocked,true)
  assert.equal(page.data.savedTarget,null); assert.equal(page.data.savedMessage,'')
  assert.deepEqual(page.store.state().pending.body,sent.body); assert.equal(page.data.saveTarget.date,source.date)
  const actions = visibleSaveRecoveryActions(page)
  assert.ok(actions.includes('onRetryWorkspace'),'the unresolved save must expose its original-request recovery')
  assert.ok(!actions.includes('onRefreshSaveTarget'),'a pending save must not expose a refresh that cannot run')
  f.api.confirmMealWorkspace = confirm; f.api.getMealWorkspace = read
  await page[actions.find(action => action === 'onRetryWorkspace')]()
  assert.equal(f.calls.length,2); assert.deepEqual(f.calls[1].body,sent.body)
  assert.equal(page.data.confirmationVisible,false); assert.equal(page.data.savedMessage,'已保存到10月9日晚餐')
})
for (const reopen of [false,true]) test(`saved menu and next preferences survive midnight ${reopen?'reopening':'foreground'}`,async t=>{
 const f=fixture(source,'result'),page=f.page;t.after(()=>page.onUnload());await page.initializeWorkspace(source);page._params={...source}
 await page.onConfirmPlan();const dishes=plain(page.data.draft.dishes),version=page.data.draft.planVersion
 f.api.saveWorkspaceContext=async(id,body)=>{const old=f.rows.get(id),next={...old,revision:old.revision+1,context:plain(body.context)};f.rows.set(id,next);return plain(next)}
 await page.store.saveContext({...page.data.context,requirements:'下次清淡一点',compositionMode:'manual',counts:{meat:0,veg:2,soup:0,staple:0,dessert:0,side:0}});page.renderWorkspace()
 assert.equal(page.data.saveState,'saved');f.midnight();if(reopen)await page.initializeWorkspace(source);else await page.onShow()
 assert.equal(page.data.context.date,source.date);assert.equal(page.data.context.requirements,'下次清淡一点');assert.equal(page.data.context.counts.veg,2)
 assert.deepEqual(plain(page.data.draft.dishes),dishes);assert.equal(page.data.draft.planVersion,version);assert.equal(page.data.journeyRecovery,null)
})
