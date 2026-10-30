const test=require('node:test'),assert=require('node:assert/strict')
test('undeclared WeChat plugin stays unavailable without a backend session request',()=>{
 const {getWechatVoiceCapability}=require('../utils/wechat-speech')
 let loads=0
 assert.equal(getWechatVoiceCapability({manifest:{},loadPlugin:()=>{loads++;throw Error('must not load')}}).enabled,false)
 assert.equal(loads,0)
})

async function pageFixture(t){
 const {fixture,target}=require('./fixtures/workspace-flow'),f=fixture(),transports=[]
 Object.assign(f.wx,{getRecorderManager:()=>({}),connectSocket(){},authorize:({success})=>success(),getPrivacySetting:({success})=>success({needAuthorization:false}),showToast(){}})
 class Transport{
  constructor(options){this.options=options;transports.push(this)}
  async start(){assert.equal(this.options.getTicket,undefined);this.options.onPhase('recording')}
  stop(){this.options.onComplete('少油')}
  cancel(){this.cancelled=true}
 }
 const page=require('../utils/assistant-page')(f.createPage('assistant'),{api:{...f.api,createVoiceSession:async()=>{throw Error('WeChat voice must not request a cloud ticket')}},platform:f.wx,VoiceTransport:Transport,voiceCapability:{enabled:true,maxDurationMs:30000,maxTextLength:2000}})
 page.setData=(value,done)=>{Object.assign(page.data,value);if(done)done()}
 page._assistantAlive=true;page._assistantVisible=true;page._alive=true
 await page.initializeWorkspace(target)
 const state={sessionId:'voice-session',input:'今晚',messages:[],turn:null,busy:false,recoverable:false}
 let sent=0
 page.conversation={state:()=>state,setInput:text=>{state.input=text;page.renderConversation(state)},send:()=>{sent++},dispose(){}}
 page.data.assistantConnected=true;page.renderConversation(state)
 t.after(()=>page.onUnload())
 return {...f,page,state,transports,sent:()=>sent}
}
test('real page composer receives transcription, blocks sending while recording and requires explicit send',async t=>{
 const f=await pageFixture(t)
 assert.equal(f.page.data.conversationVoice.enabled,true)
 await f.page.onConversationVoice()
 assert.equal(f.page.data.conversationVoice.phase,'recording')
 f.page.onConversationSend();assert.equal(f.sent(),0)
 f.transports[0].options.onText('少');assert.equal(f.state.input,'今晚 少')
 await f.page.onConversationVoice()
 assert.equal(f.state.input,'今晚 少油');assert.equal(f.page.data.conversationVoice.inputLocked,false)
 assert.equal(f.sent(),0);f.page.onConversationSend();assert.equal(f.sent(),1)
})
test('hiding page restores original input and never recreates a voice controller through render reentrancy',async t=>{
 const f=await pageFixture(t);await f.page.onConversationVoice();f.transports[0].options.onText('少油')
 f.page.onHide()
 assert.equal(f.state.input,'今晚');assert.equal(f.page._conversationVoice,null)
 f.transports[0].options.onComplete('迟到的结果')
 assert.equal(f.state.input,'今晚');assert.equal(f.sent(),0)
})
test('account switch rejects late transcription without writing old text to another account',async t=>{
 const f=await pageFixture(t);await f.page.onConversationVoice();f.switchAccount()
 f.transports[0].options.onText('不该进入新账号')
 assert.equal(f.state.input,'今晚');assert.equal(f.transports[0].cancelled,true)
})
