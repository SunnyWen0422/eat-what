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
