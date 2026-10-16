const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
function fixture(api){let page,scope='A';const navigation=[],memory=new Map();const wx={getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,v),navigateTo:v=>navigation.push(v.url),switchTab:()=>{}};vm.runInNewContext(fs.readFileSync('pages/assistant-history/assistant-history.js','utf8'),{Page:v=>page=v,wx,console,require:n=>n.endsWith('/api')?api:n.endsWith('/util')?{getUserStorageKey:k=>scope+':'+k}:require(path.resolve('pages/assistant-history',n))});page.setData=v=>Object.assign(page.data,v);page.onLoad();return{page,navigation,memory,switch:()=>scope='B'}}
test('new history is primary and browsing a saved conversation performs no business write',async()=>{
 let reads=0;const f=fixture({getAssistantV4Sessions:async()=>({sessions:[{sessionId:'s',workspaceRef:{workspaceId:'w'},target:{date:'2026-10-15',mealType:'dinner'},updatedAt:1000,lastStatus:'needs_input'}]}),getAssistantV4Session:async()=>{reads++;return{sessionId:'s',workspaceRef:{workspaceId:'w'},target:{date:'2026-10-15',mealType:'dinner'},messages:[{id:'m',role:'user',text:'查菜'}]}}});
 await f.page.onShow();assert.equal(f.page.data.v4Sessions.length,1);await f.page.onOpenV4Session({currentTarget:{dataset:{id:'s'}}});assert.equal(reads,1);assert.equal(f.navigation.length,0);assert.equal(f.memory.size,0);assert.equal(f.page.data.v4Messages[0].text,'查菜')
})
test('continue rereads original workspace and navigating cannot save or import a meal',async()=>{
 const session={sessionId:'s',workspaceRef:{workspaceId:'w'},target:{date:'2026-10-12',mealType:'lunch'},messages:[]};const f=fixture({getAssistantV4Sessions:async()=>({sessions:[session]}),getAssistantV4Session:async()=>session});
 await f.page.onShow();await f.page.onContinueV4({currentTarget:{dataset:{id:'s'}}});assert.match(f.navigation[0],/sessionId=s/);assert.match(f.navigation[0],/workspaceId=w/);assert.match(f.navigation[0],/date=2026-10-12/)
 assert.match(f.navigation[0],/originToken=/);assert.equal(f.memory.size,1)
 const [key,records]=[...f.memory][0];assert.match(key,/assistantOrigins:sourceTokens$/);assert.equal(records[0].origin.kind,'history');assert.equal(records[0].payload,undefined)
})
test('late V4 history is ignored after account switch',async()=>{let resolve;const f=fixture({getAssistantV4Sessions:()=>new Promise(r=>resolve=r)});const task=f.page.onShow();f.switch();resolve({sessions:[{sessionId:'private'}]});await task;assert.equal(f.page.data.v4Sessions.length,0)})
const {createAssistantConversation}=require('../utils/assistant-conversation')
function conversationFixture(){
 const memory=new Map(),posted=[];let creates=0,fail=true
 const api={createAssistantV4Session:async()=>{creates++;return{sessionId:'s1',messages:[]}},getAssistantV4Session:async id=>({sessionId:id,workspaceRef:{workspaceId:'w'},messages:[],latestTurn:{turnId:'old-turn',status:'awaiting_confirmation',cards:[{id:'r',type:'receipt',receiptRef:'real'}]}}),sendAssistantV4Turn:async(id,body)=>{posted.push({id,body});if(fail)throw Error('lost');return{turnId:'old-turn'}},getAssistantV4Turn:async()=>({turnId:'old-turn',status:'completed',cards:[]})}
 const store={state:()=>({workspace:{id:'w',revision:1,draft:{planVersion:2}}})}
 const options={api,workspaceStore:store,identity:()=> 'account',source:()=> 'loopback',read:k=>memory.get(k),write:(k,v)=>memory.set(k,v)}
 return{api,memory,posted,creates:()=>creates,ready:()=>{fail=false},make:()=>createAssistantConversation(options)}
}
test('continuing the same history retains the unknown original request and exact UUID',async()=>{
 const f=conversationFixture(),first=f.make();await first.load();await first.send('保存到周五');f.ready()
 const resumed=f.make();await resumed.load({workspaceId:'w',sessionId:'s1'});await resumed.recover()
 assert.equal(f.creates(),1);assert.equal(f.posted.length,2);assert.deepEqual(f.posted[0],f.posted[1])
})
test('another history binding cannot overwrite a pending conversation',async()=>{
 const f=conversationFixture(),first=f.make();await first.load();await first.send('待核对');const original=JSON.parse(JSON.stringify([...f.memory.values()][0]))
 const other=f.make();await other.load({workspaceId:'w',sessionId:'s2'})
 assert.deepEqual([...f.memory.values()][0],original);assert.equal(other.state().sessionId,'s2');assert.equal(other.state().turn.status,'awaiting_confirmation');assert.equal(f.posted.length,1)
})
test('missing or mismatched historical workspace never creates a replacement session',async()=>{
 const f=conversationFixture(),c=f.make();await c.load({workspaceId:'other',sessionId:'s1'});assert.equal(f.creates(),0);assert.equal(f.memory.size,0)
 f.api.getAssistantV4Session=async()=>{throw{statusCode:404}};await c.load({workspaceId:'w',sessionId:'deleted'});assert.equal(f.creates(),0)
})

test('history rendering cannot execute or overfetch',async()=>{
 const events=[],latest={turnId:'latest',status:'partially_completed',continuation:{steps:[{kind:'calendar_save',status:'completed',receiptRef:'real-save'},{kind:'shopping_preview',status:'failed'}]}}
 const messages=Array.from({length:35},(_,i)=>({id:String(i),turnId:i===34?'latest':String(i),role:'assistant',text:'记录',cards:[{id:'receipt-'+i,type:'receipt',receiptRef:'real-'+i}]}))
 const f=fixture({getAssistantV4Sessions:async()=>{events.push('sessions');return{sessions:[{sessionId:'s'}]}},getAssistantV4Session:async()=>{events.push('session');return{sessionId:'s',messages,latestTurn:latest}},getAssistantV4Turn:async()=>events.push('recover'),sendAssistantV4Turn:async()=>events.push('send'),confirmControlledTask:async()=>events.push('confirm'),resumeAssistantV4Turn:async()=>events.push('resume')})
 await f.page.onShow();await f.page.onOpenV4Session({currentTarget:{dataset:{id:'s'}}});assert.deepEqual(events,['sessions','session']);assert.equal(f.page.data.v4Messages.length,35);assert.equal(f.page.data.v4Messages[34].workflow[0].receiptRef,'real-save');assert.equal(f.page.data.v4Messages[34].workflow[1].status,'unfinished');assert.equal(f.page.data.v4Messages[0].workflow.length,0);assert.equal(f.navigation.length,0)
})
