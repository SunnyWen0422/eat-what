const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const file=require('node:path').resolve(__dirname,'../utils/recipe-quality.js')
test('recipe quality renderer hides generated raw amounts and rejected materials',()=>{
 assert.ok(fs.existsSync(file),'recipe quality renderer missing')
 const view=require(file).presentRecipeQuality({kcal:0,quality:{reviewStatus:'UNREVIEWED',servingsStatus:'UNKNOWN',ingredients:[{name:'白糖',quantityStatus:'UNKNOWN',rawQuantity:'55',unit:'克'},{name:'快手',identityStatus:'REJECTED'}]}})
 assert.deepEqual(view.ingredientLines,['白糖 · 用量待核实']);assert.equal(view.nutritionText,'热量资料待核实');assert.ok(!view.ingredientLines.join('').includes('55'))
})
test('verified quantity and servings can be displayed while unknown calories stay unknown',()=>{
 assert.ok(fs.existsSync(file),'recipe quality renderer missing')
 const view=require(file).presentRecipeQuality({quality:{reviewStatus:'VERIFIED',servingsStatus:'VERIFIED',basePeople:2,ingredients:[{name:'白糖',identityStatus:'VERIFIED',quantityStatus:'VERIFIED',quantityValue:'10',unit:'克'}],nutritionStatus:'UNKNOWN'}})
 assert.equal(view.ingredientLines[0],'白糖 · 原配方 10克');assert.match(view.notice,/2 人/);assert.equal(view.nutritionText,'热量资料待核实')
})
test('legacy generated allowance is handled honestly even before evidence is returned',()=>{
 assert.ok(fs.existsSync(file),'recipe quality renderer missing')
 const view=require(file).presentRecipeQuality({fl:'2名成年人总量+15%冗余',ingredientsAmounts:'快手|345|克|主料|处理|2名成年人总量+15%冗余|菜名###糖|55|克|调味|加入|2名成年人总量+15%冗余|步骤'})
 assert.deepEqual(view.ingredientLines,['糖 · 用量待核实']);assert.match(view.notice,/核实/)
})
