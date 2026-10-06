const test=require('node:test'),assert=require('node:assert/strict')
function fixture(save){let scope='A';const memory=new Map(),sent=[];const page={data:{},setData(v){Object.assign(this.data,v)}}
 const wx={getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,v),removeStorageSync:k=>memory.delete(k)}
 const api={getMealOverview:async()=>({plans:[{recordDate:'2026-10-06',mealType:'dinner',revision:3,dishIds:[7],dishDetails:[{id:7,name:'青菜'}]}]}),saveMealConsumption:async(d,m,body)=>{sent.push({d,m,body});return save?save(body):{status:body.status}}}
 Object.assign(page,require('../utils/meal-actual-entry').createMealActualEntry({api,wx,scope:()=>scope,today:()=> '2026-10-06'}));return {page,sent,memory,switch:()=>scope='B'} }
test('actual quick entry keeps original payload and key after unknown save',async()=>{
 let first=true;const f=fixture(()=>{if(first){first=false;throw {isNetworkError:true}}return {status:'eaten'}});await f.page.openMealActual({date:'2026-10-06',mealType:'dinner'});await f.page.onActualByPlan();assert.equal(f.page.data.actualUnknown,true);await f.page.onActualRetry();assert.equal(f.sent[0].body.requestId,f.sent[1].body.requestId);assert.deepEqual(f.sent[0].body,f.sent[1].body)
})
test('cancel account switch and future entry never save',async()=>{
 const f=fixture();await f.page.openMealActual({date:'2026-10-07',mealType:'dinner'});await f.page.onActualByPlan();assert.equal(f.sent.length,0);await f.page.openMealActual({date:'2026-10-06',mealType:'dinner'});f.switch();await f.page.onActualByPlan();assert.equal(f.sent.length,0)
})
test('conflict reload retains input and requires a fresh explicit save',async()=>{
 let conflict=true;const f=fixture(()=>{if(conflict)throw {statusCode:409};return {status:'eaten'}})
 await f.page.openMealActual({date:'2026-10-06',mealType:'dinner'});f.page.onActualText({detail:{value:'外食拉面'}});await f.page.onActualChanged()
 assert.equal(f.page.data.actualNeedsReload,true);conflict=false;await f.page.onActualReload();assert.equal(f.page.data.actualText,'外食拉面');assert.equal(f.sent.length,1);await f.page.onActualChanged();assert.equal(f.sent.length,2);assert.deepEqual(f.sent[1].body.dishes,[{name:'外食拉面'}]);assert.notEqual(f.sent[0].body.requestId,f.sent[1].body.requestId)
})
test('skipped is a separate explicit save and closing alone writes nothing',async()=>{
 const f=fixture();await f.page.openMealActual({date:'2026-10-06',mealType:'dinner'});f.page.closeMealActual();assert.equal(f.sent.length,0);await f.page.openMealActual({date:'2026-10-06',mealType:'dinner'});await f.page.onActualSkipped();assert.equal(f.sent[0].body.status,'skipped');assert.equal(f.sent[0].body.expectedPlanRevision,3)
})
