const {canonicalDish,canonicalApi}=require('./fixtures/canonical-dish')
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
function fixture(){let page,owner='A',dish={id:1,name:'同名菜',steps:[{text:'第一步'},{instruction:'第二步'}],ingredientsAmounts:[{name:'鸡蛋',quantity:'2',unit:'个'}]};const memory=new Map(),scrolls=[]
 const wx={getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,structuredClone(v)),pageScrollTo:v=>scrolls.push(v)}
 const api={getDishById:async()=>structuredClone(dish)}
 vm.runInNewContext(fs.readFileSync('pages/meal-cooking/meal-cooking.js','utf8'),{Page:v=>page=v,wx,console,require:n=>n.endsWith('/api')?canonicalApi(api):n.endsWith('/font-scale')?Object.assign(()=>1,{base:16}):n.endsWith('/util')?{getUserStorageKey:k=>owner+':'+k}:require(path.resolve('pages/meal-cooking',n))})
 page.data=structuredClone(page.data);page.setData=(v,callback)=>{Object.assign(page.data,v);callback?.()};page.onLoad({recipeId:'1'});return {page,memory,scrolls,edit:patch=>Object.assign(dish,patch),switch:()=>owner='B'}
}
test('structured steps and ingredients remain readable, reopening resumes the current version',async()=>{
 const f=fixture();await f.page.onShow();assert.deepEqual(Array.from(f.page.data.steps),['第一步','第二步']);assert.match(f.page.data.ingredients[0],/鸡蛋/);f.page.onNextStep();await f.page.onShow();assert.equal(f.page.data.stepIndex,1);assert.equal(f.page.data.canRecordActual,false)
})
test('unversioned edited steps reset reading with a notice rather than reuse a stale position',async()=>{
 const f=fixture();await f.page.onShow();f.page.onNextStep();f.edit({steps:['新的第一步','新的第二步']});await f.page.onShow();assert.equal(f.page.data.stepIndex,0);assert.match(f.page.data.resumeNotice,/做法已更新/)
})
test('numbered source remains the reading fingerprint while the displayed step has only one ordinal',async()=>{
 const f=fixture();f.edit({steps:['1. 加1.5克盐','2. 烤20分钟']})
 await f.page.onShow()
 assert.deepEqual(Array.from(f.page.data.dishes[0].recipe.steps,step=>step.text),['1. 加1.5克盐','2. 烤20分钟'])
 assert.deepEqual(Array.from(f.page.data.steps),['加1.5克盐','烤20分钟'])
 f.page.onNextStep();await f.page.onShow()
 assert.equal(f.page.data.stepIndex,1)
 assert.equal(f.page.data.resumeNotice,'')
})
test('account switch retires old reading and late controls cannot write to either scope',async()=>{
 const f=fixture();await f.page.onShow();f.page.onNextStep();const before=JSON.stringify([...f.memory]);f.switch();f.page.onNextStep();f.page.onChooseDish({currentTarget:{dataset:{index:0}}});assert.equal(JSON.stringify([...f.memory]),before);await f.page.onShow();assert.equal(f.page.data.stepIndex,0)
})
test('reading identity distinguishes same named recipes and restores the active recipe',()=>{
 const {restoreReading,saveReading}=require('../utils/cooking-progress'),memory=new Map(),storage={getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,v)},ctx={scope:'A',date:'2026-10-15',mealType:'dinner',planRevision:2},dishes=[{id:1,name:'青菜',stepsList:['洗','炒']},{id:2,name:'青菜',stepsList:['切','煮']}]
 let state=restoreReading(storage,ctx,dishes);state.entries['2'].stepIndex=1;state.activeDishId='2';saveReading(storage,ctx,state)
 state=restoreReading(storage,ctx,dishes);assert.equal(state.dishIndex,1);assert.equal(state.entries['1'].stepIndex,0);assert.equal(state.entries['2'].stepIndex,1)
 dishes[1].stepsList=[];state=restoreReading(storage,ctx,dishes);assert.equal(state.entries['2'].stepIndex,0);assert.equal(state.changed,true)
})
test('storage failure does not block reading content',()=>{
 const progress=require('../utils/cooking-progress'),storage={getStorageSync(){throw Error('storage unavailable')},setStorageSync(){throw Error('full')}},ctx={scope:'A',date:'recipe-1',mealType:'recipe',planRevision:'recipe-v2'}
 const state=progress.restoreReading(storage,ctx,[{id:1,stepsList:['读这一步']}]);assert.equal(state.entries['1'].stepIndex,0);assert.equal(progress.saveReading(storage,ctx,state),false)
})

