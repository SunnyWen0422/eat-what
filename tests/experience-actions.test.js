const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const rules = require('../utils/meal-workspace')
const plain = value => value == null ? value : JSON.parse(JSON.stringify(value))
const target = {date:'2026-10-06',mealType:'dinner'}
const actionModule = () => fs.existsSync('utils/meal-action-feedback.js') ? require('../utils/meal-action-feedback') : {}
const deferred = () => { let resolve,reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no}); return {promise,resolve,reject} }

// Explicit Page harness. Only HTTP/platform boundaries are substituted; this
// fixture does not initialize any model, planner or assistant generation flow.
function fixture(mode='today') {
  let account='A', failure=null, wait=null, requestReceipt=null
  const memory=new Map(),calls=[],navigation=[]
  let row={id:'workspace-A',revision:4,status:'draft',context:rules.normalizeContext({...target,people:2}),
    draft:{planVersion:3,dishes:[{id:7,name:'青菜',type:'veg'},{id:8,name:'番茄',type:'veg'}],lockedDishIds:[],history:[]}}
  const wx={getStorageSync:k=>plain(memory.get(k)),setStorageSync:(k,v)=>memory.set(k,plain(v)),removeStorageSync:k=>memory.delete(k),getAppBaseInfo:()=>({fontSizeScaleFactor:1}),navigateTo:o=>navigation.push(o.url),switchTab:o=>navigation.push(o.url)}
  const util={getCurrentUserIdentity:()=>account,getUserStorageKey:k=>account+':'+k}
  const api={getUserPreferences:async()=>({defaultPeople:2}),recordBehaviorEvent:async()=>{},
    getMealWorkspace:async()=>({workspace:plain(row),plan:null,planRevision:0}),
    getWorkspaceRequest:async()=>plain(requestReceipt),
    saveWorkspaceContext:async(id,body)=>{calls.push({type:'context',body:plain(body)});row={...row,context:plain(body.context),revision:row.revision+1};return plain(row)},
    commandMealWorkspace:async(id,body)=>{
      calls.push({type:'command',body:plain(body)});if(wait)await wait.promise;if(failure)throw failure
      const before=plain(row.draft),draft=plain(before)
      if(body.command==='replace'){draft.dishes=draft.dishes.map(d=>d.id===body.dishId?{id:9,name:'西兰花',type:'veg'}:d);draft.history=[...before.history,{...before,history:[]}]}
      if(body.command==='undo'){const restored=draft.history.pop();Object.assign(draft,restored,{history:draft.history})}
      if(body.releaseLegacyLocks)draft.lockedDishIds=[]
      draft.planVersion=before.planVersion+1;row={...row,draft,revision:row.revision+1,status:'draft'};return plain(row)
    },
  }
  const sandbox={module:{exports:{}},wx,console,setTimeout,clearTimeout,require:n=>n==='./api'?api:n==='./util'?util:n==='./meal-workspace'?{...rules,createWorkspaceStore:()=>rules.createWorkspaceStore({api,identity:util.getCurrentUserIdentity,read:wx.getStorageSync,write:wx.setStorageSync})}:require(path.resolve('utils',n))}
  vm.runInNewContext(fs.readFileSync('utils/meal-workspace-page.js','utf8'),sandbox)
  const page=sandbox.module.exports({mode});page.setData=v=>Object.assign(page.data,v);page._alive=true
  return {page,api,wx,memory,calls,navigation,row:()=>row,fail:e=>failure=e,wait:d=>wait=d,receipt:r=>requestReceipt=r,switch:()=>account='B'}
}
function feedbackInput(overrides={}) {
  const before={id:'w',revision:4,status:'draft',draft:{planVersion:3,dishes:[{id:7,name:'青菜'}],history:[]}}
  const command={command:'replace',dishId:7,expectedWorkspaceRevision:4,planVersion:3}
  const after={workspace:{...plain(before),revision:5,draft:{planVersion:4,dishes:[{id:9,name:'西兰花'}],history:[before.draft]}},syncStatus:'synced',actionReceipt:{requestId:'one',workspaceId:'w',revision:5,planVersion:4,taskId:null}}
  return {before,after,command,requestId:'one',...overrides}
}
test('real matched result says replaced dish and exposes real history undo',()=>{
  const derive=actionModule().deriveActionFeedback;assert.equal(typeof derive,'function')
  const feedback=derive(feedbackInput());assert.equal(feedback.state,'success');assert.equal(feedback.message,'已换为西兰花');assert.equal(feedback.undoAvailable,true)
})
test('unknown original request has neither success nor an effective undo',()=>{
  const derive=actionModule().deriveActionFeedback;assert.equal(typeof derive,'function')
  const input=feedbackInput();input.after.syncStatus='unknown';input.after.pending={type:'command',body:{requestId:'one'}}
  const feedback=derive(input);assert.equal(feedback.state, 'unknown');assert.equal(feedback.undoAvailable, false);assert.match(feedback.message,/原请求/)
})
test('mismatched request or later unrelated revision cannot report success',()=>{
  const derive=actionModule().deriveActionFeedback;assert.equal(typeof derive,'function')
  for(const patch of [{requestId:'other'},{revision:6}]){const input=feedbackInput();Object.assign(input.after.actionReceipt,patch);const feedback=derive(input);assert.notEqual(feedback.state,'success');assert.equal(feedback.undoAvailable,false)}
  const input=feedbackInput();input.after.workspace.revision=8;assert.notEqual(derive(input).state,'success')
})
test('replacement only marks that row busy and keeps old dishes until receipt',async t=>{
  const f=fixture(),page=f.page,waiting=deferred();t.after(()=>page.onUnload());await page.initializeWorkspace(target)
  f.wait(waiting);const pending=page.onReplace({detail:{id:7},currentTarget:{dataset:{}}});await new Promise(r=>setImmediate(r))
  assert.equal(page.data.draft.dishes[0].name,'青菜');assert.equal(page.data.draft.dishes[0].actionBusy,true);assert.equal(page.data.draft.dishes[1].actionBusy,false)
  await page.onReplace({detail:{id:8},currentTarget:{dataset:{}}});assert.equal(f.calls.length,1)
  waiting.resolve();await pending;assert.equal(page.data.actionFeedback.message,'已换为西兰花');assert.equal(page.data.draft.dishes[0].actionBusy,false)
  assert.equal(f.calls[0].body.dishId,7);assert.equal(f.calls[0].body.releaseLegacyLocks,true)
})
test('failure keeps original dishes and shows unknown request recovery',async t=>{
  const f=fixture(),page=f.page;t.after(()=>page.onUnload());await page.initializeWorkspace(target);const before=plain(page.data);f.fail({statusCode:503})
  await page.onReplace({detail:{id:7},currentTarget:{dataset:{}}});const afterFailure=plain(page.data)
  assert.deepEqual(afterFailure.draft.dishes, before.draft.dishes)
  assert.equal(afterFailure.actionFeedback.state,'unknown');assert.equal(afterFailure.actionFeedback.undoAvailable,false)
  await page.onRetryWorkspace();assert.equal(f.calls[0].body.requestId,f.calls[1].body.requestId)
})
test('undo restores the real menu snapshot and never rewrites a saved calendar plan',async t=>{
  const f=fixture(),page=f.page;t.after(()=>page.onUnload());f.row().confirmation={requestId:'saved',planVersion:3,date:target.date,mealType:target.mealType,planRevision:1}
  await page.initializeWorkspace(target);await page.onReplace({detail:{id:7},currentTarget:{dataset:{}}});await page.onUndo()
  assert.equal(page.data.draft.dishes[0].name,'青菜');assert.equal(page.data.actionFeedback.message,'已恢复青菜');assert.equal(page.data.saveState,'changed');assert.equal(f.row().confirmation.planVersion,3)
  assert.deepEqual(f.calls.map(c=>c.body.command),['replace','undo']);assert.ok(f.calls.every(c=>c.type==='command'))
})
test('legacyLocksStayVisibleUntilAtomicCommand',async t=>{
  const f=fixture(),page=f.page;t.after(()=>page.onUnload());f.row().draft.lockedDishIds=[7];await page.initializeWorkspace(target)
  assert.match(page.data.legacyLockNotice,/保留/);assert.equal(f.calls.length,0);assert.deepEqual(f.row().draft.lockedDishIds,[7])
  await page.onReplace({detail:{id:7},currentTarget:{dataset:{}}});assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.releaseLegacyLocks,true);assert.deepEqual(f.row().draft.lockedDishIds,[])
})
test('more operations use a visible sheet and requirements hold the sole meal conversation entry',async t=>{
  const f=fixture(),page=f.page;t.after(()=>page.onUnload());await page.initializeWorkspace(target);page.onToggleExtraActions();assert.equal(page.data.moreVisible,true)
  const template=fs.readFileSync('templates/meal-workspace.wxml','utf8');assert.match(template,/<ui-sheet[^>]*visible="\{\{moreVisible\}\}"/);assert.match(template,/<compact-dish-row/);assert.match(template,/<action-feedback/)
  assert.doesNotMatch(template,/workspace-keep-control|聊聊这餐/)
  const requirements=template.slice(template.indexOf('<ui-sheet visible="{{requirementsVisible}}"'),template.indexOf('<ui-sheet visible="{{settingsVisible}}"'))
  assert.match(requirements,/继续本餐对话/)
  assert.match(template,/<ui-sheet[^>]*moreVisible[\s\S]*预览保存计划与周回顾/)
})
test('late receipt cannot replace next account menu or feedback',async t=>{
  const f=fixture(),page=f.page,waiting=deferred();t.after(()=>page.onUnload());await page.initializeWorkspace(target);f.wait(waiting)
  const pending=page.onReplace({detail:{id:7},currentTarget:{dataset:{}}});await new Promise(r=>setImmediate(r));f.switch();await page.initializeWorkspace(target)
  const before=plain(page.data.draft);waiting.resolve();await pending;assert.deepEqual(plain(page.data.draft),before);assert.equal(page.data.actionFeedback,null)
})
test('minimized command receipt recovery retains old menu until authoritative reread',async t=>{
  const f=fixture(),page=f.page;t.after(()=>page.onUnload());await page.initializeWorkspace(target);f.fail({statusCode:503});await page.onReplace({detail:{id:7},currentTarget:{dataset:{}}})
  const body=f.calls[0].body;f.row().revision=body.expectedWorkspaceRevision+1;f.row().draft={...f.row().draft,planVersion:body.planVersion+1,dishes:[{id:9,name:'西兰花',type:'veg'},{id:8,name:'番茄',type:'veg'}],history:[{planVersion:3,dishes:[{id:7,name:'青菜'}]}]}
  f.receipt({...plain(f.row()),draft:{planVersion:body.planVersion+1,dishes:[],history:[],lockedDishIds:[]}});f.fail(null)
  await page.onRetryWorkspace();assert.equal(page.data.draft.dishes[0].name,'西兰花');assert.equal(page.data.actionFeedback.state,'success');assert.equal(f.calls.length,1)
})
test('minimized replay returned by the original command endpoint cannot erase the menu',async t=>{
  const f=fixture(),page=f.page;t.after(()=>page.onUnload());await page.initializeWorkspace(target)
  f.fail({statusCode:503});await page.onReplace({detail:{id:7},currentTarget:{dataset:{}}})
  const original=plain(f.calls[0].body),real=f.api.commandMealWorkspace
  f.fail(null)
  f.api.commandMealWorkspace=async(id,body)=>{
    assert.deepEqual(plain(body),original)
    const result=await real(id,body)
    return {...result,draft:{planVersion:result.draft.planVersion,dishes:[],lockedDishIds:[],history:[]}}
  }
  await page.onRetryWorkspace()
  assert.deepEqual(page.data.draft.dishes.map(d=>d.name),['西兰花','番茄'])
  assert.equal(page.data.actionFeedback.state,'success');assert.equal(f.calls.length,2)
})
test('offline authoritative read after a minimized replay preserves dishes and the original request',async t=>{
  const f=fixture(),page=f.page;t.after(()=>page.onUnload());await page.initializeWorkspace(target)
  f.fail({statusCode:503});await page.onReplace({detail:{id:7},currentTarget:{dataset:{}}})
  const original=plain(f.calls[0].body),command=f.api.commandMealWorkspace,read=f.api.getMealWorkspace
  f.fail(null)
  f.api.commandMealWorkspace=async(id,body)=>{
    const result=await command(id,body)
    f.receipt({...result,draft:{planVersion:result.draft.planVersion,dishes:[],lockedDishIds:[],history:[]}})
    return {...result,draft:{planVersion:result.draft.planVersion,dishes:[],lockedDishIds:[],history:[]}}
  }
  f.api.getMealWorkspace=async()=>{throw Error('暂时离线')}
  await page.onRetryWorkspace()
  assert.deepEqual(page.data.draft.dishes.map(d=>d.name),['青菜','番茄'])
  assert.deepEqual(page.store.state().pending.body,original)
  assert.equal(page.data.actionFeedback.state,'unknown');assert.equal(page.data.actionFeedback.undoAvailable,false)
  f.api.getMealWorkspace=read;await page.onRetryWorkspace()
  assert.deepEqual(page.data.draft.dishes.map(d=>d.name),['西兰花','番茄']);assert.equal(f.calls.length,2)
})
test('queued static acknowledgement stays pending until its exact completed revision is read',()=>{
  const input=feedbackInput(),derive=actionModule().deriveActionFeedback
  input.after.actionReceipt={...input.after.actionReceipt,planVersion:3,taskId:'task-one'}
  input.after.workspace={...plain(input.before),revision:5,status:'generating',taskId:'task-one'}
  assert.equal(derive(input).state,'pending');assert.equal(derive(input).undoAvailable,false)
  input.after.workspace={...feedbackInput().after.workspace,revision:6,taskId:null}
  input.after.actionTask={id:'task-one',workspaceId:'w',baseRevision:5,status:'draft'}
  assert.equal(derive(input).state,'success')
  input.after.workspace.revision=7;assert.equal(derive(input).state,'unknown')
})
test('another command at the expected revision cannot impersonate the original task completion',()=>{
  const input=feedbackInput(),derive=actionModule().deriveActionFeedback
  input.after.actionReceipt={...input.after.actionReceipt,planVersion:3,taskId:'original-task'}
  input.after.workspace.revision=6
  assert.equal(derive(input).state,'unknown')
  input.after.actionTask={id:'original-task',workspaceId:'w',baseRevision:5,status:'cancelled'}
  const feedback=derive(input);assert.equal(feedback.state,'error');assert.equal(feedback.undoAvailable,false)
})
test('reopening a completed static task verifies its original task identity before showing success',async t=>{
  const f=fixture(),page=f.page;t.after(()=>page.onUnload());await page.initializeWorkspace(target)
  f.api.commandMealWorkspace=async(id,body)=>{f.calls.push({type:'command',body:plain(body)});Object.assign(f.row(),{revision:5,status:'generating',taskId:'original-task'});return plain(f.row())}
  await page.onReplace({detail:{id:7},currentTarget:{dataset:{}}});page.stopTimers()
  assert.equal(page.data.actionFeedback.state,'pending')
  Object.assign(f.row(),{revision:6,status:'draft',taskId:null,draft:{...f.row().draft,planVersion:4,dishes:[{id:9,name:'西兰花',type:'veg'},{id:8,name:'番茄',type:'veg'}],history:[{dishes:[{id:7,name:'青菜'}]}]}})
  let taskReads=0
  f.api.getWorkspaceTask=async(id,taskId)=>{taskReads++;assert.equal(id,'workspace-A');assert.equal(taskId,'original-task');return {id:taskId,workspaceId:id,baseRevision:5,status:'draft'}}
  await page.initializeWorkspace(target)
  assert.equal(taskReads,1);assert.equal(page.data.actionFeedback.state,'success');assert.equal(page.data.actionFeedback.message,'已换为西兰花');assert.equal(f.calls.length,1)
})
test('a confirmed stop preserves menu version and never claims an unknown outcome',()=>{
  const input=feedbackInput(),derive=actionModule().deriveActionFeedback
  input.command.command='cancel';input.after.workspace={...plain(input.before),revision:5}
  input.after.actionReceipt.planVersion=3
  const feedback=derive(input)
  assert.equal(feedback.state,'success');assert.equal(feedback.message,'已停止，原菜单仍保留');assert.equal(feedback.undoAvailable,false)
})
test('unknown command disables the visible menu undo and replacement controls',async t=>{
  const f=fixture(),page=f.page;t.after(()=>page.onUnload());f.row().draft.history=[{dishes:[{id:6,name:'旧菜'}]}]
  await page.initializeWorkspace(target);f.fail({statusCode:503});await page.onReplace({detail:{id:7},currentTarget:{dataset:{}}})
  const template=fs.readFileSync('templates/meal-workspace.wxml','utf8')
  const disabled=template.match(/disabled="\{\{([^}]+)\}\}" bindtap="onUndo"/)[1]
  assert.equal(vm.runInNewContext(disabled,plain(page.data)),true)
  await page.onUndo();assert.equal(f.calls.length,1)
  assert.equal(page.data.actionFeedback.undoAvailable,false)
})
test('conflict retains legacy locks and old dishes without issuing a separate unlock',async t=>{
  const f=fixture(),page=f.page;t.after(()=>page.onUnload());f.row().draft.lockedDishIds=[7]
  await page.initializeWorkspace(target);f.fail({statusCode:409,message:'版本冲突'});await page.onReplace({detail:{id:7},currentTarget:{dataset:{}}})
  assert.equal(page.data.actionFeedback.state,'error');assert.equal(page.data.actionFeedback.undoAvailable,false)
  assert.deepEqual(f.row().draft.lockedDishIds,[7]);assert.equal(page.data.draft.dishes[0].name,'青菜');assert.equal(f.calls.length,1)
  await page.onRegenerate();assert.equal(f.calls.length,1)
})
test('late same-account response cannot overwrite the newly opened meal revision',async t=>{
  const f=fixture(),page=f.page,waiting=deferred();t.after(()=>page.onUnload());await page.initializeWorkspace(target)
  const oldResult={...plain(f.row()),revision:5,draft:{...plain(f.row().draft),planVersion:4,dishes:[{id:9,name:'旧响应'}]}}
  f.api.commandMealWorkspace=()=>waiting.promise
  const pending=page.onReplace({detail:{id:7},currentTarget:{dataset:{}}});await new Promise(r=>setImmediate(r))
  const newTarget={date:'2026-10-08',mealType:'lunch'}
  Object.assign(f.row(),{id:'another-meal',revision:20,context:rules.normalizeContext({...newTarget,people:3}),draft:{planVersion:12,dishes:[{id:11,name:'新餐菜单'}],lockedDishIds:[],history:[]}})
  await page.initializeWorkspace(newTarget);waiting.resolve(oldResult);await pending
  assert.equal(page.store.state().workspace.revision,20);assert.equal(page.data.draft.dishes[0].name,'新餐菜单');assert.equal(page.data.actionFeedback,null)
})
test('a superseded read cannot mark the next meal synced during receipt verification',async()=>{
  const f=fixture(),waiting=deferred(),nextTarget={date:'2026-10-08',mealType:'lunch'},read=f.api.getMealWorkspace
  f.api.getMealWorkspace=(date,meal)=>date===nextTarget.date?waiting.promise:read(date,meal)
  const store=rules.createWorkspaceStore({api:f.api,identity:()=> 'A',read:f.wx.getStorageSync,write:f.wx.setStorageSync})
  const first=store.load(target.date,target.mealType).then(()=>null,error=>error)
  await Promise.resolve()
  const next=store.load(nextTarget.date,nextTarget.mealType),firstError=await first,during=store.state()
  waiting.resolve({workspace:{...plain(f.row()),id:'next-meal',context:rules.normalizeContext({...nextTarget,people:2})}})
  await next;store.dispose()
  assert.match(firstError && firstError.message || '',/当前餐已切换/)
  assert.equal(during.syncStatus,'loading');assert.equal(during.workspace,null)
})
test('generation limitation keeps manual selection, dish reading and calendar accessible',async t=>{
  const f=fixture(),page=f.page;t.after(()=>page.onUnload());Object.assign(f.row(),{status:'needs_input',message:'智能服务暂不可用，本次安排未完成'})
  await page.initializeWorkspace(target)
  assert.match(page.data.generationLimitNotice,/自动安排/);assert.match(page.data.generationLimitNotice,/自己选菜/)
  assert.equal(page.data.contextLocked,false);assert.equal(page.data.busy,false)
  page.onDishOpen({currentTarget:{dataset:{id:7}}});page.onViewPlan();page.onChooseDishes()
  assert.deepEqual(f.navigation,['/pages/dish-detail/dish-detail?id=7&people=2','/pages/calendar-detail/calendar-detail?date=2026-10-06&mealType=dinner','/pages/customize/customize'])
  assert.equal(f.calls.length,0)
  const template=fs.readFileSync('templates/meal-workspace.wxml','utf8');assert.match(template,/generationLimitNotice/)
})
test('continuing this meal keeps its edited requirements and gives visible next-step feedback',async t=>{
  const f=fixture('assistant'),page=f.page;t.after(()=>page.onUnload());await page.initializeWorkspace(target)
  assert.equal(page.data.requirementsVisible,true);page.onRequirementsDraftInput({detail:{value:'清淡一点'}})
  await page.onContinueMealConversation();assert.equal(page.data.context.requirements,'清淡一点')
  assert.equal(page.data.requirementsVisible,false);assert.match(page.data.conversationNotice,/本餐要求/)
  assert.deepEqual(f.calls.map(c=>c.type),['context']);assert.equal(f.navigation.length,0)
  assert.match(fs.readFileSync('templates/meal-workspace.wxml','utf8'),/conversationNotice/)
})
test('assistant history shows the original meal before a read-only import handoff',async()=>{
  let history,scope='A';const memory=new Map(),navigation=[],calls=[]
  const oldTarget={date:'2026-09-30',mealType:'lunch'},current={date:'2026-10-06',mealType:'dinner'}
  memory.set('A:activeMealTarget',plain(current))
  const session={session_id:'old-session',state:{plan:{version:4,period:{people:3},meals:[{date:oldTarget.date,meal_type:oldTarget.mealType,dishes:[{id:7,name:'青菜'}]}]}},messages:[{role:'user',content:'历史要求'}]}
  const api={getAssistantSessions:async()=>({sessions:[{sessionId:'old-session',updatedAt:1}]}),getAssistantSession:async id=>{calls.push(id);return plain(session)}}
  vm.runInNewContext(fs.readFileSync('pages/assistant-history/assistant-history.js','utf8'),{Page:v=>history=v,console,wx:{getStorageSync:k=>plain(memory.get(k)),setStorageSync:(k,v)=>memory.set(k,plain(v)),navigateTo:o=>navigation.push(o.url)},require:n=>n.endsWith('/api')?api:n.endsWith('/util')?{getUserStorageKey:k=>scope+':'+k}:require(path.resolve('pages/assistant-history',n))})
  history.setData=v=>Object.assign(history.data,v);history.onLoad(current);await history.onShow();await history.onOpenSession({currentTarget:{dataset:{id:'old-session'}}})
  assert.equal(history.data.meals[0].date,oldTarget.date);assert.equal(history.data.meals[0].mealName,'午餐')
  assert.deepEqual(memory.get('A:activeMealTarget'),current);assert.equal(memory.size,1);assert.equal(navigation.length,0)
  await history.onImportMeal({currentTarget:{dataset:{index:0}}})
  assert.equal(navigation[0],'/pages/chat/chat?date=2026-09-30&mealType=lunch&import=history')
  assert.deepEqual(memory.get('A:pendingLegacyMealImport'),{sessionId:'old-session',date:oldTarget.date,mealType:oldTarget.mealType,planVersion:4})
  assert.deepEqual(memory.get('A:activeMealTarget'),current);assert.deepEqual(calls,['old-session','old-session']);history.onUnload()
})

