const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
function fixture(){let account='A',factory;const urls=[];const scope={module:{exports:{}},require:n=>n==='./api'?{}:n==='./util'?{getCurrentUserIdentity:()=>account,getUserStorageKey:k=>'A:'+k}:require(path.resolve('utils',n)),wx:{navigateTo:o=>urls.push(o.url)},setTimeout,clearTimeout,console};vm.runInNewContext(fs.readFileSync('utils/meal-workspace-page.js','utf8'),scope);factory=scope.module.exports;const page=factory();page.setData=v=>Object.assign(page.data,v);page._alive=true;page._scope='A';page.store={};page.data.context={date:'2026-10-09',mealType:'lunch'};return{page,urls,switch:()=>account='B'}}
test('open meal result waits for the draft save and carries the selected meal target',async()=>{
 const f=fixture();let done;f.page.flushDraft=()=>new Promise(r=>done=r)
 const opening=f.page.onOpenMealResult();assert.equal(f.urls.length,0);done();await opening
 assert.equal(f.urls[0],'/pages/result/result?date=2026-10-09&mealType=lunch')
})
test('a changed account during the save never opens the previous meal route',async()=>{
 const f=fixture();let done;f.page.flushDraft=()=>new Promise(r=>done=r)
 const opening=f.page.onOpenAssistantView();f.switch();done();await opening;assert.equal(f.urls.length,0)
})
test('failed draft save keeps the current page and tells the user what remains unsaved',async()=>{
 const f=fixture();f.page.flushDraft=async()=>{throw Error('本餐尚未保存')}
 await f.page.onOpenMealResult();assert.equal(f.urls.length,0);assert.equal(f.page.data.errorMessage,'本餐尚未保存')
})