test('ingredient sheet preserves step and viewport',async()=>{
 const template=fs.readFileSync('pages/meal-cooking/meal-cooking.wxml','utf8');assert.match(template,/<ui-sheet visible="\{\{ingredientsVisible\}\}"[^>]*bind:close="closeIngredients"/)
 const f=fixture();await f.page.onShow();f.page.onNextStep();f.page.onPageScroll({scrollTop:637});f.scrolls.length=0
 const before=JSON.stringify([...f.memory]);f.page.onIngredients();assert.equal(f.page.data.ingredientsVisible,true)
 assert.equal(f.page.data.dishIndex,0);assert.equal(f.page.data.stepIndex,1);assert.equal(f.page._ingredientReturnPosition.scrollTop,637)
 f.page.closeIngredients();assert.equal(f.page.data.ingredientsVisible,false);assert.equal(f.page.data.stepIndex,1)
 assert.deepEqual(JSON.parse(JSON.stringify(f.scrolls)),[{scrollTop:637,duration:0}]);assert.equal(JSON.stringify([...f.memory]),before)
})

test('step navigation targets content heading and final step never records eating',async()=>{
 assert.match(fs.readFileSync('pages/meal-cooking/meal-cooking.wxml','utf8'),/id="cooking-step-heading"/)
 const f=fixture();await f.page.onShow();f.page.onNextStep()
 assert.equal(f.scrolls.at(-1).selector,'#cooking-step-heading');assert.equal('scrollTop' in f.scrolls.at(-1),false)
 const saved=JSON.stringify([...f.memory]),count=f.scrolls.length;f.page.onNextStep()
 assert.equal(f.page.data.stepIndex,1);assert.equal(f.scrolls.length,count);assert.equal(JSON.stringify([...f.memory]),saved);assert.equal(f.page.data.actualVisible,false)
 f.page.setData({reducedMotion:true});f.page.onPreviousStep();assert.equal(f.scrolls.at(-1).duration,0)
})

test('stale ingredient return never restores another dish, account, or content version',async()=>{
 const f=fixture();await f.page.onShow();f.page.data.dishes.push({id:2,name:'另一道菜',stepsList:['切','煮'],ingredientsList:[]});f.page._reading.entries['2']={fingerprint:'second',stepIndex:0}
 f.page.onNextStep();f.page.onPageScroll({scrollTop:300});f.page.onIngredients();f.page.onChooseDish({currentTarget:{dataset:{index:1}}});f.page.closeIngredients()
 assert.equal(f.page.data.dishIndex,1);assert.equal(f.page.data.stepIndex,0);assert.equal(f.page.data.ingredientsVisible,false);assert.equal(f.scrolls.some(v=>v.scrollTop===300),false)
 f.page.onNextStep();f.page.onChooseDish({currentTarget:{dataset:{index:0}}});assert.equal(f.page.data.stepIndex,1)
 f.page.onIngredients();f.switch();f.scrolls.length=0;f.page.closeIngredients();assert.equal(f.scrolls.length,0)
 await f.page.onShow();f.page.onIngredients();f.edit({steps:['新做法']});await f.page.onShow();f.scrolls.length=0;f.page.closeIngredients();assert.equal(f.scrolls.length,0);assert.equal(f.page.data.stepIndex,0)
})

test('delayed ingredient close cannot restore after reselecting a dish or unloading',async()=>{
 const f=fixture();await f.page.onShow();f.page.onPageScroll({scrollTop:720});f.page.onIngredients()
 const callbacks=[];f.page.setData=(value,callback)=>{Object.assign(f.page.data,value);if(callback)callbacks.push(callback)}
 f.page.closeIngredients();f.page.onChooseDish({currentTarget:{dataset:{index:0}}});f.scrolls.length=0
 callbacks.splice(0).forEach(callback=>callback());assert.equal(f.scrolls.length,0)
 f.page.onIngredients();f.page.closeIngredients();f.page.onUnload();callbacks.splice(0).forEach(callback=>callback());assert.equal(f.scrolls.length,0)
})

test('contentVersion changes reset reading and unknown recipe data stays honest',async()=>{
 const f=fixture();f.edit({contentVersion:'v1'});await f.page.onShow();f.page.onNextStep()
 f.edit({contentVersion:'v2'});await f.page.onShow();assert.equal(f.page.data.stepIndex,0);assert.match(f.page.data.resumeNotice,/做法已更新/)
 f.edit({steps:[],ingredientsAmounts:[]});await f.page.onShow();assert.equal(f.page.data.steps.length,0);assert.equal(f.page.data.ingredients.length,0)
 f.scrolls.length=0;f.page.onNextStep();assert.equal(f.scrolls.length,0);f.page.onIngredients();f.page.closeIngredients();assert.equal(f.page.data.stepIndex,0)
})