// Upgrade cache, deferred HTTP receipt reads and context writes are static
// transport records. No model/planner/worker runtime is initialized below.
for(const route of ['receipt','replay'])for(const offline of [false,true])test(`pre-update pending command recovers via ${route}${offline?' after an offline source read':''} without changing its payload`,async t=>{
  const f=fixture(),page=f.page,before=plain(f.row()),body={requestId:'pre-update-original',expectedWorkspaceRevision:4,planVersion:3,command:'replace',dishId:7}
  t.after(()=>page.onUnload())
  const cached={workspace:before,context:before.context,linked:{},dirty:false,pending:{type:'command',id:before.id,body},syncStatus:'unknown'}
  f.memory.set(`user:A:meal-workspace:${target.date}:${target.mealType}`,plain(cached))
  const receipt={...plain(before),revision:5,status:'generating',taskId:'legacy-task',draft:{planVersion:3,dishes:[],history:[],lockedDishIds:[]}}
  Object.assign(f.row(),{revision:6,status:'draft',taskId:null,draft:{planVersion:4,dishes:[{id:9,name:'西兰花',type:'veg'},{id:8,name:'番茄',type:'veg'}],history:[before.draft],lockedDishIds:[]}})
  const read=f.api.getMealWorkspace
  f.api.getWorkspaceRequest=async(id,request)=>{assert.equal(id,before.id);assert.equal(request,body.requestId);return route==='receipt'?plain(receipt):null}
  f.api.commandMealWorkspace=async(id,sent)=>{f.calls.push({type:'command',body:plain(sent)});assert.equal(id,before.id);assert.deepEqual(plain(sent),body);return plain(receipt)}
  f.api.getWorkspaceTask=async()=>({id:'legacy-task',workspaceId:before.id,baseRevision:5,status:'draft'})
  await page.initializeWorkspace(target)
  assert.equal(page.store.state().lastAction,null)
  if(offline)f.api.getMealWorkspace=async()=>{throw Error('源菜单暂时离线')}
  await page.onRetryWorkspace()
  if(offline) {
    assert.deepEqual(page.data.draft.dishes.map(d=>d.name),['青菜','番茄'])
    assert.deepEqual(page.store.state().pending.body,body)
    assert.notEqual(page.data.actionFeedback && page.data.actionFeedback.state,'success')
    // The already accepted original request is now found; recovery must not
    // resend a second action just because the previous full read was offline.
    f.api.getWorkspaceRequest=async()=>plain(receipt);f.api.getMealWorkspace=read
    await page.onRetryWorkspace()
  }
  assert.equal(page.store.state().pending,null);assert.equal(page.data.syncStatus,'synced')
  assert.deepEqual(page.data.draft.dishes.map(d=>d.name),['西兰花','番茄'])
  assert.equal(page.data.actionFeedback.state,'success');assert.equal(page.data.actionFeedback.requestId,body.requestId)
  assert.equal(f.calls.length,route==='replay'?1:0)
  assert.equal(Object.prototype.hasOwnProperty.call(page.store.state().lastAction.command,'releaseLegacyLocks'),false)
})
test('legacy recovery without a reliable before snapshot restores the source without inventing success or undo',async t=>{
  const f=fixture(),page=f.page,before=plain(f.row()),body={requestId:'no-original-snapshot',expectedWorkspaceRevision:4,planVersion:3,command:'replace',dishId:7}
  t.after(()=>page.onUnload())
  f.memory.set(`user:A:meal-workspace:${target.date}:${target.mealType}`,{context:before.context,linked:{},dirty:false,pending:{type:'command',id:before.id,body},syncStatus:'unknown'})
  Object.assign(f.row(),{revision:6,draft:{planVersion:4,dishes:[{id:9,name:'已完成菜单'}],history:[before.draft],lockedDishIds:[]}})
  f.api.getWorkspaceRequest=async()=>({...plain(before),revision:5,status:'generating',taskId:'legacy-task',draft:{planVersion:3,dishes:[],history:[],lockedDishIds:[]}})
  f.api.getWorkspaceTask=async()=>({id:'legacy-task',workspaceId:before.id,baseRevision:5,status:'draft'})
  await page.initializeWorkspace(target);await page.onRetryWorkspace()
  assert.equal(page.store.state().pending,null);assert.equal(page.data.draft.dishes[0].name,'已完成菜单')
  assert.notEqual(page.data.actionFeedback && page.data.actionFeedback.state,'success')
  assert.equal(!!(page.data.actionFeedback && page.data.actionFeedback.undoAvailable),false)
  assert.equal(f.calls.length,0)
})

