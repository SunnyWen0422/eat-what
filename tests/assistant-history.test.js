const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
function fixture(api){let page,scope='A';const memory=new Map(),navigation=[];
 const wx={getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,v),navigateTo:v=>navigation.push(v.url)}
 const ctx={wx,console,Page:v=>page=v,require:n=>n.endsWith('/api')?api:n.endsWith('/util')?{getUserStorageKey:k=>scope+':'+k}:require(path.resolve('pages/assistant-history',n))}
 vm.runInNewContext(fs.readFileSync('pages/assistant-history/assistant-history.js','utf8'),ctx);page.setData=v=>Object.assign(page.data,v);page.onLoad({date:'2026-10-06',mealType:'dinner'});return {page,wx,memory,navigation,switch:()=>scope='B'} }
test('late history list cannot appear after an account switch',async()=>{
 let finish;const f=fixture({getAssistantSessions:()=>new Promise(r=>finish=r)});const pending=f.page.onShow();f.switch();finish({sessions:[{sessionId:'A-history'}]});await pending;assert.equal(f.page.data.sessions.length,0)
})
test('history is read-only and importing rereads the recipe version',async()=>{
 const meal={date:'2026-10-06',meal_type:'dinner',dishes:[{id:7,name:'青菜'}]};let version=1;
 const f=fixture({getAssistantSessions:async()=>({sessions:[{sessionId:'s'}]}),getAssistantSession:async()=>({session_id:'s',state:{plan:{version,period:{people:2},meals:[meal]}},messages:[{role:'user',content:'旧要求'}]})});await f.page.onShow();await f.page.onOpenSession({currentTarget:{dataset:{id:'s'}}});assert.equal(f.memory.size,0);version=2;await f.page.onImportMeal({currentTarget:{dataset:{index:0}}});assert.equal(f.navigation.length,0);assert.match(f.page.data.errorMessage,/更新/);assert.equal(f.memory.size,0)
})
