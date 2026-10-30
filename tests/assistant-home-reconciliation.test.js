const test=require('node:test'),assert=require('node:assert/strict')
const {collectRecoveryPointers}=require('../utils/meal-journey-presentation')
const {reconcileAssistantReceipts}=require('../utils/assistant-journal-reconciliation')
const scope='local|A',key='assistant-v4:'+encodeURIComponent(scope)+':w'
const initial=()=>({sessionBody:{workspaceId:'w'},sessionId:'session',pending:{turnId:'turn',body:{requestId:'original',message:'安排晚餐'}},lastTurn:{turnId:'turn',status:'running'},messages:[],input:'再少放点盐',draftEdited:true})
function fixture(){const rows=new Map([[key,initial()]]),calls=[];return {rows,calls,options:{scope,workspaceId:'w',keys:()=>[...rows.keys()],read:k=>rows.get(k),write:(k,v)=>rows.set(k,v),isCurrent:()=>true,api:{getAssistantV4Turn:async id=>{calls.push(id);return {turnId:id,status:'completed',reply:'已更新本餐',cards:[]}}}}}}
test('returning home clears a completed same-account receipt without resending or losing typed input',async()=>{
 const f=fixture();await reconcileAssistantReceipts(f.options)
 assert.deepEqual(f.calls,['turn']);assert.equal(f.rows.get(key).pending,null)
 assert.equal(f.rows.get(key).input,'再少放点盐');assert.equal(f.rows.get(key).lastTurn.status,'completed')
})
test('unknown sends and real previews remain recoverable; other accounts and meals are not read',async()=>{
 const f=fixture();f.rows.set(key,{...initial(),pending:{body:{requestId:'unknown'}}})
 f.rows.set(key+':other',{...initial(),sessionBody:{workspaceId:'other'}})
 f.rows.set('assistant-v4:other-account:w',initial());await reconcileAssistantReceipts(f.options)
 assert.equal(f.calls.length,0)
 f.rows.set(key,initial());f.options.api.getAssistantV4Turn=async()=>({turnId:'turn',status:'awaiting_confirmation',pendingAction:{id:'preview'}})
 await reconcileAssistantReceipts(f.options);assert.equal(f.rows.get(key).pending.turnId,'turn')
})
test('a late receipt cannot overwrite new input, a newer request, or another account',async()=>{
 for(const mode of ['edited','account','new-request']){
  const f=fixture();f.options.api.getAssistantV4Turn=async()=>{
   if(mode==='account')f.options.isCurrent=()=>false
   else f.rows.set(key,{...initial(),...(mode==='edited'?{input:'新输入'}:{pending:{turnId:'new'}})})
   return {turnId:'turn',status:'completed'}
  };const current=()=>f.options.isCurrent();await reconcileAssistantReceipts({...f.options,isCurrent:current})
  assert.ok(f.rows.get(key).pending)
 }
})
test('lookup failure preserves the original request evidence',async()=>{
 const f=fixture(),before=JSON.stringify(f.rows.get(key));f.options.api.getAssistantV4Turn=async()=>{throw Error('offline')}
 await reconcileAssistantReceipts(f.options);assert.equal(JSON.stringify(f.rows.get(key)),before)
})
test('partial completion clears only the recovered compound request, retaining independently typed input',async()=>{
 for(const edited of [false,true]){
  const f=fixture();f.rows.set(key,{...initial(),input:edited?'下一顿吃清淡些':'安排晚餐',draftEdited:edited})
  f.options.api.getAssistantV4Turn=async()=>({turnId:'turn',status:'partially_completed'})
  await reconcileAssistantReceipts(f.options)
  assert.equal(f.rows.get(key).input,edited?'下一顿吃清淡些':'')
 }
})
test('completed turn rereads a newer menu before removing recovery; a failed reread retains a read-only pointer',async()=>{
 for(const failed of [false,true]){
  const f=fixture();let current={id:'w',revision:1,draft:{planVersion:1}},refreshes=0
  f.options.workspace=()=>current
  f.options.refreshWorkspace=async()=>{refreshes++;if(failed)throw Error('offline');current={id:'w',revision:2,draft:{planVersion:2}}}
  f.options.api.getAssistantV4Turn=async()=>({turnId:'turn',status:'completed',workspaceRef:{workspaceId:'w',workspaceRevision:2,planVersion:2}})
  await reconcileAssistantReceipts(f.options)
  assert.equal(refreshes,1)
  assert.equal(!!f.rows.get(key).pending,failed)
  assert.equal(!!f.rows.get(key).workspaceSyncRef,failed)
  if(!failed)assert.equal(current.revision,2)
 }
})
test('a normal execution checkpoint is busy, never a preview confirmation',()=>{
 const f=fixture();f.rows.set('A:meal-workspace:2026-10-27:dinner',{workspace:{id:'w'}})
 f.rows.set(key,{...initial(),lastTurn:{turnId:'turn',status:'awaiting_confirmation',reply:'已更新本餐，正在准备下一步',retryable:false,continuation:{cursor:0,steps:[{status:'pending'}]}}})
 const pointers=collectRecoveryPointers({storage:{getStorageInfoSync:()=>({keys:[...f.rows.keys()]}),getStorageSync:k=>f.rows.get(k)},storageKey:k=>'A:'+k,assistantScope:scope})
 assert.equal(pointers[0].state,'busy')
})
