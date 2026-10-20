const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {deriveWorkspacePresentation}=require('../utils/meal-workspace-presentation')
const target={date:'2026-10-15',mealType:'dinner',people:2,counts:{meat:1,veg:1},compositionMode:'manual'}
const view=(patch={})=>deriveWorkspacePresentation({status:'draft',syncStatus:'synced',context:target,draft:{planVersion:1,dishes:[{id:7,type:'meat'},{id:8,type:'veg'}],history:[]},canConfirm:true,...patch})
test('one actionable state wins over repeated progress and result text',()=>{
 const result=view({syncStatus:'unknown',errorMessage:'连接暂未完成',status:'needs_regeneration'})
 assert.equal(result.workspaceNotice.kind,'warning');assert.match(result.workspaceNotice.text,/待核对/);assert.equal(result.primaryAction,'onRetryWorkspace')
 assert.equal(result.showActionFeedback,false)
 const unapplied=view({status:'needs_regeneration'});assert.match(unapplied.workspaceNotice.text,/条件已修改/);assert.equal(unapplied.primaryAction,'onRegenerate')
 assert.equal(view().workspaceNotice,null)
})
test('shortage retains exact missing categories while unknown categories do not invent counts',()=>{
 const result=view({status:'needs_input',draft:{dishes:[{id:7,type:'veg'}]}});assert.match(result.workspaceNotice.text,/还缺1道荤菜/)
 const unknown=view({status:'needs_input',draft:{dishes:[{id:7,type:'unknown'}]}});assert.match(unknown.workspaceNotice.text,/分类/);assert.doesNotMatch(unknown.workspaceNotice.text,/还缺\d/)
})
test('replacement feedback stays at the affected row and undo remains reachable',()=>{
 const result=view({draft:{dishes:[{id:9,type:'meat'}],history:[{}]},actionFeedback:{state:'success',kind:'replace',message:'已换为清蒸鱼',undoAvailable:true}})
 assert.equal(result.showActionFeedback,false);assert.equal(result.showMenuUndo,true)
})
test('composition sheet uses the approved concise persistence notice',()=>{
 const source=fs.readFileSync('templates/meal-workspace.wxml','utf8'),sheet=source.split('visible="{{compositionVisible}}"')[1].split('</ui-sheet>')[0]
 assert.match(sheet,/应用后保留此搭配/);assert.doesNotMatch(sheet,/compositionTotal|compositionPreferenceNotice|当前.*道菜/)
})
test('current meal click and keep action leave the current menu and selected dishes intact',async t=>{
 const {fixture,target}=require('./fixtures/workspace-flow'),f=fixture(),page=f.createPage();t.after(()=>page.onUnload());await page.initializeWorkspace(target)
 const before=JSON.stringify(page.data.draft);await page.onMealTab({currentTarget:{dataset:{index:2}}});assert.equal(JSON.stringify(page.data.draft),before)
 await page.onKeep({currentTarget:{dataset:{id:7}}});assert.deepEqual(page.data.draft.lockedDishIds,[7]);await page.onMealTab({currentTarget:{dataset:{index:2}}});assert.deepEqual(page.data.draft.lockedDishIds,[7])
})

