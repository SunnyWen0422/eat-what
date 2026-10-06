const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path')
test('whole-meal cooking uses every saved recipe and completing steps does not record eating',async()=>{
 let page,writes=0;const memory=new Map();const api={getMealOverview:async()=>({plans:[{recordDate:'2026-10-06',mealType:'dinner',revision:3,dishIds:[1,2],dishDetails:[{id:1,name:'番茄炒蛋',steps:'切番茄###炒鸡蛋'},{id:2,name:'青菜',steps:'洗菜###炒熟'}]}]}),saveMealConsumption:()=>writes++}
 const wx={getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,v),showToast(){}}
 const context={Page:v=>page=v,wx,console,require:n=>n.endsWith('/api')?api:n.endsWith('/font-scale')?Object.assign(()=>1.5,{base:14}):n.endsWith('/util')?{getUserStorageKey:k=>'A:'+k}:require(path.resolve('pages/meal-cooking',n))};vm.runInNewContext(fs.readFileSync('pages/meal-cooking/meal-cooking.js','utf8'),context);page.setData=v=>Object.assign(page.data,v);assert.equal(page.data.fontScale,1.5)
 page.onLoad({date:'2026-10-06',mealType:'dinner',planRevision:'3'});await page.onShow();assert.equal(page.data.dishes.length,2);assert.equal(page.data.steps.length,2);page.onNextStep();page.onPreviousStep();await page.onShow();assert.equal(page.data.stepIndex,0);page.onChooseDish({currentTarget:{dataset:{index:1}}});assert.equal(page.data.dishName,'青菜');assert.equal(writes,0)
 let opened;page.openMealActual=target=>{opened=target};page.onRecordActual();assert.equal(opened.planRevision,3);assert.match(opened.displayedPlanNames,/番茄炒蛋.*青菜/)
})
