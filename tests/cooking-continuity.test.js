const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
function fixture(){let page,owner='A',dish={id:1,name:'同名菜',steps:[{text:'第一步'},{instruction:'第二步'}],ingredientsAmounts:[{name:'鸡蛋',quantity:'2',unit:'个'}]};const memory=new Map(),scrolls=[]
 const wx={getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,structuredClone(v)),pageScrollTo:v=>scrolls.push(v)}
 const api={getDishById:async()=>structuredClone(dish)}
 vm.runInNewContext(fs.readFileSync('pages/meal-cooking/meal-cooking.js','utf8'),{Page:v=>page=v,wx,console,require:n=>n.endsWith('/api')?api:n.endsWith('/font-scale')?Object.assign(()=>1,{base:16}):n.endsWith('/util')?{getUserStorageKey:k=>owner+':'+k}:require(path.resolve('pages/meal-cooking',n))})
 page.data=structuredClone(page.data);page.setData=v=>Object.assign(page.data,v);page.onLoad({recipeId:'1'});return {page,memory,scrolls,edit:patch=>Object.assign(dish,patch),switch:()=>owner='B'}
}
test('structured steps and ingredients remain readable, reopening resumes the current version',async()=>{
 const f=fixture();await f.page.onShow();assert.deepEqual(Array.from(f.page.data.steps),['第一步','第二步']);assert.match(f.page.data.ingredients[0],/鸡蛋/);f.page.onNextStep();await f.page.onShow();assert.equal(f.page.data.stepIndex,1);assert.equal(f.page.data.canRecordActual,false)
})
test('unversioned edited steps reset reading with a notice rather than reuse a stale position',async()=>{
 const f=fixture();await f.page.onShow();f.page.onNextStep();f.edit({steps:['新的第一步','新的第二步']});await f.page.onShow();assert.equal(f.page.data.stepIndex,0);assert.match(f.page.data.resumeNotice,/做法已更新/)
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
