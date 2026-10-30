const test=require('node:test'),assert=require('node:assert/strict')
const {nutritionView}=require('../utils/canonical-recipe')
const {presentNutritionReference}=require('../utils/diet-report')
const total={energyKcal:100.6,proteinG:5,fatG:3,carbohydrateG:10,fiberG:2,sodiumMg:8}
test('main ingredients scope gets compact integer energy and separate reference text',()=>{
 const result=nutritionView({nutrition:{scope:'main_ingredients',completeness:'complete',total}})
 assert.equal(result.nutritionAvailable,true)
 assert.equal(result.nutritionText,'约 101 千卡');assert.equal(result.nutritionNote,'仅参考')
})
test('old unscoped nutrition cannot be relabelled main ingredient nutrition',()=>{
 const result=nutritionView({nutrition:{completeness:'complete',total}})
 assert.equal(result.nutritionText,'约 101 千卡');assert.doesNotMatch(result.nutritionText,/主料/)
})
test('missing main nutrition never displays known subtotal as a full result',()=>{
 for(const completeness of ['partial','unavailable']){
  const result=nutritionView({nutrition:{scope:'main_ingredients',completeness,total:null,quantifiedSubtotal:{total}}})
  assert.equal(result.nutritionAvailable,false);assert.equal(result.nutritionText,'')
 }
})
test('record reference uses main ingredient scope and keeps covered-only subtotal explicit',()=>{
 const n={scope:'main_ingredients',basis:'recipe_baseline',personalIntakeAvailable:false,entryCount:3,coveredCount:2,unknownCount:1,complete:false,knownTotal:total,total:null}
 const view=presentNutritionReference(n)
 assert.equal(view.title,'营养');assert.equal(view.label,'已知部分');assert.equal(view.coverage,'已覆盖 2/3 道')
 assert.equal(view.note,'仅参考');assert.equal(view.rows[0].value,'101')
 const old=presentNutritionReference({...n,scope:undefined});assert.equal(old.title,'营养');assert.equal(old.note,'仅参考')
})

test('only a small note below calories is rendered without repeated scope explanations',()=>{
 const fs=require('fs'),path=require('path')
 const detail=fs.readFileSync(path.join(__dirname,'../pages/dish-detail/dish-detail.wxml'),'utf8')
 const review=fs.readFileSync(path.join(__dirname,'../pages/statistics/statistics.wxml'),'utf8')
 assert.match(detail,/nutritionText}}<\/text><view class="ew-muted ew-small">{{qualityView.nutritionNote}}/)
 assert.match(review,/item.key === 'energyKcal'/)
 assert.equal((review.match(/nutritionReference.note/g)||[]).length,1)
 assert.doesNotMatch(detail+review,/主料营养参考|不含调味料及辅料/)
})
