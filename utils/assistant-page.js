const {createAssistantConversation,probeAssistantCapability}=require('./assistant-conversation')
const {safeText}=require('./assistant-cards')
// Keep the existing page's handlers and lifecycle intact when the service is unavailable.
module.exports=function assistantPage(fallback, options={}) {
 return {...fallback,data:{...fallback.data,assistantConnected:false,conversationMessages:[],conversationInput:'',conversationError:'',conversationBusy:false,conversationRecoverable:false,keyboardHeight:0},
  async onLoad(params={}) {
   this._assistantAlive=true;this._assistantParams=params
   const app=typeof getApp==='function'?getApp():null;if(app&&app.waitForLogin)await app.waitForLogin()
   if(!this._assistantAlive)return
   const enabled=await (options.probe || probeAssistantCapability)()
   if(!this._assistantAlive)return
   this.setData({assistantConnected:enabled})
   await fallback.onLoad.call(this,params)
   if(!this._assistantAlive || !enabled || !this.current())return
   this.setData({requirementsVisible:false})
   this._requirementsBinding=null
   return this.openConnectedConversation()
  },
  async openConnectedConversation() {
   if(this.conversation)this.conversation.dispose()
   const store=this.store
   try {
    if(!store.state().workspace)await store.save()
    if(!this._assistantAlive || !this.current() || store!==this.store)return
    this.renderWorkspace()
    this.conversation=createAssistantConversation({api:require('./api'),workspaceStore:store,entryScene:['home','calendar'].includes(this._assistantParams.entryScene)?this._assistantParams.entryScene:'chat',onChange:state=>this.renderConversation(state),onWorkspaceChange:()=>{if(this._assistantAlive&&this.current())this.renderWorkspace()}})
    await this.conversation.load()
   }catch(error){if(this._assistantAlive&&this.current())this.setData({conversationError:'本餐暂未同步，请回到今天核对后再试'})}
  },
  renderConversation(state) {
   if(!this._assistantAlive || !this.current())return
   const turn=state.turn,currentCards=new Set((turn&&turn.cards || []).map(c=>c.id))
   const messages=state.messages.map(m=>({...m,text:safeText(m.text || m.content),cards:(m.cards || []).map(card=>({...card,active:!!turn&&m.turnId===turn.turnId&&currentCards.has(card.id)&&!state.selectionPending&&!state.confirmationPending&&(!card.taskId||turn.status==='awaiting_confirmation'&&turn.pendingAction&&turn.pendingAction.taskId===card.taskId&&turn.pendingAction.previewToken===card.previewToken)}))}))
   this.setData({conversationMessages:messages,conversationInput:state.input,conversationError:state.error,conversationBusy:state.busy,conversationRecoverable:state.recoverable,conversationCanStop:!!turn&&['queued','running','awaiting_confirmation'].includes(turn.status),conversationStopLabel:turn&&turn.status==='awaiting_confirmation'?'取消预览':'停止这次请求',conversationHasOlder:!!state.nextCursor,conversationScrollTarget:'conversation-end'})
   clearTimeout(this._conversationTimer)
   if(state.busy&&state.turn&&['queued','running'].includes(state.turn.status))this._conversationTimer=setTimeout(()=>{if(this._assistantAlive&&this.current()&&this.conversation)this.conversation.recover(state.turn.turnId)},1000)
  },
  async onShow() {
   if(!this.data.assistantConnected)return fallback.onShow && fallback.onShow.call(this)
   if(!this._assistantAlive || !this._scope)return
   if(!this.current()){
    if(this.conversation)this.conversation.dispose()
    this.setData({assistantConnected:false,conversationMessages:[],conversationInput:'',conversationError:'',conversationBusy:false})
    const enabled=await (options.probe || probeAssistantCapability)()
    if(!this._assistantAlive)return
    await fallback.initializeWorkspace.call(this,this._assistantParams)
    if(this.current()&&enabled){this.setData({assistantConnected:true,requirementsVisible:false});return this.openConnectedConversation()}
    return
   }
   if(this.conversation){
    const conversation=this.conversation,store=this.store,state=conversation.state()
    if(state.recoverable)return conversation.recover()
    this.renderConversation(state)
    const local=store&&store.state()
    if(store&&local&&!local.dirty&&!local.pending&&!(state.turn&&state.turn.status==='awaiting_confirmation')){
     try{await store.reloadLatest();if(this._assistantAlive&&this.current()&&store===this.store&&conversation===this.conversation)this.renderWorkspace()}
     catch(error){if(this._assistantAlive&&this.current()&&store===this.store&&conversation===this.conversation)this.setData({conversationError:'最新菜单暂未读到，请回到今天核对后再发，输入仍保留'})}
    }
   }
  },
  onHide(){clearTimeout(this._conversationTimer);if(fallback.onHide)fallback.onHide.call(this)},
  onUnload(){this._assistantAlive=false;clearTimeout(this._conversationTimer);if(this.conversation)this.conversation.dispose();if(fallback.onUnload)fallback.onUnload.call(this)},
  onConversationInput(event){if(this.conversation)this.conversation.setInput(event.detail.value)},
  onConversationSend(){if(this.conversation&&!this.data.conversationBusy)return this.conversation.send(this.data.conversationInput)},
  onConversationRecover(){if(this.conversation)return this.conversation.recover();return this.openConnectedConversation()},
  onConversationStop(){if(this.conversation)return this.conversation.cancelTurn()},
  onConversationConfirm(event){if(this.conversation&&!this.data.conversationBusy)return this.conversation.confirm(event.detail.id)},
  onConversationSelection(event){if(this.conversation&&!this.data.conversationBusy)return this.conversation.selectShopping(event.detail.id,event.detail.selectedSourceKeys)},
  onConversationRepreview(event){if(this.conversation&&!this.data.conversationBusy)return this.conversation.selectShopping(event.detail.id)},
  async onConversationUndo(event){
   if(this.data.conversationBusy || !this.current() || !this.conversation)return
   const turn=this.conversation.state().turn,card=turn && (turn.cards || []).find(c=>c.id===event.detail.id),w=this.store.state().workspace,ref=card && card.workspaceRef
   if(!card || card.type!=='menu' || !card.data || !card.data.canUndo || !w || !ref || ref.workspaceId!==w.id || ref.workspaceRevision!==w.revision || ref.planVersion!==w.draft.planVersion){this.setData({conversationError:'本餐已变化，请核对当前菜单后再撤销'});return}
   const applied=await this.runCommand('undo');if(applied&&this.current())this.setData({conversationError:'已撤销草稿的上一步，日历和清单中的记录仍保留'})
  },
  onConversationVoice(){wx.showModal({title:'语音输入',content:'抱歉，该功能暂不可用',showCancel:false})},
  onConversationKeyboard(event){this.setData({keyboardHeight:Math.max(0,Number(event.detail.height)||0)})},
  onConversationHome(){if(this.current())wx.switchTab({url:'/pages/index/index'})},
  onConversationOlder(){return this.conversation && this.conversation.loadOlder && this.conversation.loadOlder()},
 }
}
