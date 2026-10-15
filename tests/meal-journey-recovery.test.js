const test=require('node:test'),assert=require('node:assert/strict')
const {deriveMealJourney,collectRecoveryPointers}=require('../utils/meal-journey-presentation')
const target={date:'2026-10-15',mealType:'dinner'},workspace=()=>({id:'w',revision:1,context:target,status:'draft',draft:{planVersion:2,dishes:[{id:7}],lockedDishIds:[7]}})
test('recovery priority is unknown conflict busy unapplied normal and remains a projection',()=>{
 const w=workspace(),before=JSON.stringify(w),pending=[{kind:'workspace',state:'unknown',target,route:'/pages/result/result?date=2026-10-15&mealType=dinner'}]
 assert.equal(deriveMealJourney({workspace:w,syncStatus:'conflict',busy:true,pendingReceipts:pending}).recovery.state,'unknown')
 assert.equal(deriveMealJourney({workspace:w,syncStatus:'conflict',busy:true}).recovery.state,'conflict')
 assert.equal(deriveMealJourney({workspace:{...w,status:'generating'},busy:true}).recovery.state,'busy')
 const needs={...w,status:'needs_regeneration'}
 assert.equal(deriveMealJourney({workspace:needs,actual:{status:'eaten'}}).recovery.state,'unapplied')
 assert.equal(JSON.stringify(w),before)
})
test('saving to another day retains exact destination and purchased ingredients never imply eaten',()=>{
 const w=workspace(),saved={date:'2026-10-16',mealType:'lunch'}
 const state=deriveMealJourney({workspace:{...w,status:'planned'},plan:{revision:1},savedTarget:saved,saveState:'saved',shoppingSources:[target,{date:'2026-10-14',mealType:'lunch'}]})
 assert.equal(state.primary.action,'onViewSavedMeal');assert.deepEqual(state.target,saved)
 const normal=deriveMealJourney({workspace:{...w,status:'planned'},plan:{revision:1},shoppingSources:[target]})
 assert.equal(normal.primary.action,'onViewRecipes');assert.equal(normal.actualStatus,'unrecorded')
 assert.equal(deriveMealJourney({workspace:w,pendingReceipts:[{kind:'actual',state:'unknown',target:saved}]}).recovery,null)
})
test('recovery collection reads only the current scope and never mutates original requests',()=>{
 const rows=new Map([['A:meal-workspace:2026-10-15:dinner',{workspace:workspace(),context:target,pending:{body:{requestId:'original'}},syncStatus:'unknown'}],['A:mealActual:pending:2026-10-15:dinner',{scope:'A:mealActual',date:target.date,mealType:'dinner',body:{requestId:'actual-original'}}],['B:meal-workspace:2026-10-15:dinner',{pending:{secret:'other'}}],['A:personalRecipeWrite:dish:copy:9',{requestId:'copy-original',expectedVersion:'v1'}]])
 const before=JSON.stringify([...rows]);const storage={getStorageInfoSync:()=>({keys:[...rows.keys()]}),getStorageSync:k=>rows.get(k)}
 const pointers=collectRecoveryPointers({storage,storageKey:k=>'A:'+k,assistantScope:'A-api'})
 assert.equal(pointers.length,3);assert.deepEqual(pointers.map(p=>p.kind).sort(),['actual','copy_recipe','workspace'])
 assert.equal(JSON.stringify([...rows]),before);assert.equal(pointers.filter(p=>p.requestId==='original').length,1)
 assert.equal(collectRecoveryPointers({storage,storageKey:k=>'C:'+k,assistantScope:'C-api'}).length,0)
})
test('known awaiting confirmation differs from unknown send and an unrelated source is never guessed',()=>{
 const w=workspace(),pending={kind:'assistant',state:'confirmation',target,label:'助手安排待确认'}
 const state=deriveMealJourney({workspace:w,plan:{},canConfirm:true,pendingReceipts:[pending]})
 assert.equal(state.primary.action,'onRecoverJourney');assert.equal(state.recovery.state,'confirmation')
 assert.equal(deriveMealJourney({workspace:w,canConfirm:true,pendingReceipts:[{...pending,target:null}]}).primary.action,'onConfirmPlan')
})
test('ten repeated page confirmations still use one original write and do not record an actual meal',async t=>{
 const {fixture,target}=require('./fixtures/workspace-flow'),f=fixture(),page=f.createPage();t.after(()=>page.onUnload());await page.initializeWorkspace(target)
 await page.onConfirmPlan();await Promise.all(Array.from({length:10},()=>page.onApproveReplacement()))
 assert.equal(f.calls.filter(c=>c.type==='confirm').length,1);assert.equal(page.data.actual,null)
})
