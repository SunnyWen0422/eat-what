const clone=value=>JSON.parse(JSON.stringify(value))
// Read the result of an existing request only. Home must never replay a model
// question or confirm an old preview while reconciling its local receipt.
async function reconcileAssistantReceipts({api,scope,workspaceId,keys,read,write,isCurrent,workspace,refreshWorkspace}) {
 if(!workspaceId||!api.getAssistantV4Turn)return
 const prefix='assistant-v4:'+encodeURIComponent(scope)+':'
 for(const key of keys()) {
  if(!isCurrent())return
  if(typeof key!=='string'||!key.startsWith(prefix))continue
  const saved=read(key)
  if(!saved||!saved.sessionBody||saved.sessionBody.workspaceId!==workspaceId||
    !saved.pending||!saved.pending.turnId||saved.renewal||saved.steering||saved.confirmation&&saved.confirmation.unknown)continue
  let before=JSON.stringify(saved)
  const record=clone(saved),id=record.pending.turnId
  try {
   const turn=await api.getAssistantV4Turn(id)
   if(!isCurrent())return
   if(!turn||turn.turnId!==id||JSON.stringify(read(key))!==before)continue
   record.lastTurn=clone(turn)
   const refs=[turn.workspaceRef,...(turn.cards||[]).map(card=>card.workspaceRef),record.workspaceSyncRef]
    .filter(ref=>ref&&ref.workspaceId===workspaceId&&Number.isInteger(ref.workspaceRevision)&&Number.isInteger(ref.planVersion))
   const ref=refs.reduce((latest,next)=>!latest||next.workspaceRevision>latest.workspaceRevision?next:latest,null)
   if(ref){
    const synchronized=()=>{const w=workspace&&workspace();return !!(w&&w.id===ref.workspaceId&&w.revision>=ref.workspaceRevision&&w.draft&&w.draft.planVersion>=ref.planVersion)}
    if(!synchronized()){
     // The action can finish between the initial workspace read and this turn
     // read. Persist only a read target; never clear its receipt prematurely.
     record.workspaceSyncRef=clone(ref);write(key,record);before=JSON.stringify(record)
     if(!refreshWorkspace)continue
     await refreshWorkspace(ref)
     if(!isCurrent())return
     if(JSON.stringify(read(key))!==before||!synchronized())continue
    }
    record.workspaceSyncRef=null
   }
   if(['completed','cancelled','failed','partially_completed','needs_input'].includes(turn.status)) {
    if(turn.status==='partially_completed'&&!record.draftEdited&&record.input===(record.pending.body&&record.pending.body.message))record.input=''
    if(['cancelled','failed'].includes(turn.status)&&!record.draftEdited)record.input=record.pending.body&&record.pending.body.message||record.input||''
    record.pending=null
   }
   write(key,record)
  }catch(_) { /* Keep the exact original request for a later read. */ }
 }
}
module.exports={reconcileAssistantReceipts}
