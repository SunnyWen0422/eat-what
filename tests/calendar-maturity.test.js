const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {calendarMealPresentation,calendarDayLabel}=require('../utils/calendar-meal-presentation')
const flow=require('../utils/meal-workflow')
test('calendar dates announce the complete target and distinguish missing records from skipped meals',()=>{
 assert.equal(calendarDayLabel({date:'2026-10-31',selected:true,hasPlan:true,eaten:false,skipped:true}),'2026年10月31日，已选中，有安排，已记录这餐没吃')
 assert.equal(calendarDayLabel({date:'2026-11-01'}),'2026年11月1日，未记录实际用餐')
 assert.equal(flow.shiftDay('2026-10-31',1),'2026-11-01')
 const now=Date.now;try{Date.now=()=>Date.parse('2026-10-31T16:00:00Z');assert.equal(flow.today(),'2026-11-01')}finally{Date.now=now}
})
test('calendar offers one primary action without promoting historical procurement',()=>{
 const plan={dishDetails:[{id:1,name:'青菜'}]}
 assert.deepEqual(calendarMealPresentation({plan,date:'2026-10-15',today:'2026-10-15'}).primary,{kind:'recordEaten',label:'记录这餐'})
 assert.equal(calendarMealPresentation({plan,date:'2026-10-16',today:'2026-10-15'}).primary.kind,'prepare')
 for(const status of ['eaten','skipped'])assert.equal(calendarMealPresentation({actual:{status},date:'2026-10-14',today:'2026-10-15'}).primary.kind,'correctActual')
 assert.equal(calendarMealPresentation({date:'2026-10-15',today:'2026-10-15'}).primary.kind,'arrange')
})
test('actual remains the reading subject after deletion and does not fall back to a different meal with the same dish name',()=>{
 const date='2026-10-15',overview={plans:[{recordDate:date,mealType:'lunch',dishDetails:[{id:9,name:'青菜'}]}],consumptions:[{mealDate:date,mealType:'dinner',status:'eaten',actualDishes:[{dishId:2,name:'青菜'}],plannedSnapshot:{name:'旧晚餐'}}]}
 const meal=flow.mealViews(overview,date).find(x=>x.mealType==='dinner'),shown=calendarMealPresentation({...meal,date,today:date})
 assert.equal(shown.mode,'actualOnly');assert.equal(shown.dishes[0].dishId,2);assert.equal(shown.originalPlan.name,'旧晚餐')
})
test('calendar and actual templates keep blank dates inert and explicit record semantics',()=>{
 const grid=fs.readFileSync('pages/calendar/calendar.wxml','utf8'),detail=fs.readFileSync('pages/calendar-detail/calendar-detail.wxml','utf8'),sheet=fs.readFileSync('templates/meal-actual-sheet.wxml','utf8')
 assert.match(grid,/aria-label="\{\{item.accessibleLabel\}\}"/);assert.match(grid,/wx:if="\{\{item.blank\}\}" aria-hidden="true"/)
 assert.match(detail,/bind:action="onPrimaryMeal"/);assert.doesNotMatch(detail,/class="meal-status-actions"/)
 assert.doesNotMatch(sheet,/没按这份计划做|确认未按计划/);assert.match(sheet,/<textarea[^>]*bindinput="onActualText"/);assert.match(sheet,/按这份计划吃了/)
})
