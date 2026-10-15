const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const pricing=require('../utils/shopping-prices')
function harness({caps={expensesEnabled:true,pricesEnabled:false},quote=async()=>[],expense=async()=>{}}={}){
 let definition,owner='A',reads=0,quotes=0;const list={version:1,dishes:[{dishId:7,selectionKey:'dinner',items:[{id:1,canonicalName:'猪肉',displayName:'猪肉',normalizedVariant:'里脊',quantityText:'适量',checked:false}]}],expenses:{}}
 const api={getIngredientPriceQuotes:async rows=>{quotes++;return quote(rows)},saveShoppingExpense:expense}
 const modules={'../../utils/api':api,'../../utils/shopping-list':{},'../../utils/util':{getUserStorageKey:k=>owner+':'+k},'../../utils/font-scale':Object.assign(()=>1,{base:16}),'../../utils/shopping-prices':pricing,'../../utils/shopping-view':require('../utils/shopping-view'),'../../utils/shopping-list-presentation':require('../utils/shopping-list-presentation'),'../../utils/meal-workflow':require('../utils/meal-workflow'),'../../utils/experience-preferences':()=>({get:()=>({})}),'../../utils/ui-tokens':require('../utils/ui-tokens'),'../../utils/meal-next-step':require('../utils/meal-next-step'),'../../utils/shopping-capabilities':{refresh:async()=>{reads++;return caps},notice:()=>'',markQuotesUnavailable(){}}}
 vm.runInNewContext(fs.readFileSync('pages/shopping-list/shopping-list.js','utf8'),{Page:v=>definition=v,require:n=>modules[n],wx:{},console})
 const page={...definition,data:structuredClone(definition.data),setData(v){Object.assign(this.data,v)}};page._scope='A:shoppingList';page._epoch=1;page._full=list;page.data.version=1
 return {page,list,reads:()=>reads,quotes:()=>quotes,switch:()=>owner='B'}
}
test('expenses are available on demand even with no reference pricing, and keep zero distinct from missing',async()=>{
 const f=harness();await f.page.onPriceDetails();assert.equal(f.reads(),1);assert.equal(f.quotes(),0);assert.equal(f.page.data.expensesEnabled,true);assert.equal(f.page.data.pricingRows[0].referenceText,'—')
 f.list.expenses[pricing.ingredientKey({...f.list.dishes[0].items[0],sourceDishId:7})]={amount:'0.00'};f.page.refreshPricing();assert.equal(f.page.data.actualSpend,'¥0.00')
 f.page.onEditExpense({currentTarget:{dataset:{key:f.page.data.pricingRows[0].ingredientKey}}});assert.equal(f.page.data.expenseAmount,'0.00');assert.match(f.page.data.expenseName,/里脊/)
})
test('a late quote result cannot replace the next list version or next account',async()=>{
 let finish;const f=harness({caps:{pricesEnabled:true,expensesEnabled:true},quote:()=>new Promise(r=>finish=r)});const waiting=f.page.onPriceDetails();await new Promise(r=>setImmediate(r));assert.equal(f.quotes(),1)
 f.page._full={version:2,dishes:[],expenses:{}};f.page.data.version=2;finish([]);await waiting;assert.equal(f.page.data.priceLoading,false);assert.equal(f.page.data.expensesEnabled,false)
 f.switch();await f.page.loadPrices('A:shoppingList',1);assert.equal(f.reads(),1)
})
test('unknown and unconvertible quantities stay missing while actual spend remains independent',()=>{
 const items=[{id:1,displayName:'猪肉',normalizedVariant:'里脊',quantityText:'适量'},{id:2,displayName:'猪肉',normalizedVariant:'五花',quantityText:'2块',parseStatus:'PARSED',calculationStatus:'CALCULATED',quantityValue:2,unitCode:'块',unitFamily:'count'}]
 const list={dishes:[{dishId:7,items}]},quotes={};for(const item of items)quotes[pricing.ingredientKey({...item,sourceDishId:7})]={status:'AVAILABLE',quoteDate:'2026-10-15',price:'10',unitQuantity:500,unitCode:'g',unitFamily:'mass'}
 const view=pricing.buildPricing(list,quotes,'2026-10-15');assert.equal(view.rows.length,2);assert.equal(view.pendingMissing,2);assert.equal(view.pendingText,'—');assert.ok(view.rows.every(r=>r.referenceText==='—'))
})
test('costs stay folded and ingredient names retain variants in the optional expense editor',()=>{
 const template=fs.readFileSync('pages/shopping-list/shopping-list.wxml','utf8');assert.match(template,/wx:if="\{\{detailsExpanded\}\}"/);assert.match(template,/bind:confirm="saveExpense"/);assert.match(template,/从日历准备食材/)
})
test('a missing expense amount stays empty instead of breaking the shopping page',()=>{
 const item={id:1,canonicalName:'鸡蛋'},key=pricing.ingredientKey({...item,sourceDishId:7})
 const view=pricing.buildPricing({dishes:[{dishId:7,items:[item]}],expenses:{[key]:{amount:null}}})
 assert.equal(view.rows[0].displayName,'鸡蛋');assert.equal(view.rows[0].actualText,'—');assert.equal(view.recorded,0)
})
test('expense edit cannot silently save against a later list version',async()=>{
 const f=harness();await f.page.onPriceDetails();f.page.onEditExpense({currentTarget:{dataset:{key:f.page.data.pricingRows[0].ingredientKey}}});f.page.data.version=2
 let writes=0;f.page.perform=()=>writes++;f.page.data.expenseAmount='0';f.page.saveExpense();assert.equal(writes,0);assert.match(f.page.data.formError,/清单已变化/)
})
