const {validateMealTarget}=require('./meal-save-target')
const KINDS=['record_actual','edit_preferences','edit_shopping','copy_recipe','save_personal_menu','use_personal_menu','view_favorite']
const clone=value=>JSON.parse(JSON.stringify(value))
const keys=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>allowed.includes(k))
const id=value=>Number.isSafeInteger(value)&&value>0
function validate(value){
 if(!keys(value,['kind','ref','target','sourceVersion','prefill'])||!KINDS.includes(value.kind))return null
 const kind=value.kind,ref=value.ref
 const field=({edit_shopping:'itemId',copy_recipe:'dishId',view_favorite:'dishId',use_personal_menu:'menuId',save_personal_menu:'workspaceId'})[kind]
 if(!keys(ref,field?[field]:[])||field&&(field==='workspaceId'?typeof ref[field]!=='string'||!ref[field]||ref[field].length>100:!id(ref[field])))return null
 const result={kind,ref:clone(ref)}
 try{if(value.target){if(!keys(value.target,['date','mealType']))return null;result.target=validateMealTarget(value.target)}}catch(_){return null}
 if(['record_actual','save_personal_menu','use_personal_menu'].includes(kind)&&!result.target)return null
 if(value.sourceVersion!=null){if(typeof value.sourceVersion!=='string'||!value.sourceVersion||value.sourceVersion.length>100)return null;result.sourceVersion=value.sourceVersion}
 if(value.prefill!=null){if(!keys(value.prefill,['userText'])||typeof value.prefill.userText!=='string'||value.prefill.userText.length>2000)return null;result.prefill={userText:value.prefill.userText}}
 return result
}
function routeForHandoff(value){
 const p=validate(value);if(!p)return ''
 switch(p.kind){
  case 'record_actual':return `/pages/calendar-detail/calendar-detail?date=${p.target.date}&mealType=${p.target.mealType}`
  case 'edit_preferences':return '/pages/settings/settings'
  case 'edit_shopping':return '/pages/shopping-list/shopping-list'
  case 'copy_recipe':return `/pages/custom-dishes/custom-dishes?copy=${p.ref.dishId}${p.sourceVersion?'&version='+encodeURIComponent(p.sourceVersion):''}`
  case 'view_favorite':return '/pages/dish-detail/dish-detail?id='+p.ref.dishId
  case 'save_personal_menu':case 'use_personal_menu':return '/pages/customize/customize'
  default:return ''
 }
}
function createActionHandoffStore({storage,scopeKey,originScopeKey=scopeKey,now=Date.now}){
 let sequence=0
 function takeWithOrigin(token){if(typeof token!=='string'||!token)return null;const key=scopeKey(),records=storage.getStorageSync(key);if(!Array.isArray(records))return null
  const record=records.find(r=>r.token===token);if(!record)return null;storage.setStorageSync(key,records.filter(r=>r!==record))
  const age=now()-record.created,payload=age>=0&&age<600000?validate(record.payload):null
  return payload?{payload,origin:require('./assistant-origin').validateOrigin(record.origin,originScopeKey(),now())}:null}
 return{
  put(value,origin){const payload=validate(value);if(!payload)return '';const created=now(),key=scopeKey(),token=`${created}-${++sequence}-${Math.random().toString(36).slice(2)}`
   const previous=storage.getStorageSync(key),records=Array.isArray(previous)?previous.filter(r=>r&&created-r.created>=0&&created-r.created<600000).slice(-19):[]
   const checked=origin?require('./assistant-origin').validateOrigin({...origin,scopeKey:originScopeKey(),created},originScopeKey(),created):null
   records.push({token,created,payload,...(checked?{origin:checked}:{})});storage.setStorageSync(key,records);return token},
  takeWithOrigin,
  take(token){const incoming=takeWithOrigin(token);return incoming&&incoming.payload}
 }
}
function currentStore(environment={}){return createActionHandoffStore({storage:environment.storage||wx,scopeKey:()=>require('./config').getApiBaseUrl()+':'+(environment.storageKey||require('./util').getUserStorageKey)('assistantActionHandoffs'),originScopeKey:()=>require('./assistant-origin').currentOriginScope(environment)})}
function incomingWithOrigin(options={},allowed=[],environment={}){
 const isTab=allowed.some(k=>['save_personal_menu','use_personal_menu'].includes(k));if(!options.handoffToken&&!isTab)return null
 const storage=environment.storage||wx,storageKey=environment.storageKey||require('./util').getUserStorageKey,key=storageKey('assistantActionTab'),tab=isTab?storage.getStorageSync(key):null,token=options.handoffToken||(tab&&tab.token)
 if(!token)return null
 const received=currentStore(environment).takeWithOrigin(token)
 if(tab&&tab.token===token)storage.removeStorageSync(key)
 return received&&allowed.includes(received.payload.kind)?received:null
}
function incoming(options={},allowed=[],environment={}){const received=incomingWithOrigin(options,allowed,environment);return received&&received.payload}
function openCard(card,workspace,origin){
 if(!card||card.type!=='handoff'||!workspace||!card.workspaceRef||card.workspaceRef.workspaceId!==workspace.id||card.workspaceRef.workspaceRevision!==workspace.revision||card.workspaceRef.planVersion!==workspace.draft.planVersion||!card.expiresAt||card.expiresAt<=Date.now())return false
 const payload=validate(card.data),route=routeForHandoff(payload);if(!route)return false
 const token=currentStore().put(payload,origin);if(!token)return false
 if(route==='/pages/customize/customize'){wx.setStorageSync(require('./util').getUserStorageKey('assistantActionTab'),{token});wx.switchTab({url:route})}
 else wx.navigateTo({url:route+(route.includes('?')?'&':'?')+'handoffToken='+encodeURIComponent(token)})
 return true
}
module.exports={createActionHandoffStore,routeForHandoff,validate,incoming,incomingWithOrigin,currentStore,openCard}
