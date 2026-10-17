const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
function fixture(){let account='A',factory;const urls=[];const scope={module:{exports:{}},require:n=>n==='./api'?{}:n==='./util'?{getCurrentUserIdentity:()=>account,getUserStorageKey:k=>'A:'+k}:require(path.resolve('utils',n)),wx:{navigateTo:o=>urls.push(o.url)},setTimeout,clearTimeout,console};vm.runInNewContext(fs.readFileSync('utils/meal-workspace-page.js','utf8'),scope);factory=scope.module.exports;const page=factory();page.setData=v=>Object.assign(page.data,v);page._alive=true;page._scope='A';page.store={};page.data.context={date:'2026-10-09',mealType:'lunch'};return{page,urls,switch:()=>account='B'}}
test('open meal result waits for the draft save and carries the selected meal target',async()=>{
 const f=fixture();let done;f.page.flushDraft=()=>new Promise(r=>done=r)
 const opening=f.page.onOpenMealResult();assert.equal(f.urls.length,0);done();await opening
 assert.equal(f.urls[0],'/pages/result/result?date=2026-10-09&mealType=lunch')
})
test('a changed account during the save never opens the previous meal route',async()=>{
 const f=fixture();let done;f.page.flushDraft=()=>new Promise(r=>done=r)
 const opening=f.page.onOpenAssistantView();f.switch();done();await opening;assert.equal(f.urls.length,0)
})
test('failed draft save keeps the current page and tells the user what remains unsaved',async()=>{
 const f=fixture();f.page.flushDraft=async()=>{throw Error('本餐尚未保存')}
 await f.page.onOpenMealResult();assert.equal(f.urls.length,0);assert.equal(f.page.data.errorMessage,'本餐尚未保存')
})
test('reference is checked after asynchronous draft flush',async()=>{
 for(const method of ['onOpenMealResult','onOpenAssistantView'])for(const change of ['date','mealType','workspaceId','planVersion']){
  const f=fixture();let done;const workspace={id:'original',draft:{planVersion:1}};f.page.store={state:()=>({workspace})};f.page.flushDraft=()=>new Promise(r=>done=r)
  const opening=f.page[method]()
  if(change==='date')f.page.data.context.date='2026-10-10'
  if(change==='mealType')f.page.data.context.mealType='dinner'
  if(change==='workspaceId')workspace.id='different'
  if(change==='planVersion')workspace.draft.planVersion=2
  done();await opening;assert.equal(f.urls.length,0,change)
 }
})

async function freshFixture(){
 const f=fixture();let source='synthetic-api',finish;const requests=[]
 const {createWorkspaceStore}=require('../utils/meal-workspace')
 f.page.store=createWorkspaceStore({identity:()=>f.page.current()?'A':'B',source:()=>source,read:()=>null,write:()=>{},api:{
  getMealWorkspace:async()=>({workspace:null}),
  createMealWorkspace:body=>{requests.push(body);return new Promise(resolve=>finish=()=>resolve({id:'created-workspace',revision:1,context:body.context,draft:{planVersion:0,dishes:[]}}))}
 }})
 await f.page.store.load('2026-10-09','lunch')
 return{...f,requests,finish:()=>finish(),apiSwitch:()=>source='other-api'}
}
test('first route tap accepts the real store initial workspace save',async()=>{
 for(const [method,route] of [['onOpenMealResult','result/result'],['onOpenAssistantView','chat/chat'],['onOpenLongTermPreferences','settings/settings']]){
  const f=await freshFixture();assert.equal(f.page.store.state().workspace,null)
  const opening=f.page[method]();assert.equal(f.urls.length,0);f.finish();await opening
  assert.deepEqual(f.urls,[`/pages/${route}?date=2026-10-09&mealType=lunch`]);assert.equal(f.requests.length,1)
  assert.equal(f.page.store.state().workspace.id,'created-workspace')
 }
})
test('initial save cannot authorize navigation after target, owner, store or accepted version changes',async()=>{
 for(const change of ['date','mealType','account','api','store','version']){
  const f=await freshFixture(),store=f.page.store
  if(change==='version'){const save=store.save;store.save=async()=>{const accepted=await save();store.state=()=>({...accepted,workspace:{...accepted.workspace,draft:{...accepted.workspace.draft,planVersion:9}}});return accepted}}
  const opening=f.page.onOpenMealResult()
  if(change==='date')f.page.data.context.date='2026-10-10'
  if(change==='mealType')f.page.data.context.mealType='dinner'
  if(change==='account')f.switch()
  if(change==='api')f.apiSwitch()
  if(change==='store')f.page.store={}
  f.finish();await opening;assert.equal(f.urls.length,0,change)
 }
})
