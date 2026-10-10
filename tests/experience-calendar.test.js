const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const date='2026-10-09',today=date
const plan={recordDate:date,mealType:'dinner',recipeName:'后来安排',revision:3,targetPeople:2,dishIds:[7],dishDetails:[{id:7,name:'青菜'}]}
const eaten={mealDate:date,mealType:'dinner',status:'eaten',revision:4,actualDishes:[{dishId:8,name:'原来吃的鱼'}],plannedSnapshot:{name:'原安排',targetPeople:3,dishDetails:[{id:8,name:'原来吃的鱼'}]}}
function presentation(input){const file='../utils/calendar-meal-presentation';try{return require(file).calendarMealPresentation(input)}catch(e){if(e.code==='MODULE_NOT_FOUND')return {};throw e}}
function harness(actual=eaten,options={}){let definition,scope=options.account||'A';const writes=[],memory=options.memory||new Map();let plans=options.noSourcePlan?[]:[structuredClone(options.sourcePlan||plan)],consumptions=actual?[structuredClone(actual)]:[]
 const api={getMealOverview:async(d)=>options.getOverview?options.getOverview(d):({plans:d===date?plans:options.targetPlan?[{...plan,recordDate:d,revision:options.targetRevision||6}]:[],consumptions}),saveMealConsumption:async(d,m,b)=>writes.push({kind:'actual',date:d,body:structuredClone(b)}),removeMealPlan:async()=>{plans=[]},saveMealPlan:async(d,m,b)=>{writes.push({kind:'plan',date:d,body:structuredClone(b)});if(options.savePlan)return options.savePlan(d,m,b);if(options.copyError)throw options.copyError}}
 const util={getUserStorageKey:k=>scope+':'+k};const wx={getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,v),removeStorageSync:k=>memory.delete(k),showModal:v=>{options.modals?.push(v);v.success({confirm:options.approve!==false})},showToast(){},navigateTo(){},switchTab(){}}
 const modules={};function read(file){if(modules[file])return modules[file];const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,wx,console,require:n=>n.endsWith('/api')||n==='./api'?api:n.endsWith('/util')||n==='./util'?util:n.includes('font-scale')?Object.assign(()=>1,{base:16}):read(path.resolve(path.dirname(file),n+'.js'))});return modules[file]=module.exports}
 const route=options.pageRoute || 'calendar-detail';vm.runInNewContext(fs.readFileSync('pages/'+route+'/'+route+'.js','utf8'),{Page:d=>definition=d,wx,console,require:n=>n.includes('api')?api:n.endsWith('/util')?util:n.includes('font-scale')?Object.assign(()=>1,{base:16}):read(path.resolve('pages/'+route,n+'.js'))})
 const page={...definition,data:structuredClone(definition.data),setData(v,cb){Object.assign(this.data,v);if(cb)cb()}};page.onLoad({date});page._viewScope='A:mealView'
 return {page,writes,memory,getActual:()=>structuredClone(consumptions),switchAccount:()=>scope='B'}
}
const event={currentTarget:{dataset:{meal:'dinner'}}}
test('eight combinations distinguish plan, actual and explicit skipped state',()=>{
 for(const [p,a,mode] of [[null,null,'empty'],[plan,null,'planned'],[null,{status:'unrecorded'},'empty'],[plan,{status:'unrecorded'},'planned'],[null,eaten,'actualOnly'],[plan,eaten,'eaten'],[null,{status:'skipped'},'skipped'],[plan,{status:'skipped'},'skipped']])assert.equal(presentation({plan:p,actual:a,date,today}).mode,mode)
 const calendarMealPresentation=presentation
 assert.equal(calendarMealPresentation({ plan: null, actual: eaten, date, today }).mode, 'actualOnly')
})
test('actions follow date and plan availability and actual history is read first',()=>{
 const past=presentation({plan:null,actual:null,date,today});assert.deepEqual(past.actions,['arrange','recordEaten'])
 const futureActions=presentation({plan,actual:null,date:'2026-10-10',today}).actions||[]
 assert.equal(futureActions.includes('recordEaten'), false)
 assert.deepEqual(presentation({plan:null,actual:null,date:'2026-10-10',today}).actions,['arrange'])
 assert.equal(presentation({plan:null,actual:eaten,date,today}).actions.includes('adjustPlan'),false)
 const view=presentation({plan,actual:eaten,date,today});assert.deepEqual(view.dishes,eaten.actualDishes);assert.deepEqual(view.originalPlan,eaten.plannedSnapshot)
})
test('first eaten confirmation binds plan revision; editing eaten uses authoritative actual snapshot',async()=>{
 const first=harness(null);await first.page.loadMealRecords();await first.page.onEaten(event);await first.page.onConfirmActual();assert.equal(first.writes[0].body.usePlan,true);assert.equal(first.writes[0].body.expectedPlanRevision,3)
 const edit=harness();await edit.page.loadMealRecords();await edit.page.onEaten(event);assert.equal(edit.page.data.actualMode,'changed');assert.equal(edit.page.data.actualText,'原来吃的鱼');await edit.page.onConfirmActual();assert.equal(edit.writes[0].body.usePlan,false);assert.deepEqual(edit.writes[0].body.dishes,[{retainedEntryIndex:0}]);assert.equal(edit.writes[0].body.expectedRevision,4)
})
test('remove plan retains actual and copying never removes source or copies actual',async()=>{
 const f=harness();await f.page.loadMealRecords();const actualBeforeRemovingPlan=f.getActual();await f.page.onDeleteMeal(event);await new Promise(r=>setImmediate(r));const actualAfterRemovingPlan=f.getActual();assert.deepEqual(actualAfterRemovingPlan, actualBeforeRemovingPlan)
 const copy=harness();await copy.page.loadMealRecords();copy.page.onCopy(event);copy.page.data.copyDate='2026-10-10';await copy.page.saveForm();assert.equal(copy.writes.length,1);assert.equal(copy.writes[0].kind,'plan');assert.equal(copy.page.meal('dinner').plan.recipeName,plan.recipeName);assert.equal(copy.writes[0].body.actualDishes,undefined)
})
test('read-first detail has folded original plan, one adjust entry, distinct management and state commands',()=>{
 const source=fs.readFileSync('pages/calendar-detail/calendar-detail.wxml','utf8');assert.match(source,/item.presentation.dishes/);assert.match(source,/原安排/);assert.match(source,/bindtap="onAdjustMeal"/);assert.match(source,/bindtap="onManageMeal"/);assert.match(source,/这餐没吃/);assert.doesNotMatch(source,/取消这餐安排/)
 const calendar=fs.readFileSync('pages/calendar/calendar.wxml','utf8');assert.ok(calendar.indexOf('bindtap="onReview"')<calendar.indexOf('day-grid'))
})
test('quick confirmation exits to recoverable sheet on unknown result and conflict',async()=>{
 const {createMealActualEntry}=require('../utils/meal-actual-entry')
 for(const error of [{isNetworkError:true},{statusCode:409}]){
  const memory=new Map(),page={data:{},setData(v){Object.assign(this.data,v)}}
  Object.assign(page,createMealActualEntry({scope:()=> 'A',today:()=>today,wx:{getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,v),removeStorageSync:k=>memory.delete(k)},api:{getMealOverview:async()=>({plans:[plan],consumptions:[]}),saveMealConsumption:async()=>{throw error}}}))
  await page.openMealActual({date,mealType:'dinner',quick:true});assert.equal(page.data.actualQuick,true);await page.onConfirmActual();assert.equal(page.data.actualQuick,false);assert.equal(page.data.actualVisible,true)
 }
})
test('failed initial quick read shows full reload sheet instead of a dead confirm',async()=>{
 const page={data:{},setData(v){Object.assign(this.data,v)}};Object.assign(page,require('../utils/meal-actual-entry').createMealActualEntry({scope:()=> 'A',today:()=>today,wx:{},api:{getMealOverview:async()=>{throw {isNetworkError:true}}}}));await page.openMealActual({date,mealType:'dinner',quick:true});assert.equal(page.data.actualNeedsReload,true);assert.equal(page.data.actualQuick,false)
})

