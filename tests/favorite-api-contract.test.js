const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const {createFavoriteStore}=require('../utils/favorite-store')
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function client(){
 const requests=[],wx={getStorageSync:key=>key==='userInfo'?{id:'test-user'}:key==='token'?'test-token':null,showToast(){throw Error('silent favorite API must not show its own toast')},request:value=>requests.push(value)}
 const identity={exports:{}},module={exports:{}}
 vm.runInNewContext(fs.readFileSync('utils/account-identity.js','utf8'),{module:identity,wx})
 vm.runInNewContext(fs.readFileSync('utils/api.js','utf8'),{module,wx,getApp:()=>({globalData:{}}),setTimeout,clearTimeout,console:{log(){},warn(){},error(){}},require:name=>name==='./account-identity'?identity.exports:{getApiBaseUrl:()=>'/isolated-api'}})
 const store=createFavoriteStore({api:module.exports});store.subscribe(7,()=>{})
 const respond=(i,data)=>requests[i].success({statusCode:200,data})
 return {store,requests,respond}
}
test('shared stars use real API serializers and existing backend response shapes',async()=>{
 const f=client(),click=f.store.toggle(7);await tick()
 assert.equal(f.requests[0].url,'/isolated-api/favorite-dishes/batch-check');assert.equal(f.requests[0].method,'POST');assert.deepEqual(Array.from(f.requests[0].data),[7])
 f.respond(0,[7]);await tick();assert.equal(f.requests[1].method,'DELETE');assert.equal(f.requests[1].url,'/isolated-api/favorite-dishes/7')
 f.respond(1,{success:true});await click;assert.equal(f.store.state(7).favorite,false)
 const adding=f.store.toggle(7);await tick();assert.equal(f.requests[2].method,'POST');assert.equal(f.requests[2].data.dishId,7)
 f.respond(2,{success:true});await adding;assert.equal(f.store.state(7).favorite,true)
})
test('an unknown HTTP write is not automatically repeated; the real API checks the saved state',async()=>{
 const f=client(),click=f.store.toggle(7);await tick();f.respond(0,[]);await tick()
 f.requests[1].fail({errMsg:'isolated timeout'});await tick()
 assert.equal(f.requests.length,3);assert.equal(f.requests[2].url,'/isolated-api/favorite-dishes/check?dishId=7');assert.equal(f.requests[2].method,'GET')
 f.respond(2,{isFavorite:true});await click;assert.equal(f.store.state(7).favorite,true)
 assert.equal(f.requests.filter(x=>x.url==='/isolated-api/favorite-dishes'&&x.method==='POST').length,1)
})
