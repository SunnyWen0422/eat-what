const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,deferred,target,plain}=require('./fixtures/workspace-flow')
const assistantPage=require('../utils/assistant-page')
async function setup(t) {
 const f=fixture(),page=assistantPage(f.createPage('assistant'),{probe:async()=>true}),previousWx=global.wx
 global.wx=f.wx;t.after(()=>{if(previousWx)global.wx=previousWx;else delete global.wx})
 page.setData=(patch,cb)=>{Object.assign(page.data,patch);if(cb)cb()}
 page._assistantAlive=true;page._alive=true
 await page.initializeWorkspace(target)
 const state={messages:[],input:'保留我正在写的问题',busy:false},sent=[]
 page.conversation={state:()=>state,setInput:value=>{state.input=value},send:value=>sent.push(value),dispose(){}}
 page.data.assistantConnected=true;page.renderWorkspace();page.data.conversationInput=state.input
 t.after(()=>page.onUnload())
 return {...f,page,state,sent}
}
const value=value=>({detail:{value}})
const step=(delta,type)=>({currentTarget:{dataset:{delta,type}}})
test('修改 opens an independent meal editor and cancel preserves context, input and menu',async t=>{
 const f=await setup(t),before=plain(f.page.store.state())
 f.page.onConversationEditRequirements()
 assert.equal(f.page.data.conversationMealSettingsVisible,true)
 assert.equal(f.page.data.conversationMealSettingsDraft.people,2)
 assert.equal(f.page.data.conversationMealSettingsRows.length,6)
 f.page.onConversationMealPeopleStep(step(1))
 f.page.onConversationMealCountStep(step(1,'soup'))
 f.page.onConversationMealRequirementsInput(value('少油，不放香菜'))
 assert.deepEqual(f.page.store.state(),before)
 assert.equal(f.state.input,'保留我正在写的问题')
 f.page.onConversationMealSettingsCancel()
 assert.equal(f.page.data.conversationMealSettingsVisible,false)
 assert.equal(f.page.data.conversationMealSettingsDraft,null)
 assert.deepEqual(f.page.store.state(),before);assert.equal(f.calls.length,0)
})
test('apply saves people, composition and requirements with the original revision and no model/calendar write',async t=>{
 const f=await setup(t)
 f.page.store.edit({...f.page.data.context,totalCookMinutes:35,ownedIngredients:['番茄'],criteria:{includeTagCodes:['LIGHT']}})
 await f.page.flushDraft();f.page.renderWorkspace();f.calls.length=0
 const before=plain(f.page.store.state())
 f.page.onConversationEditRequirements()
 f.page.onConversationMealPeopleInput(value('4'))
 f.page.onConversationMealCountStep(step(1,'soup'))
 f.page.onConversationMealRequirementsInput(value('少油，不放香菜'))
 await f.page.onConversationMealSettingsApply()
 const after=f.page.store.state()
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].type,'context')
 assert.equal(f.calls[0].body.expectedWorkspaceRevision,before.workspace.revision)
 assert.ok(f.calls[0].body.requestId)
 assert.equal(after.context.people,4);assert.equal(after.context.requirements,'少油，不放香菜')
 assert.equal(after.context.counts.soup,1);assert.equal(after.context.compositionMode,'manual')
 assert.equal(after.context.totalCookMinutes,35);assert.deepEqual(after.context.ownedIngredients,['番茄'])
 assert.deepEqual(after.context.criteria,{includeTagCodes:['LIGHT']})
 assert.deepEqual(after.workspace.draft,before.workspace.draft)
 assert.equal(after.dirty,false);assert.equal(after.syncStatus,'synced')
 assert.equal(f.page.data.conversationMealSettingsVisible,false)
 assert.equal(f.state.input,'保留我正在写的问题');assert.equal(f.sent.length,0);assert.equal(f.plans.size,0)
})
test('invalid people or counts cannot write, and automatic composition follows valid people',async t=>{
 const f=await setup(t);f.page.onConversationEditRequirements()
 f.page.onConversationMealPeopleInput(value(''))
 await f.page.onConversationMealSettingsApply();assert.equal(f.calls.length,0)
 assert.equal(f.page.data.conversationMealSettingsApplyDisabled,true)
 f.page.onConversationMealPeopleInput(value('4'))
 assert.deepEqual(f.page.data.conversationMealSettingsDraft.counts,{meat:1,veg:2})
 f.page.onConversationMealCountInput({currentTarget:{dataset:{type:'soup'}},detail:{value:'11'}})
 await f.page.onConversationMealSettingsApply();assert.equal(f.calls.length,0)
 f.page.onConversationMealSettingsAuto()
 assert.deepEqual(f.page.data.conversationMealSettingsDraft.counts,{meat:1,veg:2})
 assert.equal(f.page.data.conversationMealSettingsApplyDisabled,false)
 f.page.onConversationMealRequirementsInput(value('字'.repeat(2001)))
 await f.page.onConversationMealSettingsApply();assert.equal(f.calls.length,0)
})
test('duplicate apply and edits during saving cannot replace the submitted context or input',async t=>{
 const f=await setup(t),wait=deferred(),save=f.api.saveWorkspaceContext;let attempts=0
 f.api.saveWorkspaceContext=async(id,body)=>{attempts++;await wait.promise;return save(id,body)}
 f.page.onConversationEditRequirements();f.page.onConversationMealPeopleInput(value('3'))
 const pending=f.page.onConversationMealSettingsApply()
 assert.equal(f.page.data.conversationMealSettingsSaving,true)
 f.page.onConversationMealPeopleInput(value('5'));f.page.onConversationMealSettingsCancel()
 await f.page.onConversationMealSettingsApply()
 f.state.input='等待期间新写的文字'
 wait.resolve();await pending
 assert.equal(attempts,1);assert.equal(f.page.store.state().context.people,3)
 assert.equal(f.state.input,'等待期间新写的文字')
})
test('unknown save outcome retains the original request and editor until recovery, without new writes',async t=>{
 const f=await setup(t);let attempts=0
 f.api.saveWorkspaceContext=async()=>{attempts++;throw Error('network lost')}
 f.page.onConversationEditRequirements();f.page.onConversationMealRequirementsInput(value('清淡一点'))
 await f.page.onConversationMealSettingsApply()
 const pending=f.page.store.state().pending
 assert.ok(pending);assert.equal(pending.type,'context')
 assert.equal(f.page.data.conversationMealSettingsVisible,true)
 assert.match(f.page.data.conversationMealSettingsError,/查看是否已保存/)
 await f.page.onConversationMealSettingsApply()
 assert.equal(attempts,1);assert.deepEqual(f.page.store.state().pending,pending)
 assert.equal(f.state.input,'保留我正在写的问题')
 f.page.onConversationMealSettingsCancel()
 assert.deepEqual(f.page.store.state().pending,pending)
 assert.equal(f.page.data.conversationMealSettingsVisible,true)
 assert.match(f.page.data.conversationMealSettingsError,/查看是否已保存/)
})
test('definite save failure keeps editable values and permits a corrected retry',async t=>{
 const f=await setup(t),save=f.api.saveWorkspaceContext
 f.api.saveWorkspaceContext=async()=>{throw Object.assign(Error('invalid'),{statusCode:400})}
 f.page.onConversationEditRequirements();f.page.onConversationMealRequirementsInput(value('少盐'))
 await f.page.onConversationMealSettingsApply()
 assert.equal(f.page.store.state().pending,null)
 assert.equal(f.page.data.conversationMealSettingsVisible,true)
 assert.equal(f.page.data.conversationMealSettingsSaving,false)
 assert.equal(f.page.data.conversationMealSettingsDraft.requirements,'少盐')
 f.api.saveWorkspaceContext=save
 f.page.onConversationMealRequirementsInput(value('少油'))
 await f.page.onConversationMealSettingsApply()
 assert.equal(f.page.store.state().context.requirements,'少油')
 assert.equal(f.page.data.conversationMealSettingsVisible,false)
})
test('retrying unchanged values after definite failure saves again, while a synced no-op does not write',async t=>{
 const f=await setup(t),save=f.api.saveWorkspaceContext
 f.page.onConversationEditRequirements();await f.page.onConversationMealSettingsApply()
 assert.equal(f.calls.length,0)
 f.api.saveWorkspaceContext=async()=>{throw Object.assign(Error('bad request'),{statusCode:400})}
 f.page.onConversationEditRequirements();f.page.onConversationMealRequirementsInput(value('少盐'))
 await f.page.onConversationMealSettingsApply()
 f.api.saveWorkspaceContext=save
 await f.page.onConversationMealSettingsApply()
 assert.equal(f.calls.length,1);assert.equal(f.page.store.state().dirty,false)
 assert.equal(f.page.data.conversationMealSettingsVisible,false)
})
test('workspace revisions and independently edited context are revalidated before applying',async t=>{
 for(const change of ['revision','context']){
  const f=await setup(t);f.page.onConversationEditRequirements()
  f.page.onConversationMealRequirementsInput(value('过时的编辑'))
  if(change==='revision'){f.row().revision++;await f.page.store.reloadLatest()}
  else f.page.store.edit({...f.page.store.state().context,requirements:'另一处修改'})
  await f.page.onConversationMealSettingsApply()
  assert.equal(f.calls.length,0)
  assert.match(f.page.data.conversationMealSettingsError,/变化/)
  assert.notEqual(f.page.store.state().context.requirements,'过时的编辑')
 }
})
test('busy, unknown, pending confirmation and disabled actions block opening and applying',async t=>{
 for(const patch of [{busy:true},{recoverable:true},{confirmationPending:true},{selectionPending:true},{turn:{status:'running'}}]){
  const f=await setup(t)
  Object.assign(f.state,patch);f.page.onConversationEditRequirements()
  assert.equal(f.page.data.conversationMealSettingsVisible,false)
  Object.assign(f.state,{busy:false,recoverable:false,confirmationPending:false,selectionPending:false,turn:null})
  f.page.onConversationEditRequirements();f.page.onConversationMealRequirementsInput(value('等一下'))
  Object.assign(f.state,patch);await f.page.onConversationMealSettingsApply()
  assert.equal(f.calls.length,0)
 }
 const f=await setup(t);f.page.data.conversationActionsEnabled=false
 f.page.onConversationEditRequirements();assert.equal(f.page.data.conversationMealSettingsVisible,false)
})
test('late save completion cannot mutate the next account UI',async t=>{
 const f=await setup(t),wait=deferred(),save=f.api.saveWorkspaceContext
 f.api.saveWorkspaceContext=async(id,body)=>{await wait.promise;return save(id,body)}
 f.page.onConversationEditRequirements();f.page.onConversationMealRequirementsInput(value('旧账号文字'))
 const pending=f.page.onConversationMealSettingsApply()
 f.switchAccount();f.page.data.conversationMealSettingsError='新账号内容'
 wait.resolve();await pending
 assert.equal(f.page.data.conversationMealSettingsError,'新账号内容')
 assert.equal(f.page.store.state().syncStatus,'account_changed')
})
test('definite rejection restores the pre-apply dirty state so cancel or leaving cannot save the rejected edit',async t=>{
 for(const dirtyBefore of [false,true]){
  const f=await setup(t),save=f.api.saveWorkspaceContext
  if(dirtyBefore){f.page.store.edit({...f.page.data.context,requirements:'本来就有的本地草稿'});f.page.renderWorkspace()}
  const before=plain(f.page.store.state())
  f.api.saveWorkspaceContext=async()=>{throw Object.assign(Error('invalid'),{statusCode:400})}
  f.page.onConversationEditRequirements();f.page.onConversationMealRequirementsInput(value('用户随后取消的修改'))
  await f.page.onConversationMealSettingsApply()
  assert.deepEqual(f.page.store.state().context,before.context)
  assert.equal(f.page.store.state().dirty,before.dirty)
  assert.equal(f.page.store.state().syncStatus,before.syncStatus)
  assert.equal(f.page.data.conversationMealSettingsDraft.requirements,'用户随后取消的修改')
  f.page.onConversationMealSettingsCancel();f.page.onHide()
  f.api.saveWorkspaceContext=save
  await f.page.flushDraft()
  assert.equal(f.calls.length,dirtyBefore?1:0)
  assert.equal(f.page.store.state().context.requirements,before.context.requirements)
  assert.equal(f.state.input,'保留我正在写的问题')
 }
})
test('recovery of an accepted settings save closes only its original editor and clears stale error',async t=>{
 const f=await setup(t),save=f.api.saveWorkspaceContext
 f.api.saveWorkspaceContext=async(id,body)=>{await save(id,body);throw Error('response lost')}
 f.page.onConversationEditRequirements();f.page.onConversationMealRequirementsInput(value('清淡'))
 await f.page.onConversationMealSettingsApply()
 const pending=plain(f.page.store.state().pending)
 f.api.getWorkspaceRequest=async(id,requestId)=>{
  assert.equal(requestId,pending.body.requestId);return plain(f.row())
 }
 await f.page.onConversationWorkspaceRecover()
 assert.equal(f.page.store.state().pending,null)
 assert.equal(f.page.store.state().context.requirements,'清淡')
 assert.equal(f.page.data.conversationMealSettingsVisible,false)
 assert.equal(f.page.data.conversationMealSettingsError,'')
 assert.equal(f.page.data.conversationMealSettingsDraft,null)
 assert.equal(f.state.input,'保留我正在写的问题')
})
test('an original unknown request later rejected restores its saved pre-apply snapshot',async t=>{
 const f=await setup(t),before=plain(f.page.store.state())
 f.api.saveWorkspaceContext=async()=>{throw Error('network lost')}
 f.page.onConversationEditRequirements();f.page.onConversationMealRequirementsInput(value('未被接受的修改'))
 await f.page.onConversationMealSettingsApply()
 const original=f.page.store.state().pending.body.requestId
 f.api.saveWorkspaceContext=async(id,body)=>{
  assert.equal(body.requestId,original);throw Object.assign(Error('invalid'),{statusCode:400})
 }
 await f.page.onConversationWorkspaceRecover()
 assert.equal(f.page.store.state().pending,null)
 assert.deepEqual(f.page.store.state().context,before.context)
 assert.equal(f.page.store.state().dirty,before.dirty)
 assert.equal(f.page.data.conversationMealSettingsVisible,true)
 assert.doesNotMatch(f.page.data.conversationMealSettingsError,/待核对/)
 f.page.onConversationMealSettingsCancel()
 assert.deepEqual(f.page.store.state().context,before.context)
})
test('definite rejection never restores over a newer local edit',async t=>{
 const f=await setup(t),wait=deferred()
 f.api.saveWorkspaceContext=async()=>{await wait.promise;throw Object.assign(Error('invalid'),{statusCode:400})}
 f.page.onConversationEditRequirements();f.page.onConversationMealRequirementsInput(value('较旧的修改'))
 const pending=f.page.onConversationMealSettingsApply()
 f.page.store.edit({...f.page.store.state().context,requirements:'另一处新修改'})
 wait.resolve();await pending
 assert.equal(f.page.store.state().context.requirements,'另一处新修改')
 assert.equal(f.page.store.state().dirty,true)
})
test('settings rollback metadata survives page restart and retry still uses the original request',async t=>{
 const f=await setup(t),before=plain(f.page.store.state())
 f.api.saveWorkspaceContext=async()=>{throw Error('network lost')}
 f.page.onConversationEditRequirements();f.page.onConversationMealRequirementsInput(value('重启前的修改'))
 await f.page.onConversationMealSettingsApply()
 const original=plain(f.page.store.state().pending);f.page.onUnload()
 const store=require('../utils/meal-workspace').createWorkspaceStore({api:f.api,identity:()=> 'A',read:f.wx.getStorageSync,write:f.wx.setStorageSync})
 await store.load(target.date,target.mealType)
 assert.deepEqual(store.state().pending,original)
 f.api.saveWorkspaceContext=async(id,body)=>{
  assert.equal(body.requestId,original.body.requestId)
  throw Object.assign(Error('invalid'),{statusCode:400})
 }
 await assert.rejects(store.retry())
 assert.deepEqual(store.state().context,before.context)
 assert.equal(store.state().dirty,before.dirty);assert.equal(store.state().pending,null)
 store.dispose()
})
test('a rejected version conflict restores the pre-apply context without clearing conflict protection',async t=>{
 const f=await setup(t),before=plain(f.page.store.state())
 f.api.saveWorkspaceContext=async()=>{throw Object.assign(Error('conflict'),{statusCode:409})}
 f.page.onConversationEditRequirements();f.page.onConversationMealRequirementsInput(value('冲突的修改'))
 await f.page.onConversationMealSettingsApply()
 assert.deepEqual(f.page.store.state().context,before.context)
 assert.equal(f.page.store.state().dirty,before.dirty)
 assert.equal(f.page.store.state().syncStatus,'conflict')
 f.page.onConversationMealSettingsCancel()
 await assert.rejects(f.page.store.save(),/最新内容/)
})
test('the context panel cannot collapse while meal settings are being edited',async t=>{
 const f=await setup(t)
 f.page.onToggleConversationMenu();assert.equal(f.page.data.conversationMenuExpanded,true)
 f.page.onToggleConversationMenu();assert.equal(f.page.data.conversationMenuExpanded,false)
 f.page.onConversationEditRequirements()
 f.page.onToggleConversationMenu()
 assert.equal(f.page.data.conversationMenuExpanded,true)
 assert.equal(f.page.data.conversationMealSettingsVisible,true)
 f.page.onConversationMealSettingsCancel();f.page.onToggleConversationMenu()
 assert.equal(f.page.data.conversationMenuExpanded,false)
})
test('only the original unresolved settings request marks the editor pending and all edits remain read-only',async t=>{
 const f=await setup(t),wait=deferred(),save=f.api.saveWorkspaceContext
 assert.equal(f.page.data.conversationMealSettingsPending,false)
 f.api.saveWorkspaceContext=async(id,body)=>{await wait.promise;await save(id,body);throw Error('lost response')}
 f.page.onConversationEditRequirements();f.page.onConversationMealRequirementsInput(value('清淡一点'))
 const draft=plain(f.page.data.conversationMealSettingsDraft),operation=f.page.onConversationMealSettingsApply()
 assert.equal(f.page.data.conversationMealSettingsSaving,true)
 f.page.onConversationMealPeopleStep(step(1));f.page.onConversationMealRequirementsInput(value('不能写入'))
 assert.deepEqual(f.page.data.conversationMealSettingsDraft,draft)
 wait.resolve();await operation
 assert.equal(f.page.data.conversationMealSettingsSaving,false)
 assert.equal(f.page.data.conversationMealSettingsPending,true)
 f.page.onConversationMealPeopleInput(value('8'))
 f.page.onConversationMealCountStep(step(1,'soup'))
 f.page.onConversationMealRequirementsInput(value('不能写入'))
 f.page.onConversationMealSettingsAuto()
 assert.deepEqual(f.page.data.conversationMealSettingsDraft,draft)
 const binding=f.page._conversationMealSettingsBinding,requestId=binding.pendingRequestId
 binding.pendingRequestId='another-request';f.page.refreshConversationMenus()
 assert.equal(f.page.data.conversationMealSettingsPending,false)
 binding.pendingRequestId=requestId;f.page.refreshConversationMenus()
 assert.equal(f.page.data.conversationMealSettingsPending,true)
 f.api.getWorkspaceRequest=async()=>plain(f.row())
 await f.page.onConversationWorkspaceRecover()
 assert.equal(f.page.data.conversationMealSettingsPending,false)
 assert.equal(f.page.data.conversationMealSettingsVisible,false)
})
