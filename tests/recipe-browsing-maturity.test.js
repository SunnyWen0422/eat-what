const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const quality=require('../utils/recipe-quality')
function pageFixture(api={}){
 let page,scope='A';const timers=new Map(),memory=new Map(),writes=[],util={getUserStorageKey:k=>scope+':'+k},wx={getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,v),removeStorageSync:k=>memory.delete(k),getStorageInfoSync:()=>({keys:[...memory.keys()]}),vibrateShort(){},enableAlertBeforeUnload(){},disableAlertBeforeUnload(){}}
 const journal=require('../utils/personal-recipes').createWriteJournal({identity:()=> 'A',key:util.getUserStorageKey,read:wx.getStorageSync,write:wx.setStorageSync,remove:wx.removeStorageSync,keys:()=>[...memory.keys()]})
 vm.runInNewContext(fs.readFileSync('pages/customize/customize.js','utf8'),{Page:d=>page=d,wx,console,setTimeout:fn=>{const id=timers.size+1;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id),require:n=>n.endsWith('/api')?api:n.endsWith('/util')?util:n.endsWith('/account-identity')?{currentIdentity:()=> 'A'}:n.endsWith('/config')?{ENABLE_MEAL_WORKSPACE:false}:n.endsWith('/personal-recipes')?{createWriteJournal:()=>journal}:require(path.resolve('pages/customize',n))})
 page.setData=(patch,cb)=>{writes.push(patch);Object.assign(page.data,patch);if(cb)cb()};page.ensureBrowseOwner();return{page,writes,timers,switchSource:()=>scope='A-other-api'}
}
test('search hides stale rows during debounce and late old results cannot appear under a new query',async()=>{
 let finish;const f=pageFixture({getDishes:()=>new Promise(r=>finish=r)});f.page.data.currentDishes=[{id:1,name:'旧菜'}]
 const pending=f.page.loadPage('meat',1);f.page.onSearchInput({detail:{value:'鸡蛋'}});assert.equal(f.page.data.loading,true)
 finish({list:[{id:2,name:'过期响应'}],total:1});await pending;assert.equal(f.page.data.currentDishes.some(d=>d.id===2),false)
 const source=fs.readFileSync('pages/customize/customize.wxml','utf8');assert.match(source,/wx:if="{{!loading && \(!browseError \|\| browseErrorPage > 1\)}}"/)
})
test('scroll events preserve position without a setData feedback loop and return keeps the query and filter',async()=>{
 const f=pageFixture();f.page.data.searchKeyword='鸡蛋';f.page.data.activeTab='veg';f.page.data.browseCriteria={cuisineCodes:['C1'],tagCodes:[],methodCodes:[]};const start=f.writes.length
 f.page.onBrowseScroll({detail:{scrollTop:345}});assert.equal(f.writes.length,start);f.page.onHide();await f.page.onShow()
 assert.equal(f.page.data.browseScrollTop,345);assert.equal(f.page.data.searchKeyword,'鸡蛋');assert.equal(f.page.data.activeTab,'veg');assert.equal(f.page.data.browseCriteria.cuisineCodes[0],'C1')
})
test('recipe lines render structured source content without object serialization or image links',()=>{
 assert.deepEqual(quality.presentRecipeLines([{name:'鸡蛋',quantity:2,unit:'个'},{text:'香葱少许'}],true),['鸡蛋 2个','香葱少许'])
 assert.deepEqual(quality.presentRecipeLines(JSON.stringify([{text:'煮熟\n再焖一会'},{instruction:'装盘'}])),['煮熟\n再焖一会','装盘'])
 assert.deepEqual(quality.presentRecipeLines([{internalId:5,image:'https://example.test/internal.jpg'}]),[])
 assert.equal(quality.recipeDurationLabel({cookMinutes:20,quality:{timeStatus:'UNKNOWN'}}),'')
 assert.equal(quality.recipeDurationLabel({cookMinutes:20,recipe:{timing:{totalMinutes:20}}}),'20 分钟')
})

test('zero results do not clear hard constraints', async()=>{
 const calls=[],f=pageFixture({getDishes:async args=>{calls.push(args);return {list:[],total:0}},saveUserPreferences:()=>assert.fail('browse recovery must not save preferences')})
 f.page.recommendationGroups={cuisine:[{code:'C1',label:'菜系一'},{code:'C2',label:'菜系二'}]}
 f.page.data.browseCriteria={cuisineCodes:['C1','C2'],tagCodes:['LIGHT'],methodCodes:[],maxCookMinutes:30,excludedIngredients:['花生']}
 f.page.data.searchKeyword='鸡蛋';f.page.data.selectedIds=[7];f.page._browseScrollTop=312
 await f.page.onRemoveBrowseFilter({currentTarget:{dataset:{key:'cuisineCodes:C1'}}})
 assert.deepEqual(Array.from(f.page.data.browseCriteria.cuisineCodes),['C2']);assert.equal(f.page.data.searchKeyword,'鸡蛋')
 assert.deepEqual(Array.from(f.page.data.selectedIds),[7]);assert.deepEqual(Array.from(f.page.data.browseCriteria.excludedIngredients),['花生'])
 assert.equal(calls[0].keyword,'鸡蛋');assert.equal(calls[0].tagCodes[0],'LIGHT')
 assert.equal(f.page._browseScrollTop,312)
 assert.equal(f.page.data.activeBrowseFilterChips.length,2);assert.equal(f.page.data.browseFilterMoreCount,1)
 await f.page.onClearBrowseFilters();assert.equal(f.page.data.browseCriteria.excludedIngredients[0],'花生')
})

