const {validateMealTarget}=require('./meal-save-target')
const TTL=600000
const ROUTES={home:'/pages/index/index',calendar:'/pages/calendar-detail/calendar-detail',dish:'/pages/dish-detail/dish-detail',history:'/pages/assistant-history/assistant-history',assistant:'/pages/chat/chat'}
const LABELS={home:'回到今天',calendar:'返回原餐次',dish:'返回原菜品',history:'返回对话记录',assistant:'返回原对话'}
const text=value=>typeof value==='string'&&value.length>0&&value.length<=200
function validateOrigin(value,currentScope,now=Date.now()){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['scopeKey','kind','created','sessionId','workspaceId','date','mealType','dishId'].includes(k)))return null
 if(!Object.prototype.hasOwnProperty.call(ROUTES,value.kind)||typeof value.scopeKey!=='string'||!value.scopeKey||value.scopeKey!==currentScope||!Number.isFinite(value.created)||value.created<0||now-value.created<0||now-value.created>=TTL)return null
 const result={scopeKey:currentScope,kind:value.kind,created:value.created}
 for(const key of ['sessionId','workspaceId'])if(value[key]!=null){if(!text(value[key]))return null;result[key]=value[key]}
 if(value.date!=null||value.mealType!=null)try{Object.assign(result,validateMealTarget(value))}catch(_){return null}
 if(value.dishId!=null){if(!Number.isSafeInteger(value.dishId)||value.dishId<1)return null;result.dishId=value.dishId}
 if(value.kind==='dish'&&!result.dishId||value.kind==='calendar'&&!result.date||value.kind==='assistant'&&(!result.sessionId||!result.workspaceId||!result.date))return null
 return result
}
function createAssistantOriginStore({storage,scopeKey,now=Date.now}){
 let sequence=0
 return{
  put(origin){
   try{
   const key=scopeKey(),created=now(),value=validateOrigin({...origin,scopeKey:key,created},key,created)
   if(!value)return ''
   const storageKey=key+':sourceTokens',token=`${created}-origin-${++sequence}-${Math.random().toString(36).slice(2)}`,previous=storage.getStorageSync(storageKey)
   const records=Array.isArray(previous)?previous.filter(r=>r&&validateOrigin(r.origin,key,created)).slice(-19):[]
   storage.setStorageSync(storageKey,[...records,{token,origin:value}]);return token
   }catch(_){return ''}
  },
  take(token){
   try{
   if(typeof token!=='string'||!token)return null
   const key=scopeKey(),storageKey=key+':sourceTokens',records=storage.getStorageSync(storageKey);if(!Array.isArray(records))return null
   const record=records.find(r=>r&&r.token===token);if(!record)return null
   storage.setStorageSync(storageKey,records.filter(r=>r!==record));return validateOrigin(record.origin,key,now())
   }catch(_){return null}
  }
 }
}
function currentOriginScope(environment={}){return require('./config').getApiBaseUrl()+':'+(environment.storageKey||require('./util').getUserStorageKey)('assistantOrigins')}
function currentOriginStore(environment={}){return createAssistantOriginStore({storage:environment.storage||wx,scopeKey:()=>currentOriginScope(environment)})}
function resolveAssistantReturn({origin,pageStack=[],currentScope,now=Date.now()}){
 const value=validateOrigin(origin,currentScope,typeof now==='function'?now():now)
 if(!value)return{label:'回到今天',mode:'none'}
 const label=LABELS[value.kind],route=ROUTES[value.kind].slice(1)
 for(let index=pageStack.length-2;index>=0;index--){
  const page=pageStack[index],params=page.options||{},data=page.data||{}
  if(page.route!==route||page._assistantOriginScope&&page._assistantOriginScope!==currentScope)continue
  if(value.kind==='assistant'){
   const state=page.conversation&&page.conversation.state(),workspace=page.store&&page.store.state().workspace
   if((state?state.sessionId:params.sessionId)!==value.sessionId||(workspace?workspace.id:params.workspaceId)!==value.workspaceId)continue
  }
  const focusedMeal=data.focusedMeal||params.mealType
  if(value.kind==='calendar'&&((data.selectedDate||params.date)!==value.date||focusedMeal&&focusedMeal!==value.mealType))continue
  if(value.kind==='dish'&&Number(page._dishId||params.id)!==value.dishId)continue
  return{label,mode:'back',delta:pageStack.length-1-index}
 }
 const params=value.kind==='assistant'?{sessionId:value.sessionId,workspaceId:value.workspaceId,date:value.date,mealType:value.mealType}:value.kind==='calendar'?{date:value.date,mealType:value.mealType}:value.kind==='dish'?{id:value.dishId}:{}
 return{label,mode:value.kind==='home'?'switchTab':'navigateTo',routeKey:value.kind,params}
}
function navigateReturn(result,platform=wx){
 if(result.mode==='back')return platform.navigateBack({delta:result.delta})
 const route=ROUTES[result.routeKey];if(!route)return
 if(result.mode==='switchTab')return platform.switchTab({url:route})
 if(result.mode==='navigateTo'){const query=Object.entries(result.params||{}).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&');return platform.navigateTo({url:route+(query?'?'+query:'')})}
}
function pageStack(){return typeof getCurrentPages==='function'?getCurrentPages():[]}
function bindAssistantOrigin(page,origin,environment={}){
 const scope=currentOriginScope(environment)
 page._assistantOrigin=validateOrigin(origin,scope)
 page._assistantOriginScope=scope
 const result=resolveAssistantReturn({origin:page._assistantOrigin,pageStack:pageStack(),currentScope:scope})
 page.setData({assistantReturnVisible:!!page._assistantOrigin&&page._assistantOrigin.kind==='assistant',assistantReturnLabel:result.label})
}
function refreshAssistantOrigin(page,environment={}){if(page._assistantOrigin)bindAssistantOrigin(page,page._assistantOrigin,environment)}
function returnBlocked(page){
 const d=page.data||{},state=page.store&&page.store.state&&page.store.state()
 return ['busy','saving','savingCustom','menuBusy','menuSaving','mutating','actualBusy','actualLoading','copyBusy','editPending','customPending','menuPending','actualUnknown','copyUnknown','copyPending','savingPlan'].some(k=>d[k])||!!(d.drafts&&d.drafts.length)||!!page._pendingMutation||!!(page._actualBinding&&page._actualBinding.pending)||!!(state&&(state.pending||state.dirty))
}
function returnDirty(page){
 const d=page.data||{}
 return d.dirty||String(d.ingredientDraft||'').trim()||d.formVisible||d.expenseVisible||d.actualVisible||d.showCustomForm||d.menuFormVisible||d.menuEditingId||d.editing&&(typeof page.editChanged!=='function'||page.editChanged())
}
function returnFromPage(page,environment={},fallbackHome=false){
 const scope=currentOriginScope(environment),platform=environment.storage||wx
 let origin=page._assistantOrigin
 const resolve=()=>resolveAssistantReturn({origin,pageStack:pageStack(),currentScope:currentOriginScope(environment)})
 const result=resolve()
 if(result.mode==='none'){page._assistantOrigin=null;origin=null;page.setData({assistantReturnVisible:false,assistantReturnLabel:'回到今天'});if(!fallbackHome)return}
 if(returnBlocked(page)){platform.showModal({title:'请先核对当前操作',content:'还有未完成的保存或结果待核对，请在当前页面核对原请求后返回。',showCancel:false});return}
 const go=()=>{if(page._unloaded||page._assistantAlive===false||page._visible===false||page._recipeVisible===false||page._assistantVisible===false||scope!==currentOriginScope(environment)||origin!==page._assistantOrigin||returnBlocked(page))return;const latest=resolve();if(latest.mode!=='none')return navigateReturn(latest,platform);if(fallbackHome)platform.switchTab({url:ROUTES.home})}
 if(returnDirty(page)){
  const before=JSON.stringify(page.data)
  platform.showModal({title:'离开当前编辑？',content:'输入尚未保存。返回后不会替你保存或执行操作。',confirmText:'离开编辑',cancelText:'保留编辑',success:r=>{if(r.confirm&&before===JSON.stringify(page.data))go()}})
 }else go()
}
function receiveHandoff(page,options,allowed,environment={}){
 const platform=environment.storage||wx,storageKey=environment.storageKey||require('./util').getUserStorageKey
 const attempted=options.handoffToken||allowed.some(k=>['save_personal_menu','use_personal_menu'].includes(k))&&platform.getStorageSync(storageKey('assistantActionTab'))
 const incoming=require('./assistant-action-handoff').incomingWithOrigin(options,allowed,environment)
 // A normal tab onShow must not erase an existing same-lifecycle return pointer.
 if(incoming||attempted)bindAssistantOrigin(page,incoming&&incoming.origin,environment)
 return incoming&&incoming.payload
}
function originQuery(origin,environment={}){const token=currentOriginStore(environment).put(origin);return token?'&originToken='+encodeURIComponent(token):''}
module.exports={createAssistantOriginStore,resolveAssistantReturn,validateOrigin,currentOriginScope,currentOriginStore,bindAssistantOrigin,refreshAssistantOrigin,returnFromPage,receiveHandoff,originQuery}