test('copy target conflict requires approval and never transmits actual fields',async()=>{
 const modals=[],f=harness(eaten,{targetPlan:true,approve:false,modals});await f.page.loadMealRecords();f.page.onCopy(event);await f.page.saveForm();assert.equal(modals.length,1);assert.equal(f.writes.length,0);assert.equal(f.page.meal('dinner').plan.revision,3)
 const confirmed=harness(eaten,{targetPlan:true,modals:[]});await confirmed.page.loadMealRecords();confirmed.page.onCopy(event);await confirmed.page.saveForm();assert.equal(confirmed.writes[0].body.expectedRevision,6);assert.deepEqual(Object.keys(confirmed.writes[0].body).sort(),['dishIds','expectedRevision','isManual','recipeName','requestId','targetPeople'].sort());assert.equal(confirmed.page.meal('dinner').plan.revision,3)
})
test('copy failure leaves source and actual intact, and does not claim success',async()=>{
 const f=harness(eaten,{copyError:{isNetworkError:true}});await f.page.loadMealRecords();const before=f.getActual();f.page.onCopy(event);await f.page.saveForm();assert.equal(f.page.data.formVisible,true);assert.ok(f.page.data.formError);assert.equal(f.page.meal('dinner').plan.revision,3);assert.deepEqual(f.getActual(),before)
})
test('quick entry after account switch cannot save or display a success',async()=>{
 const f=harness(null);await f.page.loadMealRecords();await f.page.onEaten(event);f.switchAccount();await f.page.onConfirmActual();assert.equal(f.writes.length,0);assert.equal(f.page.data.actualSavedMessage,'')
})
test('calendar read rows protect long names and full-sized touch targets',()=>{
 const css=fs.readFileSync('pages/calendar-detail/calendar-detail.wxss','utf8');assert.match(css,/\.calendar-dish-row[^}]*min-height:\s*80px/);assert.match(css,/\.dish-recipe-link[^}]*white-space:\s*normal/)
})
test('cooking reading does not invite future eaten confirmation and detail uses month-day heading',()=>{
 const cooking=fs.readFileSync('pages/meal-cooking/meal-cooking.wxml','utf8');assert.match(cooking,/wx:if="\{\{!recipeMode && canRecordActual\}\}" label="这餐吃了"/)
 const detail=fs.readFileSync('pages/calendar-detail/calendar-detail.wxml','utf8');assert.match(detail,/\{\{dateHeading\}\}/)
})

