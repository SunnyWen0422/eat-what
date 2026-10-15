const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs')
const factory=fs.existsSync('utils/assistant-entry.js')?require('../utils/assistant-entry').createAssistantEntryStore:null
test('dish entry is scoped, single use, validated and expires after ten minutes',()=>{
 assert.equal(typeof factory,'function')
 const memory=new Map();let scope='api:A',now=1000
 const store=factory({storage:{getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,v),removeStorageSync:k=>memory.delete(k)},scopeKey:()=>scope,now:()=>now})
 const entry={dishId:7,dishName:'鱼',date:'2026-10-15',mealType:'dinner'}
 const token=store.put(entry);scope='api:B';assert.equal(store.take(token),null);scope='other:A';assert.equal(store.take(token),null);scope='api:A'
 assert.deepEqual(store.take(token),entry);assert.equal(store.take(token),null)
 const expired=store.put(entry);now+=600001;assert.equal(store.take(expired),null)
 assert.equal(store.put({...entry,dishId:0}),'');assert.equal(store.put({...entry,date:'2026-02-30'}),'')
 const old=store.put(entry),fresh=store.put({...entry,dishId:8});assert.equal(store.take(old),null);assert.equal(store.take(fresh).dishId,8)
})
