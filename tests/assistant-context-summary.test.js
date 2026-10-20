const test=require('node:test'),assert=require('node:assert/strict')
const {buildAssistantContextSummary}=require('../utils/assistant-presentation')
const {fixture,deferred,target,plain}=require('./fixtures/workspace-flow')
const assistantPage=require('../utils/assistant-page')
const workspace={context:{...target,people:2,requirements:'少油',totalCookMinutes:45,criteria:{maxCookMinutes:20},ownedIngredients:['番茄']},draft:{dishes:[]}}
test('context summary separates temporary and saved inputs',()=>{
 const input={workspace,preferencesSnapshot:{excludedIngredients:['花生'],preferredTagCodes:['LIGHT'],defaultPeople:4,maxCookMinutes:30},preferencesState:'ready',options:{groups:{flavor:[{code:'LIGHT',label:'清淡'}]}}}
 const before=plain(input),view=buildAssistantContextSummary(input)
 assert.match(view.targetLabel,/2026.*10.*6.*晚餐.*2人/)
 assert.match(view.mealRows.map(r=>r.text).join(' '),/少油/);assert.doesNotMatch(view.mealRows.map(r=>r.text).join(' '),/花生/)
 assert.match(view.savedRows.map(r=>r.text).join(' '),/花生/);assert.match(view.savedRows.map(r=>r.text).join(' '),/清淡/)
 assert.match(view.mealRows.find(r=>r.id==='total-time').text,/整餐用时上限.*45/);assert.doesNotMatch(view.mealRows.find(r=>r.id==='total-time').text,/预计/)
 assert.match(view.mealRows.find(r=>r.id==='dish-time').text,/单菜.*20/)
 assert.equal(view.savedRows.find(r=>r.id==='saved-people').text,'4人')
 assert.deepEqual(input,before);assert.equal(view.unavailableLabel,'')
 const lost=buildAssistantContextSummary({...input,preferencesState:'unavailable'})
 assert.match(lost.unavailableLabel,/暂未读到/);assert.deepEqual(lost.savedRows,[])
 assert.doesNotMatch(JSON.stringify(lost),/未设置|花生/)
})
test('unset, unavailable and loading preferences remain distinct and row text is bounded',()=>{
 const ready=buildAssistantContextSummary({workspace,preferencesSnapshot:{},preferencesState:'ready'})
 assert.match(ready.savedRows.map(r=>r.text).join(' '),/未设置/)
 for(const preferencesState of ['loading','unavailable',undefined]){
  const result=buildAssistantContextSummary({workspace,preferencesState})
  assert.equal(result.savedRows.length,0);assert.ok(result.unavailableLabel);assert.doesNotMatch(result.unavailableLabel,/未设置/)
 }
 const bounded=buildAssistantContextSummary({workspace:{context:{...workspace.context,requirements:'字'.repeat(3000)}},preferencesState:'ready',preferencesSnapshot:{excludedIngredients:Array(200).fill('花生')}})
 assert.ok(JSON.stringify(bounded).length<2500)
 assert.match(bounded.mealRows.find(row=>row.id==='requirements').text,/…$/)
 const concise=buildAssistantContextSummary({workspace:{context:{}},preferencesState:'ready',preferencesSnapshot:{avoidRecentDays:7}})
 assert.equal(concise.mealRows.find(row=>row.id==='requirements').text,'未添加')
 assert.deepEqual(concise.savedRows.find(row=>row.id==='saved-recent'),{id:'saved-recent',label:'菜品轮换',text:'最近7天不重复'})
 assert.equal(buildAssistantContextSummary({preferencesState:'ready',preferencesSnapshot:{avoidRecentDays:0}}).savedRows.find(row=>row.id==='saved-recent').text,'不限制')
})
async function pageFixture(t){
 const f=fixture(),page=assistantPage(f.createPage('assistant'),{probe:async()=>true})
 const previousWx=global.wx;global.wx=f.wx;t.after(()=>{if(previousWx)global.wx=previousWx;else delete global.wx})
 page.setData=(v,cb)=>{Object.assign(page.data,v);if(cb)cb()};page._assistantAlive=true;page._alive=true
 let reads=0;f.api.getUserPreferences=async()=>{reads++;return {preferences:{excludedIngredients:['花生'],defaultPeople:2}}}
 await page.initializeWorkspace(target)
 const state={messages:[],input:'',busy:false};page.conversation={state:()=>state,setInput:v=>state.input=v,dispose(){},setActionsEnabled(){}}
 page.data.assistantConnected=true;page.renderWorkspace();t.after(()=>page.onUnload())
 return {...f,page,state,reads:()=>reads}
}
test('context uses the existing shared preference read and no render or expansion fetch',async t=>{
 const f=await pageFixture(t)
 assert.equal(f.reads(),1);assert.equal(f.page.data.conversationMenuExpanded,false)
 for(let i=0;i<4;i++){f.page.renderWorkspace();f.page.onToggleConversationMenu()}
 assert.equal(f.reads(),1);assert.match(JSON.stringify(f.page.data.conversationContextSummary.savedRows),/花生/)
})
test('an unavailable optional options cache cannot block the live menu or context summary',async t=>{
 const f=await pageFixture(t);f.wx.getStorageSync=key=>{if(key.startsWith('recommendationOptions'))throw Error('unavailable cache')}
 assert.doesNotThrow(()=>f.page.refreshConversationMenus())
 assert.equal(f.page.data.conversationCurrentMenu.data.dishes[0].id,7);assert.match(JSON.stringify(f.page.data.conversationContextSummary.savedRows),/花生/);assert.equal(f.reads(),1)
})
test('temporary settings use their own editor and saved preference return rereads without rewriting history',async t=>{
 const f=await pageFixture(t),before=plain(f.state.messages)
 f.page.store.edit({...f.page.data.context,requirements:'少油'});f.page.renderWorkspace()
 f.state.input='尚未发送的问题'
 f.page.onConversationEditRequirements()
 assert.equal(f.page.data.conversationMealSettingsVisible,true)
 assert.equal(f.page.data.conversationMealSettingsDraft.requirements,'少油')
 assert.equal(f.state.input,'尚未发送的问题');assert.equal(f.calls.length,0)
 f.page.onConversationPreferences();assert.deepEqual(f.navigation,['/pages/settings/settings'])
 f.api.getUserPreferences=async()=>({preferences:{excludedIngredients:['香菜']}})
 await f.page.onShow();assert.match(JSON.stringify(f.page.data.conversationContextSummary.savedRows),/香菜/)
 assert.deepEqual(f.state.messages,before);assert.equal(f.calls.length,0)
})
test('failed foreground preferences do not present the stale snapshot as saved current facts',async t=>{
 const f=await pageFixture(t);f.api.getUserPreferences=async()=>{throw Error('offline')}
 await f.page.onShow();assert.match(f.page.data.conversationContextSummary.unavailableLabel,/暂未读到/)
 assert.deepEqual(f.page.data.conversationContextSummary.savedRows,[])
})
test('empty preference transport response is unavailable instead of an unset preference',async t=>{
 const f=await pageFixture(t);f.api.getUserPreferences=async()=>null
 await f.page.onShow();assert.match(f.page.data.conversationContextSummary.unavailableLabel,/暂未读到/);assert.deepEqual(f.page.data.conversationContextSummary.savedRows,[])
})
test('pending or disabled assistant input cannot be replaced by the context edit affordance',async t=>{
 const f=await pageFixture(t);let modals=0;f.wx.showModal=()=>modals++;f.state.input='原文';f.page.data.conversationActionsEnabled=false
 f.page.onConversationEditRequirements();assert.equal(f.state.input,'原文');assert.equal(modals,0)
 assert.equal(f.page.data.conversationMealSettingsVisible,false)
 f.page.data.conversationActionsEnabled=true;f.state.confirmationPending=true
 f.page.onConversationEditRequirements();assert.equal(f.state.input,'原文');assert.equal(f.page.data.conversationMealSettingsVisible,false)
})
test('late saved preference response cannot pollute a new account or workspace',async t=>{
 const f=await pageFixture(t),wait=deferred();f.api.getUserPreferences=()=>wait.promise
 const refresh=f.page.refreshHardExclusions();f.switchAccount();wait.resolve({excludedIngredients:['旧账号忌口']});await refresh
 assert.doesNotMatch(JSON.stringify(f.page.data.conversationContextSummary),/旧账号忌口/)
})
