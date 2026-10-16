const test=require('node:test'),assert=require('node:assert/strict')
const {createActionHandoffStore,routeForHandoff}=require('../utils/assistant-action-handoff')
function fixture(){let scope='a|api',now=1000;const rows=new Map();const storage={setStorageSync:(k,v)=>rows.set(k,v),getStorageSync:k=>rows.get(k),removeStorageSync:k=>rows.delete(k)};return{store:createActionHandoffStore({storage,scopeKey:()=>scope,now:()=>now}),rows,switch:()=>scope='b|api',expire:()=>now+=600001}}
const copy=()=>({kind:'copy_recipe',ref:{dishId:7},sourceVersion:'v1',prefill:{userText:'少油一点'}})
test('handoffs are scoped, ten-minute, one-use and contain no executable URL',()=>{const f=fixture(),token=f.store.put(copy());assert.ok(token);assert.deepEqual(f.store.take(token),copy());assert.equal(f.store.take(token),null);const expired=f.store.put(copy());f.expire();assert.equal(f.store.take(expired),null);const other=f.store.put(copy());f.switch();assert.equal(f.store.take(other),null)})
test('foreign fields, forged numbers and arbitrary routes are rejected',()=>{const f=fixture();for(const value of [{...copy(),url:'https://evil.test'},{...copy(),kind:'delete_account'},{...copy(),prefill:{grams:5}},{...copy(),ref:{dishId:'7'}},{...copy(),prefill:{userText:'a',people:4}}])assert.equal(f.store.put(value),'');assert.equal(routeForHandoff({kind:'arbitrary',ref:{}}),'')})
test('routes map only to existing confirmation or edit pages',()=>{assert.match(routeForHandoff(copy()),/^\/pages\/custom-dishes\/custom-dishes\?copy=7/);assert.match(routeForHandoff({kind:'record_actual',ref:{},target:{date:'2026-10-15',mealType:'dinner'}}),/^\/pages\/calendar-detail/);assert.match(routeForHandoff({kind:'use_personal_menu',ref:{menuId:2},sourceVersion:'3',target:{date:'2026-10-16',mealType:'lunch'}}),/^\/pages\/customize\/customize/);assert.equal(routeForHandoff({kind:'record_actual',ref:{}}),'')})
test('trusted origin envelope leaves model validation and legacy take shape unchanged',()=>{
 const f=fixture(),origin={kind:'assistant',sessionId:'s',workspaceId:'w',date:'2026-10-15',mealType:'dinner',scopeKey:'forged'}
 const token=f.store.put(copy(),origin);assert.deepEqual(f.store.take(token),copy())
 const received=f.store.takeWithOrigin(f.store.put(copy(),origin));assert.deepEqual(received.payload,copy());assert.equal(received.origin.scopeKey,'a|api');assert.equal(received.origin.sessionId,'s')
 assert.equal(f.store.put({...copy(),origin}),'');assert.equal(f.store.put({...copy(),originToken:'forged'}),'')
 const withoutOrigin=f.store.takeWithOrigin(f.store.put(copy()));assert.deepEqual(withoutOrigin,{payload:copy(),origin:null})
})
