const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const {calendarMealPresentation:present,calendarDayLabel}=require('../utils/calendar-meal-presentation')
const plan={recipeName:'这餐',dishDetails:[{id:1,name:'面'}]}
test('one record is the only calendar subject regardless of retired consumption fields',()=>{
 for(const actual of [null,{status:'eaten',actualDishes:[{name:'旧表'}]},{status:'skipped'}]){
  const row=present({plan,actual,date:'2026-10-25',today:'2026-10-25'})
  assert.equal(row.mode,'recorded');assert.equal(row.summary,'面');assert.equal(row.originalPlan,null);assert.equal(row.primary.kind,'prepare')
  assert.equal(present({plan:null,actual,date:'2026-10-25',today:'2026-10-25'}).mode,'empty')
 }
})
test('future calendar record stays visible before it counts in the review',()=>{const p=present({plan,date:'2026-10-30',today:'2026-10-25'});assert.equal(p.statusLabel,'已保存');assert.equal(p.summary,'面');assert.equal(p.primary.kind,'prepare')})
test('calendar displays one record mark without plan and eaten categories',()=>{
 const label=calendarDayLabel({date:'2026-10-25',hasPlan:true,selected:true});assert.match(label,/有餐次记录/);assert.doesNotMatch(label,/实吃|吃过/)
 const s=fs.readFileSync('pages/calendar/calendar.wxml','utf8');assert.match(s,/记：已保存菜单/);assert.doesNotMatch(s,/排：|计划与实际/)
})
