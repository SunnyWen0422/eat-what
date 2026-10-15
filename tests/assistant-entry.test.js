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
test('pending dish entry is offered once after recovery without overwriting input automatically',()=>{
 const vm=require('node:vm'),path=require('node:path');let takes=0,modal,alive=true,scope='A';const module={exports:{}}
 vm.runInNewContext(fs.readFileSync('utils/assistant-page.js','utf8'),{module,wx:{showModal:o=>modal=o},setTimeout,clearTimeout,require:name=>name==='./assistant-entry'?{currentEntryStore:()=>({take:()=>{takes++;return{dishId:7,dishName:'鱼',date:'2026-10-15',mealType:'dinner'}}})}:require(path.resolve('utils',name))})
 const page=module.exports({data:{context:{date:'2026-10-15',mealType:'dinner'}}});let state={sessionId:'session',messages:[],input:'原请求',recoverable:true,busy:false};let sets=0
 Object.assign(page,{_assistantAlive:true,_assistantParams:{entryToken:'once'},_scope:'A',current:()=>alive&&scope==='A',setData(v){Object.assign(this.data,v)},conversation:{state:()=>state,setInput:input=>{state={...state,input};sets++;page.renderConversation(state)}}})
 page.applyAssistantEntry();assert.equal(takes,0)
 state={...state,recoverable:false};page.renderConversation(state);assert.equal(takes,1);assert.equal(sets,0);assert.ok(modal)
 modal.success({confirm:false});assert.equal(state.input,'原请求');page.renderConversation(state);assert.equal(takes,1)
 page._assistantParams.entryToken='next';page.renderConversation(state);scope='B';modal.success({confirm:true});assert.equal(sets,0)
})
test('highlighting a calendar meal does not claim it came from shopping',()=>{
 const source=fs.readFileSync('pages/calendar-detail/calendar-detail.wxml','utf8')
 assert.doesNotMatch(source,/highlightedMeal[^\n]*清单对应餐次/)
})
