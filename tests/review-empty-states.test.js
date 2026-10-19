const test=require('node:test'),assert=require('node:assert/strict')
const presentation=require('../utils/shopping-page-presentation'),pricing=require('../utils/shopping-prices')
test('genuinely empty shopping removes switches and expenses but keeps one footer add action',()=>{
 const p=presentation.shoppingPagePresentation({});assert.equal(p.showViews,false);assert.equal(p.showExpenses,false);assert.equal(p.showMore,false);assert.equal(p.emptyAction,'')
})
test('checked items, zero expenses and recovery remain accessible',()=>{
 assert.equal(presentation.shoppingPagePresentation({checkedCount:2}).showViews,true)
 assert.equal(presentation.shoppingPagePresentation({hasExpense:true}).showExpenses,true)
 for(const state of [{drafts:[{}]},{loading:true},{offline:true},{errorMessage:'暂未连接'}])assert.equal(presentation.shoppingPagePresentation(state).emptyAction,'')
})
test('removed ingredient expenses do not reappear from a stale response',()=>{
 const p=pricing.buildPricing({dishes:[],expenses:{synthetic:{amount:'0',channel:'其他'}}});assert.equal(p.recorded,0);assert.equal(p.actualText,'—');assert.equal(p.rows.length,0);assert.equal(pricing.copyPending({dishes:[],expenses:{synthetic:{amount:'0'}}}),'')
})

test('zero expense remains a real amount while the ingredient still exists',()=>{
 const item={sourceDishId:1,canonicalName:'番茄',displayName:'番茄',quantityText:'1个'}
 const key=pricing.ingredientKey(item),p=pricing.buildPricing({dishes:[{dishId:1,items:[item]}],expenses:{[key]:{amount:'0',channel:'其他'}}})
 assert.equal(p.recorded,1);assert.equal(p.actualText,'¥0.00');assert.equal(p.rows.length,1)
})
test('diet empty state is based on eaten meals and retains pending plans',()=>{
 const range={startDate:'2026-10-12',endDate:'2026-10-18'},report={metadata:{...range,basis:'explicit_eaten'},blocks:{overview:{mealCount:0},actualDetails:{records:[]},frequentDishes:{dishes:[]},categoryCounts:{categories:{},entryCount:0},planExecution:{unconfirmedMeals:2},completeness:{observedDays:7}}}
 const view=require('../utils/diet-report').presentDietReport(report,range);assert.equal(view.hasActualRecords,false);assert.equal(view.reportView.planExecution.unconfirmedMeals,2)
 report.blocks.overview.mealCount=1;assert.equal(require('../utils/diet-report').presentDietReport(report,range).hasActualRecords,true)
})
