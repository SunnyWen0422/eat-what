const test=require('node:test'),assert=require('node:assert/strict')
const workflow=()=>require('../utils/assistant-workflow-presentation')
const partial=()=>({turnId:'t',status:'partially_completed',cards:[{id:'saved',type:'receipt',receiptRef:'calendar-real',data:{action:'calendar_save',date:'2026-10-18',mealType:'dinner'}}],continuation:{cursor:1,steps:[{kind:'calendar_save',status:'completed',receiptRef:'calendar-real'},{kind:'shopping_preview',status:'failed',requestId:'purchase-original'}]}})
function fixture(initial){
 const memory=new Map(),events=[];let turn=initial,id=0
 const api={createAssistantV4Session:async()=>({sessionId:'s',latestTurn:turn}),getAssistantV4Session:async()=>({sessionId:'s',workspaceRef:{workspaceId:'w'},latestTurn:turn}),sendAssistantV4Turn:async(_s,body)=>{events.push(['send',body]);return{turnId:'t'}},getAssistantV4Turn:async id=>{events.push(['read',id]);return turn},resumeAssistantV4Turn:async()=>{events.push(['resume']);return turn},confirmControlledTask:async()=>{events.push(['confirm']);throw Error('lost')},getControlledTask:async id=>{events.push(['check',id]);return{status:'completed'}},cancelAssistantV4Turn:async()=>{events.push(['cancel']);turn={...turn,status:'cancelled',pendingAction:null};return turn}}
 const conversation=require('../utils/assistant-conversation').createAssistantConversation({api,workspaceStore:{state:()=>({workspace:{id:'w',revision:1,draft:{planVersion:1}}})},identity:'synthetic',source:'isolated',uuid:()=>`uuid-${++id}`,read:k=>memory.get(k),write:(k,v)=>memory.set(k,v)})
 return{conversation,events,api,setTurn:v=>turn=v}
}
function pageFor(conversation){const page=require('../utils/assistant-page')({data:{},current:()=>true},{probe:async()=>true});page._assistantAlive=true;page._scope='synthetic';page.conversation=conversation;page.setData=function(v,cb){Object.assign(this.data,v);if(cb)cb()};return page}

