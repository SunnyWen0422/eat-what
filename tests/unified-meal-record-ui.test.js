const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {calendarMealPresentation}=require('../utils/calendar-meal-presentation')
test('saved menu has one record action and no mark-eaten workflow',()=>{
 const p=calendarMealPresentation({plan:{dishDetails:[{id:1,name:'番茄面'}]},date:'2026-10-25',today:'2026-10-25'})
 assert.equal(p.statusLabel,'已记录');assert.equal(p.primary.kind,'prepare')
 assert.ok(!p.actions.some(x=>/Actual|Eaten|Skipped/.test(x)))
})
test('home does not expose composite save-review tasks or mark-eaten controls',()=>{
 const template=fs.readFileSync('templates/meal-workspace.wxml','utf8')
 assert.doesNotMatch(template,/保存计划与周回顾|查看任务与恢复|onQuickActual|harnessMessage|仅保存计划，不记录吃过/)
})

test('home restores an existing calendar record even without a generated workspace',async t=>{
 const {fixture,target}=require('./fixtures/workspace-flow'), f=fixture(), page=f.createPage()
 t.after(()=>page.onUnload())
 f.api.getMealWorkspace=async()=>({workspace:null,planRevision:4,plan:{revision:4,targetPeople:3,dishDetails:[{id:8,name:'番茄面',type:'主食'}]}})
 await page.initializeWorkspace(target)
 assert.equal(page.data.displayedSavedRecord,true)
 assert.equal(page.data.draft.dishes[0].name,'番茄面')
 assert.equal(page.data.context.people,3)
 assert.equal(page.data.context.counts.staple,1)
 assert.equal(page.data.status,'planned')
 assert.equal(f.calls.length,0)
})

test('a saved homepage rereads calendar edits instead of showing an obsolete confirmed draft',async t=>{
 const {fixture,target}=require('./fixtures/workspace-flow'),f=fixture(),page=f.createPage();t.after(()=>page.onUnload())
 const row=f.row();row.status='planned'
 f.plans.set(row.id,{revision:8,targetPeople:4,dishDetails:[{id:9,name:'后来修改的汤',type:'soup'}]})
 await page.initializeWorkspace(target)
 assert.equal(page.data.draft.dishes[0].name,'后来修改的汤');assert.equal(page.data.context.people,4)
 assert.equal(f.row().draft.dishes[0].name,'青菜')
})

test('calendar snapshot display cannot save an obsolete workspace over the displayed record',async t=>{
 const {fixture,target}=require('./fixtures/workspace-flow'),f=fixture(),page=f.createPage();t.after(()=>page.onUnload())
 const row=f.row();row.status='planned';row.confirmation={...target,planVersion:1,planRevision:2}
 f.plans.set(row.id,{revision:8,targetPeople:4,dishDetails:[{id:9,name:'后来修改的汤',type:'soup'}]})
 await page.initializeWorkspace(target)
 assert.equal(page.data.saveState,'saved')
 assert.equal(page.data.canConfirm,false)
 assert.doesNotMatch(page.data.resultNotice?.text||'',/有修改|尚未保存/)
 page.onConfirmPlan()
 assert.equal(page.data.confirmationVisible,false)
 assert.equal(f.calls.length,0)
 assert.equal(f.plans.get(row.id).dishDetails[0].id,9)
})

test('historical records above the generation limit remain readable and do not become offline',async t=>{
 const {fixture,target}=require('./fixtures/workspace-flow'),f=fixture(),page=f.createPage();t.after(()=>page.onUnload())
 const dishDetails=Array.from({length:11},(_,i)=>({id:i+1,name:'菜'+i,type:'veg'}))
 f.api.getMealWorkspace=async()=>({workspace:null,planRevision:4,plan:{revision:4,targetPeople:3,dishDetails}})
 await page.initializeWorkspace(target)
 assert.equal(page.data.syncStatus,'synced');assert.equal(page.data.contextLocked,false)
 assert.equal(page.data.draft.dishes.length,11)
 assert.equal(page.data.compositionLabel,'11素')
 assert.equal(page.data.canConfirm,false)
 assert.equal(page.data.primaryAction,'onViewRecipes')
})

test('a name-only calendar record is shown without inventing a recipe identity',async t=>{
 const {fixture,target}=require('./fixtures/workspace-flow'),f=fixture(),page=f.createPage();t.after(()=>page.onUnload())
 f.api.getMealWorkspace=async()=>({workspace:null,planRevision:2,plan:{revision:2,recipeName:'外食面条',dishDetails:[],dishIds:[]}})
 await page.initializeWorkspace(target)
 assert.equal(page.data.draft.dishes[0].name,'外食面条');assert.equal(page.data.draft.dishes[0].id,undefined)
 assert.equal(page.data.primaryAction,'onViewRecipes');assert.equal(page.data.canConfirm,false)
})
