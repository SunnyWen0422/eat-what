const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const plain=v=>v==null?v:JSON.parse(JSON.stringify(v))
const originApi=()=>{const api=fs.existsSync('utils/assistant-origin.js')?require('../utils/assistant-origin'):{};assert.equal(typeof api.createAssistantOriginStore,'function');return api}
const target={date:'2026-10-15',mealType:'dinner'}
const source=()=>({kind:'assistant',sessionId:'session-1',workspaceId:'workspace-1',...target})
function fixture(){let scope='api:A',time=1000;const rows=new Map(),storage={getStorageSync:k=>plain(rows.get(k)),setStorageSync:(k,v)=>rows.set(k,plain(v)),removeStorageSync:k=>rows.delete(k)};return{rows,storage,scope:()=>scope,now:()=>time,switch:v=>scope=v,time:v=>time=v}}

test('source tokens are single use, independently stored and bind the store scope',()=>{
 const api=originApi(),f=fixture(),store=api.createAssistantOriginStore({storage:f.storage,scopeKey:f.scope,now:f.now})
 const token=store.put({...source(),scopeKey:'forged'}),other=store.put({kind:'dish',dishId:7,...target})
 assert.ok(token);assert.deepEqual(store.take(token),{...source(),scopeKey:'api:A',created:1000});assert.equal(store.take(token),null);assert.equal(store.take(other).dishId,7)
 assert.equal(store.put({...source(),route:'/pages/private/private'}),'');assert.equal(store.put({...source(),sessionId:''}),'')
})
test('scope or expiry invalidates return',()=>{
 const api=originApi(),f=fixture(),store=api.createAssistantOriginStore({storage:f.storage,scopeKey:f.scope,now:f.now})
 const token=store.put(source());f.switch('api:B');assert.equal(store.take(token),null);f.switch('other-api:A');assert.equal(store.take(token),null);f.switch('api:A')
 const origin=store.take(token)
 for(const candidate of [{...origin,scopeKey:'api:B'},{...origin,created:1001},{...origin,created:-600000},{...origin,routeKey:'evil'},{...origin,url:'https://evil.test'}])assert.equal(api.resolveAssistantReturn({origin:candidate,pageStack:[],currentScope:f.scope(),now:1000}).mode,'none')
 const expired=store.put(source());f.time(601000);assert.equal(store.take(expired),null)
})
test('optional origin storage failures cannot block entry or return an unconsumed token',()=>{
 const api=originApi(),f=fixture(),store=api.createAssistantOriginStore({storage:f.storage,scopeKey:f.scope,now:f.now})
 const token=store.put(source());f.storage.setStorageSync=()=>{throw Error('storage unavailable')}
 assert.equal(store.take(token),null);assert.equal(store.put(source()),'')
 f.storage.getStorageSync=()=>{throw Error('storage unavailable')};assert.equal(store.take(token),null);assert.equal(store.put(source()),'')
})
test('return prefers a matching real stack and only reconstructs whitelisted targets',()=>{
 const {resolveAssistantReturn:resolve}=originApi(),base={scopeKey:'api:A',created:1000},opts={currentScope:'api:A',now:1000}
 const origin={...source(),...base},chat={route:'pages/chat/chat',options:{sessionId:'session-1',workspaceId:'workspace-1',...target}}
 assert.deepEqual(resolve({...opts,origin,pageStack:[chat,{route:'pages/customize/customize'}]}),{label:'返回原对话',mode:'back',delta:1})
 assert.deepEqual(resolve({...opts,origin,pageStack:[{...chat,options:{...chat.options,workspaceId:'other'}},{}]}),{label:'返回原对话',mode:'navigateTo',routeKey:'assistant',params:{sessionId:'session-1',workspaceId:'workspace-1',...target}})
 for(const [kind,extra,routeKey,mode] of [['home',{},'home','switchTab'],['calendar',target,'calendar','navigateTo'],['dish',{dishId:7},'dish','navigateTo'],['history',{},'history','navigateTo']]){
  const result=resolve({...opts,origin:{kind,...extra,...base},pageStack:[]});assert.equal(result.routeKey,routeKey);assert.equal(result.mode,mode)
 }
 assert.deepEqual(resolve({...opts,origin:null,pageStack:[]}),{label:'回到今天',mode:'none'})
 assert.deepEqual(resolve({...opts,origin:{kind:'calendar',...target,...base},pageStack:[{route:'pages/calendar-detail/calendar-detail',data:{selectedDate:target.date,focusedMeal:''}},{}]}),{label:'返回原餐次',mode:'back',delta:1})
})

