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
 assert.equal(quality.recipeDurationLabel({cookMinutes:20,quality:{timeStatus:'ESTIMATED'}}),'预计 20 分钟')
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
test('detail reads title then image then ingredients steps and optional source, while favorites bar is contextual',()=>{
 const detail=fs.readFileSync('pages/dish-detail/dish-detail.wxml','utf8')
 assert.ok(detail.indexOf('class="dish-header"')<detail.indexOf('class="dish-image-container'))
 assert.ok(detail.indexOf('食材与用量')<detail.indexOf('烹饪步骤'));assert.ok(detail.indexOf('烹饪步骤')<detail.indexOf('查看用料来源'))
 assert.doesNotMatch(detail,/所有步骤图片汇总/)
 const fav=fs.readFileSync('pages/favorite-dishes/favorite-dishes.wxml','utf8');assert.match(fav,/wx:if="{{selectedMeal.count \|\| selectionFeedback.state === 'unknown' \|\| selectionBusy}}" class="favorite-selected-summary"/)
})