for(const outcome of ['resolve','reject'])for(const newState of ['success','pending','unknown'])test(`old verification ${outcome} cannot overwrite a newer stop ${newState}`,async t=>{
  const f=fixture(),page=f.page,verifying=deferred(),started=deferred(),stopping=deferred()
  t.after(()=>page.onUnload())
  f.api.commandMealWorkspace=async(id,body)=>{
    f.calls.push({type:'command',body:plain(body)})
    if(body.command==='cancel') {
      if(newState==='pending')await stopping.promise
      if(newState==='unknown')throw {statusCode:503,message:'停止结果待确认'}
      Object.assign(f.row(),{revision:body.expectedWorkspaceRevision+1,status:'draft',taskId:null,message:'已停止'})
    } else Object.assign(f.row(),{revision:5,status:'generating',taskId:'original-task'})
    return plain(f.row())
  }
  await page.initializeWorkspace(target);await page.onReplace({detail:{id:7},currentTarget:{dataset:{}}});page.stopTimers()
  const before=plain(f.row().draft)
  Object.assign(f.row(),{revision:6,status:'draft',taskId:null,draft:{...before,planVersion:4,dishes:[{id:9,name:'西兰花'}],history:[before]}})
  f.api.getWorkspaceTask=async()=>{started.resolve();return verifying.promise}
  const reading=page.readWorkspace(target);await started.promise
  assert.equal(page.data.status,'generating')
  const stop=page.onCancelTask();await new Promise(resolve=>setImmediate(resolve))
  if(newState!=='pending')await stop
  const latest=plain(page.store.state()),feedback=plain(page.data.actionFeedback),error=page.data.errorMessage
  if(outcome==='resolve')verifying.resolve({id:'original-task',workspaceId:f.row().id,baseRevision:5,status:'draft'})
  else verifying.reject(Error('旧任务核对失败'))
  await reading
  assert.deepEqual(plain(page.store.state()),latest)
  assert.deepEqual(plain(page.data.actionFeedback),feedback);assert.equal(page.data.errorMessage,error)
  if(newState==='pending') {
    assert.equal(page.data.syncStatus,'saving');assert.equal(page.data.busy,true)
    stopping.resolve();await stop
  }
  if(newState==='unknown') {
    assert.equal(page.data.syncStatus,'unknown');assert.equal(page.data.errorMessage,'停止结果待确认')
    assert.equal(page.store.state().pending.body.requestId,f.calls[1].body.requestId)
  } else {assert.equal(page.data.syncStatus,'synced');assert.equal(page.data.actionFeedback.state,'success')}
})
for(const failure of ['transport','wrong-task'])test(`a current ${failure} verification failure remains recoverable without another command`,async t=>{
  const f=fixture(),page=f.page;t.after(()=>page.onUnload())
  f.api.commandMealWorkspace=async(id,body)=>{f.calls.push({type:'command',body:plain(body)});Object.assign(f.row(),{revision:5,status:'generating',taskId:'original-task'});return plain(f.row())}
  await page.initializeWorkspace(target);await page.onReplace({detail:{id:7},currentTarget:{dataset:{}}});page.stopTimers()
  const before=plain(f.row().draft)
  Object.assign(f.row(),{revision:6,status:'draft',taskId:null,draft:{...before,planVersion:4,dishes:[{id:9,name:'西兰花'}],history:[before]}})
  f.api.getWorkspaceTask=async()=>{if(failure==='transport')throw Error('任务回执暂时离线');return {id:'unrelated-task',workspaceId:f.row().id,baseRevision:5,status:'draft'}}
  await page.readWorkspace(target)
  assert.equal(page.data.syncStatus,'offline');assert.equal(page.data.actionFeedback.state,'unknown');assert.equal(page.data.actionFeedback.undoAvailable,false)
  assert.equal(page.data.primaryAction,'onRetryWorkspace');assert.equal(page.store.state().lastAction.task,undefined)
  f.api.getWorkspaceTask=async()=>({id:'original-task',workspaceId:f.row().id,baseRevision:5,status:'draft'})
  await page.onRetryWorkspace()
  assert.equal(page.data.syncStatus,'synced');assert.equal(page.data.actionFeedback.state,'success');assert.equal(page.data.actionFeedback.message,'已换为西兰花')
  assert.equal(f.calls.length,1);assert.equal(page.store.state().pending,null)
})

