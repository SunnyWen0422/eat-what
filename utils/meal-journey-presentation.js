const {validateMealTarget}=require('./meal-save-target')
const {mealSourceUrl}=require('./meal-next-step')
const same=(a,b)=>!!a&&!!b&&a.date===b.date&&a.mealType===b.mealType
const targetOf=value=>{try{return validateMealTarget(value)}catch(_){return null}}
function deriveMealJourney({workspace={},plan,actual,shoppingSources=[],pendingReceipts=[],syncStatus,busy=false,dirty=false,canConfirm,savedTarget,saveState}={}){
 const context=workspace.context||{},target=targetOf(context),draft=workspace.draft||{},status=workspace.status
 const relevant=pendingReceipts.filter(p=>p&&same(p.target,target))
 const unknown=relevant.find(p=>p.state==='unknown')
 let primary={action:'onGenerate',label:'生成本餐菜单',target},recovery=null
 if(unknown||['unknown','offline'].includes(syncStatus)){
  recovery=unknown||{kind:'workspace',state:'unknown',label:'核对原请求',target}
  primary={action:recovery.kind==='workspace'?'onRetryWorkspace':'onRecoverJourney',label:recovery.label||'核对并重试同步',target}
  if(recovery.kind==='workspace')primary.label='核对并重试同步'
 }else if(syncStatus==='conflict'||relevant.some(p=>p.state==='conflict')){
  recovery=relevant.find(p=>p.state==='conflict')||{kind:'workspace',state:'conflict',label:'本餐已有更新',target};primary={action:recovery.kind==='workspace'?'onLoadLatest':'onRecoverJourney',label:'读取最新安排',target}
 }else if(busy||status==='generating'||relevant.some(p=>p.state==='busy')){
  recovery=relevant.find(p=>p.state==='busy')||{kind:'workspace',state:'busy',label:'正在处理本餐',target};primary={action:recovery.kind!=='workspace'?'onRecoverJourney':'onCancelTask',label:recovery.kind!=='workspace'?'查看正在处理的请求':status==='generating'?'停止本次安排':'正在处理',target}
 }else if(dirty||status==='needs_regeneration'){
  recovery={kind:'workspace',state:'unapplied',label:'条件已修改',target}
  const regenerate=status==='needs_regeneration'||draft.dishes&&draft.dishes.length
  primary={action:regenerate?'onRegenerate':'onGenerate',label:regenerate?(context.compositionMode==='manual'?'按新搭配换一套':'按新条件换一套'):'生成本餐菜单',target}
 }else if(relevant.some(p=>p.state==='confirmation')){
  recovery=relevant.find(p=>p.state==='confirmation');primary={action:'onRecoverJourney',label:'核对助手安排',target}
 }else if(status==='plan_changed')primary={action:'onViewPlan',label:'查看最新安排',target}
 else if(status==='draft'&&canConfirm)primary={action:'onConfirmPlan',label:'保存到日历',target}
 else if(saveState==='saved'&&targetOf(savedTarget)&&!same(savedTarget,target))primary={action:'onViewSavedMeal',label:'查看已保存的这餐',target:targetOf(savedTarget)}
 else if(status==='planned'&&plan)primary={action:'onViewRecipes',label:'开始做饭 · 本餐全部做法',target}
 else if(status==='needs_input')primary={action:'onOpenRequirements',label:'调整本餐要求',target}
 const secondary=[]
 if(!recovery&&plan)secondary.push({action:'onShoppingPreview',label:'准备食材',target})
 // Purchase sources describe navigation only. Even a checked list is not an actual meal.
 const sources=shoppingSources.map(targetOf).filter(Boolean)
 return{primary,secondary,recovery,target:primary.target,shoppingSources:sources,actualStatus:actual&&['eaten','skipped'].includes(actual.status)?actual.status:'unrecorded'}
}
/** Project existing journals. Never persist a second request or retry on discovery. */
function collectRecoveryPointers({storage,storageKey,assistantScope}){
 const keys=storage.getStorageInfoSync?storage.getStorageInfoSync().keys||[]:[],pointers=[],workspaces=new Map()
 const workspacePrefix=storageKey('meal-workspace:'),actualPrefix=storageKey('mealActual')+':pending:',personalPrefix=storageKey('personalRecipeWrite:')
 const assistantPrefix=assistantScope?'assistant-v4:'+encodeURIComponent(assistantScope)+':':null
 for(const key of keys){
  if(typeof key!=='string'||!key.startsWith(workspacePrefix))continue
  const parts=key.slice(workspacePrefix.length).split(':'),target=targetOf({date:parts[0],mealType:parts[1]})
  if(parts.length!==2||!target)continue
  const value=storage.getStorageSync(key);if(!value)continue
  if(value.workspace)workspaces.set(value.workspace.id,target)
  const state=value.pending?'unknown':value.syncStatus==='conflict'?'conflict':value.dirty?'unapplied':['offline','unknown'].includes(value.syncStatus)?'unknown':null
  if(!state)continue
  pointers.push({id:'workspace:'+target.date+':'+target.mealType,kind:'workspace',state,target,label:state==='unknown'?'本餐结果待核对':state==='conflict'?'本餐已有更新':'本餐输入未同步',requestId:value.pending&&value.pending.body&&value.pending.body.requestId,route:'/pages/result/result?date='+target.date+'&mealType='+target.mealType})
 }
 for(const key of keys){
  if(typeof key!=='string')continue
  // Old consumption requests belong to the retired writer; never turn them
  // into a blocking action for the unified calendar record.
  if(key.startsWith(actualPrefix))continue;else if(key.startsWith(personalPrefix)){
   const value=storage.getStorageSync(key),suffix=key.slice(personalPrefix.length)
   if(!value||!value.requestId)continue
   const copy=/^dish:copy:[1-9][0-9]*$/.test(suffix),menu=/^menu:(?:create|new|edit:[1-9][0-9]*|delete:[1-9][0-9]*|[1-9][0-9]*)$/.test(suffix)
   if(!copy&&!menu&&!/^dish:(?:create|edit:[1-9][0-9]*|delete:[1-9][0-9]*)$/.test(suffix))continue
   pointers.push({id:'personal:'+suffix,kind:copy?'copy_recipe':menu?'personal_menu':'personal_recipe',state:'unknown',target:null,label:suffix.includes(':delete:')?(menu?'常用菜单删除待核对':'个人菜谱删除待核对'):copy?'菜谱副本保存待核对':menu?'常用菜单保存待核对':'个人菜谱保存待核对',requestId:value.requestId,route:menu?'/pages/customize/customize?menus=1':'/pages/custom-dishes/custom-dishes'})
  }else if(assistantPrefix&&key.startsWith(assistantPrefix)){
   const value=storage.getStorageSync(key);if(!value||!(value.pending||value.renewal||value.confirmation&&value.confirmation.unknown))continue
   const target=workspaces.get(value.sessionBody&&value.sessionBody.workspaceId)||null,status=value.lastTurn&&value.lastTurn.status
   const unknown=value.renewal||value.confirmation&&value.confirmation.unknown||value.pending&&!value.pending.turnId
   const state=unknown?'unknown':['queued','running'].includes(status)?'busy':status==='awaiting_confirmation'?'confirmation':'unknown'
   pointers.push({id:'assistant:'+String(value.sessionId||key.slice(assistantPrefix.length)),kind:'assistant',state,target,label:state==='confirmation'?'助手安排待确认':state==='busy'?'助手正在处理':'助手操作结果待核对',route:'/pages/assistant-history/assistant-history'})
  }
 }
 const rank={unknown:0,conflict:1,busy:2,unapplied:3,confirmation:4},seen=new Set()
 return pointers.filter(p=>!seen.has(p.id)&&seen.add(p.id)).sort((a,b)=>(rank[a.state]??9)-(rank[b.state]??9)||a.id.localeCompare(b.id))
}
function openRecoveryPointer(pointer,{platform,storageKey}){
 if(!pointer)return false
 const target=targetOf(pointer.target)
 switch(pointer.kind){
  case 'workspace':if(!target)return false;platform.navigateTo({url:'/pages/result/result?date='+target.date+'&mealType='+target.mealType});break
  case 'actual':if(!target)return false;platform.navigateTo({url:mealSourceUrl(target)+'&recoverActual=1'});break
  case 'copy_recipe':case 'personal_recipe':platform.navigateTo({url:'/pages/custom-dishes/custom-dishes'});break
  case 'personal_menu':platform.setStorageSync(storageKey('openPersonalMenus'),true);platform.switchTab({url:'/pages/customize/customize'});break
  case 'assistant':platform.navigateTo({url:'/pages/assistant-history/assistant-history'});break
  default:return false
 }
 return true
}
module.exports={deriveMealJourney,collectRecoveryPointers,openRecoveryPointer}
