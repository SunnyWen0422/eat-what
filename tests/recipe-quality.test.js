const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const file=require('node:path').resolve(__dirname,'../utils/recipe-quality.js')
test('partial nutrition does not display a fake whole recipe total or verification placeholders',()=>{
 assert.ok(fs.existsSync(file),'recipe quality renderer missing')
 const view=require(file).presentRecipeQuality({kcal:0,recipe:{calculatedNutrition:{completeness:'partial',total:null,quantifiedSubtotal:{energyKcal:55},perServing:null}}})
 assert.equal(view.nutritionAvailable,false);assert.equal(view.nutritionText,'')
})
test('complete nutrition displays whole dish energy even with unknown source servings',()=>{
 assert.ok(fs.existsSync(file),'recipe quality renderer missing')
 const view=require(file).presentRecipeQuality({recipe:{baseServings:null,calculatedNutrition:{completeness:'complete',total:{energyKcal:100,proteinG:2,fatG:4,carbohydrateG:10,fiberG:1,sodiumMg:12},perServing:null}}})
 assert.equal(view.nutritionAvailable,true);assert.equal(view.nutritionText,'约 100 千卡')
})
test('legacy calorie and verification fields cannot replace canonical nutrition',()=>{
 assert.ok(fs.existsSync(file),'recipe quality renderer missing')
 const view=require(file).presentRecipeQuality({fl:'2名成年人总量+15%冗余',ingredientsAmounts:'快手|345|克|主料|处理|2名成年人总量+15%冗余|菜名###糖|55|克|调味|加入|2名成年人总量+15%冗余|步骤'})
 assert.equal(view.nutritionAvailable,false);assert.equal(view.nutritionText,'')
})

test('category labels translate catalog codes without exposing unknown internal values',()=>{
 const label=require(file).dishCategoryLabel
 assert.equal(label('meat'),'荤菜');assert.equal(label('veg'),'素菜');assert.equal(label('dessert'),'甜品')
 assert.equal(label('家常菜'),'家常菜');assert.equal(label('internal_future_code'),'未分类');assert.equal(label(null),'未分类')
})
