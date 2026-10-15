const test=require('node:test'),assert=require('node:assert/strict')
const {createAssistantConversation,probeAssistantCapability,clearCapabilityCache}=require('../utils/assistant-conversation')
const {presentCard}=require('../utils/assistant-cards')
const card=()=>({id:'ask',type:'clarification',title:'请说明目标日期。',expiresAt:Date.now()+60000,workspaceRef:{workspaceId:'w',workspaceRevision:1,planVersion:2},data:{kind:'meal_target',questionCode:'target_date',continuationRef:'t1',authorizedOptions:[{id:'today',label:'今天',selection:{date:'2026-10-15'}},{id:'date',label:'选择日期',selection:{}}]}})
async function conversation(){clearCapabilityCache();const memory=new Map(),sent=[];let current={turnId:'t1',status:'needs_input',cards:[card()]},lose=false
 const api={getAssistantV4Capabilities:async()=>({enabled:true,schemaVersion:'assistant.v4.1',reads:[],draftCommands:[],previewActions:[],supportedUiFeatures:['clarification_v1','handoff_v1']}),createAssistantV4Session:async()=>({sessionId:'s'}),sendAssistantV4Turn:async(_id,body)=>{sent.push(body);if(lose)throw Error('lost');return {turnId:body.clarificationChoice?'t2':'t1'}},getAssistantV4Turn:async id=>id==='t1'?current:{turnId:'t2',status:'completed',cards:[]}}
 const options={api,identity:'A',source:'isolated',read:k=>memory.get(k),write:(k,v)=>memory.set(k,v),workspaceStore:{state:()=>({workspace:{id:'w',revision:1,draft:{planVersion:2,dishes:[]}}})}}
 await probeAssistantCapability(options);const c=createAssistantConversation(options);await c.load();await c.send('保存到日历');return {c,sent,memory,options,lose:()=>lose=true,expired:()=>current.cards[0].expiresAt=1}
}
test('clarifications expose bounded server options and never accept an expired choice',()=>{
 const view=presentCard(card());assert.equal(view.canClarify,true);assert.equal(view.choices.length,2);assert.equal(view.choices[1].requiresDate,true)
 const expired=card();expired.expiresAt=1;assert.equal(presentCard(expired).canClarify,false)
 const malformed=card();malformed.data.authorizedOptions.push({...malformed.data.authorizedOptions[0]});assert.equal(presentCard(malformed).canClarify,false)
})
test('chosen dates use the original continuation and unknown retry retains the same body',async()=>{
 const f=await conversation();f.lose();await f.c.chooseClarification('ask','date','2026-11-01');assert.equal(f.sent.length,2);assert.deepEqual(f.sent[1].clarificationChoice,{continuationRef:'t1',optionId:'date',date:'2026-11-01'});assert.ok(f.sent[1].uiFeatures.includes('clarification_v1'))
 const restored=createAssistantConversation(f.options);f.options.api.getAssistantV4Session=async()=>({sessionId:'s',latestTurn:{turnId:'t1',status:'needs_input',cards:[card()]}});await restored.load();await restored.recover();assert.deepEqual(f.sent[2],f.sent[1])
})
test('invalid dates, stale options, and disabled actions never send new turns',async()=>{
 const f=await conversation();await f.c.chooseClarification('ask','date','2026-02-30');assert.equal(f.sent.length,1);await f.c.chooseClarification('ask','fake');assert.equal(f.sent.length,1);f.expired();await f.c.recover('t1');await f.c.chooseClarification('ask','today');assert.equal(f.sent.length,1)
 f.c.setActionsEnabled(false);await f.c.send('再保存');assert.equal(f.sent.length,1)
})
test('choosing a clarification asks before replacing unsent input and cancellation does nothing',()=>{
 let modal,chosen=0;global.wx={showModal:o=>modal=o}
 const page=require('../utils/assistant-page')({data:{},current:()=>true});page._assistantAlive=true;page._scope='A';page.setData=function(v,cb){Object.assign(this.data,v);if(cb)cb()};page.conversation={state:()=>({input:'还没发送的想法'}),chooseClarification:()=>chosen++}
 page.onConversationChoice({detail:{id:'ask',optionId:'today'}});assert.equal(chosen,0);modal.success({confirm:false});assert.equal(chosen,0)
 page.onConversationChoice({detail:{id:'ask',optionId:'today'}});modal.success({confirm:true});assert.equal(chosen,1);delete global.wx
})
test('foreground disabled capability retires old write cards while keeping readable history',async()=>{
 const page=require('../utils/assistant-page')({data:{},current:()=>true},{probe:async()=>false});page._assistantAlive=true;page._scope='A';page.data.assistantConnected=true;page.setData=function(v,cb){Object.assign(this.data,v);if(cb)cb()};let enabled=true
 const current={turnId:'t1',status:'awaiting_confirmation',cards:[{id:'save',type:'calendar_save',taskId:'task',previewToken:'p',expiresAt:Date.now()+60000}],pendingAction:{taskId:'task',previewToken:'p'}}
 const state={turn:current,messages:[{id:'t1',turnId:'t1',role:'assistant',cards:current.cards}],busy:false}
 page.conversation={state:()=>state,setActionsEnabled:value=>enabled=value};page.store={state:()=>({})};await page.onShow();assert.equal(enabled,false);assert.equal(page.data.conversationMessages[0].cards[0].active,false);assert.equal(page.data.assistantConnected,true)
})
test('only the current confirmation card stays actionable while prior cards remain readable',()=>{
 const page=require('../utils/assistant-page')({data:{},current:()=>true});page._assistantAlive=true;page.setData=function(v,cb){Object.assign(this.data,v);if(cb)cb()}
 const preview={id:'new',type:'calendar_save',taskId:'new-task',previewToken:'p'},old={...preview,id:'old'},turn={turnId:'t2',status:'awaiting_confirmation',cards:[old,preview],pendingAction:{taskId:'new-task',previewToken:'p'}}
 page.renderConversation({turn,messages:[{id:'t1',turnId:'t1',cards:[old]},{id:'t2',turnId:'t2',cards:turn.cards}]});assert.equal(page.data.conversationMessages[0].cards[0].active,false);assert.deepEqual(page.data.conversationMessages[1].cards.map(c=>c.active),[false,true])
})
test('reading older conversation does not jump to new messages until the user chooses',()=>{
 const page=require('../utils/assistant-page')({data:{},current:()=>true});page._assistantAlive=true;page.setData=function(v,cb){Object.assign(this.data,v);if(cb)cb()}
 const state={messages:[{id:'1',role:'assistant',text:'旧消息',cards:[]}],turn:{turnId:'1',status:'completed',cards:[]}}
 page.renderConversation(state);page._conversationViewportHeight=400;page.onConversationScroll({detail:{scrollTop:100,scrollHeight:1200}});page.renderConversation({...state,messages:[...state.messages,{id:'2',role:'assistant',text:'新消息',cards:[]}]});assert.equal(page.data.conversationScrollTarget,'');assert.equal(page.data.conversationHasNew,true)
 page.onConversationLatest();assert.equal(page.data.conversationScrollTarget,'conversation-end');assert.equal(page.data.conversationHasNew,false)
})
