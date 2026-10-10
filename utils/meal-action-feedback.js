/** Receipt-bound display state; this module never changes menus or writes plans.
 * @typedef {{requestId:string,kind:string,state:'pending'|'success'|'error'|'unknown',message:string,undoAvailable:boolean}} ActionFeedback
 */
function deriveActionFeedback({before,after,command,requestId,pending=false,error}) {
  const body=typeof command==='string'?{command}:command || {},kind=body.command || ''
  const value={requestId,kind,state:'pending',message:kind==='replace'?'正在换这一道菜':'正在更新本餐菜单',undoAvailable:false}
  const workspace=after && after.workspace,receipt=after && after.actionReceipt
  if(after && (after.pending && after.syncStatus!=='saving' || ['unknown','offline'].includes(after.syncStatus)))return {...value,state:'unknown',message:'结果待确认，请核对并重试原请求'}
  if(error || after && after.syncStatus==='conflict')return {...value,state:'error',message:error && error.message || '本餐已变化，请核对最新内容；原菜单仍保留'}
  if(pending && !receipt)return value
  const expected=body.expectedWorkspaceRevision == null ? before && before.revision : body.expectedWorkspaceRevision
  const version=body.planVersion == null ? before && before.draft && before.draft.planVersion : body.planVersion
  if(!before || !workspace || !receipt || receipt.requestId!==requestId || receipt.workspaceId!==before.id || workspace.id!==before.id || receipt.revision!==expected+1)
    return {...value,state:'unknown',message:'回执尚未匹配，请核对原请求'}
  if(receipt.taskId && workspace.status==='generating' && workspace.taskId===receipt.taskId && workspace.revision===receipt.revision)return value
  const revision=receipt.revision+(receipt.taskId?1:0)
  if(workspace.revision!==revision)return {...value,state:'unknown',message:'本餐版本已变化，请核对原请求与最新菜单'}
  if(receipt.taskId) {
    const task=after.actionTask
    if(!task || task.id!==receipt.taskId || task.workspaceId!==receipt.workspaceId || task.baseRevision!==receipt.revision)
      return {...value,state:'unknown',message:'原任务结果仍待核对，请查询原请求'}
    if(task.status!=='draft')return {...value,state:['queued','running'].includes(task.status)?'unknown':'error',message:workspace.message || '原任务未完成，当前菜单仍保留'}
  }
  if(['needs_input','failed','cancelled'].includes(workspace.status))return {...value,state:'error',message:workspace.message || '本次调整未完成，原菜单仍保留'}
  if(kind==='cancel' && !receipt.taskId && workspace.status!=='generating' && workspace.draft && workspace.draft.planVersion===version && receipt.planVersion===version)
    return {...value,state:'success',message:'已停止，原菜单仍保留'}
  if(!workspace.draft || workspace.draft.planVersion!==version+1 || (!receipt.taskId && receipt.planVersion!==version+1))return {...value,state:'unknown',message:'菜单尚未确认完成，请核对原请求'}
  const oldDishes=before.draft && before.draft.dishes || [],dishes=workspace.draft.dishes || []
  let message='本餐菜单已更新',dishId=null
  if(kind==='replace') {
    const index=oldDishes.findIndex(d=>d.id===body.dishId),replacement=dishes[index]
    if(index<0 || !replacement || replacement.id===body.dishId)return {...value,state:'error',message:'这道菜尚未更换，原菜单仍保留'}
    message=`已换为${replacement.name || '新菜品'}`;dishId=replacement.id
  } else if(kind==='undo') {
    const restored=dishes.filter((d,i)=>!oldDishes[i] || d.id!==oldDishes[i].id || d.name!==oldDishes[i].name)
    message=`已恢复${(restored.length?restored:dishes).map(d=>d.name).filter(Boolean).join('、') || '上一版菜单'}`
  }
  return {...value,state:'success',message,dishId,undoAvailable:['replace','select','generate','regenerate','undo'].includes(kind) && !!(workspace.draft.history || []).length}
}
function legacyLockNotice(draft) {
  return draft && (draft.lockedDishIds || []).length ? '旧草稿中有保留菜。下次换菜、换一套或自己选菜时，会一并解除旧保留；原菜单快照仍可撤销恢复。' : ''
}
function interactionCommand(command,extra={}) {
  return {...extra,...(['generate','regenerate','replace','select','undo'].includes(command)?{releaseLegacyLocks:true}:{})}
}
module.exports={deriveActionFeedback,legacyLockNotice,interactionCommand}
