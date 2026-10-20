const test=require('node:test'),assert=require('node:assert/strict')
const assistantPage=require('../utils/assistant-page')
function fixture(){
 let state={busy:true,canSteer:true,messages:[{id:'request-1',role:'user',text:'推荐这一餐'}]},valid=true,id=0
 const timers=new Map(),page=assistantPage({data:{}},{waitingTimers:{setTimeout(fn,ms){assert.equal(ms,4800);timers.set(++id,fn);return id},clearTimeout(id){timers.delete(id)}}})
 page._assistantAlive=true;page._assistantVisible=true;page._scope='owner'
 page.current=()=>valid;page.setData=(patch,cb)=>{Object.assign(page.data,patch);if(cb)cb()}
 page.conversation={state:()=>state,dispose(){}}
 return {page,timers,state:()=>state,setState:next=>state=next,invalidate:()=>valid=false,tick(){const [id,fn]=timers.entries().next().value;timers.delete(id);fn()}}
}
test('poll refreshes retain one caption timer and rotate only display text',()=>{
 const f=fixture(),before=JSON.stringify(f.state());f.page.updateConversationWaiting(f.state())
 const first=f.page.data.conversationWaiting.label
 for(let i=0;i<5;i++)f.page.updateConversationWaiting(f.state())
 assert.equal(f.timers.size,1);f.tick()
 assert.notEqual(f.page.data.conversationWaiting.label,first);assert.equal(f.timers.size,1)
 assert.equal(JSON.stringify(f.state()),before);f.page.onUnload();assert.equal(f.timers.size,0)
})
test('terminal, stop and unknown result states cancel rotating model copy',()=>{
 for(const extra of [{busy:false,turn:{status:'completed'}},{busy:true,cancelling:true},{busy:false,recoverable:true}]){
  const f=fixture();f.page.updateConversationWaiting(f.state());assert.equal(f.timers.size,1)
  f.setState({...f.state(),...extra});f.page.updateConversationWaiting(f.state())
  assert.equal(f.timers.size,0);assert.equal(f.page.data.conversationWaiting.animated,false)
  f.page.onUnload()
 }
})
test('hidden, unloaded or stale owners cannot rotate the active screen',()=>{
 for(const action of ['hide','unload','account','conversation']){
  const f=fixture();f.page.updateConversationWaiting(f.state())
  const queued=[...f.timers.values()][0],before=JSON.stringify(f.page.data.conversationWaiting)
  if(action==='hide')f.page.onHide()
  if(action==='unload')f.page.onUnload()
  if(action==='account')f.invalidate()
  if(action==='conversation')f.page.conversation={state:()=>f.state(),dispose(){}}
  queued();assert.equal(JSON.stringify(f.page.data.conversationWaiting),before)
  f.page.onUnload()
 }
})
test('reduced motion keeps readable static copy without a caption timer',()=>{
 const f=fixture();f.page.data.conversationReducedMotion=true
 f.page.updateConversationWaiting(f.state());assert.equal(f.timers.size,0)
 assert.equal(f.page.data.conversationWaiting.visible,true)
 f.page.data.conversationReducedMotion=false;f.page.updateConversationWaiting(f.state());assert.equal(f.timers.size,1)
 f.page.data.conversationReducedMotion=true;f.page.updateConversationWaiting(f.state());assert.equal(f.timers.size,0)
 f.page.onUnload()
})
test('a new sent request resets the caption even in the same conversation',()=>{
 const f=fixture();f.page.updateConversationWaiting(f.state());f.tick()
 f.setState({...f.state(),messages:[...f.state().messages,{id:'request-2',role:'user',text:'今天吃得健康吗'}]})
 f.page.updateConversationWaiting(f.state())
 assert.equal(f.page.data.conversationWaiting.kind,'health')
 assert.equal(f.page.data.conversationWaiting.label,f.page.data.conversationWaiting.captions[0])
 assert.equal(f.timers.size,1);f.page.onUnload()
})
test('page render removes only the current duplicate failure presentation and keeps persisted history',()=>{
 const f=fixture(),reply='本次处理未完成，请重新发送；已有内容仍保留'
 const state={busy:false,input:'推荐这一餐',error:'这次未完成，输入已保留，可以调整后再发',messages:[{id:'old',role:'assistant',text:reply},{id:'u',role:'user',text:'推荐这一餐'},{id:'failed',turnId:'failed',role:'assistant',text:reply}],turn:{turnId:'failed',status:'failed',retryable:true,reply,cards:[]}}
 const before=JSON.stringify(state);f.page.refreshConversationMenus=()=>{}
 f.page.renderConversation(state)
 assert.deepEqual(f.page.data.conversationMessages.map(m=>m.id),['old','u'])
 assert.equal(f.page.data.conversationError,'已保留本次输入')
 assert.equal(f.page.data.conversationWaiting.visible,false)
 assert.equal(JSON.stringify(state),before);f.page.onUnload()
})
test('open meal editor prevents sending a chat with unapplied settings',()=>{
 const f=fixture();let sent=0;f.page.conversation.send=()=>sent++;f.page.workspaceBlocksConversation=()=>false
 f.page.data.conversationMealSettingsVisible=true;f.page.data.conversationInput='推荐'
 f.page.onConversationSend();assert.equal(sent,0)
 f.page.data.conversationMealSettingsVisible=false;f.page.onConversationSend();assert.equal(sent,1)
 f.page.onUnload()
})
