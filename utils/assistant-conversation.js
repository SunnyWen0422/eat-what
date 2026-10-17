const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
const capabilities = new Map()
const valueOf = value => typeof value === 'function' ? value() : value
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {const n=Math.floor(Math.random()*16);return (c==='x'?n:(n&3)|8).toString(16)})
function scopeOf(options) { return `${valueOf(options.source || (()=>require('./config').getApiBaseUrl()))}|${valueOf(options.identity || (()=>require('./util').getCurrentUserIdentity()))}` }
async function probeAssistantCapability(options = {}) {
 const api=options.api || require('./api'),scope=scopeOf(options),now=Date.now(),cached=capabilities.get(scope)
 if(!options.force && cached && cached.until>now){const enabled=await Promise.resolve(cached.promise || cached.enabled);return scope===scopeOf(options)&&enabled}
 if(!api.getAssistantV4Capabilities)return false
 const entry={until:now+300000,enabled:false}
 entry.promise=Promise.resolve().then(()=>scope===scopeOf(options)?api.getAssistantV4Capabilities():null).then(result=>{
  entry.enabled=!!(result && result.enabled===true && result.schemaVersion==='assistant.v4.1' && Array.isArray(result.reads) && Array.isArray(result.draftCommands) && Array.isArray(result.previewActions))
  entry.uiFeatures=entry.enabled&&Array.isArray(result.supportedUiFeatures)?['clarification_v1','handoff_v1'].filter(name=>result.supportedUiFeatures.includes(name)):[]
  return entry.enabled
 }).catch(()=>false).finally(()=>{delete entry.promise})
 capabilities.set(scope,entry)
 const enabled=await entry.promise
 return scope===scopeOf(options) && enabled
}
function createAssistantConversation(options = {}) {
 const api=options.api || require('./api'),store=options.workspaceStore,scope=scopeOf(options),read=options.read || (key=>wx.getStorageSync(key)),write=options.write || ((key,v)=>wx.setStorageSync(key,v)),makeId=options.uuid || uuid
 let active=true,actionsEnabled=true,key='',record=null,running=null,cancellation=null
 let view={sessionId:null,messages:[],input:'',error:'',busy:false,recoverable:false,turn:null,nextCursor:null}
 const current=()=>active && scope===scopeOf(options)
 const state=()=>current()?clone({...view,busy:view.busy||!!cancellation,error:cancellation?'正在停止这次请求，请稍候核对结果':view.error,cancelling:!!cancellation,selectionPending:!!(record&&record.renewal),confirmationPending:!!(record&&record.confirmation&&record.confirmation.unknown)}):{sessionId:null,messages:[],input:'',error:'请重新进入这一餐',busy:false,recoverable:false,turn:null}
 const notify=()=>{if(current()&&options.onChange)options.onChange(state())}
 const persist=()=>{if(current()&&key){record.input=view.input;write(key,clone(record))}notify()}
 const exclusive=action=>{if(cancellation)return cancellation;if(running)return running;if(!current())return Promise.resolve(state());running=Promise.resolve().then(action).finally(()=>{running=null});return running}
 const workspace=()=>store && store.state().workspace
 const fail=(message='连接暂未完成，输入已保留，请重试刚才的请求')=>{if(!current())return state();view.busy=false;view.error=message;view.recoverable=!!(record&&(!record.sessionId||record.pending||record.renewal||record.confirmation&&record.confirmation.unknown));if(record&&record.pending)view.input=record.pending.body.message;persist();return state()}
 const canResume=turn=>turn&&turn.status==='awaiting_confirmation'&&!turn.pendingAction&&turn.continuation&&turn.continuation.steps&&turn.continuation.steps[turn.continuation.cursor]&&turn.continuation.steps[turn.continuation.cursor].status==='pending'
 function adopt(turn) {
  if(!current())return
  view.turn=clone(turn);view.busy=['queued','running'].includes(turn.status);view.recoverable=view.busy||!!canResume(turn)
  const message={id:turn.turnId,turnId:turn.turnId,role:'assistant',text:turn.reply || '',cards:clone(turn.cards || []),workflow:require('./assistant-workflow-presentation').presentWorkflow({turn}).rows}
  const index=view.messages.findIndex(m=>m.id===turn.turnId || (m.role==='assistant'&&m.turnId===turn.turnId))
  if(index>=0)view.messages[index]=message;else view.messages.push(message)
  if(['failed','cancelled','partially_completed'].includes(turn.status)){
   // A partial turn is terminal. Its compound request must not become a resend.
   // Preserve anything the user has typed since sending or restoring the request.
   if(turn.status==='partially_completed'){if(record.pending&&view.input===record.pending.body.message)view.input=''}
   else view.input=record.pending && record.pending.body.message || view.input
   view.error=turn.status==='cancelled'?'已停止这次请求，输入仍保留':turn.status==='partially_completed'?'这次请求已结束，请查看各项结果。剩余事项需重新核对来源和目标，再由你发送':'这次未完成，输入已保留，可以调整后再发';view.recoverable=false
  }
  else view.error=''
  if(!view.busy && turn.status!=='awaiting_confirmation'){record.pending=null;record.renewal=null;view.recoverable=false}
  record.lastTurn=clone(turn)
  record.messages=clone(view.messages);persist()
 }
 async function refreshWorkspace(turn) {
  if(!current() || !turn.workspaceRef || !store)return
  const w=workspace(),ref=turn.workspaceRef
  if(w && ref.workspaceId===w.id && (ref.workspaceRevision>w.revision || ref.planVersion>(w.draft && w.draft.planVersion || 0))) {
   await store.reloadLatest();if(!current())return
   if(options.onWorkspaceChange)options.onWorkspaceChange(store.state())
  }
 }
 async function poll(id) {
  const turn=await api.getAssistantV4Turn(id);if(!current())return state()
  if(!turn || turn.turnId!==id)throw Error('invalid turn')
  adopt(turn);await refreshWorkspace(turn);return state()
 }
 async function dispatch() {
  if(!current())return state()
  const pending=record.pending
  if(pending.turnId)return poll(pending.turnId)
  if(!actionsEnabled)return fail('助手暂不可用，原请求仍保留，请稍后核对')
  view.busy=true;persist()
  let result
  try{result=await api.sendAssistantV4Turn(record.sessionId,clone(pending.body))}
  catch(error){
   if(current()&&record.pending===pending&&!pending.turnId&&error&&error.statusCode===409){
    view.input=pending.body.message;record.pending=null;view.busy=false;view.recoverable=false;view.error='本餐已变化，请核对最新菜单后重新说明要调整的菜。输入仍保留';persist()
    try{
     const local=store.state()
     if(local.dirty||local.pending){view.error='本餐已变化，还有内容未同步，请回到今天核对。输入仍保留';persist();return state()}
     await store.reloadLatest();if(!current())return state()
     if(options.onWorkspaceChange)options.onWorkspaceChange(store.state())
    }catch(refreshError){if(current()){view.error='最新菜单暂未读到，请回到今天核对后再发。输入仍保留';persist()}}
    return state()
   }
   throw error
  }
  if(!current())return state()
  if(!result || !result.turnId)throw Error('missing turn')
  pending.turnId=result.turnId;persist();return poll(result.turnId)
 }
 async function loadRecord(workspaceRef) {
  const w=workspace(),id=workspaceRef && workspaceRef.workspaceId || w && w.id
  if(!id)return fail('请先回到今天，准备这一餐的菜单')
  const requestedSession=workspaceRef&&workspaceRef.sessionId
  if(requestedSession&&(!w||w.id!==id))return fail('原来那一餐已变化，请返回记录后重新打开')
  key=`assistant-v4:${encodeURIComponent(scope)}:${id}`
  const existing=clone(read(key))
  if(requestedSession&&(!existing||existing.sessionId!==requestedSession))key+=`:session:${encodeURIComponent(requestedSession)}`
  record=clone(read(key)) || {sessionBody:{workspaceId:id,requestId:makeId()},sessionId:requestedSession||null,pending:null,messages:[],input:'',confirmedTasks:[]}
  view.input=record.input || '';view.messages=clone(record.messages || []);view.recoverable=!!(record.pending||record.renewal||record.confirmation&&record.confirmation.unknown)
  try {
   let result
   if(record.sessionId){
    try{result=await api.getAssistantV4Session(record.sessionId)}catch(error){
     if(!current())return state()
     if(!error || error.statusCode!==404 || requestedSession)throw error
     // A definitive owner-scoped session absence expires only the binding. Keep
     // recovery evidence, but never replay its old business intent in a new session.
     record.expiredBindings=record.expiredBindings || []
     record.expiredBindings.push(clone({sessionId:record.sessionId,sessionBody:record.sessionBody,pending:record.pending,renewal:record.renewal,confirmation:record.confirmation,lastTurn:record.lastTurn,confirmedTasks:record.confirmedTasks}))
     view.input=view.input || record.pending&&record.pending.body.message || ''
     record.sessionId=null;record.sessionBody={workspaceId:id,requestId:makeId()};record.pending=null;record.renewal=null;record.confirmation=null;record.lastTurn=null;record.confirmedTasks=[]
     record.bindingExpired=true;view.sessionId=null;view.turn=null;view.recoverable=false;persist()
    }
   }
   if(!result){persist();result=await api.createAssistantV4Session(clone(record.sessionBody))}
   if(!current())return state()
   if(!result || !result.sessionId)throw Error('invalid session')
   if(requestedSession&&(result.sessionId!==requestedSession||!result.workspaceRef||result.workspaceRef.workspaceId!==id))throw Error('history binding mismatch')
   record.sessionId=result.sessionId;view.sessionId=result.sessionId;view.nextCursor=result.nextCursor || null
   if(Array.isArray(result.messages)&&result.messages.length)view.messages=clone(result.messages)
   record.messages=clone(view.messages)
   if(result.latestTurn){
    // A session's latest response may be the parent of an unresolved child send.
    // Only dispatch/recovery of the original UUID can resolve that send.
    if(record.pending&&record.pending.turnId!==result.latestTurn.turnId)view.turn=clone(record.lastTurn||null)
    else {adopt(result.latestTurn);await refreshWorkspace(result.latestTurn);if(!current())return state()}
   }
   if(record.pending)view.input=record.pending.body.message
   if(record.bindingExpired)view.error='原对话已过期，输入仍保留。请先核对日历和清单，再重新说明要办理的内容'
   persist();return state()
  }catch(error){return fail('对话暂未连接，输入已保留，请重新进入或重试')}
 }
 function load(workspaceRef){return exclusive(()=>loadRecord(workspaceRef))}
 function send(text,choice) {return exclusive(async()=>{
  if(!actionsEnabled)return fail('助手暂不可用，输入仍保留')
  if(!record || !record.sessionId)return fail('对话尚未连接，请重新进入这一餐')
  if(record.pending)return fail('刚才的结果还待确认，请先恢复原请求')
  const w=workspace(),local=store.state();let message=String(text||'').trim(),selected
  if(choice){
   const turn=view.turn,card=turn&&(turn.cards||[]).find(c=>c.id===choice.cardId),ref=card&&card.workspaceRef
   const negotiated=capabilities.get(scope),option=card&&require('./assistant-cards').clarificationOptions(card).find(o=>o.id===choice.optionId)
   if(!negotiated||!negotiated.enabled||negotiated.until<=Date.now()||!negotiated.uiFeatures.includes('clarification_v1')||!turn||turn.status!=='needs_input'||!option||!w||!ref||ref.workspaceId!==w.id||ref.workspaceRevision!==w.revision||ref.planVersion!==(w.draft&&w.draft.planVersion||0))return fail('这组选项已变化，请重新说明需求')
   selected={continuationRef:card.data.continuationRef,optionId:option.id}
   if(option.requiresDate){try{require('./meal-save-target').validateMealTarget({date:choice.date,mealType:'breakfast'})}catch(_){return fail('请选择有效日期')};selected.date=choice.date}
   else if(choice.date!==undefined)return fail('请重新选择当前选项')
   message=[card.title,option.label,selected.date||''].filter(Boolean).join(' ')
  }
  if(!message || message.length>2000)return fail('请用两千字以内说说这一餐的想法')
  if(!w || local.dirty || local.pending)return fail('本餐还有未同步内容，请回到今天先同步后再试')
  record.pending={body:{requestId:makeId(),message,workspaceId:w.id,expectedWorkspaceRevision:w.revision,expectedPlanVersion:w.draft && w.draft.planVersion || 0,entryScene:options.entryScene || 'chat'}}
  const negotiated=capabilities.get(scope)
  if(negotiated&&negotiated.enabled&&negotiated.until>Date.now()&&negotiated.uiFeatures&&negotiated.uiFeatures.length)record.pending.body.uiFeatures=negotiated.uiFeatures.slice()
  if(selected)record.pending.body.clarificationChoice=selected
  record.bindingExpired=false;view.input='';view.error='';view.busy=true;view.messages.push({id:record.pending.body.requestId,role:'user',text:message,cards:[]});record.messages=clone(view.messages);persist()
  try{return await dispatch()}catch(error){return fail()}
 })}
 function recover(turnId) {return exclusive(async()=>{
  if(!record || !record.sessionId)return loadRecord()
  try {
   if(record.confirmation && record.confirmation.unknown){
    if(!await resolveConfirmation())return state()
    return await resumeCurrent()
   }
   if(record.renewal)return await resolveRenewal(true)
   if(turnId)return await poll(turnId)
   if(view.turn&&['queued','running'].includes(view.turn.status))return await poll(view.turn.turnId)
   if(record.pending){await dispatch();if(!current())return state();return await resumeCurrent()}
   // A restored session may have a pending preview but no local send record.
   // Read that original turn before considering its server-owned continuation.
   if(view.turn&&view.turn.status==='awaiting_confirmation'){
    const id=view.turn.turnId;await poll(id)
    if(!current()||!view.turn||view.turn.turnId!==id)return state()
   }
   return await resumeCurrent()
  }catch(error){return fail('结果暂未核对，原请求已保留，请稍后恢复')}
 })}
 async function resolveConfirmation(){
  const confirmation=record.confirmation
  const task=await api.getControlledTask(confirmation.taskId);if(!current())return false
  if(!task){fail('刚才的保存结果还待核对，请稍后恢复');return false}
  if(task.status==='completed'){if(!record.confirmedTasks.includes(confirmation.taskId))record.confirmedTasks.push(confirmation.taskId);confirmation.unknown=false}
  else if(task.status==='awaiting_confirmation'||task.status==='cancelled'||task.status==='failed')confirmation.unknown=false
  else {fail('刚才的保存结果还待核对，请稍后恢复');return false}
  persist();await poll(confirmation.turnId)
  if(current()&&task.status==='failed'&&task.retryable===true){view.error='这次保存未完成，可再次确认重试，或取消预览';persist()}
  return current()
 }
 function confirm(cardId) {return exclusive(async()=>{
  if(!actionsEnabled)return fail('助手暂不可用，请稍后再确认')
  const turn=view.turn,card=turn && (turn.cards || []).find(c=>c.id===cardId),pending=turn && turn.pendingAction
  if(!turn || turn.status!=='awaiting_confirmation' || !card || !['calendar_save','shopping_preview'].includes(card.type) || card.data&&card.data.kind==='readonly_fact' || !pending || card.taskId!==pending.taskId || card.previewToken!==pending.previewToken || !card.previewToken)return state()
  if(record.renewal)return fail('食材选择结果还待核对，请先恢复原请求')
  if(record.confirmedTasks.includes(card.taskId))return state()
  if(record.confirmation && record.confirmation.unknown)return fail('刚才的保存结果还待核对，请先恢复原请求')
  if(!card.expiresAt || Number(card.expiresAt)<=Date.now())return fail('这份预览已过期，请重新核对后再确认')
  record.confirmation={taskId:card.taskId,turnId:turn.turnId,previewToken:card.previewToken,unknown:true};view.busy=true;persist()
  try {
   const result=await api.confirmControlledTask(card.taskId,card.previewToken);if(!current())return state()
   if(result&&result.status==='failed'){record.confirmation.unknown=false;persist();await poll(turn.turnId);return fail(result.retryable?'这次保存未完成，可再次确认重试，或取消预览':'这份预览未能保存，请取消后重新核对')}
   if(!result || result.status!=='completed')return fail('保存结果待核对，请恢复刚才的请求')
   record.confirmedTasks.push(card.taskId);record.confirmation.unknown=false;persist()
   return await poll(turn.turnId)
  }catch(error){return fail('保存结果待核对，请恢复刚才的请求')}
 })}
 async function resumeCurrent(){
  if(!current() || !actionsEnabled || !canResume(view.turn) || !api.resumeAssistantV4Turn)return state()
  const id=view.turn.turnId;view.busy=true;persist()
  const turn=await api.resumeAssistantV4Turn(id);if(!current())return state()
  if(!turn || turn.turnId!==id)throw Error('invalid resume')
  adopt(turn);await refreshWorkspace(turn);return state()
 }
 async function resolveRenewal(queryFirst){
  const renewal=record.renewal;if(!renewal || !current())return state()
  view.busy=true;persist()
  let task
  if(queryFirst){
   try{task=await api.getControlledTaskByRequest(renewal.body.requestId)}catch(error){if(error.statusCode!==404)throw error}
   if(!current())return state()
  }
  if(!task){
   try{task=await api.repreviewAssistantShopping(renewal.taskId,clone(renewal.body))}catch(error){
    if(!current())return state()
    if(!error||![400,409].includes(error.statusCode))throw error
    // Rejection is definitive; restore the server's current parent before
    // enabling edits. If this read fails the renewal remains recoverable.
    await poll(renewal.turnId);if(!current())return state()
    record.renewal=null;view.busy=false;view.error='这次选择未能应用，已恢复当前预览。请保留已购或手动填写的食材后再试';persist();return state()
   }
   if(!current())return state()
  }
  if(!task || !task.id)throw Error('invalid renewal')
  renewal.newTaskId=task.id;persist()
  const turn=await api.getAssistantV4Turn(renewal.turnId);if(!current())return state()
  if(!turn || turn.turnId!==renewal.turnId)throw Error('invalid parent')
  if(['completed','cancelled','failed','partially_completed'].includes(turn.status)){record.renewal=null;adopt(turn);await refreshWorkspace(turn);return state()}
  const card=(turn.cards || []).find(c=>c.taskId===task.id),pending=turn.pendingAction
  if(turn.status!=='awaiting_confirmation' || !pending || pending.taskId!==task.id || !task.previewToken || pending.previewToken!==task.previewToken || !card || card.previewToken!==task.previewToken)throw Error('renewal mismatch')
  record.renewal=null;adopt(turn);return state()
 }
 function selectShopping(cardId,selectedSourceKeys,excludedOwnedIngredients){return exclusive(async()=>{
  if(!actionsEnabled)return fail('助手暂不可用，原预览仍保留')
  if(record&&record.renewal)return fail('上次食材选择还待核对，请先恢复原请求')
  if(record&&record.confirmation&&record.confirmation.unknown)return fail('刚才的加入结果还待核对，请先恢复原请求')
  const turn=view.turn,card=turn&&(turn.cards || []).find(c=>c.id===cardId),pending=turn&&turn.pendingAction
  if(!api.repreviewAssistantShopping || !turn || turn.status!=='awaiting_confirmation' || !card || card.type!=='shopping_preview' || card.receiptRef || card.data&&card.data.kind==='readonly_fact' || !pending || card.taskId!==pending.taskId || card.previewToken!==pending.previewToken || record.confirmedTasks.includes(card.taskId))return state()
  const keys=new Set((card.data&&card.data.items || []).map(i=>i.sourceKey).filter(k=>typeof k==='string'))
  if(selectedSourceKeys!==undefined&&(!Array.isArray(selectedSourceKeys)||selectedSourceKeys.some(k=>!keys.has(k))||new Set(selectedSourceKeys).size!==selectedSourceKeys.length))return fail('食材选择已变化，请核对当前预览')
  if(Array.isArray(selectedSourceKeys)&&selectedSourceKeys.length===0)return fail('请至少保留一种食材；不再采购时可取消预览')
  if(excludedOwnedIngredients!==undefined&&(!Array.isArray(excludedOwnedIngredients)||excludedOwnedIngredients.some(k=>typeof k!=='string'||!k.trim())||new Set(excludedOwnedIngredients).size!==excludedOwnedIngredients.length))return fail('请核对家里已有的食材')
  const body={requestId:makeId()};if(selectedSourceKeys!==undefined)body.selectedSourceKeys=clone(selectedSourceKeys);if(excludedOwnedIngredients!==undefined)body.excludedOwnedIngredients=clone(excludedOwnedIngredients)
  record.renewal={turnId:turn.turnId,taskId:card.taskId,body};view.busy=true;view.error='';persist()
  try{return await resolveRenewal(false)}catch(error){return fail('食材选择结果待核对，请恢复刚才的请求后再确认')}
 })}
 function cancelTurn() {
  if(cancellation)return cancellation
  if(!current()||!record)return Promise.resolve(state())
  const origin=record,sessionId=record.sessionId,pending=record.pending,turnId=view.turn&&view.turn.turnId,prior=running
  const same=()=>current()&&record===origin&&record.sessionId===sessionId
  cancellation=Promise.resolve(prior).then(async()=>{
  try{
   if(!same())return state()
   const id=pending?pending.turnId:turnId
   if(!id)return fail('原请求结果待核对，请先恢复后再停止')
   if(view.turn&&view.turn.turnId!==id)return state()

   if(record&&record.confirmation&&record.confirmation.unknown){if(!await resolveConfirmation())return state()}
   if(!same()||view.turn&&view.turn.turnId!==id)return state()
   const turn=view.turn
   if(turn&&!['queued','running','awaiting_confirmation'].includes(turn.status))return state()
   await api.cancelAssistantV4Turn(id);if(!current())return state();return await poll(id)
  }catch(error){return fail('停止前还需核对原结果，请恢复刚才的请求')}
 }).finally(()=>{cancellation=null;notify()})
 view.error='正在停止这次请求，请稍候核对结果';notify();return cancellation
 }
 function loadOlder(){return exclusive(async()=>{
  if(!record || !record.sessionId || !view.nextCursor)return state()
  try {
   const page=await api.getAssistantV4Session(record.sessionId,{cursor:view.nextCursor,limit:30});if(!current())return state()
   if(!page || page.sessionId!==record.sessionId)return fail('先前的对话暂未读到，请稍后再试')
   const seen=new Set(),combined=[...(page.messages || []),...view.messages]
   view.messages=combined.filter(m=>{if(seen.has(m.id))return false;seen.add(m.id);return true});view.nextCursor=page.nextCursor || null;record.messages=clone(view.messages);persist();return state()
  }catch(error){return fail('先前的对话暂未读到，请稍后再试')}
 })}
 function setInput(input){if(current()){view.input=String(input || '');if(record)persist()}}
 function dispose(){active=false}
 return {chooseClarification:(cardId,optionId,date)=>send('',{cardId,optionId,date}),setActionsEnabled(value){actionsEnabled=value===true;notify()},load,loadOlder,send,confirm,selectShopping,cancelTurn,recover,state,setInput,dispose}
}
module.exports={createAssistantConversation,probeAssistantCapability,clearCapabilityCache:()=>capabilities.clear(),uuid}