for(const mode of ['today','result','assistant'])for(const changed of ['account','target'])for(const outcome of ['resolve','reject'])test(`stale ${mode} continuation ${outcome} cannot act after ${changed} switch`,async t=>{
  const f=fixture(mode),page=f.page,saving=deferred(),started=deferred()
  t.after(()=>page.onUnload())
  await page.initializeWorkspace(target);if(mode!=='assistant')page.onOpenRequirements()
  page.onRequirementsDraftInput({detail:{value:'原账号的本餐要求'}})
  const original=plain(f.row())
  f.api.saveWorkspaceContext=async(id,body)=>{f.calls.push({type:'context',body:plain(body)});started.resolve();await saving.promise;return {...original,revision:original.revision+1,context:plain(body.context)}}
  const continuing=page.onContinueMealConversation();await started.promise
  if(changed==='account')f.switch()
  const next={date:'2026-10-08',mealType:'lunch'}
  Object.assign(f.row(),{id:'next-meal',context:rules.normalizeContext({...next,people:3})})
  await page.initializeWorkspace(next);if(mode==='assistant')page.onCancelRequirements()
  const newView=plain(page.data)
  if(outcome==='resolve')saving.resolve();else saving.reject(Error('原账号保存失败'))
  await continuing
  assert.deepEqual(f.navigation,[]);assert.equal(page.data.conversationNotice,'')
  assert.equal(page.data.context.date,next.date);assert.equal(page.data.context.mealType,next.mealType)
  assert.deepEqual(plain(page.data.draft),newView.draft);assert.equal(page.data.errorMessage,newView.errorMessage)
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.context.date,target.date)
})
for(const mode of ['today','result'])test(`${mode} continuation opens only the successfully applied original meal`,async t=>{
  const f=fixture(mode),page=f.page;t.after(()=>page.onUnload());await page.initializeWorkspace(target)
  page.onOpenRequirements();page.onRequirementsDraftInput({detail:{value:'清淡一些'}});await page.onContinueMealConversation()
  assert.deepEqual(f.navigation,['/pages/chat/chat?date=2026-10-06&mealType=dinner'])
  assert.equal(page.data.context.requirements,'清淡一些');assert.equal(f.calls.length,1)
})