test('late quick-entry read cannot change the new account sheet mode',async()=>{
 const options={},f=harness(null,options);await f.page.loadMealRecords();let finish;options.getOverview=()=>new Promise(resolve=>{finish=resolve});const first=f.page.onEaten(event);f.switchAccount();delete options.getOverview;await f.page.loadMealRecords();await f.page.onActualDifferent(event);assert.equal(f.page.data.actualMode,'changed');finish({plans:[plan],consumptions:[]});await first;assert.equal(f.page.data.actualMode,'changed');assert.equal(f.page._actualBinding.scope,'B:mealActual')
})
test('failed quick-entry read at Page level retains reload without throwing',async()=>{
 const options={},f=harness(null,options);await f.page.loadMealRecords();options.getOverview=async()=>{throw {isNetworkError:true}};await f.page.onEaten(event);assert.equal(f.page.data.actualQuick,false);assert.equal(f.page.data.actualNeedsReload,true)
})
test('account reload clears the previous account quick confirmation and text',async()=>{
 const f=harness();await f.page.loadMealRecords();await f.page.onEaten(event);assert.equal(f.page.data.actualVisible,true);f.switchAccount();await f.page.loadMealRecords();assert.equal(f.page.data.actualVisible,false);assert.equal(f.page.data.actualText,'');assert.equal(f.page._actualBinding,null)
})

test('cooking account reload also retires the old actual confirmation',async()=>{
 const f=harness(eaten,{pageRoute:'meal-cooking'});f.page.onLoad({date,mealType:'dinner',planRevision:3});await f.page.onShow();await f.page.onRecordActual();assert.equal(f.page.data.actualVisible,true);f.switchAccount();await f.page.onShow();assert.equal(f.page.data.actualVisible,false);assert.equal(f.page.data.actualText,'');assert.equal(f.page._actualBinding,null)
})
test('cooking eaten quick intent corrects skipped without silently submitting skipped',async()=>{
 const f=harness({...eaten,status:'skipped',actualDishes:[]},{pageRoute:'meal-cooking'});f.page.onLoad({date,mealType:'dinner',planRevision:3});await f.page.onShow();await f.page.onRecordActual();assert.equal(f.page.data.actualQuick,true);assert.equal(f.page.data.actualMode,'byPlan');await f.page.onConfirmActual();assert.equal(f.writes[0].body.status,'eaten');assert.equal(f.writes[0].body.expectedRevision,4);assert.equal(f.writes[0].body.expectedPlanRevision,3)
})
test('committed copy with lost response retries identical request after target revision changes',async()=>{
 const options={targetPlan:true},f=harness(eaten,options);await f.page.loadMealRecords();let lost=true;options.savePlan=async(d,m,b)=>{if(lost){lost=false;options.targetRevision=7;throw {isNetworkError:true}}};f.page.onCopy(event);await f.page.saveForm();assert.equal(f.writes.length,1);await f.page.saveForm();assert.equal(f.writes.length,2);assert.deepEqual(f.writes[1],f.writes[0]);assert.equal(f.page.data.formVisible,false)
})

