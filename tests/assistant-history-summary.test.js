const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const load=(api={},wxOverrides={})=>{let page;vm.runInNewContext(fs.readFileSync('pages/assistant-history/assistant-history.js','utf8'),{Page:v=>page=v,console,wx:{showModal:({success})=>success({confirm:true}),navigateTo(){},switchTab(){},...wxOverrides},require:n=>n.endsWith('/api')?api:n.endsWith('/util')?{getUserStorageKey:k=>'A:'+k}:require(path.resolve('pages/assistant-history',n))});return page}
test('same-meal history is recognizable by question while pending outcome is not completed',()=>{
 const present=require('../utils/assistant-history').presentHistorySession
 const rows=['换一道素菜','明晚保存什么','准备采购'].map(title=>present({title,target:{date:'2026-10-17',mealType:'dinner'},updatedAt:1,lastStatus:'awaiting_confirmation',hasPending:true,preview:'已保存'}))
 assert.equal(new Set(rows.map(r=>r.label)).size,3);assert.match(rows[0].preview,/确认/);assert.doesNotMatch(rows[0].preview,/已保存/)
})
test('legacy summary remains readable and partial work is explicit',()=>{
 const present=require('../utils/assistant-history').presentHistorySession
 assert.match(present({target:{date:'2026-10-17',mealType:'dinner'},updatedAt:1}).label,/晚餐/)
 assert.match(present({lastStatus:'partially_completed',updatedAt:1}).statusLabel,/部分/)
})
test('history provides explicit delete handler without changing any meal',()=>{assert.equal(typeof load().onDeleteV4,'function')})

test('explicit conversation deletion calls only original session endpoint and removes its row',async()=>{
 let deleted=[];const page=load({getAssistantV4Session:async id=>({sessionId:id,latestTurn:{status:'completed'}}),deleteAssistantV4Session:async id=>deleted.push(id)})
 page.onLoad();page._scope='A:assistantHistory';page._epoch=1;page.setData=value=>Object.assign(page.data,value);page.data.v4Sessions=[{sessionId:'original',hasPending:false}]
 await page.onDeleteV4({currentTarget:{dataset:{id:'original'}}});assert.deepEqual(deleted,['original']);assert.equal(page.data.v4Sessions.length,0)
})
test('pending conversations cannot be deleted before result review',async()=>{
 let deleted=0;const page=load({deleteAssistantV4Session:async()=>deleted++});page.data.v4Sessions=[{sessionId:'pending',hasPending:true}]
 await page.onDeleteV4({currentTarget:{dataset:{id:'pending'}}});assert.equal(deleted,0)
})

test('an operation started after opening history blocks deletion on fresh reread',async()=>{
 let deleted=0;const page=load({getAssistantV4Session:async id=>({sessionId:id,latestTurn:{status:'awaiting_confirmation'}}),deleteAssistantV4Session:async()=>deleted++})
 page.onLoad();page._scope='A:assistantHistory';page._epoch=1;page.setData=value=>Object.assign(page.data,value);page.data.v4Sessions=[{sessionId:'original',hasPending:false}]
 await page.onDeleteV4({currentTarget:{dataset:{id:'original'}}});assert.equal(deleted,0);assert.match(page.data.errorMessage,/核对/)
})

test('repeated row taps do not invalidate the request that owns the loading state',async()=>{
 let resolveRead,reads=0;const navigation=[];const page=load({getAssistantV4Session:()=>{reads++;return new Promise(resolve=>resolveRead=resolve)}},{getStorageSync:()=>[],setStorageSync(){},navigateTo:value=>navigation.push(value.url)})
 page.onLoad();page._scope='A:assistantHistory';page._epoch=1;page.setData=value=>Object.assign(page.data,value)
 page.data.v4Sessions=[{sessionId:'original',workspaceRef:{workspaceId:'w'},target:{date:'2026-10-17',mealType:'dinner'}}]
 const event={currentTarget:{dataset:{id:'original'}}},pending=page.onEnterV4(event)
 await page.onEnterV4(event)
 resolveRead({sessionId:'original',workspaceRef:{workspaceId:'w'},target:{date:'2026-10-17',mealType:'dinner'}})
 await pending;assert.equal(reads,1);assert.equal(page.data.loading,false);assert.equal(navigation.length,1);assert.match(navigation[0],/sessionId=original.*date=2026-10-17/);assert.equal(page.data.errorMessage,'')
})