test('partial terminal task offers editable remaining request',async()=>{
 const f=fixture(partial());await f.conversation.load();await f.conversation.send('保存到明晚并准备采购');assert.notEqual(f.conversation.state().input,'保存到明晚并准备采购')
 const state=f.conversation.state(),view=workflow().presentWorkflow(state),text=workflow().buildRemainingTaskPrefill({turn:state.turn})
 assert.deepEqual(view.remainingKinds,['shopping_preview']);assert.equal(view.primaryAction,'remaining');assert.equal(view.rows[0].status,'completed');assert.equal(view.rows[0].receiptRef,'calendar-real');assert.equal(view.rows[1].status,'unfinished');assert.match(text,/采购来源/);assert.doesNotMatch(text,/2026-|明晚|保存到/)
 const page=pageFor(f.conversation);page.renderConversation(state);page.onConversationWorkflow();assert.equal(f.conversation.state().input,text);assert.equal(f.events.filter(e=>e[0]==='send').length,1)
 await f.conversation.recover();assert.equal(f.events.filter(e=>e[0]==='resume').length,0);await f.conversation.send(text);assert.equal(f.events.filter(e=>e[0]==='send').length,2)
})
test('unknown confirmation preserves original request',async()=>{
 const turn={...partial(),status:'awaiting_confirmation',cards:[...partial().cards,{id:'buy',type:'shopping_preview',taskId:'original-task',previewToken:'original-token',expiresAt:Date.now()+60000}],pendingAction:{taskId:'original-task',previewToken:'original-token'}}
 const f=fixture(turn);await f.conversation.load();await f.conversation.send('保存并采购');await f.conversation.confirm('buy');const before=f.conversation.state()
 assert.equal(workflow().presentWorkflow(before).primaryAction,'recover');assert.equal(workflow().presentWorkflow(before).rows[0].receiptRef,'calendar-real')
 f.setTurn({...partial(),status:'completed'});await f.conversation.recover();assert.deepEqual(f.events.filter(e=>e[0]==='check'),[['check','original-task']]);assert.equal(f.events.filter(e=>e[0]==='confirm').length,1);assert.equal(f.events.filter(e=>e[0]==='send').length,1)
})
test('cancelled workflow cannot auto continue',async()=>{
 const turn={...partial(),status:'cancelled'},f=fixture(turn);await f.conversation.load();const page=pageFor(f.conversation);page.data.assistantConnected=true;page.renderConversation(f.conversation.state());await page.onShow();page.onConversationWorkflow();assert.equal(workflow().presentWorkflow({turn}).primaryAction,null);assert.equal(workflow().buildRemainingTaskPrefill({turn}),null);assert.equal(page.data.conversationWorkflow.rows[0].receiptRef,'calendar-real');assert.deepEqual(f.events,[])
})
test('workflow summary is bounded and success requires a real receipt',()=>{
 const turn=partial();turn.continuation.steps.unshift({kind:'draft_update',status:'completed'},{kind:'calendar_save',status:'awaiting_confirmation'})
 const view=workflow().presentWorkflow({turn});assert.equal(view.rows.length,3);assert.equal(view.rows[0].status,'unknown');assert.equal(view.rows[0].receiptRef,null);assert.equal(view.rows[1].status,'unfinished');assert.equal(view.rows[2].receiptRef,'calendar-real')
 turn.continuation.steps=[turn.continuation.steps[2]];assert.deepEqual(workflow().presentWorkflow({turn}).rows,[])
 turn.continuation.steps.push({kind:'unpublished_action',status:'failed'});assert.equal(workflow().buildRemainingTaskPrefill({turn}),null)
})
test('current previews, missing previews, expiry and selection expose one honest next step',()=>{
 const expiresAt=Date.now()+60000,turn={...partial(),status:'awaiting_confirmation',pendingAction:{taskId:'buy',previewToken:'p',expiresAt},cards:[{id:'buy-card',type:'shopping_preview',taskId:'buy',previewToken:'p',expiresAt}]}
 assert.equal(workflow().presentWorkflow({turn}).primaryAction,'preview');turn.cards[0].expiresAt=1;assert.equal(workflow().presentWorkflow({turn}).primaryAction,'recover')
 turn.pendingAction=null;turn.continuation.steps[1].status='pending';assert.equal(workflow().presentWorkflow({turn}).primaryAction,'recover');assert.equal(workflow().presentWorkflow({turn,selectionPending:true}).primaryAction,'recover')
})
test('remaining prefill respects disabled capability and late modal state changes',()=>{
 let state={turn:partial(),input:'保留这段'},modal,sets=0;global.wx={showModal:o=>modal=o};const c={state:()=>state,setInput:()=>sets++},page=pageFor(c)
 page.data.conversationActionsEnabled=false;page.onConversationWorkflow();assert.equal(modal,undefined);page.data.conversationActionsEnabled=true;page.onConversationWorkflow();assert.ok(modal);state={...state,turn:{...state.turn,turnId:'new'}};modal.success({confirm:true});assert.equal(sets,0);delete global.wx
})
test('partial result does not erase a newer unsent draft',async()=>{
 const f=fixture(null);await f.conversation.load();let resolve;f.api.getAssistantV4Turn=()=>new Promise(r=>resolve=r)
 const sending=f.conversation.send('保存并采购');await new Promise(setImmediate);f.conversation.setInput('我还想补充一句');resolve(partial());await sending;assert.equal(f.conversation.state().input,'我还想补充一句')
})
test('unknown current step is not presented as an ordinary unconfirmed preview',()=>{
 const turn={...partial(),status:'awaiting_confirmation',pendingAction:{taskId:'buy'},continuation:{cursor:1,steps:[partial().continuation.steps[0],{kind:'shopping_preview',taskId:'buy',status:'awaiting_confirmation'}]}}
 const view=workflow().presentWorkflow({turn,confirmationPending:true});assert.equal(view.rows[1].status,'unknown');assert.match(view.rows[1].label,/核对/);assert.equal(view.primaryAction,'recover')
})
test('an unknown new send takes priority over a prior partial outcome',async()=>{
 const f=fixture(partial());await f.conversation.load();f.api.sendAssistantV4Turn=async()=>{throw Error('lost')};await f.conversation.send('采购来源我想改一下')
 const page=pageFor(f.conversation);page.renderConversation(f.conversation.state());assert.equal(page.data.conversationWorkflowAction,'recover');assert.equal(page.data.conversationWorkflowLabel,'继续查看结果');page.onConversationWorkflow();assert.equal(f.conversation.state().input,'采购来源我想改一下')
})
const previewTurn=(cards)=>({turnId:'restored',status:'awaiting_confirmation',cards,pendingAction:{taskId:'original-preview',previewToken:'original-token',expiresAt:1},continuation:{cursor:1,steps:[{kind:'calendar_save',status:'completed',receiptRef:'saved-real'},{kind:'shopping_preview',taskId:'original-preview',status:'awaiting_confirmation'}]}})
const expiredPreview=()=>({id:'expired',type:'shopping_preview',taskId:'original-preview',previewToken:'original-token',expiresAt:1})
async function restoredPreview(cards){const f=fixture(previewTurn(cards));await f.conversation.load({workspaceId:'w',sessionId:'s'});const page=pageFor(f.conversation);page.renderConversation(f.conversation.state());assert.equal(f.conversation.state().recoverable,false);assert.equal(page.data.conversationWorkflowAction,'recover');return{...f,page}}
for(const kind of ['expired','missing'])test(`restored ${kind} preview recovery rereads the original turn without replay`,async()=>{
 const f=await restoredPreview(kind==='expired'?[expiredPreview()]:[]),expiresAt=Date.now()+60000
 const fresh={...previewTurn([{...expiredPreview(),expiresAt}]),pendingAction:{taskId:'original-preview',previewToken:'original-token',expiresAt}}
 f.setTurn(fresh);await f.page.onConversationRecover();assert.deepEqual(f.events,[['read','restored']]);assert.equal(f.conversation.state().turn.cards[0].expiresAt,expiresAt);assert.equal(workflow().presentWorkflow(f.conversation.state()).primaryAction,'preview')
})
test('restored preview recovery resumes only server pending continuation after reread',async()=>{
 const f=await restoredPreview([]),pending={...previewTurn([]),pendingAction:null};pending.continuation.steps[1].status='pending';f.setTurn(pending)
 await f.page.onConversationRecover();assert.deepEqual(f.events,[['read','restored'],['resume']]);assert.equal(f.events.some(e=>['send','confirm'].includes(e[0])),false)
})
test('restored preview recovery keeps disabled capability read-only',async()=>{
 const f=await restoredPreview([expiredPreview()]);f.conversation.setActionsEnabled(false);f.page.data.conversationActionsEnabled=false
 const pending={...previewTurn([]),pendingAction:null};pending.continuation.steps[1].status='pending';f.setTurn(pending);await f.page.onConversationRecover();await f.conversation.confirm('expired');assert.deepEqual(f.events,[['read','restored']])
})
test('page recovery checks a newer unknown send before the restored preview',async()=>{
 const f=await restoredPreview([expiredPreview()]),sent=[];f.api.sendAssistantV4Turn=async(_s,body)=>{sent.push(body);if(sent.length===1)throw Error('lost');return{turnId:'new-send'}}
 await f.conversation.send('先核对采购来源');f.api.getAssistantV4Turn=async id=>{f.events.push(['read',id]);return{turnId:id,status:'completed',cards:[]}}
 await f.page.onConversationRecover();assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.deepEqual(f.events,[['read','new-send']])
})
test('late restored-preview reread cannot resume after conversation disposal',async()=>{
 const f=await restoredPreview([]);let resolve;f.api.getAssistantV4Turn=id=>{f.events.push(['read',id]);return new Promise(r=>resolve=r)}
 const recovery=f.page.onConversationRecover();await new Promise(setImmediate);assert.equal(typeof resolve,'function');f.conversation.dispose();const pending={...previewTurn([]),pendingAction:null};pending.continuation.steps[1].status='pending';resolve(pending);await recovery;assert.deepEqual(f.events,[['read','restored']]);assert.equal(f.conversation.state().turn,null)
})
