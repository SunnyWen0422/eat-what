const test=require('node:test'),assert=require('node:assert/strict')
const {buildAssistantWaitingPresentation:waiting,buildAssistantFailurePresentation:failure}=require('../utils/assistant-presentation')
const clone=value=>JSON.parse(JSON.stringify(value))
const sent=text=>({busy:true,messages:[{id:'user-1',role:'user',text}],input:'尚未发送的新内容'})

test('waiting copy follows the sent request only and never changes intent or input',()=>{
 const cases=[
  ['按当前人数和要求安排这餐','recommendation'],
  ['推荐一份清淡的菜单','recommendation'],
  ['把这道菜换成别的','replacement'],
  ['看看我已有的用餐安排','arrangements'],
  ['看看我今天实际吃得是否均衡，有什么可以调整的？','health'],
  ['今天还需要买什么食材','shopping'],
  ['这个问题再讲清楚一些','general'],
 ]
 for(const [text,kind] of cases){
  const state=sent(text),before=clone(state),view=waiting({state})
  assert.equal(view.kind,kind)
  assert.equal(view.visible,true);assert.equal(view.animated,true)
  assert.ok(view.captions.length>=2);assert.equal(view.label,view.captions[0])
  assert.equal(view.requestKey,'user-1');assert.deepEqual(state,before)
  assert.doesNotMatch(view.captions.join(' '),/已完成|已查询|已保存|已找到|正在调用|%|即将完成/)
 }
})

test('caption frames rotate without claiming real phases or accepting arbitrary provider stage text',()=>{
 const state={...sent('推荐这一餐'),turn:{turnId:'turn-1',status:'running',stage:'已完成数据库读取'}}
 const first=waiting({state}),next=waiting({state,frame:1})
 assert.notEqual(first.label,next.label)
 assert.equal(waiting({state,frame:first.captions.length}).label,first.label)
 for(const frame of [-1,Infinity,NaN,'unknown'])assert.equal(waiting({state,frame}).label,first.label)
 assert.doesNotMatch(first.captions.join(' '),/数据库|阶段|进度|已完成/)
 assert.equal(waiting({state:{...state,input:'我今天吃得健康吗'}}).kind,'recommendation')
})

test('server queued and direct action states use honest non-generating copy',()=>{
 const queued=waiting({state:{...sent('推荐这一餐'),turn:{turnId:'turn-1',status:'queued'}}})
 assert.equal(queued.kind,'queued');assert.match(queued.label,/排队/);assert.equal(queued.captions.length,1)
 const action=waiting({state:{...sent('保存到日历'),turn:{turnId:'turn-1',status:'awaiting_confirmation',cards:[{data:{executionMode:'direct'}}]}}})
 assert.equal(action.kind,'action');assert.match(action.label,/办理/);assert.doesNotMatch(action.label,/生成|已保存/)
 const confirmation=waiting({state:{...sent('保存到日历'),confirmationPending:true,turn:{turnId:'turn-1',status:'awaiting_confirmation'}}})
 assert.equal(confirmation.kind,'recovery');assert.doesNotMatch(confirmation.label,/生成|推荐/)
})

test('stop, unknown, preview and terminal outcomes never retain generating animation',()=>{
 const base={...sent('推荐这一餐'),turn:{turnId:'turn-1',status:'running'}}
 const cancelling=waiting({state:{...base,cancelling:true}})
 assert.equal(cancelling.kind,'cancelling');assert.equal(cancelling.animated,false);assert.match(cancelling.label,/停止/)
 const unknown=waiting({state:{...base,busy:false,recoverable:true,error:'结果暂未核对，原请求已保留，请稍后恢复'}})
 assert.equal(unknown.kind,'recovery');assert.equal(unknown.animated,false);assert.match(unknown.label,/没有收到结果/)
 for(const status of ['failed','cancelled','completed','partially_completed','needs_input','awaiting_confirmation']){
  const view=waiting({state:{...base,turn:{turnId:'turn-1',status},messages:[...base.messages,{id:'turn-1',role:'assistant',turnId:'turn-1',text:'结果'}]}})
  assert.equal(view.visible,false,status);assert.equal(view.animated,false,status)
 }
 assert.equal(waiting({state:{busy:false,messages:[]}}).visible,false)
})

