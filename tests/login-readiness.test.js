const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs')
function fixture(){let app,login;const storage=new Map(),timers=new Map();const wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),login:opts=>{login=opts}}
const pending={};pending.promise=new Promise(r=>pending.resolve=r)
vm.runInNewContext(fs.readFileSync('app.js','utf8'),{App:x=>app=x,wx,require:n=>n.includes('config')?{ENABLE_LOGIN:true,getApiBaseUrl:()=> 'https://test.invalid/api'}:{login:()=>pending.promise,requestSilent:async()=>({})},console:{log(){},error(){},warn(){}},setTimeout:f=>{const id=timers.size+1;timers.set(id,f);return id},clearTimeout:i=>timers.delete(i)})
app.precacheDishes=()=>{};return {app,storage,timers,pending,getLogin:()=>login}}
test('login returns one awaitable outcome and concurrent clicks share the operation',async()=>{
 const f=fixture(),first=f.app.doLogin(),second=f.app.doLogin();assert.ok(first&&typeof first.then==='function');assert.equal(first,second)
 let settled=false;first.then(()=>settled=true);f.getLogin().success({code:'c'});await Promise.resolve();assert.equal(settled,false)
 f.pending.resolve({success:true,token:'t',user:{id:1}});const result=await first;assert.equal(result.success,true);assert.equal(f.app.globalData.isLoggedIn,true)
})
test('timeout resolves failure and late login cannot silently change identity',async()=>{
 const f=fixture(),promise=f.app.doLogin();assert.ok(promise&&typeof promise.then==='function');f.getLogin().success({code:'c'});[...f.timers.values()][0]()
 const result=await promise;assert.equal(result.success,false);f.pending.resolve({success:true,token:'late',user:{id:1}});await Promise.resolve();await Promise.resolve();assert.equal(f.storage.get('token'),undefined)
})
test('platform rejection stays visible as a failed result',async()=>{
 const f=fixture(),promise=f.app.doLogin();assert.ok(promise&&typeof promise.then==='function');f.getLogin().fail({});assert.equal((await promise).success,false);assert.equal(f.app.globalData.isLoggedIn,false)
})
