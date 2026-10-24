const test=require('node:test'),assert=require('node:assert/strict')
const {presentNutritionReference,presentDietReport}=require('../utils/diet-report')
const totals={energyKcal:420,proteinG:20,fatG:12,carbohydrateG:58,fiberG:0,sodiumMg:600}
const nutrition=overrides=>({basis:'recipe_baseline',personalIntakeAvailable:false,entryCount:3,coveredCount:2,unknownCount:1,complete:false,knownTotal:totals,total:null,...overrides})
test('partial coverage labels the known part without replacing unknown values with zero',()=>{
 const view=presentNutritionReference(nutrition())
 assert.equal(view.label,'已知部分');assert.equal(view.coverage,'已覆盖 2/3 道');assert.equal(view.rows.find(row=>row.key==='energyKcal').value,'420')
 assert.equal(view.rows.find(row=>row.key==='fiberG').value,'0');assert.match(view.note,/不代表个人实际摄入/)
 const missing=presentNutritionReference(nutrition({coveredCount:0,unknownCount:3,knownTotal:null}))
 assert.equal(missing.rows.length,0);assert.equal(missing.coverage,'已覆盖 0/3 道');assert.equal(missing.available,false)
})
test('only complete coverage with all six numeric facts gets a total label',()=>{
 const full=presentNutritionReference(nutrition({coveredCount:3,unknownCount:0,complete:true,total:totals}))
 assert.equal(full.label,'总值');assert.equal(full.rows.length,6)
 const incomplete=presentNutritionReference(nutrition({coveredCount:3,unknownCount:0,complete:true,total:{...totals,fatG:null},knownTotal:null}))
 assert.equal(incomplete.available,false);assert.equal(incomplete.rows.length,0)
 assert.equal(presentNutritionReference(nutrition({basis:'personal_intake'})),null)
 assert.equal(presentNutritionReference(nutrition({personalIntakeAvailable:true})),null)
})
test('optional nutrition preserves the six-block report contract and old responses',()=>{
 const range={startDate:'2026-10-19',endDate:'2026-10-25'},report={metadata:{...range,basis:'explicit_eaten'},blocks:{overview:{mealCount:1},actualDetails:{records:[]},frequentDishes:{},categoryCounts:{},planExecution:{},completeness:{observedDays:7}}}
 assert.equal(presentDietReport(report,range).nutritionReference,null)
 report.blocks.actualDetails.nutrition=nutrition();const result=presentDietReport(report,range)
 assert.equal(result.nutritionReference.label,'已知部分');assert.equal(Object.keys(report.blocks).length,6)
})
