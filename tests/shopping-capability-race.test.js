const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
test('account capability survives a list mutation and quotes are requested for the current list',async()=>{
 let page,finishCapabilities,quoted
 const modules={
  '../../utils/api':{getIngredientPriceQuotes:async rows=>{quoted=rows;return []}},
  '../../utils/util':{getUserStorageKey:k=>'A:'+k},
  '../../utils/shopping-list':{},'../../utils/shopping-ingredients':{},'../../utils/meal-workflow':{},
  '../../utils/shopping-list-presentation':{},'../../utils/font-scale':Object.assign(()=>1,{base:14}),
  '../../utils/shopping-capabilities':{refresh:()=>new Promise(resolve=>finishCapabilities=resolve),notice:()=>''},
  '../../utils/shopping-prices':{CHANNELS:[],buildPricing:list=>({rows:list.dishes})},
 }
 vm.runInNewContext(fs.readFileSync('pages/shopping-list/shopping-list.js','utf8'),{Page:v=>page=v,require:n=>modules[n],wx:{},console})
 page.setData=v=>Object.assign(page.data,v);page._scope='A:shoppingList';page._epoch=1
 page._full={version:1,dishes:[{ingredientKey:'old',canonicalName:'旧食材'}]};page.renderList=()=>{}
 const waiting=page.loadPrices(page._scope,1)
 page._full={version:2,dishes:[{ingredientKey:'current',canonicalName:'当前食材'}]}
 finishCapabilities({expensesEnabled:true,pricesEnabled:true});await waiting
 assert.equal(page.data.expensesEnabled,true)
 assert.equal(quoted[0].ingredientKey,'current')
})
