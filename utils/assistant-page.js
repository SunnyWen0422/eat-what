const {createAssistantConversation,probeAssistantCapability}=require('./assistant-conversation')
const {safeText,presentMenuActions,conversationBlocksMenu}=require('./assistant-cards')
const {workspaceReference,matchesWorkspaceReference}=require('./meal-workspace')
// Keep the existing page's handlers and lifecycle intact when the service is unavailable.
module.exports=function assistantPage(fallback, options={}) {
 return {...fallback,data:{...fallback.data,assistantConnected:false,conversationMenuExpanded:false,conversationSuggestions:[],conversationMenuCount:0,conversationCurrentMenu:null,conversationMessages:[],conversationInput:'',conversationError:'',conversationBusy:false,conversationRecoverable:false,keyboardHeight:0},
  renderWorkspace(){
   if(fallback.renderWorkspace)fallback.renderWorkspace.call(this)
   if(!this.data.assistantConnected || !this.current())return
   this.refreshConversationMenus()
  },
  refreshConversationMenus(state=this.conversation&&this.conversation.state()) {
   if(!this.store || !this.current())return
   const local=this.store.state(),w=local.workspace,context=w&&w.context,dishes=w&&w.draft&&w.draft.dishes
   const conversationState={...(state||{}),actionsEnabled:!!state&&this.data.conversationActionsEnabled!==false},workspaceState={...local,busy:!!this.data.busy}
   const decorate=card=>({...card,menuActions:presentMenuActions({card,workspace:w,conversationState,workspaceState})})
   const live=context&&Array.isArray(dishes)&&dishes.length?decorate({id:'current-menu',type:'menu',title:'当前本餐菜单',workspaceRef:workspaceReference(w),data:{date:context.date,mealType:context.mealType,people:context.people,dishes,canUndo:false}}):null
   this.setData({conversationMenuCount:(dishes||[]).length,conversationSuggestions:require('./assistant-presentation').buildAssistantSuggestions({hasMenu:!!(dishes&&dishes.length),available:true}),conversationCurrentMenu:live,conversationMessages:(this.data.conversationMessages||[]).map(message=>({...message,cards:(message.cards||[]).map(decorate)})),conversationWorkspaceRecoverable:!!local.pending||['conflict','offline'].includes(local.syncStatus),conversationWorkspaceRecoveryLabel:local.pending?'核对刚才的菜单操作':'查看最新本餐菜单',conversationWorkspaceBlocked:this.workspaceBlocksConversation(),conversationWorkspaceFeedback:this.data.errorMessage || this.data.actionFeedback&&this.data.actionFeedback.message || ''})
  },
  async onLoad(params={}) {
   this._assistantAlive=true;this._assistantParams=params
   const app=typeof getApp==='function'?getApp():null;if(app&&app.waitForLogin)await app.waitForLogin()
   if(!this._assistantAlive)return
   const origins=require('./assistant-origin')
   if(params.originToken)origins.bindAssistantOrigin(this,origins.currentOriginStore().take(params.originToken))
   else {this._assistantOrigin=null;this.setData({assistantReturnVisible:false,assistantReturnLabel:'回到今天'})}
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
   this._conversationAtBottom=true;this._conversationStamp=null;this.setData({conversationActionsEnabled:true,conversationHasNew:false})
   if(this.conversation)this.conversation.dispose()
   const store=this.store
   try {
    if(!store.state().workspace){if(this._assistantParams.sessionId)throw Error('missing original meal');await store.save()}
    if(!this._assistantAlive || !this.current() || store!==this.store)return
    this.renderWorkspace()
    this.conversation=createAssistantConversation({api:require('./api'),workspaceStore:store,entryScene:['home','calendar'].includes(this._assistantParams.entryScene)?this._assistantParams.entryScene:'chat',onChange:state=>this.renderConversation(state),onWorkspaceChange:()=>{if(this._assistantAlive&&this.current())this.renderWorkspace()}})
    const history=this._assistantParams.sessionId?{sessionId:this._assistantParams.sessionId,workspaceId:this._assistantParams.workspaceId}:null
    await this.conversation.load(history)
    this.applyAssistantEntry()
   }catch(error){if(this._assistantAlive&&this.current())this.setData({conversationError:'本餐暂未同步，请回到今天核对后再试'})}
  },
  applyAssistantEntry() {
   if(!this._assistantAlive || !this.current() || !this.conversation || !this._assistantParams || !this._assistantParams.entryToken)return
   const state=this.conversation.state()
   if(!state.sessionId || state.busy || state.recoverable || state.confirmationPending || state.turn && ['queued','running','awaiting_confirmation'].includes(state.turn.status))return
   const entry=require('./assistant-entry').currentEntryStore().take(this._assistantParams.entryToken)
   if(!entry)return
   this._assistantParams.entryToken=''
   if(entry.date!==this.data.context.date || entry.mealType!==this.data.context.mealType)return
   this.offerConversationInput(`请介绍菜品 ID ${entry.dishId}「${entry.dishName}」的做法`)
  },
  offerConversationInput(text, expectedRef=null) {
   const conversation=this.conversation,scope=this._scope
   if(!conversation || !this.current())return
   const state=conversation.state(),before=state.input || ''
   const blocked=s=>conversationBlocksMenu(s) || expectedRef && (this.workspaceBlocksConversation() || !matchesWorkspaceReference(expectedRef,this.store&&this.store.state().workspace,this.store&&this.store.state().context))
   if(blocked(state))return
   const apply=()=>{if(!this._assistantAlive || !this.current() || scope!==this._scope || conversation!==this.conversation)return;const latest=conversation.state();if(!blocked(latest)&&latest.input===state.input)conversation.setInput(text)}
   if(before.trim()&&before!==text)wx.showModal({title:'替换当前输入？',content:'当前尚未发送的文字会被替换。',success:result=>{if(result.confirm)apply()}})
   else apply()
  },
  renderConversation(state) {
   if(!this._assistantAlive || !this.current())return
   const turn=state.turn,cards=turn&&turn.cards||[],pending=turn&&turn.pendingAction
   const actionable=pending?cards.filter(c=>c.taskId===pending.taskId&&c.previewToken===pending.previewToken).slice(-1):turn&&turn.status==='needs_input'?cards.filter(c=>['clarification','handoff'].includes(c.type)).slice(-1):cards.filter(c=>c.type==='menu'&&c.data&&c.data.canUndo).slice(-1)
   const currentCards=new Set(actionable.map(c=>c.id)),enabled=this.data.conversationActionsEnabled!==false&&!state.busy&&!state.recoverable
   const messages=state.messages.map(m=>({...m,text:safeText(m.text || m.content),cards:(m.cards || []).map(card=>({...card,active:enabled&&!!turn&&m.turnId===turn.turnId&&currentCards.has(card.id)&&!state.selectionPending&&!state.confirmationPending&&(!card.taskId||turn.status==='awaiting_confirmation'&&turn.pendingAction&&turn.pendingAction.taskId===card.taskId&&turn.pendingAction.previewToken===card.previewToken)}))}))
   this.setData({conversationMessages:messages,conversationInput:state.input,conversationError:state.error,conversationBusy:state.busy,conversationRecoverable:state.recoverable,conversationCanStop:!!turn&&['queued','running','awaiting_confirmation'].includes(turn.status),conversationStopLabel:turn&&turn.status==='awaiting_confirmation'?'取消预览':'停止这次请求',conversationHasOlder:!!state.nextCursor,conversationProgressLabel:turn&&turn.status==='queued'?'正在排队…':'正在处理这次请求…'})
   this.refreshConversationMenus(state)
   const last=state.messages[state.messages.length-1],stamp=last?JSON.stringify([last.id,last.text||last.content,last.cards,turn&&turn.status]):''
   if(stamp!==this._conversationStamp){this._conversationStamp=stamp;if(this._conversationAtBottom!==false||this._conversationForceBottom)this.onConversationLatest();else this.setData({conversationScrollTarget:'',conversationHasNew:true})}
   this._conversationForceBottom=false
   clearTimeout(this._conversationTimer)
   if(this._assistantVisible!==false&&state.busy&&state.turn&&['queued','running'].includes(state.turn.status))this._conversationTimer=setTimeout(()=>{if(this._assistantAlive&&this.current()&&this.conversation)this.conversation.recover(state.turn.turnId)},1000)
   this.applyAssistantEntry()
  },
  async onShow() {
   if(this._assistantOrigin)require('./assistant-origin').refreshAssistantOrigin(this)
   this._assistantVisible=true
   if(!this.data.assistantConnected)return fallback.onShow && fallback.onShow.call(this)
   if(!this._assistantAlive || !this._scope)return
   if(!this.current()){
    if(this.conversation)this.conversation.dispose()
    this.setData({assistantConnected:false,conversationCurrentMenu:null,conversationMessages:[],conversationInput:'',conversationError:'',conversationBusy:false})
    const enabled=await (options.probe || probeAssistantCapability)()
    if(!this._assistantAlive)return
    await fallback.initializeWorkspace.call(this,this._assistantParams)
    if(this.current()&&enabled){this.setData({assistantConnected:true,requirementsVisible:false});return this.openConnectedConversation()}
    return
   }
   if(this.conversation){
    const activeConversation=this.conversation,scope=this._scope
    this.setData({conversationActionsEnabled:false,conversationCapabilityChecking:true});if(activeConversation.setActionsEnabled)activeConversation.setActionsEnabled(false)
    const enabled=await (options.probe||probeAssistantCapability)({force:true})
    if(!this._assistantAlive||!this.current()||scope!==this._scope||activeConversation!==this.conversation)return
    this.setData({conversationActionsEnabled:enabled,conversationCapabilityChecking:false});if(activeConversation.setActionsEnabled)activeConversation.setActionsEnabled(enabled)
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
  onHide(){this._assistantVisible=false;clearTimeout(this._conversationTimer);if(fallback.onHide)fallback.onHide.call(this)},
  onUnload(){this._assistantAlive=false;clearTimeout(this._conversationTimer);if(this.conversation)this.conversation.dispose();if(fallback.onUnload)fallback.onUnload.call(this)},
  onToggleConversationMenu(){if(this.current())this.setData({conversationMenuExpanded:!this.data.conversationMenuExpanded})},
  onConversationCurrentMenu(){if(this.current()){this.setData({conversationMenuExpanded:true,conversationScrollTarget:''},()=>this.setData({conversationScrollTarget:'conversation-current-menu'}));this.refreshConversationMenus()}},
  workspaceBlocksConversation(){const local=this.store&&this.store.state();return !!(this.data.busy || this._directDishBinding || local&&(local.pending || ['saving','unknown','conflict'].includes(local.syncStatus) || local.workspace&&local.workspace.status==='generating'))},
  canRunReferencedCommand(expectedRef){
   const binding=this._directDishBinding
   return !!this.conversation && this.data.conversationActionsEnabled!==false && !conversationBlocksMenu(this.conversation.state()) && (!binding || binding.conversation===this.conversation&&binding.store===this.store&&binding.scope===this._scope) && matchesWorkspaceReference(expectedRef,this.store.state().workspace,this.store.state().context)
  },
  async onConversationDishAction(event){
   if(!this.current())return
   if(event.detail&&event.detail.action==='current')return this.onConversationCurrentMenu()
   if(!this.conversation || !this.store || this.workspaceBlocksConversation())return
   const {cardId,dishId,action,expectedRef}=event.detail||{},conversation=this.conversation,local=this.store.state(),state=conversation.state()
   const card=cardId==='current-menu'?this.data.conversationCurrentMenu:(state.messages||[]).flatMap(m=>m.cards||[]).find(c=>c.id===cardId)
   const menu=presentMenuActions({card,workspace:local.workspace,conversationState:{...state,actionsEnabled:this.data.conversationActionsEnabled!==false},workspaceState:local}),row=menu.rows.find(r=>r.dishId===dishId)
   if(!menu.enabled || !row || !matchesWorkspaceReference(expectedRef,local.workspace,local.context) || ['workspaceId','workspaceRevision','planVersion','date','mealType'].some(key=>expectedRef[key]!==menu.expectedRef[key])){this.setData({conversationError:'这份菜单已变化，请查看当前餐或完成当前核对'});return}
   if(action==='lighter'){
    const dish=local.workspace.draft.dishes.find(d=>(d.id||d.dishId)===dishId)
    if(!row.locked)this.offerConversationInput(`请把${expectedRef.date}${require('./meal-workspace-presentation').contextPresentation(local.workspace.context).mealName || '这餐'}的「${dish.name}」换清淡点，保留其他已保留的菜`,{...expectedRef})
    return
   }
   if(!['keep','release','replace'].includes(action) || action==='replace'&&!row.canReplace || action==='keep'&&row.locked || action==='release'&&!row.locked)return
   const binding={conversation,store:this.store,scope:this._scope};this._directDishBinding=binding
   this.setData({conversationError:''})
   try{return await this.runCommand(action,{dishId},{...expectedRef})}
   finally{if(this._directDishBinding===binding){this._directDishBinding=null;if(this.current()&&binding.store===this.store&&conversation===this.conversation){this.refreshConversationMenus();this.setData({conversationMenuExpanded:true})}}}
  },
  async onConversationWorkspaceRecover(){
   if(!this.current()||this.data.busy||!this.store||conversationBlocksMenu(this.conversation&&this.conversation.state()))return
   const local=this.store.state()
   if(local.pending)return this.onRetryWorkspace()
   if(!['conflict','offline'].includes(local.syncStatus))return
   const binding={store:this.store,scope:this._scope,conversation:this.conversation};this._conversationRecoveryBinding=binding
   await this.onLoadLatest()
   if(this.current()&&binding.store===this.store&&binding.scope===this._scope&&binding.conversation===this.conversation){this.setData({conversationMenuExpanded:true});this.refreshConversationMenus()}
  },
  onConversationRestoreDraft(){
   const binding=this._conversationRecoveryBinding,context=this._preservedContext
   if(!this.current()||!this.data.conflictDraftAvailable||!context||!binding||binding.store!==this.store||binding.scope!==this._scope||binding.conversation!==this.conversation||this.workspaceBlocksConversation()||conversationBlocksMenu(this.conversation&&this.conversation.state())||context.date!==this.data.context.date||context.mealType!==this.data.context.mealType)return
   this._conversationRecoveryBinding=null;return this.onRestoreLocalDraft()
  },
  onConversationSuggestion(event){
   if(!this.data.assistantConnected || (this.data.conversationMessages || []).length)return
   const item=require('./assistant-presentation').buildAssistantSuggestions({available:true,hasMenu:!!this.data.conversationCurrentMenu}).find(s=>s.id===event.currentTarget.dataset.id)
   if(item)this.offerConversationInput(item.text)
  },
  onConversationInput(event){if(this.conversation)this.conversation.setInput(event.detail.value)},
  onConversationSend(){if(this.conversation&&!this.workspaceBlocksConversation()&&!this.data.conversationBusy&&this.data.conversationActionsEnabled!==false){this._conversationForceBottom=true;return this.conversation.send(this.data.conversationInput)}},
  onConversationRecover(){if(this.conversation)return this.conversation.recover();return this.openConnectedConversation()},
  onConversationStop(){if(this.conversation)return this.conversation.cancelTurn()},
  onConversationConfirm(event){if(this.conversation&&!this.workspaceBlocksConversation()&&!this.data.conversationBusy&&this.data.conversationActionsEnabled!==false)return this.conversation.confirm(event.detail.id)},
  onConversationHandoff(event){
   if(!this.current()||!this.conversation||this.data.conversationBusy||this.data.conversationActionsEnabled===false)return
   const state=this.conversation.state(),turn=state.turn,w=this.store.state().workspace
   if(state.recoverable||state.confirmationPending||state.selectionPending||!turn||turn.status!=='needs_input')return
   const card=(turn.cards||[]).find(c=>c.id===event.detail.id)
   if(!require('./assistant-action-handoff').openCard(card,w,{kind:'assistant',sessionId:state.sessionId,workspaceId:w&&w.id,date:this.data.context.date,mealType:this.data.context.mealType}))this.setData({conversationError:'这项内容已变化，请重新查询后再打开'})
  },
  onConversationChoice(event){
   if(!this.conversation||this.workspaceBlocksConversation()||this.data.conversationBusy||this.data.conversationActionsEnabled===false||!this.current())return
   const conversation=this.conversation,scope=this._scope,before=conversation.state(),choice={...event.detail}
   if(before.recoverable||before.confirmationPending||before.selectionPending)return
   const apply=()=>{if(!this._assistantAlive||!this.current()||this.workspaceBlocksConversation()||scope!==this._scope||conversation!==this.conversation||conversation.state().input!==before.input)return;this._conversationForceBottom=true;return conversation.chooseClarification(choice.id,choice.optionId,choice.date)}
   if(String(before.input||'').trim())wx.showModal({title:'使用这个选项？',content:'当前尚未发送的文字会被替换。',success:result=>{if(result.confirm)apply()}})
   else return apply()
  },
  onReady(){if(fallback.onReady)fallback.onReady.call(this);this.measureConversation()},
  onResize(){if(fallback.onResize)fallback.onResize.call(this);this.measureConversation()},
  measureConversation(){if(!wx.createSelectorQuery)return;wx.createSelectorQuery().in(this).select('.connected-messages').boundingClientRect(rect=>{if(this._assistantAlive&&rect)this._conversationViewportHeight=rect.height}).exec()},
  onConversationScroll(event){const h=this._conversationViewportHeight;this._conversationAtBottom=!!h&&event.detail.scrollHeight-event.detail.scrollTop-h<64;if(!this._conversationAtBottom)this.setData({conversationScrollTarget:''})},
  onConversationBottom(){this._conversationAtBottom=true;this.setData({conversationHasNew:false})},
  onConversationLatest(){this._conversationAtBottom=true;this.setData({conversationScrollTarget:'',conversationHasNew:false},()=>this.setData({conversationScrollTarget:'conversation-end'}))},
  onConversationSelection(event){if(this.conversation&&!this.workspaceBlocksConversation()&&!this.data.conversationBusy)return this.conversation.selectShopping(event.detail.id,event.detail.selectedSourceKeys)},
  onConversationRepreview(event){if(this.conversation&&!this.workspaceBlocksConversation()&&!this.data.conversationBusy)return this.conversation.selectShopping(event.detail.id)},
  async onConversationUndo(event){
   if(this.data.conversationBusy || !this.current() || !this.conversation || this.data.conversationActionsEnabled===false)return
   const turn=this.conversation.state().turn,card=turn && (turn.cards || []).find(c=>c.id===event.detail.id),w=this.store.state().workspace,ref=card && card.workspaceRef
   if(!card || card.type!=='menu' || !card.data || !card.data.canUndo || !w || !ref || ref.workspaceId!==w.id || ref.workspaceRevision!==w.revision || ref.planVersion!==w.draft.planVersion){this.setData({conversationError:'本餐已变化，请核对当前菜单后再撤销'});return}
   const applied=await this.runCommand('undo');if(applied&&this.current())this.setData({conversationError:'已撤销草稿的上一步，日历和清单中的记录仍保留'})
  },
  onConversationVoice(){wx.showModal({title:'语音输入',content:'抱歉，该功能暂不可用',showCancel:false})},
  onConversationKeyboard(event){this.setData({keyboardHeight:Math.max(0,Number(event.detail.height)||0)},()=>this.measureConversation())},
  onConversationHome(){if(this.current())return require('./assistant-origin').returnFromPage(this,{},true)},
  onConversationOlder(){return this.conversation && this.conversation.loadOlder && this.conversation.loadOlder()},
 }
}
