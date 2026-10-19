const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
function card(){let definition;vm.runInNewContext(fs.readFileSync('components/dish-card/dish-card.js','utf8'),{Component:d=>definition=d,require:require('node:module').createRequire(require('node:path').resolve('components/dish-card/dish-card.js'))});const events=[];const page={data:{dish:{id:7,name:'青菜'},mode:'select',selected:false,disabled:false},properties:{mode:'select',disabled:false},triggerEvent:(name,detail)=>events.push({name,id:detail.dish.id})};return{definition,page,events}}
test('dish selection emits only the select action while opening emits only detail',()=>{
 const f=card();f.definition.methods.choose.call(f.page);assert.deepEqual(f.events,[{name:'select',id:7}]);f.events.length=0;f.definition.methods.open.call(f.page);assert.deepEqual(f.events,[{name:'open',id:7}])
})
test('browse mode and disabled selection never change the selected dishes',()=>{
 const f=card();f.page.data.mode='browse';f.definition.methods.choose.call(f.page);f.page.data.mode='select';f.page.data.disabled=true;f.definition.methods.choose.call(f.page);assert.deepEqual(f.events,[])
})

test('reading entry precedes long recipe body',()=>{
 const markup=fs.readFileSync('pages/dish-detail/dish-detail.wxml','utf8')
 assert.ok(markup.indexOf('bindtap="onOpenCooking"')<markup.indexOf('class="steps-list"'))
 assert.equal((markup.match(/bindtap="onOpenCooking"/g)||[]).length,1)
})
function favorites(){
 let definition;const menus=[],modals=[],writes=[]
 const wx={showActionSheet:v=>menus.push(v),showModal:v=>modals.push(v),showToast(){}}
 vm.runInNewContext(fs.readFileSync('pages/favorite-dishes/favorite-dishes.js','utf8'),{Page:v=>definition=v,wx,require:name=>name.endsWith('/api')?{removeFavoriteDish:async id=>writes.push(id)}:name.endsWith('/util')?{getUserStorageKey:key=>'A:'+key}:Object.assign(()=>1,{base:16})})
 const page={...definition,data:{...definition.data},_viewScope:'A:favoriteView',_epoch:1,setData:v=>Object.assign(page.data,v),loadFavorites(){},onAddToMeal(){throw Error('menu must never select')}}
 return {page,menus,modals,writes}
}
test('confirmed star removal updates favorites without opening a menu or selecting a meal',()=>{
 const f=favorites();f.page.data.favorites=[{id:7,name:'青菜'},{id:8,name:'鸡蛋'}]
 f.page.onFavoriteChange({detail:{id:7,favorite:false}})
 assert.deepEqual(f.page.data.favorites.map(x=>x.id),[8]);assert.equal(f.menus.length,0);assert.equal(f.modals.length,0);assert.equal(f.writes.length,0)
 f.page.onFavoriteChange({detail:{id:8,favorite:true}});assert.equal(f.page.data.favorites.length,1)
})
test('favorite changes from a closed page or different owner do not remove visible rows',()=>{
 const f=favorites();f.page.data.favorites=[{id:7,name:'青菜'}];f.page._viewScope='B:favoriteView'
 f.page.onFavoriteChange({detail:{id:7,favorite:false}});assert.equal(f.page.data.favorites.length,1)
 f.page._viewScope='A:favoriteView';f.page._unloaded=true;f.page.onFavoriteChange({detail:{id:7,favorite:false}});assert.equal(f.page.data.favorites.length,1)
})
test('personal editor presents one current save state above its fields',()=>{
 const markup=fs.readFileSync('pages/custom-dishes/custom-dishes.wxml','utf8')
 // E18 removed the duplicate subtitle; the current save state remains above fields.
 assert.doesNotMatch(markup,/class="ew-subtitle"/)
 assert.match(markup,/class="ew-notice personal-edit-status"[^>]*>{{editPending \?/)
 assert.ok(markup.indexOf('personal-edit-status')<markup.indexOf('id="edit-name"'))
 assert.match(markup,/wx:if="{{formError && !editPending}}"/)
})
