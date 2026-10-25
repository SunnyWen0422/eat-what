const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
function favorite(){
 let def,nav=0,adds=0,toasts=[]
 vm.runInNewContext(fs.readFileSync('pages/favorite-dishes/favorite-dishes.js','utf8'),{Page:v=>def=v,console,wx:{navigateTo:()=>nav++,showToast:v=>toasts.push(v)},require:n=>n.includes('font-scale')?Object.assign(()=>1,{base:16}):n.endsWith('/util')?{getUserStorageKey:k=>'A'+k}:n.endsWith('/api')?{getFavoriteDishes:async()=>[{dish:{id:39409,name:'旧菜'},unavailable:true,unavailableReason:'该菜品已退出当前菜库，收藏记录仍保留'},{dish:{id:1,name:'新菜'}}]}:n.endsWith('/dish-workspace-handoff')?{disposeSelectionPage(){},addDishToWorkspace:async()=>adds++}:{}})
 return {page:{...def,data:{...def.data},setData(v){Object.assign(this.data,v)}},counts:()=>({nav,adds,toasts})}
}
test('retired favorite retains unavailable status and cannot open or enter meal',async()=>{
 const f=favorite(),p=f.page;await p.loadFavorites();assert.equal(p.data.filtered[0].unavailable,true)
 p.onViewDish({detail:{id:39409}});await p.onAddToMeal({detail:{id:39409}})
 assert.equal(f.counts().nav,0);assert.equal(f.counts().adds,0);assert.ok(f.counts().toasts.length)
 p.onViewDish({detail:{id:1}});assert.equal(f.counts().nav,1)
})
test('retired favorite remains removable and account-switched click cannot navigate',async()=>{
 const f=favorite(),p=f.page;await p.loadFavorites();p._viewScope='BfavoriteView';p.onViewDish({detail:{id:1}});assert.equal(f.counts().nav,0)
 p._viewScope='AfavoriteView';p.onFavoriteChange({detail:{id:39409,favorite:false}});assert.equal(p.data.favorites.length,1)
})
test('known missing detail does not offer repeated read requests',()=>{
 let def,reads=0;vm.runInNewContext(fs.readFileSync('pages/dish-detail/dish-detail.js','utf8'),{Page:v=>def=v,require:n=>n.includes('font-scale')?Object.assign(()=>1,{base:16}):{},console})
 const p={...def,data:{...def.data,errorKind:'unavailable'},_dishId:39409,_loadAfterLogin:()=>reads++};p.onRetry();assert.equal(reads,0)
 p.data.errorKind='retired';p.onRetry();assert.equal(reads,0)
 p.data.errorKind='network';p.onRetry();assert.equal(reads,1)
})

test('retired detail displays exact message, while missing and forbidden keep distinct states',async()=>{
 for(const [status,kind] of [[410,'retired'],[404,'unavailable'],[403,'permission']]){
  let def;vm.runInNewContext(fs.readFileSync('pages/dish-detail/dish-detail.js','utf8'),{Page:v=>def=v,console:{error(){}},require:n=>n.includes('font-scale')?Object.assign(()=>1,{base:16}):n.endsWith('/util')?{getUserStorageKey:k=>'A'+k}:n.endsWith('/api')?{getDishById:async()=>{throw {statusCode:status}}}:{}})
  const p={...def,data:{...def.data},setData(v){Object.assign(this.data,v)}};await p.loadDishDetail(39409);assert.equal(p.data.errorKind,kind);if(status===410)assert.equal(p.data.detailError,'菜品已下架')
 }
})
