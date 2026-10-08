const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm')
test('dish detail obtains quantities and procurement for the actual meal people',async()=>{
 let page,request,selection
 const api={getDishById:async()=>({id:1,name:'菜',tags:'快手,早餐',ingredientsAmounts:'鸡蛋|2|枚|主料|||2人',fl:'2人'}),checkFavoriteDish:async()=>({}),createShoppingPreview:async body=>{request=body;return {dishes:[{items:[{displayName:'鸡蛋',quantityText:'4count',calculationStatus:'CALCULATED'}]}]}}}
 const ctx={Page:p=>page=p,wx:{getStorageSync:()=>null,navigateTo(){}},getApp:()=>({globalData:{loginReady:true}}),console,require:name=>{
 if(name.endsWith('/recipe-quality'))return require('../utils/recipe-quality')
 if(name.endsWith('/api'))return api
 if(name.endsWith('/font-scale'))return ()=>1
 if(name.endsWith('/util'))return {getUserStorageKey:key=>'A:'+key}
 if(name.endsWith('/shopping-list'))return {beginShoppingSelection:s=>selection=s}
 throw Error(name)
 }}
 vm.runInNewContext(fs.readFileSync('pages/dish-detail/dish-detail.js','utf8'),ctx);page.setData=p=>{for(const [key,value] of Object.entries(p)){const parts=key.split(".");let target=page.data;while(parts.length>1)target=target[parts.shift()];target[parts[0]]=value}}
 page.onLoad({id:1,people:'4'});await page.loadDishDetail(1);await new Promise(resolve=>setImmediate(resolve));page.onAddToShoppingList()
 assert.equal(request.targetPeople,4);assert.equal(selection.targetPeople,4);assert.deepEqual(Array.from(page.data.dish.tagsList),['快手','早餐']);assert.ok(page.data.dish.ingredientsList[0].includes('4'))
})