test('copy retry survives page re-entry and later source edits without copying actual',async()=>{
 const first=harness(eaten,{targetPlan:true,copyError:{isNetworkError:true}});await first.page.loadMealRecords();first.page.onCopy(event);await first.page.saveForm();const original=first.writes[0];first.page.onUnload()
 const second=harness(eaten,{memory:first.memory,targetPlan:true,targetRevision:9,sourcePlan:{...plan,recipeName:'新的原餐',dishIds:[99],revision:8}});await second.page.loadMealRecords();second.page.onCopy(event);second.page.onCopyDate({detail:{value:'2026-11-11'}});await second.page.saveForm();assert.deepEqual(second.writes[0],original);assert.equal(second.page.data.copyUnknown,false)
})
test('pending copy can be recovered after source plan removal and stays scoped',async()=>{
 const first=harness(eaten,{copyError:{isNetworkError:true}});await first.page.loadMealRecords();first.page.onCopy(event);await first.page.saveForm()
 const other=harness(eaten,{memory:first.memory,account:'B',noSourcePlan:true});await other.page.loadMealRecords();assert.equal(other.page.data.copyPendingMeal,'');other.page.onCopy(event);assert.equal(other.page.data.formVisible,false)
 const restored=harness(eaten,{memory:first.memory,noSourcePlan:true});await restored.page.loadMealRecords();assert.equal(restored.page.data.copyPendingMeal,'dinner');restored.page.onCopy(event);await restored.page.saveForm();assert.deepEqual(restored.writes[0],first.writes[0]);assert.equal(restored.page.data.copyPendingMeal,'')
})
test('quick eaten intent does not replace an unresolved skipped request',async()=>{
 const memory=new Map(),pending={scope:'A:mealActual',date,mealType:'dinner',text:'',body:{status:'skipped',usePlan:false,dishes:[],expectedRevision:4,expectedPlanRevision:3,requestId:'original-skipped'}};memory.set('A:mealActual:pending:'+date+':dinner',pending)
 const f=harness({...eaten,status:'skipped',actualDishes:[]},{pageRoute:'meal-cooking',memory});f.page.onLoad({date,mealType:'dinner',planRevision:3});await f.page.onShow();await f.page.onRecordActual();assert.equal(f.page.data.actualQuick,false);assert.equal(f.page.data.actualMode,'skipped');await f.page.onActualRetry();assert.deepEqual(f.writes[0].body,pending.body)
})

test('cooking quick edit of eaten keeps historical entries instead of later plan',async()=>{
 const f=harness(eaten,{pageRoute:'meal-cooking'});f.page.onLoad({date,mealType:'dinner',planRevision:3});await f.page.onShow();await f.page.onRecordActual();assert.equal(f.page.data.actualMode,'changed');assert.equal(f.page.data.actualText,'原来吃的鱼');await f.page.onConfirmActual();assert.equal(f.writes[0].body.usePlan,false);assert.deepEqual(f.writes[0].body.dishes,[{retainedEntryIndex:0}]);assert.equal(f.writes[0].body.expectedRevision,4)
})
test('pending copy retry cannot cross accounts and can recover when owner returns',async()=>{
 const f=harness(eaten,{copyError:{isNetworkError:true}});await f.page.loadMealRecords();f.page.onCopy(event);await f.page.saveForm();f.switchAccount();await f.page.saveForm();assert.equal(f.writes.length,1)
 const returned=harness(eaten,{memory:f.memory,targetRevision:8});await returned.page.loadMealRecords();returned.page.onRecoverCopy();await returned.page.saveForm();assert.deepEqual(returned.writes[0],f.writes[0])
})
test('concurrent target conflict resolves original request separately before new overwrite approval',async()=>{
 const modals=[],options={targetPlan:true,modals},f=harness(eaten,options);await f.page.loadMealRecords();let attempt=0;options.savePlan=async()=>{attempt++;if(attempt===1){options.targetRevision=9;throw {isNetworkError:true}}throw {statusCode:409}};f.page.onCopy(event);await f.page.saveForm();await f.page.saveForm();assert.deepEqual(f.writes[1],f.writes[0]);assert.equal(modals.length,1);assert.equal(f.page.data.copyUnknown,false);assert.equal(f.page.data.copyPendingMeal,'');assert.equal(f.page.data.formVisible,true)
 options.approve=false;await f.page.saveForm();assert.equal(modals.length,2);assert.equal(f.writes.length,2);assert.equal(f.page.meal('dinner').plan.revision,3)
})
test('late account-change rejection preserves unresolved copy for the original owner',async()=>{
 let reject;const options={savePlan:()=>new Promise((resolve,no)=>{reject=no})},f=harness(eaten,options);await f.page.loadMealRecords();f.page.onCopy(event);const saving=f.page.saveForm();await new Promise(r=>setImmediate(r));assert.equal(f.writes.length,1);f.switchAccount();await f.page.loadMealRecords();reject({statusCode:401,isAccountChanged:true});await saving
 const owner=harness(eaten,{memory:f.memory});await owner.page.loadMealRecords();assert.equal(owner.page.data.copyPendingMeal,'dinner');owner.page.onRecoverCopy();await owner.page.saveForm();assert.deepEqual(owner.writes[0],f.writes[0])
})
