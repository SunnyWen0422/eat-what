const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs')
function fixture(verify=async()=>({})){let app,login,environment='https://test.invalid/api';const storage=new Map(),timers=new Map();const wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),login:opts=>{login=opts}}
const pending={};pending.promise=new Promise(r=>pending.resolve=r)
vm.runInNewContext(fs.readFileSync('app.js','utf8'),{App:x=>app=x,wx,require:n=>n.includes('config')?{ENABLE_LOGIN:true,getApiBaseUrl:()=>environment}:{login:()=>pending.promise,requestSilent:verify},console:{log(){},error(){},warn(){}},setTimeout:f=>{const id=timers.size+1;timers.set(id,f);return id},clearTimeout:i=>timers.delete(i)})
app.precacheDishes=()=>{};return {app,storage,timers,pending,getLogin:()=>login,setEnvironment:v=>environment=v}}
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

test('temporary verification failure preserves the cached login, expired credentials clear both identities',async()=>{
 for(const error of [{isNetworkError:true},{statusCode:500},{statusCode:503},{statusCode:401},{statusCode:403}]) {
  const f=fixture(async()=>{throw error});f.storage.set('token','cached');f.storage.set('userInfo',{id:1});f.app.globalData.userInfo={id:1};f.app.globalData.isLoggedIn=true;
  await f.app._verifyTokenLazy('cached');const expired=[401,403].includes(error.statusCode);
  assert.equal(f.storage.has('token'),!expired);assert.equal(f.storage.has('userInfo'),!expired);assert.equal(f.app.globalData.isLoggedIn,!expired);assert.equal(f.app.globalData.userInfo===null,expired)
 }
})

test('late verification never clears a newer login or environment',async()=>{
 for(const change of ['token','environment','epoch','accountChanged']) {
  let reject;const f=fixture(()=>new Promise((_,r)=>reject=r));f.storage.set('token','cached');f.storage.set('userInfo',{id:1});f.app.globalData.userInfo={id:1};f.app.globalData.isLoggedIn=true;
  const verifying=f.app._verifyTokenLazy('cached');
  if(change==='token')f.storage.set('token','new');if(change==='environment')f.setEnvironment('https://other.invalid/api');if(change==='epoch')f.app._loginEpoch=3;
  reject({statusCode:401,isAccountChanged:change==='accountChanged'});await verifying;
  assert.ok(f.storage.has('token'));assert.equal(f.app.globalData.isLoggedIn,true)
 }
})
