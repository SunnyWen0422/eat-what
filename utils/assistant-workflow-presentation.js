// Public continuation contains action kinds and receipts, never replay arguments.
const labels={draft_update:'更新本餐',calendar_save:'保存计划',shopping_preview:'准备采购'}
const stepsOf=turn=>turn&&turn.continuation&&Array.isArray(turn.continuation.steps)?turn.continuation.steps:[]
const receiptOf=step=>typeof step.receiptRef==='string'&&step.receiptRef.trim()?step.receiptRef:null
function remainingKinds(turn) {
 const steps=stepsOf(turn)
 if(!turn||turn.status!=='partially_completed'||!steps.length||steps.some(s=>!s||!labels[s.kind]))return []
 // A completed step without evidence is unknown, not safe to repeat.
 if(steps.some(s=>s.status==='completed'&&!receiptOf(s)))return []
 return [...new Set(steps.filter(s=>!receiptOf(s)&&['pending','failed','cancelled','awaiting_confirmation'].includes(s.status)).map(s=>s.kind))]
}
function buildRemainingTaskPrefill({turn}={}) {
 const kinds=remainingKinds(turn)
 if(!kinds.length)return null
 const questions={draft_update:'请先和我核对要调整的本餐菜单和要求',calendar_save:'请先和我核对计划来源、目标日期和餐次',shopping_preview:'请先和我核对采购来源（本餐菜单或已保存计划）及目标清单'}
 return `还有${kinds.map(k=>labels[k]).join('、')}未完成。${kinds.map(k=>questions[k]).join('；')}，再重新预览。已完成的步骤不要重复执行。`
}
function presentWorkflow({turn,confirmationPending=false,selectionPending=false}={}) {
 const direct=!!(turn&&(turn.cards||[]).some(c=>c.data&&c.data.executionMode==='direct'))
 const steps=stepsOf(turn),terminal=turn&&['completed','partially_completed','failed','cancelled','needs_input'].includes(turn.status)
 const remaining=remainingKinds(turn),rows=steps.length>1?steps.slice(0,3).map((step,index)=>{
  step=step||{}
  const receiptRef=receiptOf(step),unknown=(confirmationPending||selectionPending)&&index===turn.continuation.cursor
  const status=receiptRef?'completed':step.status==='completed'||unknown?'unknown':step.status==='awaiting_confirmation'&&!terminal?'awaiting_confirmation':'unfinished'
  const statusLabel={completed:'已完成',unknown:'结果待核对',awaiting_confirmation:direct?'办理中':'待确认',unfinished:turn&&turn.status==='cancelled'?'已停止':'未完成'}[status]
  return{id:step.stepId||String(index),kind:step.kind,status,receiptRef,label:`${labels[step.kind]||'这一步'} · ${statusLabel}`}
 }):[]
 let primaryAction=null,primaryLabel=''
 if(confirmationPending||selectionPending){primaryAction='recover';primaryLabel='核对原请求结果'}
 else if(turn&&turn.status==='awaiting_confirmation'){
  const pending=turn.pendingAction,card=pending&&(turn.cards||[]).filter(c=>c.taskId===pending.taskId&&c.previewToken===pending.previewToken&&['calendar_save','shopping_preview'].includes(c.type)&&!c.receiptRef&&!(c.data&&c.data.kind==='readonly_fact')).slice(-1)[0]
  if(direct){primaryAction='recover';primaryLabel='核对办理结果'}
  else if(card&&card.previewToken&&Number(card.expiresAt)>Date.now()&&(!pending.expiresAt||Number(pending.expiresAt)>Date.now())){primaryAction='preview';primaryLabel='核对当前预览'}
  else if(pending||steps[turn.continuation&&turn.continuation.cursor]&&steps[turn.continuation.cursor].status==='pending'){primaryAction='recover';primaryLabel=pending?'重新核对过期或缺失的预览':'准备下一步预览'}
 }
 else if(remaining.length){primaryAction='remaining';primaryLabel='填写剩余事项，再核对'}
 return{rows,primaryAction,primaryLabel,remainingKinds:remaining}
}
module.exports={presentWorkflow,buildRemainingTaskPrefill}