test('clearing search preserves filters and selection; recovery markup offers individual conditions',async()=>{
 const f=pageFixture({getDishes:async()=>({list:[],total:0})})
 f.page.data.searchKeyword='鸡蛋';f.page.data.browseCriteria.tagCodes=['LIGHT'];f.page.data.selectedIds=[7]
 await f.page.onResetRecipeSearch()
 assert.equal(f.page.data.searchKeyword,'');assert.equal(f.page.data.browseCriteria.tagCodes[0],'LIGHT');assert.equal(f.page.data.selectedIds[0],7)
 const source=fs.readFileSync('pages/customize/customize.wxml','utf8')
 assert.match(source,/wx:for="{{activeBrowseFilterChips}}"[^>]*data-key="{{item.key}}"[^>]*bindtap="onRemoveBrowseFilter"/)
 assert.doesNotMatch(source,/清空搜索与筛选/)
 assert.match(source,/selectedTotal \|\| selectionFeedback.state === 'unknown' \|\| selectionBusy/)
 assert.match(source,/bindtap="onViewMeal">查看本餐/)
})

test('late search cannot replace new results',async()=>{
 const pending={},f=pageFixture({getDishes:args=>new Promise(resolve=>pending[args.keyword]=resolve)})
 f.page.data.selectedIds=[7];f.page.onSearchInput({detail:{value:'A'}});[...f.timers.values()].at(-1)()
 f.page.onSearchInput({detail:{value:'B'}});[...f.timers.values()].at(-1)()
 pending.B({list:[{id:7,name:'B'}],total:40});await new Promise(resolve=>setImmediate(resolve))
 f.page.onBrowseScroll({detail:{scrollTop:312}});f.page.onHide();await f.page.onShow()
 pending.A({list:[{id:8,name:'A'}],total:1});await new Promise(resolve=>setImmediate(resolve))
 assert.equal(f.page.data.currentDishes[0].name,'B');assert.equal(f.page.data.currentDishes[0].isSelected,true)
 assert.equal(f.page.data.searchKeyword,'B');assert.equal(f.page.data.browseScrollTop,312);assert.equal(f.page.currentPage,1);assert.equal(f.page.data.hasMore,true)
})
test('failed pagination retains current readable rows and retry requests the same page',async()=>{
 let fail=true;const calls=[],f=pageFixture({getDishes:async args=>{calls.push(args.page);if(args.page===2&&fail)throw Error('offline');return{list:[{id:args.page,name:'菜'+args.page}],total:100}}})
 await f.page.loadPage('meat',1);await f.page.loadPage('meat',2);assert.equal(f.page.data.currentDishes[0].id,1);assert.equal(f.page.data.browseErrorPage,2)
 fail=false;await f.page.onRetryPage();assert.deepEqual(calls,[1,2,2]);assert.equal(f.page.data.currentDishes.length,2)
})
test('API change invalidates the browse cache even when user identity is unchanged',()=>{
 const f=pageFixture();f.page.data.currentDishes=[{id:8,name:'上一环境的菜'}];f.page.data.searchKeyword='旧搜索';f.switchSource()
 assert.equal(f.page.ensureBrowseOwner(),false);assert.equal(f.page.data.currentDishes.length,0);assert.equal(f.page.data.searchKeyword,'')
})
test('detail reads title then image then ingredients notes and steps, while favorites bar is contextual',()=>{
 const detail=fs.readFileSync('pages/dish-detail/dish-detail.wxml','utf8')
 assert.ok(detail.indexOf('class="dish-header"')<detail.indexOf('class="dish-image-container'))
 assert.ok(detail.indexOf('食材与用量')<detail.indexOf('dish.ingredientRows'));assert.ok(detail.indexOf('dish.ingredientRows')<detail.indexOf('dish.cookingNotes'));assert.ok(detail.indexOf('dish.cookingNotes')<detail.indexOf('烹饪步骤'));assert.doesNotMatch(detail,/查看用料来源/)
 assert.doesNotMatch(detail,/所有步骤图片汇总/)
 const fav=fs.readFileSync('pages/favorite-dishes/favorite-dishes.wxml','utf8');assert.match(fav,/wx:if="{{selectedMeal.count \|\| selectionFeedback.state === 'unknown' \|\| selectionBusy}}" class="favorite-selected-summary"/)
})
