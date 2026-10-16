const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,deferred,plain,target}=require('./fixtures/workspace-flow')
const assistantPage=require('../utils/assistant-page')
const {presentMenuActions}=require('../utils/assistant-cards')
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const ref=w=>({workspaceId:w.id,workspaceRevision:w.revision,planVersion:w.draft.planVersion,date:w.context.date,mealType:w.context.mealType})
async function setup(t){
 const f=fixture(),page=assistantPage(f.createPage('chat'))
 page.setData=(value,cb)=>{Object.assign(page.data,value);if(cb)cb()};page._assistantAlive=true;page._alive=true
 await page.initializeWorkspace(target)
 let sends=0
 const state={messages:[],input:'',busy:false,recoverable:false,turn:null}
 page.conversation={state:()=>state,setInput:v=>state.input=v,send:()=>sends++,dispose(){}}
 page.data.assistantConnected=true;page.renderWorkspace()
 t.after(()=>page.onUnload())
 const action=(action='keep',expectedRef=ref(page.store.state().workspace),cardId='current-menu')=>page.onConversationDishAction({detail:{cardId,dishId:7,action,expectedRef}})
 return {...f,page,state,action,sends:()=>sends}
}
test('direct dish action does not send a model turn',async t=>{
 const f=await setup(t),original=plain(f.state.messages)
 await f.action();assert.equal(f.calls.filter(c=>c.type==='command').length,1);assert.equal(f.calls[0].body.command,'keep');assert.equal(f.sends(),0)
 assert.deepEqual(f.state.messages,original);assert.equal(f.page.data.conversationCurrentMenu.menuActions.rows[0].locked,true)
 await f.action('release');assert.equal(f.calls[1].body.command,'release');assert.equal(f.sends(),0)
})
test('reference is checked after asynchronous draft flush',async t=>{
 const f=await setup(t),hold=deferred(),started=deferred(),before=ref(f.page.store.state().workspace)
 f.page.flushDraft=async()=>{started.resolve();await hold.promise}
 const run=f.action('replace',before);await started.promise
 await f.page.store.load(target.date,'lunch');hold.resolve();await run
 assert.equal(f.calls.filter(c=>c.type==='command').length,0);assert.equal(f.sends(),0)
})
for(const field of ['workspaceId','workspaceRevision','planVersion','date','mealType'])test(`changed ${field} after draft flush rejects the frozen reference`,async t=>{
 const f=await setup(t),hold=deferred(),started=deferred(),before=ref(f.page.store.state().workspace)
 f.page.flushDraft=async()=>{started.resolve();await hold.promise}
 const run=f.action('keep',before);await started.promise
 const row=f.row();if(field==='workspaceId')row.id='other';else if(field==='workspaceRevision')row.revision++;else if(field==='planVersion')row.draft.planVersion++;else row.context[field]=field==='date'?'2026-10-07':'lunch'
 await f.page.store.reloadLatest();hold.resolve();await run
 assert.equal(f.calls.filter(c=>c.type==='command').length,0)
})
test('store checks expected reference again after its asynchronous save',async t=>{
 const f=await setup(t),store=f.page.store,before=ref(store.state().workspace)
 store.edit({...store.state().context,requirements:'清淡'})
 await assert.rejects(store.command('keep',{dishId:7},before),/变化|核对/)
 assert.equal(f.calls.filter(c=>c.type==='context').length,1);assert.equal(f.calls.filter(c=>c.type==='command').length,0)
})
for(const flag of ['confirmationPending','selectionPending','recoverable','busy'])test(`pending confirmation blocks competing command: ${flag}`,async t=>{
 const f=await setup(t);f.state[flag]=true;await f.action('replace');assert.equal(f.calls.length,0)
})
test('confirmation that arrives during flush blocks the direct command',async t=>{
 const f=await setup(t),hold=deferred(),started=deferred()
 f.page.flushDraft=async()=>{started.resolve();await hold.promise}
 const run=f.action();await started.promise;f.state.confirmationPending=true;hold.resolve();await run;assert.equal(f.calls.length,0)
})
for(const flag of ['confirmationPending','selectionPending','recoverable'])test(`${flag} during internal store save blocks command freeze with unchanged reference`,async t=>{
 const f=await setup(t),hold=deferred(),started=deferred(),before=plain(f.page.store.state().workspace)
 // Keep reference values equal to isolate the live conversation guard from the
 // independently tested version guard. No HTTP or external account is used.
 f.api.saveWorkspaceContext=async(_id,body)=>{started.resolve();await hold.promise;return {...before,context:body.context}}
 f.page.flushDraft=async()=>{}
 f.page.store.edit({...f.page.store.state().context,requirements:'清淡'})
 const run=f.action();await started.promise;f.state[flag]=true;hold.resolve();await run
 assert.equal(f.calls.filter(c=>c.type==='command').length,0);assert.deepEqual(ref(f.page.store.state().workspace),ref(before))
})
test('unknown replacement recovers original command',async t=>{
 const f=await setup(t),queries=[];let original
 f.api.commandMealWorkspace=async(id,body)=>{original={id,body:plain(body)};f.calls.push(original);throw Error('lost')}
 await f.action('replace');assert.equal(f.page.store.state().syncStatus,'unknown');assert.equal(f.page.data.conversationWorkspaceRecoverable,true)
 await f.action('replace');assert.equal(f.calls.length,1)
 const result={...f.row(),revision:2,draft:{...f.row().draft,planVersion:2,dishes:[{id:8,name:'豆腐'}]}}
 f.rows.set(result.id,result);f.api.getWorkspaceRequest=async(id,requestId)=>{queries.push({id,requestId});return result}
 await f.page.onConversationWorkspaceRecover();assert.deepEqual(queries,[{id:original.id,requestId:original.body.requestId}]);assert.equal(f.calls.length,1);assert.equal(f.sends(),0)
 assert.deepEqual(f.state.messages,[]);assert.equal(f.page.data.conversationWorkspaceFeedback,'已换为豆腐')
})
async function conflict(f){
 const command=f.api.commandMealWorkspace;let rejected=0
 f.api.commandMealWorkspace=async(id,body)=>{if(!rejected++){f.calls.push({type:'command',id,body:plain(body)});throw {statusCode:409}}return command(id,body)}
 await f.action();return f
}
test('409 offers current-authority recovery and consistently disables sending',async t=>{
 const f=await conflict(await setup(t));assert.equal(f.page.store.state().syncStatus,'conflict');assert.equal(f.page.store.state().pending,null)
 assert.equal(f.page.data.conversationWorkspaceRecoverable,true);assert.equal(f.page.data.conversationWorkspaceBlocked,true);assert.equal(f.page.workspaceBlocksConversation(),true)
})
test('409 recovery reads current authority, preserves input and never replays the rejected command',async t=>{
 const f=await conflict(await setup(t));f.state.input='还没发送的想法';f.page.store.edit({...f.page.store.state().context,requirements:'本餐未同步条件'});f.page.renderWorkspace()
 const old=f.row(),latest={...old,revision:4,context:{...old.context,requirements:'另一处条件'},draft:{...old.draft,planVersion:3}}
 f.rows.set(latest.id,latest);let reads=0;const get=f.api.getMealWorkspace;f.api.getMealWorkspace=async(...args)=>{reads++;return get(...args)}
 await f.page.onConversationWorkspaceRecover();assert.equal(reads,1);assert.equal(f.calls.length,1);assert.equal(f.page.store.state().workspace.revision,4);assert.equal(f.page.data.conversationWorkspaceBlocked,false)
 assert.equal(f.state.input,'还没发送的想法');assert.equal(f.page._preservedContext.requirements,'本餐未同步条件');assert.equal(f.page.data.conflictDraftAvailable,true)
 assert.equal(f.page.data.conversationCurrentMenu.menuActions.enabled,true)
 await f.action();assert.equal(f.calls.length,2);assert.notEqual(f.calls[1].body.requestId,f.calls[0].body.requestId);assert.equal(f.calls[1].body.expectedWorkspaceRevision,4);assert.equal(f.sends(),0)
})
test('conflict recovery exposes guarded restoration of unsaved meal conditions',async t=>{
 const f=await conflict(await setup(t));f.page.store.edit({...f.page.store.state().context,requirements:'尚未保存的条件'});f.page.renderWorkspace()
 await f.page.onConversationWorkspaceRecover();assert.equal(f.page.data.conflictDraftAvailable,true)
 f.state.confirmationPending=true;f.page.onConversationRestoreDraft();assert.equal(f.page.store.state().context.requirements,'')
 f.state.confirmationPending=false;f.page.onConversationRestoreDraft();assert.equal(f.page.store.state().context.requirements,'尚未保存的条件');assert.equal(f.calls.length,1)
})
test('repeated conflict recovery reads once and late target reentry cannot restore old conditions',async t=>{
 const f=await conflict(await setup(t)),hold=deferred(),started=deferred(),get=f.api.getMealWorkspace;let reads=0
 f.page.store.edit({...f.page.store.state().context,requirements:'旧餐输入'});f.page.renderWorkspace()
 f.api.getMealWorkspace=async(...args)=>{reads++;started.resolve();await hold.promise;return get(...args)}
 const run=f.page.onConversationWorkspaceRecover();assert.equal(f.page.data.busy,true);await started.promise;await f.page.onConversationWorkspaceRecover();assert.equal(reads,1)
 f.api.getMealWorkspace=get;await f.page.initializeWorkspace({...target,mealType:'lunch'});hold.resolve();await run
 f.page.onConversationRestoreDraft();assert.equal(f.page.data.context.mealType,'lunch');assert.equal(f.page.store.state().context.requirements,'');assert.equal(f.page.data.busy,false);assert.equal(f.calls.length,1)
})
test('failed conflict reread remains recoverable without losing the preserved input or replaying',async t=>{
 const f=await conflict(await setup(t)),get=f.api.getMealWorkspace;f.state.input='保留聊天草稿';f.page.store.edit({...f.page.store.state().context,requirements:'保留餐次条件'});f.page.renderWorkspace()
 f.api.getMealWorkspace=async()=>{throw Error('offline')};await f.page.onConversationWorkspaceRecover();assert.equal(f.page.store.state().syncStatus,'offline');assert.equal(f.page.data.conversationWorkspaceRecoverable,true)
 f.api.getMealWorkspace=get;await f.page.onConversationWorkspaceRecover();assert.equal(f.page.store.state().syncStatus,'synced');assert.equal(f.page._preservedContext.requirements,'保留餐次条件');assert.equal(f.state.input,'保留聊天草稿');assert.equal(f.calls.length,1)
})
test('late conflict recovery cannot overwrite or restore another account context',async t=>{
 const f=await conflict(await setup(t)),hold=deferred(),started=deferred(),get=f.api.getMealWorkspace
 f.api.getMealWorkspace=async(...args)=>{started.resolve();await hold.promise;return get(...args)}
 const run=f.page.onConversationWorkspaceRecover();await started.promise;f.switchAccount();f.api.getMealWorkspace=get;await f.page.initializeWorkspace(target)
 hold.resolve();await run;f.page.onConversationRestoreDraft();assert.equal(f.page.store.state().workspace.id,'B:2026-10-06:dinner');assert.equal(f.page.data.busy,false);assert.equal(f.page.data.conflictDraftAvailable,false);assert.equal(f.calls.length,1)
})
test('historical cards require exact current references and are never rewritten',async t=>{
 const f=await setup(t),w=f.page.store.state().workspace,card={id:'old',type:'menu',workspaceRef:ref(w),data:{...target,dishes:w.draft.dishes}}
 f.state.messages=[{id:'m',cards:[card]}];const before=plain(card)
 await f.action('keep',ref(w),'old');assert.equal(f.calls.length,1);assert.deepEqual(card,before)
 await f.action('release',ref(f.page.store.state().workspace),'old');assert.equal(f.calls.length,1)
})
test('semantic replacement is only an editable prefill and locked replacement is blocked',async t=>{
 const f=await setup(t);await f.action('lighter');assert.match(f.state.input,/青菜/);assert.equal(f.sends(),0);assert.equal(f.calls.length,0)
 await f.action('keep');await f.action('replace');assert.equal(f.calls.length,1)
})
test('queued replacement reports processing and preserves other locks without a model reply',async t=>{
 const f=await setup(t),old=f.row();old.draft={...old.draft,dishes:[{id:7,name:'青菜'},{id:9,name:'汤'}],lockedDishIds:[9]};await f.page.store.reloadLatest();f.page.renderWorkspace()
 f.api.commandMealWorkspace=async(id,body)=>{f.calls.push({id,body:plain(body)});const next={...old,revision:2,status:'generating',taskId:'task-original'};f.rows.set(id,next);return plain(next)}
 await f.action('replace');assert.equal(f.page.data.actionFeedback.state,'pending');assert.equal(f.page.data.conversationCurrentMenu.menuActions.enabled,false)
 assert.deepEqual(f.page.store.state().workspace.draft.lockedDishIds,[9]);assert.equal(f.sends(),0);assert.deepEqual(f.state.messages,[])
 assert.deepEqual(Object.keys(f.calls[0].body).sort(),['command','dishId','expectedWorkspaceRevision','planVersion','requestId'])
})
test('API owner switch during store save rejects the original command',async t=>{
 const {createWorkspaceStore}=require('../utils/meal-workspace'),hold=deferred(),started=deferred(),before={id:'w',revision:1,context:{...target,people:2},draft:{planVersion:1,dishes:[{id:7}]}};let source='isolated-A',commands=0
 const store=createWorkspaceStore({identity:()=> 'A',source:()=>source,read:()=>null,write(){},api:{getMealWorkspace:async()=>({workspace:before}),saveWorkspaceContext:async()=>{started.resolve();await hold.promise;return before},commandMealWorkspace:()=>commands++}})
 t.after(()=>store.dispose());await store.load(target.date,target.mealType);store.edit({...store.state().context,requirements:'清淡'})
 const run=store.command('keep',{dishId:7},ref(before));await started.promise;source='isolated-B';hold.resolve();await assert.rejects(run,/服务已切换/);assert.equal(commands,0);assert.equal(store.state().workspace,null)
})
test('capability shutdown during flush blocks direct actions but original recovery remains usable',async t=>{
 const f=await setup(t),hold=deferred(),started=deferred();f.page.flushDraft=async()=>{started.resolve();await hold.promise}
 const run=f.action();await started.promise;f.page.data.conversationActionsEnabled=false;hold.resolve();await run;assert.equal(f.calls.length,0)
 // The store hook only guards referenced new commands, never its retry path.
 f.api.commandMealWorkspace=async()=>{throw Error('lost')};await assert.rejects(f.page.store.command('keep',{dishId:7}));const pending=f.page.store.state().pending
 f.api.getWorkspaceRequest=async(id,requestId)=>{assert.equal(requestId,pending.body.requestId);return {...f.row(),revision:2,draft:{...f.row().draft,planVersion:2}}}
 f.rows.set(f.row().id,{...f.row(),revision:2,draft:{...f.row().draft,planVersion:2}})
 await f.page.onConversationWorkspaceRecover();assert.equal(f.page.store.state().pending,null)
})
test('original task cancellation remains usable without a referenced direct command',async t=>{
 const f=await setup(t);Object.assign(f.row(),{status:'generating',taskId:'original-task'});await f.page.store.reloadLatest();f.page.renderWorkspace();f.state.confirmationPending=true
 await f.page.runCommand('cancel');assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.command,'cancel');assert.equal(f.page.data.busy,false)
})
test('model send cannot compete with a pending direct command',async t=>{
 const f=await setup(t),hold=deferred(),started=deferred(),original=f.api.commandMealWorkspace
 f.api.commandMealWorkspace=async(id,body)=>{started.resolve();await hold.promise;return original(id,body)}
 const run=f.action();await started.promise;f.page.data.conversationInput='同时再换一道';f.page.onConversationSend();assert.equal(f.sends(),0);hold.resolve();await run
})
test('semantic prefill confirmation cannot overwrite input after target changes',async t=>{
 const f=await setup(t),previous=global.wx;let modal
 global.wx={showModal:options=>modal=options};t.after(()=>global.wx=previous)
 f.state.input='保留的草稿';await f.action('lighter');assert.equal(f.state.input,'保留的草稿')
 await f.page.store.load(target.date,'lunch');modal.success({confirm:true});assert.equal(f.state.input,'保留的草稿');assert.equal(f.sends(),0)
})
test('account switch or store replacement during flush cannot redirect a row command',async t=>{
 for(const change of ['account','store']){
  const f=await setup(t),hold=deferred(),started=deferred();f.page.flushDraft=async()=>{started.resolve();await hold.promise}
  const run=f.action();await started.promise;if(change==='account')f.switchAccount();else f.page.store={state:()=>({workspace:f.row()}),dispose(){}}
  hold.resolve();await run;assert.equal(f.calls.length,0)
 }
})
test('presentation rejects stale references, generation, unknown and assistant confirmations',()=>{
 const workspace={id:'w',revision:3,status:'draft',context:target,draft:{planVersion:4,dishes:[{id:7}],lockedDishIds:[7]}}
 const card={id:'m',type:'menu',workspaceRef:{workspaceId:'w',workspaceRevision:3,planVersion:4,...target},data:{...target,dishes:[{id:7}]}}
 const view=presentMenuActions({card,workspace,conversationState:{},workspaceState:{}})
 assert.equal(view.enabled,true);assert.deepEqual(view.rows,[{dishId:7,locked:true,canReplace:false}])
 for(const patch of [{pending:{}},{syncStatus:'unknown'},{syncStatus:'conflict'}])assert.equal(presentMenuActions({card,workspace,conversationState:{},workspaceState:patch}).enabled,false)
 assert.equal(presentMenuActions({card,workspace:{...workspace,status:'generating'},conversationState:{},workspaceState:{}}).enabled,false)
 card.workspaceRef.planVersion=2;assert.equal(presentMenuActions({card,workspace,conversationState:{},workspaceState:{}}).enabled,false)
})
function component(card){
 let definition,sheet;const events=[]
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../components/assistant-card/index.js'),'utf8'),{Component:value=>definition=value,require:name=>require(path.resolve(__dirname,'../components/assistant-card',name)),wx:{showActionSheet:options=>sheet=options}})
 const c={...definition.methods,properties:{card,active:false,busy:false},data:plain(definition.data),setData(value){Object.assign(this.data,value)},triggerEvent:(name,detail)=>events.push({name,detail})};c.refresh()
 return {c,events,sheet:()=>sheet}
}
test('row More emits exact dish action and retires its callback when card changes',()=>{
 const expectedRef={workspaceId:'w',workspaceRevision:1,planVersion:1,...target}
 const card={id:'menu',type:'menu',data:{dishes:[{id:7,name:'青菜'}]},menuActions:{enabled:true,expectedRef,rows:[{dishId:7,locked:false,canReplace:true}]}}
 const f=component(card);f.c.onDishMore({currentTarget:{dataset:{dishId:7}}});f.sheet().success({tapIndex:0})
 assert.deepEqual(plain(f.events),[{name:'dishaction',detail:{cardId:'menu',dishId:7,action:'keep',expectedRef}}])
 f.c.onDishMore({currentTarget:{dataset:{dishId:7}}});f.c.properties.card={...card,menuActions:{...card.menuActions,expectedRef:{...expectedRef,workspaceRevision:2}}};f.sheet().success({tapIndex:1});assert.equal(f.events.length,1)
 f.c.properties.busy=true;f.c.onDishReplace({currentTarget:{dataset:{dishId:7}}});assert.equal(f.events.length,1)
})
