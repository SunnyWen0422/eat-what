const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,plain,target,deferred}=require('./fixtures/workspace-flow')
const assistantPage=require('../utils/assistant-page')
const {workspaceReference}=require('../utils/meal-workspace')
const {createAssistantConversation}=require('../utils/assistant-conversation')
const {presentMenuActions}=require('../utils/assistant-cards')

async function setup(t){
 const f=fixture(),page=assistantPage(f.createPage('assistant'),{api:f.api,platform:f.wx})
 page.setData=(data,cb)=>{Object.assign(page.data,data);if(cb)cb()}
 page._assistantAlive=true;page._alive=true;page._assistantVisible=false
 await page.initializeWorkspace(target)
 const state={messages:[],input:'未发送的想法',busy:false,recoverable:false,turn:null}
 page.conversation={state:()=>state,dispose(){}}
 page.data.assistantConnected=true;page.renderWorkspace()
 t.after(()=>page.onUnload())
 return {...f,page,state,action(action,cardId='current-menu',expectedRef=workspaceReference(page.store.state().workspace)){
  return page.onConversationDishAction({detail:{cardId,action,expectedRef}})
 }}
}
test('view opens the current menu independently of the settings panel',async t=>{
 const f=await setup(t)
 await f.action('current')
 assert.equal(f.page.data.conversationMenuExpanded,false)
 assert.equal(f.page.data.conversationCurrentMenuVisible,true)
 assert.equal(f.page.data.conversationScrollTarget,'conversation-current-menu')
 assert.equal(f.state.input,'未发送的想法')
})
test('current menu has a visible undo action based on real history, independent of latest dialogue',async t=>{
 const f=await setup(t),w=f.row()
 w.draft.history=[{dishes:[{id:8,name:'番茄炒蛋'}]}]
 await f.page.store.reloadLatest();f.page.renderWorkspace()
 assert.equal(f.page.data.conversationCurrentMenu.menuActions.canUndo,true)
 await f.action('undo')
 assert.equal(f.calls.filter(c=>c.type==='command'&&c.body.command==='undo').length,1)
})
test('adopt saves exactly this meal once and marks the matching receipt adopted',async t=>{
 const f=await setup(t)
 const original=plain(f.page.data.conversationCurrentMenu)
 await f.action('adopt')
 const writes=f.calls.filter(c=>c.type==='confirm')
 assert.equal(writes.length,1)
 assert.equal(writes[0].body.targetDate,target.date);assert.equal(writes[0].body.targetMealType,target.mealType)
 assert.deepEqual(f.plans.get(f.row().id).dishIds,[7])
 assert.equal(f.page.data.conversationCurrentMenu.menuActions.adopted,true)
 assert.equal(presentMenuActions({card:original,workspace:f.page.store.state().workspace,workspaceState:f.page.store.state(),conversationState:f.state}).adopted,true)
 await f.action('adopt');assert.equal(f.calls.filter(c=>c.type==='confirm').length,1)
 assert.equal(f.state.input,'未发送的想法')
})
test('replacement of an existing calendar meal is explicit and cancellation writes nothing',async t=>{
 const f=await setup(t)
 f.plans.set(f.row().id,{revision:4,dishIds:[9],dishDetails:[{id:9,name:'鱼汤'}]})
 let prompt
 f.wx.showModal=options=>{prompt=options;options.success({confirm:false})}
 await f.action('adopt')
 assert.equal(prompt.confirmText,'采用');assert.equal(prompt.cancelText,'取消')
 assert.equal(f.calls.length,0);assert.deepEqual(f.plans.get(f.row().id).dishIds,[9])
 f.wx.showModal=options=>options.success({confirm:true})
 await f.action('adopt')
 assert.equal(f.calls.filter(c=>c.type==='confirm').length,1)
 assert.equal(f.calls[0].body.expectedPlanRevision,4)
})
test('double tap during adoption makes one write',async t=>{
 const f=await setup(t),hold=deferred(),started=deferred(),confirm=f.api.confirmMealWorkspace
 f.api.confirmMealWorkspace=async(...args)=>{started.resolve();await hold.promise;return confirm(...args)}
 const save=f.action('adopt');await started.promise
 await f.action('adopt');hold.resolve();await save
 assert.equal(f.calls.filter(c=>c.type==='confirm').length,1)
})
test('changing menu while replacement prompt is open cannot save the changed meal',async t=>{
 const f=await setup(t),started=deferred();let modal
 f.plans.set(f.row().id,{revision:1,dishIds:[9]})
 f.wx.showModal=options=>{modal=options;started.resolve()}
 const save=f.action('adopt');await started.promise
 f.row().revision++;f.row().draft.planVersion++;await f.page.store.reloadLatest()
 modal.success({confirm:true});await save
 assert.equal(f.calls.length,0)
})
test('account change during adoption read cannot save or update the other account',async t=>{
 const f=await setup(t),hold=deferred(),read=f.api.getMealWorkspace,before=await read(target.date,target.mealType)
 f.api.getMealWorkspace=()=>hold.promise
 const save=f.action('adopt');f.switchAccount();hold.resolve(before);await save
 assert.equal(f.calls.length,0)
})
test('adoption discovers a newer remote menu and makes View show it without saving',async t=>{
 const f=await setup(t),row=f.row()
 row.revision++;row.draft.planVersion++;row.draft.dishes=[{id:9,name:'鱼汤'}]
 await f.action('adopt')
 assert.equal(f.calls.length,0)
 await f.action('current')
 assert.deepEqual(f.page.data.conversationCurrentMenu.data.dishes.map(d=>d.id),[9])
 assert.equal(f.page.data.conversationMenuExpanded,false)
})
test('definitive save conflict does not create an unknown request or retry write',async t=>{
 const f=await setup(t)
 f.api.confirmMealWorkspace=async()=>{f.calls.push({type:'rejected'});throw {statusCode:409,message:'日历安排已变化，请查看最新菜单后重试'}}
 await f.action('adopt');await f.action('adopt')
 assert.equal(f.calls.length,1);assert.equal(f.page.store.state().pending,null)
 assert.equal(f.page.store.state().syncStatus,'conflict')
 assert.equal(f.page.data.conversationWorkspaceRecoverable,true)
})
test('stale card cannot adopt or undo a different menu',async t=>{
 const f=await setup(t),w=f.row(),old={id:'old',type:'menu',workspaceRef:workspaceReference(w),data:{...target,dishes:plain(w.draft.dishes),canUndo:true}}
 f.state.messages=[{id:'turn',cards:[old]}]
 w.revision++;w.draft.planVersion++;await f.page.store.reloadLatest();f.page.renderWorkspace()
 await f.action('adopt','old',old.workspaceRef);await f.action('undo','old',old.workspaceRef)
 assert.equal(f.calls.length,0)
})
test('unknown adoption restores by the original request without a second calendar write',async t=>{
 const f=await setup(t),confirm=f.api.confirmMealWorkspace;let receipt
 f.api.confirmMealWorkspace=async(...args)=>{receipt=await confirm(...args);throw Error('lost response')}
 f.api.getWorkspaceRequest=async()=>receipt
 await f.action('adopt')
 assert.equal(f.page.store.state().pending.type,'confirm')
 assert.equal(f.page.data.conversationCurrentMenu.menuActions.canAdopt,false)
 await f.action('adopt');assert.equal(f.calls.filter(c=>c.type==='confirm').length,1)
 await f.page.onConversationWorkspaceRecover()
 assert.equal(f.page.store.state().pending,null)
 assert.equal(f.page.data.conversationCurrentMenu.menuActions.adopted,true)
 assert.equal(f.calls.filter(c=>c.type==='confirm').length,1)
})
test('current menu writes stay disabled during a pending assistant action or unsaved settings',async t=>{
 const f=await setup(t),card=f.page.data.conversationCurrentMenu,local=f.page.store.state()
 for(const update of [{pending:{type:'command'}},{dirty:true},{syncStatus:'offline'}]){
  const actions=presentMenuActions({card,workspace:local.workspace,conversationState:f.state,workspaceState:{...local,...update}})
  assert.equal(actions.canAdopt,false);assert.equal(actions.canUndo,false)
 }
 f.state.recoverable=true;await f.action('adopt');assert.equal(f.calls.length,0)
})
test('completed assistant menu survives failed synchronization, recovery and return to home',async t=>{
 const f=fixture(),home=f.createPage('today'),chat=assistantPage(f.createPage('assistant'))
 home._params={...target};await home.initializeWorkspace(target);await chat.initializeWorkspace(target)
 t.after(()=>{home.onUnload();chat.onUnload()})
 const before=f.row();before.draft.dishes=[]
 await home.store.reloadLatest();await chat.store.reloadLatest()
 let failRead=false,sends=0
 const read=f.api.getMealWorkspace
 f.api.getMealWorkspace=async(...args)=>{if(failRead)throw Error('offline');return read(...args)}
 const ref={workspaceId:before.id,workspaceRevision:2,planVersion:2}
 const turn={turnId:'turn',status:'completed',reply:'本餐已调整',workspaceRef:ref,cards:[{id:'menu',type:'menu',workspaceRef:ref,data:{...target,people:2,canUndo:true,dishes:[{id:8,name:'番茄炒蛋'}]}}]}
 f.api.createAssistantV4Session=async()=>({sessionId:'session',messages:[]})
 f.api.getAssistantV4Session=async()=>({sessionId:'session',messages:[],latestTurn:turn})
 f.api.sendAssistantV4Turn=async()=>{sends++;const row=f.row();row.revision=2;row.draft.planVersion=2;row.draft.dishes=plain(turn.cards[0].data.dishes);failRead=true;return {turnId:'turn'}}
 f.api.getAssistantV4Turn=async()=>turn
 const opts={api:f.api,workspaceStore:chat.store,identity:()=> 'A',source:()=> 'isolated',read:f.wx.getStorageSync,write:f.wx.setStorageSync}
 let conversation=createAssistantConversation(opts)
 await conversation.load();await conversation.send('安排这餐')
 assert.equal(conversation.state().recoverable,true)
 assert.match(conversation.state().error,/同步|菜单/)
 conversation.setInput('保留我正在输入的文字')
 conversation.dispose();conversation=createAssistantConversation(opts);await conversation.load()
 assert.equal(conversation.state().recoverable,true)
 failRead=false;await conversation.recover()
 assert.equal(conversation.state().recoverable,false)
 assert.equal(conversation.state().input,'保留我正在输入的文字')
 assert.equal(sends,1)
 await home.onShow()
 assert.deepEqual(home.data.draft.dishes.map(d=>d.id),[8])
 conversation.dispose()
})
test('a successful but stale workspace response stays recoverable instead of enabling another generation',async t=>{
 const f=fixture(),page=f.createPage('assistant');await page.initializeWorkspace(target)
 t.after(()=>page.onUnload())
 const original=await f.api.getMealWorkspace(target.date,target.mealType)
 const turn={turnId:'turn',status:'completed',cards:[],workspaceRef:{workspaceId:f.row().id,workspaceRevision:3,planVersion:2}}
 let sends=0
 const opts={api:{createAssistantV4Session:async()=>({sessionId:'s',messages:[]}),
  sendAssistantV4Turn:async()=>{sends++;return {turnId:'turn'}},getAssistantV4Turn:async()=>turn},
  workspaceStore:page.store,identity:()=> 'A',source:()=> 'isolated',read:f.wx.getStorageSync,write:f.wx.setStorageSync}
 f.api.getMealWorkspace=async()=>original
 const conversation=createAssistantConversation(opts);t.after(()=>conversation.dispose())
 await conversation.load();await conversation.send('推荐晚餐')
 assert.equal(conversation.state().recoverable,true)
 await conversation.send('换一套');assert.equal(sends,1)
 await conversation.recover();assert.equal(conversation.state().recoverable,true)
})
test('home shows a newer assistant menu without replaying an older undo notice',async t=>{
 const f=fixture(),home=f.createPage('today');home._params={...target}
 await home.initializeWorkspace(target);t.after(()=>home.onUnload())
 await home.runCommand('undo');assert.equal(home.data.actionFeedback.kind,'undo')
 const row=f.row();row.revision++;row.draft.planVersion++;row.draft.dishes=[{id:8,name:'番茄炒蛋'}]
 await home.onShow()
 assert.deepEqual(home.data.draft.dishes.map(d=>d.id),[8])
 assert.equal(home.data.actionFeedback,null)
})
for(const kind of ['pending','dirty','dirty-offline'])test(`completed menu sync recovers with ${kind} local settings without regenerating`,async t=>{
 const f=await setup(t),page=f.page,read=f.api.getMealWorkspace,save=f.api.saveWorkspaceContext
 let offline=false,sends=0
 const turn={turnId:'sync-turn',status:'completed',cards:[],workspaceRef:{workspaceId:f.row().id,workspaceRevision:2,planVersion:2}}
 f.api.createAssistantV4Session=async()=>({sessionId:'sync-session',messages:[]})
 f.api.sendAssistantV4Turn=async()=>{sends++;f.row().revision=2;f.row().draft.planVersion=2;offline=true;return{turnId:turn.turnId}}
 f.api.getAssistantV4Turn=async()=>turn
 f.api.getMealWorkspace=async(...args)=>{if(offline)throw Error('offline');return read(...args)}
 const c=createAssistantConversation({api:f.api,workspaceStore:page.store,identity:()=> 'A',source:()=> 'isolated',read:f.wx.getStorageSync,write:f.wx.setStorageSync})
 page.conversation=c
 await c.load();await c.send('推荐这餐')
 assert.equal(c.state().workspaceSyncPending,true)
 c.setInput('未发送的想法')
 const context={...page.store.state().context,requirements:'少油'}
 if(kind==='pending'){
  f.api.saveWorkspaceContext=async()=>{throw Error('offline')}
  await assert.rejects(page.store.saveContext(context))
  assert.ok(page.store.state().pending)
 }else page.store.edit(context)
 page.renderWorkspace()
 if(kind==='dirty-offline'){
  await page.onConversationRecover()
  assert.equal(page.store.state().dirty,true,'failed reread must retain persisted local edits')
  assert.equal(page.store.state().context.requirements,'少油')
 }
 offline=false;f.api.saveWorkspaceContext=save
 await page.onConversationRecover()
 assert.equal(c.state().recoverable,false)
 assert.equal(page.store.state().pending,null)
 assert.equal(c.state().input,'未发送的想法')
 assert.equal(sends,1)
 if(kind==='pending')assert.equal(page.store.state().context.requirements,'少油')
 else{
  assert.equal(page.data.conflictDraftAvailable,true)
  assert.equal(page._preservedContext.requirements,'少油')
  page.onConversationRestoreDraft()
  assert.equal(page.store.state().context.requirements,'少油')
  assert.equal(page.store.state().dirty,true)
 }
})
test('failed latest-menu read preserves edits typed while it was in flight',async t=>{
 const f=await setup(t),store=f.page.store,hold=deferred()
 store.edit({...store.state().context,requirements:'旧输入'})
 f.api.getMealWorkspace=()=>hold.promise
 const loading=store.reloadLatest()
 store.edit({...store.state().context,requirements:'刚刚补充的新输入'})
 hold.reject(Error('offline'))
 await assert.rejects(loading)
 assert.equal(store.state().dirty,true)
 assert.equal(store.state().context.requirements,'刚刚补充的新输入')
})
