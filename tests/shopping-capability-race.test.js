const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
test('hidden price page does not start capability or quote work after a list mutation or account change',async()=>{
 let page,quoted=0,capabilityReads=0,account='A'
 const modules={
  '../../utils/api':{getIngredientPriceQuotes:async()=>{quoted++;return []}},
  '../../utils/util':{getUserStorageKey:k=>account+':'+k},
  '../../utils/shopping-list':{},'../../utils/shopping-view':require('../utils/shopping-view'),'../../utils/meal-workflow':{},
  '../../utils/experience-preferences':()=>({get:()=>({reducedMotion:false})}),'../../utils/ui-tokens':require('../utils/ui-tokens'),
  '../../utils/shopping-list-presentation':{},'../../utils/font-scale':Object.assign(()=>1,{base:16}),
  '../../utils/shopping-capabilities':{refresh:async()=>{capabilityReads++;return {expensesEnabled:true,pricesEnabled:true}},notice:()=>''},
  '../../utils/shopping-prices':{CHANNELS:[],buildPricing:list=>({rows:list.dishes})},
 }
 vm.runInNewContext(fs.readFileSync('pages/shopping-list/shopping-list.js','utf8'),{Page:v=>page=v,require:n=>modules[n],wx:{},console})
 page.setData=v=>Object.assign(page.data,v);page._scope='A:shoppingList';page._epoch=1
 page._full={version:1,dishes:[{ingredientKey:'old',canonicalName:'旧食材'}]};page.renderList=()=>{}
 const waiting=page.loadPrices(page._scope,1)
 page._full={version:2,dishes:[{ingredientKey:'current',canonicalName:'当前食材'}]}
 await waiting
 assert.equal(page.data.expensesEnabled,false);assert.equal(quoted,0);assert.equal(capabilityReads,0)
 assert.equal(page._full.version,2);assert.equal(page._full.dishes[0].ingredientKey,'current')
 account='B';await page.loadPrices('A:shoppingList',1)
 assert.equal(quoted,0);assert.equal(capabilityReads,0);assert.equal(page.data.expensesEnabled,false)
})

test('retained capability cache never publishes a late account A response into account B',async()=>{
 let account='A',token='token-A',finish
 const values=new Map(),writes=[]
 const wx={getStorageSync:key=>key==='token'?token:values.get(key),setStorageSync:(key,value)=>{writes.push(key);values.set(key,value)}}
 const sandbox={module:{exports:{}},wx,Date,Map,require:name=>name==='./api'?{getShoppingPurchaseOptions:()=>new Promise(resolve=>finish=resolve)}:name==='./util'?{getUserStorageKey:key=>account+':'+key}:{getApiBaseUrl:()=>'/local'}}
 vm.runInNewContext(fs.readFileSync('utils/shopping-capabilities.js','utf8'),sandbox)
 const capabilities=sandbox.module.exports,waiting=capabilities.refresh()
 account='B';token='token-B';finish({pricesEnabled:true,expensesEnabled:true});await waiting
 assert.deepEqual(writes,[])
 assert.equal(capabilities.config().pricesEnabled,false);assert.equal(capabilities.config().expensesEnabled,false)
})