// Offline display cases: production projection and shared WXML. Existing page/store
// flows below remain the authority for writes and navigation; no network is used.
const workspaceTemplate=()=>fs.readFileSync('templates/meal-workspace.wxml','utf8')
const savedTarget={date:'2027-01-01',mealType:'lunch'}
test('cross-day save plus replace shows one scoped result',()=>{
 const result=view({saveState:'changed',savedTarget,actionFeedback:{kind:'replace',state:'success'}})
 assert.equal(result.menuState,'changed');assert.equal(result.resultNotice.action,'onViewSavedMeal')
 assert.deepEqual(result.resultNotice.target,savedTarget)
 assert.match(result.resultNotice.text,/2027年1月1日午餐.*当前菜单.*未保存/)
 const source=workspaceTemplate()
 assert.equal((source.match(/\{\{resultNotice.text\}\}/g)||[]).length,1)
 assert.doesNotMatch(source,/\{\{savedMessage\}\}|已保存到日历|当前草稿已调整/)
 assert.match(source,/bindtap="onViewSavedMeal"/);assert.match(source,/bindtap="onShoppingPreview"/);assert.match(source,/bindtap="onUndo"/)
 assert.match(source,/aria-label="\{\{contextLabel\}\}"/)
 assert.doesNotMatch(source,/<text>\{\{contextLabel\}\}<\/text>/)
})
test('unknown new request suppresses misleading success',()=>{
 const result=view({saveState:'saved',savedTarget,pendingReceipts:[{state:'unknown',kind:'assistant',target,label:'核对本餐请求'}]})
 assert.equal(result.menuState,'recover');assert.equal(result.primaryAction,'onRecoverJourney')
 assert.equal(result.resultNotice.kind,'warning');assert.match(result.resultNotice.text,/待核对.*此前已保存到2027年1月1日午餐.*尚未确认保存/)
 const source=workspaceTemplate()
 assert.match(source,/wx:if="\{\{resultNotice\}\}"/)
 assert.match(source,/resultNotice.action[^\n]+bindtap="onPrimaryAction"/)
 assert.doesNotMatch(source,/class="workspace-saved-result"/)
 assert.match(source,/savedTarget[^\n]+bindtap="onViewSavedMeal"/)
})
test('recovery and exclusion notices remain in the main content independently of settings sheets',()=>{
 const source=workspaceTemplate(),main=source.split('</scroll-view>')[0]
 assert.match(main,/wx:if="\{\{hardExclusionsUnavailable\}\}" class="workspace-exclusions" role="alert"/)
 assert.match(main,/wx:if="\{\{resultNotice\}\}" class="workspace-notice/)
 assert.doesNotMatch(main,/wx:if="[^"]*(?:settingsExpanded|mealSettingsVisible|requirementsVisible)/)
 assert.match(source,/<ui-sheet[^>]*visible="\{\{requirementsVisible\}\}"/)
 assert.match(view({status:'needs_regeneration'}).resultNotice.text,/条件已修改/)
 assert.match(view({syncStatus:'conflict'}).resultNotice.text,/已有更新/)
 for(const [patch,action] of [[{status:'needs_input',draft:{dishes:[{id:8,type:'veg'}]}},'composition'],[{status:'failed'},'choose']]){
  const result=view(patch);assert.equal(result.workspaceNotice.action,action)
  assert.match(source,new RegExp(`workspaceNotice.action === '${action}'`))
 }
 assert.match(source,/workspaceNotice.action === 'requirements'[^\n]+bindtap="onOpenRequirements"/)
})

test('failed adjustment retains the saved target beside its recovery',()=>{
 const result=view({saveState:'changed',savedTarget,status:'failed'})
 assert.equal(result.resultNotice.kind,'warning')
 assert.match(result.resultNotice.text,/暂未完成.*此前已保存到2027年1月1日午餐.*当前菜单.*未保存/)
 assert.equal(result.workspaceNotice.action,'choose')
})

test('pending row replacement keeps progress at the affected row',()=>{
 const pending={status:'generating',busy:true,actionFeedback:{kind:'replace',state:'pending',message:'正在换菜'}}
 const result=view(pending)
 assert.equal(result.menuState,'working');assert.equal(result.workspaceNotice,null)
 assert.equal(result.resultNotice,null,'row-owned progress must not gain a second generic task notice')
 const withReceipt=view({...pending,saveState:'saved',savedTarget})
 assert.equal(withReceipt.resultNotice.kind,'info')
 assert.match(withReceipt.resultNotice.text,/此前已保存到2027年1月1日午餐/)
 assert.doesNotMatch(withReceipt.resultNotice.text,/正在|处理中|本次.*保存/)
 assert.equal(withReceipt.resultNotice.action,'onViewSavedMeal')
 for(const [patch,state,text] of [[{syncStatus:'unknown'},'recover',/待核对/],[{syncStatus:'conflict'},'conflict',/已有更新/]]){
  const recovery=view({...pending,...patch,saveState:'saved',savedTarget})
  assert.equal(recovery.menuState,state);assert.match(recovery.resultNotice.text,text)
 }
 const unapplied=view({status:'needs_regeneration',actionFeedback:pending.actionFeedback})
 assert.match(unapplied.resultNotice.text,/条件已修改/)
})