test('new send after a terminal turn shows current waiting copy instead of old terminal status',()=>{
 const state={busy:true,turn:{turnId:'old-turn',status:'failed'},messages:[
  {id:'old-user',role:'user',text:'推荐菜单'},
  {id:'old-turn',role:'assistant',turnId:'old-turn',text:'本次处理未完成'},
  {id:'new-user',role:'user',text:'看看我已有的用餐安排'},
 ]}
 const view=waiting({state})
 assert.equal(view.kind,'arrangements');assert.equal(view.visible,true);assert.equal(view.requestKey,'new-user')
})

const failureReply='本次处理未完成，请重新发送；已有内容仍保留'
const failureError='这次未完成，输入已保留，可以调整后再发'
function failedState(){return {busy:false,recoverable:false,input:'按当前人数安排这餐',error:failureError,turn:{turnId:'turn-1',status:'failed',reply:failureReply,retryable:true,cards:[]},messages:[{id:'user-1',role:'user',text:'按当前人数安排这餐'},{id:'turn-1',turnId:'turn-1',role:'assistant',text:failureReply,cards:[]}]}}
test('current generic failure is presented once while keeping history and input intact',()=>{
 const state=failedState(),before=clone(state),view=failure({state})
 assert.deepEqual(view.suppressMessageIds,['turn-1'])
 assert.equal(view.error,'已保留本次输入')
 assert.deepEqual(state,before)
 assert.equal(failure({state:{...state,input:''}}).error,'这次未完成，可以重新发送')
})

test('failure presentation preserves receipts, continuation, specific errors and historical replies',()=>{
 const state=failedState()
 const variants=[
  {...state,busy:true},
  {...state,recoverable:true},
  {...state,confirmationPending:true},
  {...state,error:'保存结果未知，需核对原请求'},
  {...state,turn:{...state.turn,status:'partially_completed'}},
  {...state,turn:{...state.turn,retryable:false}},
  {...state,turn:{...state.turn,cards:[{receiptRef:'receipt-1'}]}},
  {...state,turn:{...state.turn,continuation:{steps:[{kind:'calendar_save',status:'failed'}]}}},
  {...state,messages:[state.messages[0],{...state.messages[1],cards:[{receiptRef:'receipt-1'}]}]},
  {...state,messages:[state.messages[0],{...state.messages[1],workflow:[{label:'保存计划 · 已完成'}]}]},
  {...state,messages:[state.messages[0],{...state.messages[1],text:'食材来源已变化，请核对来源'}]},
  {...state,messages:[...state.messages,{id:'new-user',role:'user',text:'另一个问题'}]},
 ]
 for(const variant of variants){
  const view=failure({state:variant})
  assert.deepEqual(view.suppressMessageIds,[])
  assert.equal(view.error,variant.error)
 }
 const history={...state,messages:[{...state.messages[1],id:'older-turn',turnId:'older-turn'},...state.messages]}
 assert.deepEqual(failure({state:history}).suppressMessageIds,['turn-1'])
})

test('assistant recovery notices explain user outcomes without exposing request mechanics',()=>{
 const {assistantNotice}=require('../utils/assistant-presentation')
 const messages=['结果暂未核对，原请求已保留，请稍后恢复','刚才的保存结果还待核对，请先恢复原请求','补充内容已保留，请核对原请求后继续']
 for(const text of messages){const display=assistantNotice(text);assert.doesNotMatch(display,/原请求|恢复原/);assert.match(display,/结果|保存|查看/)}
 assert.equal(assistantNotice('本餐已变化，请查看最新菜单'),'本餐已变化，请查看最新菜单')
})
