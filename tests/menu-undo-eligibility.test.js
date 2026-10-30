const test=require('node:test'),assert=require('node:assert/strict')
const {canUndoMenu}=require('../utils/menu-undo')
const {deriveWorkspacePresentation}=require('../utils/meal-workspace-presentation')
const {presentCard,presentMenuActions}=require('../utils/assistant-cards')
const {workspaceReference}=require('../utils/meal-workspace')
const {fixture,target}=require('./fixtures/workspace-flow')

test('menu undo requires an explicit authoritative flag, never the amount of local history',()=>{
 for(const canUndo of [undefined,false,1,'true'])assert.equal(canUndoMenu({draft:{canUndo,history:[{dishes:[{id:8}]}]}}),false)
 assert.equal(canUndoMenu({draft:{canUndo:true}}),true)
})

test('homepage and assistant hide configuration history but share the authoritative menu undo qualification',()=>{
 const w={id:'w',revision:4,status:'draft',context:target,draft:{planVersion:3,dishes:[{id:7,name:'青菜'}],history:[{contextSnapshot:{people:2}}]}}
 const card={type:'menu',workspaceRef:workspaceReference(w),data:{...target,dishes:w.draft.dishes,canUndo:true}}
 const state={workspace:w,context:target,syncStatus:'synced',linked:{plan:null}}
 assert.equal(deriveWorkspacePresentation({...state,status:'draft',draft:w.draft}).showMenuUndo,false)
 assert.equal(presentMenuActions({card,workspace:w,workspaceState:state}).canUndo,false)
 w.draft.canUndo=true
 assert.equal(deriveWorkspacePresentation({...state,status:'draft',draft:w.draft}).showMenuUndo,true)
 assert.equal(presentMenuActions({card,workspace:w,workspaceState:state}).canUndo,true)
})

test('configuration replies do not inherit an earlier menu undo but the current menu keeps its single restore',()=>{
 const w={id:'w',revision:4,status:'draft',context:target,draft:{planVersion:3,dishes:[{id:7,name:'青菜'}],canUndo:true}}
 const state={workspace:w,context:target,syncStatus:'synced',linked:{plan:null}}
 const menu={id:'menu-change',type:'menu',workspaceRef:workspaceReference(w),data:{...target,dishes:w.draft.dishes,changeKind:'menu',canUndo:true}}
 const actions=card=>presentMenuActions({card,workspace:w,workspaceState:state})
 assert.equal(actions(menu).canUndo,true)
 for(const data of [{changeKind:'configuration',canUndo:false},{changeKind:'configuration',canUndo:true},{canUndo:false}]){
  const card={...menu,id:'configuration-reply',data:{...menu.data,changeKind:undefined,...data}}
  assert.equal(actions(card).canUndo,false)
  assert.equal(presentCard(card).canUndo,false)
 }
 const current={...menu,id:'current-menu',data:{...menu.data,changeKind:undefined,canUndo:false}}
 assert.equal(actions(current).canUndo,true)
 assert.equal(actions({...current,data:{...current.data,changeKind:'configuration'}}).canUndo,false)
 w.draft.canUndo=false
 assert.equal(actions(menu).canUndo,false)
 assert.equal(actions(current).canUndo,false)
})

test('direct homepage undo refuses history-only eligibility and a confirmed single restore cannot run again',async t=>{
 const f=fixture(),page=f.createPage();t.after(()=>page.onUnload())
 f.row().draft.history=[{dishes:[{id:8,name:'旧菜'}]}]
 await page.initializeWorkspace(target);await page.onUndo();assert.equal(f.calls.length,0)
 f.row().draft.canUndo=true;await page.store.reloadLatest();page.renderWorkspace()
 f.api.commandMealWorkspace=async(id,body)=>{
  f.calls.push({type:'command',body});const w=f.row();w.revision++;w.draft={...w.draft,planVersion:w.draft.planVersion+1,dishes:[{id:8,name:'旧菜'}],canUndo:false,history:[]}
  return structuredClone(w)
 }
 let prompts=0;f.wx.showModal=()=>prompts++
 await page.onUndo();await page.onUndo()
 assert.equal(f.calls.length,1);assert.equal(prompts,0)
 assert.equal(page.data.draft.dishes[0].name,'旧菜');assert.equal(page.data.showMenuUndo,false)
 assert.equal(page.data.confirmationVisible,false);assert.equal(page.data.saveRecoveryPending,false)
 assert.equal(page.data.journeyRecovery,null)
})

test('retired assistant never revives unverified stack undo from can_undo or plan_history',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module')
 const file=path.resolve('pages/chat/chat.js'),nativeRequire=createRequire(file)
 let page,writes=0
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{
  Page:value=>page=value,getApp:()=>({globalData:{}}),wx:{getStorageSync(){},setStorageSync(){}},setTimeout:()=>0,clearTimeout(){},clearInterval(){},
  require:name=>name.endsWith('/config')?{ENABLE_MEAL_WORKSPACE:false}:name.endsWith('/api')?{commandAssistantPlan:async()=>{writes++}}:name.endsWith('/font-scale')?Object.assign(()=>1,{base:16}):nativeRequire(name)
 })
 page.setData=value=>Object.assign(page.data,value)
 page.hydrateSession({session_id:'legacy',can_undo:true,state:{plan:{version:3},plan_history:[{},{}]}})
 assert.equal(page.data.canUndo,false)
 page.applyAssistantResult({success:true,session_id:'legacy',can_undo:true,plan:{version:4}})
 assert.equal(page.data.canUndo,false)
 await page.onUndoPlan();await page.planCommand('undo');assert.equal(writes,0)
})