// Load real page and helper code; replace only platform and HTTP boundaries.
function pageFixture(route){
 let account='A',apiBase='http://127.0.0.1/synthetic',definition;const rows=new Map(),navigation=[],dialogs=[],writes=[],cache={};let stack=[]
 const wx={getStorageSync:k=>plain(rows.get(k)),setStorageSync:(k,v)=>rows.set(k,plain(v)),removeStorageSync:k=>rows.delete(k),getStorageInfoSync:()=>({keys:[...rows.keys()]}),showModal:o=>dialogs.push(o),showToast(){},navigateTo:o=>navigation.push({mode:'navigateTo',url:o.url}),switchTab:o=>navigation.push({mode:'switchTab',url:o.url}),navigateBack:o=>navigation.push({mode:'back',delta:o.delta}),enableAlertBeforeUnload(){},disableAlertBeforeUnload(){}}
 const http=new Proxy({getPersonalMenus:async()=>[],getMealWorkspace:async()=>({}),getUserPreferences:async()=>({})},{get:(obj,k)=>obj[k]|| (async()=>{if(!String(k).startsWith('get'))writes.push(k);return{}})})
 const sandbox={wx,Page:v=>definition=v,getCurrentPages:()=>stack,getApp:()=>({globalData:{loginReady:true}}),console,setTimeout,clearTimeout}
 function load(file){
  if(cache[file])return cache[file]
  const base=path.basename(file)
  if(base==='api.js')return http
  if(base==='config.js')return{ENABLE_MEAL_WORKSPACE:true,getApiBaseUrl:()=>apiBase}
  if(base==='util.js')return{getUserStorageKey:k=>account+':'+k,getCurrentUserIdentity:()=>account}
  if(base==='recommendation-options.js')return{loadRecommendationOptions:async()=>({options:{groups:{}}})}
  if(!fs.existsSync(file))return{}
  const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{...sandbox,module,exports:module.exports,require:n=>n.startsWith('.')?load(path.resolve(path.dirname(file),n+'.js')):require(n)});return cache[file]=module.exports
 }
 load(path.resolve(`pages/${route}/${route}.js`))
 const page={...definition,data:plain(definition.data),setData:v=>Object.assign(page.data,v)}
 return{page,wx,rows,navigation,dialogs,writes,http,load:n=>load(path.resolve('utils',n+'.js')),stack:v=>stack=v,switch:()=>account='B',apiSwitch:()=>apiBase='http://127.0.0.1/other'}
}
const handoffs=[['record_actual','calendar-detail',{ref:{},target}],['edit_preferences','settings',{ref:{}}],['edit_shopping','shopping-list',{ref:{itemId:7},sourceVersion:'1'}],['copy_recipe','custom-dishes',{ref:{dishId:7},sourceVersion:'v1'}],['save_personal_menu','customize',{ref:{workspaceId:'workspace-1'},target,sourceVersion:'1:1'}],['use_personal_menu','customize',{ref:{menuId:3},target,sourceVersion:'1'}],['view_favorite','dish-detail',{ref:{dishId:7}}]]
for(const [kind,route,fields] of handoffs)test(`${kind} handoff returns to its original session without writing`,async()=>{
 const f=pageFixture(route),handoff=f.load('assistant-action-handoff');assert.equal(typeof handoff.incomingWithOrigin,'function')
 const token=handoff.currentStore().put({kind,...fields},source())
 // Initialization async reads are stubbed at the page boundary; the handoff consumer remains real.
 if(route==='customize'){f.page.ensureBrowseOwner=()=>true;f.rows.set('A:assistantActionTab',{token});await f.page.applyAssistantMenuHandoff()}
 else {f.page._loadAfterLogin=()=>{};await f.page.onLoad({handoffToken:token,...target,id:7})}
 assert.equal(f.page.data.assistantReturnVisible,true)
 f.navigation.length=0;f.page.onAssistantReturn()
 assert.equal(f.navigation.length,1);assert.match(f.navigation[0].url,/sessionId=session-1/);assert.match(f.navigation[0].url,/workspaceId=workspace-1/);assert.equal(f.writes.length,0)
})
test('assistant handoff handler binds the live session rather than model-provided origin data',()=>{
 const f=pageFixture('customize'),h=f.load('assistant-action-handoff'),page=f.load('assistant-page')({data:{context:target},current:()=>true})
 const workspace={id:'workspace-1',revision:1,draft:{planVersion:1}},card={id:'handoff',type:'handoff',workspaceRef:{workspaceId:'workspace-1',workspaceRevision:1,planVersion:1},expiresAt:Date.now()+10000,data:{kind:'view_favorite',ref:{dishId:7}}}
 page.setData=v=>Object.assign(page.data,v);page.store={state:()=>({workspace})};page.conversation={state:()=>({sessionId:'session-1',turn:{status:'needs_input',cards:[card]}})}
 page.onConversationHandoff({detail:{id:'handoff'}})
 const token=new URL('https://local.test'+f.navigation[0].url).searchParams.get('handoffToken'),received=h.incomingWithOrigin({handoffToken:token},['view_favorite'])
 assert.equal(received.origin.sessionId,'session-1');assert.equal(received.origin.workspaceId,'workspace-1');assert.equal(received.payload.origin,undefined);assert.equal(f.writes.length,0)
})
test('origin, dish-prefill and action tokens do not consume or overwrite one another',()=>{
 const f=pageFixture('dish-detail'),origins=f.load('assistant-origin'),h=f.load('assistant-action-handoff'),entries=f.load('assistant-entry')
 const origin=origins.currentOriginStore().put(source()),action=h.currentStore().put({kind:'view_favorite',ref:{dishId:7}},source())
 const entry=entries.createAssistantEntryStore({storage:f.wx,scopeKey:()=> 'dish-prefill'}),dish=entry.put({dishId:7,dishName:'鱼',...target})
 assert.equal(origins.currentOriginStore().take(action),null);assert.equal(h.currentStore().take(origin),null)
 assert.equal(entry.take(dish).dishName,'鱼');assert.equal(h.currentStore().takeWithOrigin(action).origin.sessionId,'session-1');assert.equal(origins.currentOriginStore().take(origin).workspaceId,'workspace-1')
})
for(const route of ['index','calendar-detail','dish-detail'])test(`${route} opens assistant with its actual source independently from prefill`,async()=>{
 const f=pageFixture(route),page=f.page;page.current=()=>true;page.data.assistantAvailable=true;page._scope='A';page._alive=true;page.store={};page.flushDraft=async()=>{}
 if(route==='index'){page.data.context=target;await page.onOpenConnectedAssistant()}
 if(route==='calendar-detail'){page._viewScope='A:mealView';page.data.selectedDate=target.date;page.onCalendarAssistant({currentTarget:{dataset:{meal:target.mealType}}})}
 if(route==='dish-detail'){page.data.dish={id:7,name:'鱼'};page.data.selectedMeal={target};page.onAskDish()}
 assert.equal(f.navigation.length,1);const params=new URL('https://local.test'+f.navigation[0].url).searchParams
 const origin=f.load('assistant-origin').currentOriginStore().take(params.get('originToken'))
 assert.equal(origin.kind,route==='index'?'home':route==='calendar-detail'?'calendar':'dish');assert.equal(origin.date,target.date);assert.equal(origin.mealType,target.mealType)
 if(route==='dish-detail'){assert.equal(origin.dishId,7);assert.ok(params.get('entryToken'))}
 assert.equal(f.writes.length,0)
})
test('assistant consumes the source once and its header returns through the original stack without send/confirm',async()=>{
 const f=pageFixture('customize'),origins=f.load('assistant-origin'),factory=f.load('assistant-page')
 const page=factory({data:{},onLoad:async()=>{},current:()=>true},{probe:async()=>true});page.setData=v=>Object.assign(page.data,v);page.openConnectedConversation=()=>{};page.store={state:()=>({})}
 const token=origins.currentOriginStore().put({kind:'calendar',...target});await page.onLoad({originToken:token})
 assert.equal(page.data.assistantReturnLabel,'返回原餐次');assert.equal(origins.currentOriginStore().take(token),null)
 f.stack([{route:'pages/calendar-detail/calendar-detail',options:target},{route:'pages/chat/chat'}]);page.onConversationHome()
 assert.deepEqual(f.navigation,[{mode:'back',delta:1}]);assert.equal(f.writes.length,0)
})
test('assistant fallback without a source goes to today without resending',()=>{
 const f=pageFixture('customize'),page=f.load('assistant-page')({data:{},current:()=>true});page.setData=v=>Object.assign(page.data,v)
 page.onConversationHome();assert.deepEqual(f.navigation,[{mode:'switchTab',url:'/pages/index/index'}]);assert.equal(f.writes.length,0)
})
test('tab handoff returns without resending',async()=>{
 const f=pageFixture('customize'),h=f.load('assistant-action-handoff'),a=f.load('assistant-origin');assert.equal(typeof h.incomingWithOrigin,'function')
 const card={type:'handoff',workspaceRef:{workspaceId:'workspace-1',workspaceRevision:1,planVersion:1},expiresAt:Date.now()+10000,data:{kind:'use_personal_menu',ref:{menuId:3},target,sourceVersion:'1'}}
 assert.equal(h.openCard(card,{id:'workspace-1',revision:1,draft:{planVersion:1}},source()),true);assert.equal(f.navigation[0].mode,'switchTab')
 const received=h.incomingWithOrigin({},['use_personal_menu']);a.bindAssistantOrigin(f.page,received.origin);f.navigation.length=0
 f.page.onAssistantReturn();assert.match(f.navigation[0].url,/sessionId=session-1/);assert.equal(f.writes.length,0);assert.equal(h.incoming({},['use_personal_menu']),null)
 const params=Object.fromEntries(new URL('https://local.test'+f.navigation[0].url).searchParams)
 let reads=0,sends=0,confirms=0,creates=0
 f.http.getAssistantV4Session=async id=>{reads++;return{sessionId:id,workspaceRef:{workspaceId:'workspace-1'},target,messages:[{id:'user-1',role:'user',text:'之前的请求'}]}}
 f.http.sendAssistantV4Turn=async()=>{sends++};f.http.confirmAssistantV4Action=async()=>{confirms++};f.http.createAssistantV4Session=async()=>{creates++}
 const factory=f.load('assistant-page'),workspace={id:'workspace-1',context:target,revision:1,draft:{planVersion:1,dishes:[]}},store={state:()=>({workspace})}
 const resumed=factory({data:{context:target},onLoad(){this.store=store;this._scope='A'},current:()=>true},{probe:async()=>true})
 resumed.setData=v=>Object.assign(resumed.data,v);await resumed.onLoad(params)
 assert.equal(resumed.conversation.state().sessionId,'session-1');assert.equal(resumed.data.conversationMessages[0].text,'之前的请求');assert.equal(reads,1);assert.equal(sends,0);assert.equal(confirms,0);assert.equal(creates,0)
 resumed.onUnload()
})
test('return keeps original editor guard',()=>{
 const f=pageFixture('custom-dishes'),api=f.load('assistant-origin');assert.equal(typeof api.bindAssistantOrigin,'function')
 const token=api.currentOriginStore().put(source());api.bindAssistantOrigin(f.page,api.currentOriginStore().take(token))
 f.page.data.editing=true;f.page.editChanged=()=>true;f.page.data.form={name:'未保存的鱼'}
 f.page.onAssistantReturn();assert.equal(f.navigation.length,0);f.dialogs.at(-1).success({confirm:false});assert.equal(f.page.data.form.name,'未保存的鱼');assert.equal(f.navigation.length,0)
 const pending={requestId:'original-request',name:'未保存的鱼'};f.page._original=pending;f.page.data.editPending=true;f.page.onAssistantReturn();assert.equal(f.navigation.length,0);assert.equal(f.page._original.requestId,'original-request');assert.equal(f.writes.length,0)
})
test('return preserves an unadded preference ingredient when leaving is canceled',()=>{
 const f=pageFixture('settings'),api=f.load('assistant-origin');api.bindAssistantOrigin(f.page,api.currentOriginStore().take(api.currentOriginStore().put(source())))
 f.page.data.loading=false;f.page.data.dirty=false;f.page.data.ingredientDraft='花生';f.page.onAssistantReturn()
 assert.equal(f.navigation.length,0);assert.equal(f.dialogs.length,1);f.dialogs[0].success({confirm:false});assert.equal(f.page.data.ingredientDraft,'花生');assert.equal(f.writes.length,0)
})
test('return invalidates a live-page origin after account/API switch and ordinary pages expose no conversation return',()=>{
 for(const change of ['switch','apiSwitch']){const f=pageFixture('shopping-list'),api=f.load('assistant-origin');assert.equal(typeof api.bindAssistantOrigin,'function');api.bindAssistantOrigin(f.page,api.currentOriginStore().take(api.currentOriginStore().put(source())));f[change]();f.page.onAssistantReturn();assert.equal(f.navigation.length,0);assert.equal(f.page.data.assistantReturnVisible,false)}
 const f=pageFixture('shopping-list');f.page.onLoad({});assert.ok(!f.page.data.assistantReturnVisible)
})
