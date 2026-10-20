const {createAssistantConversation,probeAssistantCapability}=require('./assistant-conversation')
const {safeText,presentMenuActions,conversationBlocksMenu}=require('./assistant-cards')
const {workspaceReference,matchesWorkspaceReference,normalizeContext}=require('./meal-workspace')
const {validateCounts,compositionRows}=require('./meal-composition')
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value))
const {presentWorkflow,buildRemainingTaskPrefill}=require('./assistant-workflow-presentation')
const {buildAssistantWaitingPresentation,buildAssistantFailurePresentation,buildAssistantWorkspaceFeedback,assistantNotice}=require('./assistant-presentation')
// Keep the existing page's handlers and lifecycle intact when the service is unavailable.
module.exports=function assistantPage(fallback, options={}) {
 return {...fallback,data:{...fallback.data,assistantConnected:false,conversationMenuExpanded:false,conversationCurrentMenuVisible:false,conversationSettingsScrollTarget:'',conversationSuggestions:[],conversationMenuCount:0,conversationCurrentMenu:null,conversationMessages:[],conversationInput:'',conversationError:'',conversationBusy:false,conversationRecoverable:false,keyboardHeight:0,conversationWaiting:{visible:false},conversationReducedMotion:false,conversationMealSettingsVisible:false,conversationMealSettingsDraft:null,conversationMealSettingsRows:[],conversationMealSettingsSaving:false,conversationMealSettingsPending:false,conversationMealSettingsError:'',conversationMealSettingsApplyDisabled:false},
  renderWorkspace(){
   if(fallback.renderWorkspace)fallback.renderWorkspace.call(this)
   if(!this.data.assistantConnected || !this.current())return
   this.refreshConversationMenus()
  },
  refreshConversationMenus(state=this.conversation&&this.conversation.state()) {
   if(!this.store || !this.current())return
   const local=this.store.state(),w=local.workspace,context=w&&w.context,dishes=w&&w.draft&&w.draft.dishes
   const feedback=this.data.actionFeedback
   const request=(state&&state.messages||[]).filter(message=>message.role==='user').slice(-1)[0]
   const requestKey=`${state&&state.sessionId||''}:${request&&request.id||''}`
   const feedbackKey=JSON.stringify([w&&w.id,feedback&&feedback.requestId,feedback&&feedback.state,feedback&&feedback.message])
   if(this._conversationFeedbackKey!==feedbackKey){this._conversationFeedbackKey=feedbackKey;this._conversationFeedbackRequest=requestKey}
   const workspaceFeedback=buildAssistantWorkspaceFeedback({error:this.data.errorMessage,feedback,busy:!!(state&&state.busy),stale:this._conversationFeedbackRequest!==requestKey})
   const settingsBinding=this._conversationMealSettingsBinding
   const settingsPending=!!(settingsBinding&&this.conversationMealSettingsCurrent()&&local.pending&&local.pending.type==='context'&&local.pending.body.requestId===settingsBinding.pendingRequestId&&local.syncStatus!=='saving')
   this.setData({conversationMealSettingsPending:settingsPending})
   let sourceOptions=null
   try{if(typeof wx!=='undefined'&&wx.getStorageSync){const version=wx.getStorageSync('recommendationOptionsCurrentVersion')||1;sourceOptions=wx.getStorageSync(`recommendationOptionsV${version}`)}}catch(error){/* Optional labels cannot block the current meal or actions. */}
   this.setData({conversationContextSummary:require('./assistant-presentation').buildAssistantContextSummary({workspace:{...w,context:local.context||context||this.data.context},preferencesSnapshot:this.data.preferencesSnapshot,preferencesState:this.data.preferencesState,options:sourceOptions})})
   const conversationState={...(state||{}),actionsEnabled:!!state&&this.data.conversationActionsEnabled!==false},workspaceState={...local,busy:!!(this.data.busy||this.data.conversationMealSettingsVisible)}
   const decorate=card=>({...card,menuActions:presentMenuActions({card,workspace:w,conversationState,workspaceState})})
   const live=context&&Array.isArray(dishes)&&dishes.length?decorate({id:'current-menu',type:'menu',title:'当前本餐菜单',workspaceRef:workspaceReference(w),data:{date:context.date,mealType:context.mealType,people:context.people,dishes,canUndo:false}}):null
   this.setData({conversationMenuCount:(dishes||[]).length,conversationSuggestions:require('./assistant-presentation').buildAssistantSuggestions({hasMenu:!!(dishes&&dishes.length),available:true}),conversationCurrentMenu:live,conversationMessages:(this.data.conversationMessages||[]).map(message=>({...message,text:message.role==='assistant'&&(message.cards||[]).some(card=>card.type==='menu')?String(message.text||'').replace(/[，,；;]\s*可以撤销最近一次修改[。]?/g,''):message.text,cards:(message.cards||[]).map(decorate)})),conversationWorkspaceRecoverable:!!local.pending||['conflict','offline'].includes(local.syncStatus),conversationWorkspaceRecoveryLabel:local.pending?'查看菜单更新结果':'查看最新本餐菜单',conversationWorkspaceBlocked:this.workspaceBlocksConversation(),conversationWorkspaceFeedback:workspaceFeedback})
  },
  async onLoad(params={}) {
   this._assistantAlive=true;this._assistantParams=params
   this.readConversationMotion()
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
  offerConversationInput(text, expectedRef=null, expectedTurnId=null) {
   const conversation=this.conversation,scope=this._scope
   if(!conversation || !this.current())return
   const state=conversation.state(),before=state.input || ''
   const blocked=s=>conversationBlocksMenu(s) || expectedTurnId&&(!s.turn||s.turn.turnId!==expectedTurnId||s.turn.status!=='partially_completed'||this.data.conversationActionsEnabled===false) || expectedRef && (this.workspaceBlocksConversation() || !matchesWorkspaceReference(expectedRef,this.store&&this.store.state().workspace,this.store&&this.store.state().context))
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
   const workflow=presentWorkflow(state)
   const failure=buildAssistantFailurePresentation({state})
   const messages=state.messages.filter(m=>!failure.suppressMessageIds.includes(m.id)).map(m=>({...m,text:safeText(m.text || m.content),workflow:turn&&m.turnId===turn.turnId?workflow.rows:(m.workflow||[]),cards:(m.cards || []).filter(card=>!(card.data&&card.data.executionMode==='direct')).map(card=>({...card,active:enabled&&!!turn&&m.turnId===turn.turnId&&currentCards.has(card.id)&&!state.selectionPending&&!state.confirmationPending&&(!card.taskId||turn.status==='awaiting_confirmation'&&turn.pendingAction&&turn.pendingAction.taskId===card.taskId&&turn.pendingAction.previewToken===card.previewToken)}))}))
   const recover=state.recoverable||workflow.primaryAction==='recover'
   this.setData({conversationWorkflow:workflow,conversationWorkflowAction:recover?'recover':workflow.primaryAction==='remaining'?'remaining':null,conversationWorkflowLabel:recover?(workflow.primaryAction==='recover'?workflow.primaryLabel:'继续查看结果'):workflow.primaryLabel})
   this.setData({conversationMessages:messages,conversationInput:state.input,conversationError:assistantNotice(failure.error),conversationCanSteer:state.canSteer,conversationBusy:state.busy,conversationRecoverable:state.recoverable,conversationCanStop:!state.cancelling&&(!!state.canSteer||!!turn&&['queued','running','awaiting_confirmation'].includes(turn.status)),conversationStopLabel:turn&&turn.status==='awaiting_confirmation'?'取消预览':'停止这次请求',conversationHasOlder:!!state.nextCursor,conversationProgressLabel:turn&&turn.status==='queued'?'正在排队…':'正在处理这次请求…'})
   this.updateConversationWaiting(state)
   this.refreshConversationMenus(state)
   const last=state.messages[state.messages.length-1],stamp=last?JSON.stringify([last.id,last.text||last.content,last.cards,turn&&turn.status]):''
   if(stamp!==this._conversationStamp){this._conversationStamp=stamp;if(this._conversationAtBottom!==false||this._conversationForceBottom)this.onConversationLatest();else this.setData({conversationScrollTarget:'',conversationHasNew:true})}
   this._conversationForceBottom=false
   clearTimeout(this._conversationTimer)
   if(this._assistantVisible!==false&&state.busy&&state.turn&&(['queued','running'].includes(state.turn.status)||(state.turn.cards||[]).some(c=>c.data&&c.data.executionMode==='direct')))this._conversationTimer=setTimeout(()=>{if(this._assistantAlive&&this.current()&&this.conversation)this.conversation.recover(state.turn.turnId)},1000)
   this.applyAssistantEntry()
  },
  async onShow() {
   if(this._assistantOrigin)require('./assistant-origin').refreshAssistantOrigin(this)
   this._assistantVisible=true
   this.readConversationMotion()
   if(!this.data.assistantConnected)return fallback.onShow && fallback.onShow.call(this)
   if(!this._assistantAlive || !this._scope)return
   if(!this.current()){
    this.clearConversationWaiting()
    if(this.conversation)this.conversation.dispose()
    this._conversationMealSettingsBinding=null
    this.setData({assistantConnected:false,conversationCurrentMenu:null,conversationMessages:[],conversationInput:'',conversationError:'',conversationBusy:false,conversationWaiting:{visible:false},conversationMealSettingsVisible:false,conversationMealSettingsDraft:null,conversationMealSettingsRows:[],conversationMealSettingsSaving:false,conversationMealSettingsPending:false,conversationMealSettingsError:''})
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
    if(this.refreshHardExclusions)await this.refreshHardExclusions()
    if(!this._assistantAlive||!this.current()||scope!==this._scope||activeConversation!==this.conversation)return
    this.refreshConversationMenus()
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
  readConversationMotion(){this.setData({conversationReducedMotion:require('./experience-preferences')().get().reducedMotion})},
  clearConversationWaiting(){
   const cancel=options.waitingTimers&&options.waitingTimers.clearTimeout||clearTimeout
   if(this._conversationWaitingTimer!=null)cancel(this._conversationWaitingTimer)
   this._conversationWaitingTimer=null
  },
  updateConversationWaiting(state){
   if(!this._assistantAlive||!this.current())return this.clearConversationWaiting()
   const first=buildAssistantWaitingPresentation({state}),key=`${first.requestKey}|${first.kind}`
   if(key!==this._conversationWaitingKey||this._conversationWaitingOwner!==this.conversation){
    this.clearConversationWaiting();this._conversationWaitingKey=key;this._conversationWaitingOwner=this.conversation;this._conversationWaitingFrame=0
   }
   const waiting=buildAssistantWaitingPresentation({state,frame:this._conversationWaitingFrame||0})
   this.setData({conversationWaiting:waiting})
   if(!this.conversation||this._assistantVisible===false||this.data.conversationReducedMotion||!waiting.visible||!waiting.animated||waiting.captions.length<2)return this.clearConversationWaiting()
   if(this._conversationWaitingTimer!=null)return
   const conversation=this.conversation,scope=this._scope,schedule=options.waitingTimers&&options.waitingTimers.setTimeout||setTimeout
   const timer=schedule(()=>{
    if(this._conversationWaitingTimer!==timer)return
    this._conversationWaitingTimer=null
    if(!this._assistantAlive||this._assistantVisible===false||!this.current()||conversation!==this.conversation||scope!==this._scope)return
    this._conversationWaitingFrame=(this._conversationWaitingFrame||0)+1
    this.updateConversationWaiting(conversation.state())
   },4800)
   this._conversationWaitingTimer=timer
  },
  onHide(){this._assistantVisible=false;clearTimeout(this._conversationTimer);this.clearConversationWaiting();if(fallback.onHide)fallback.onHide.call(this)},
  onUnload(){this._assistantAlive=false;clearTimeout(this._conversationTimer);this.clearConversationWaiting();if(this.conversation)this.conversation.dispose();if(fallback.onUnload)fallback.onUnload.call(this)},
  onToggleConversationMenu(){if(this.current()&&!this.data.conversationMealSettingsVisible)this.setData({conversationMenuExpanded:!this.data.conversationMenuExpanded,conversationSettingsScrollTarget:''},()=>this.measureConversation())},
  onConversationEditRequirements(){
   if(!this.current()||!this.store||!this.conversation||this.data.loading||this.data.contextLocked||this.data.conversationMealSettingsSaving||this.data.conversationActionsEnabled===false||this.workspaceBlocksConversation()||conversationBlocksMenu(this.conversation.state()))return
   const local=this.store.state(),context=local.context||local.workspace&&local.workspace.context
   if(!context||!workspaceReference(local.workspace))return
   this._conversationMealSettingsBinding={store:this.store,conversation:this.conversation,scope:this._scope,reference:workspaceReference(local.workspace),context:JSON.stringify(context)}
   this.setData({conversationSettingsScrollTarget:'',conversationMenuExpanded:true,conversationMealSettingsVisible:true,conversationMealSettingsDraft:clone(context),conversationMealSettingsSaving:false,conversationMealSettingsPending:false,conversationMealSettingsError:''},()=>this.measureConversation())
   this.renderConversationMealSettings()
  },
  conversationMealSettingsCurrent(){
   const binding=this._conversationMealSettingsBinding
   return !!binding&&this._assistantAlive&&this.current()&&this.data.conversationMealSettingsVisible&&binding.store===this.store&&binding.conversation===this.conversation&&binding.scope===this._scope
  },
  conversationMealSettingsEditable(){
   return this.conversationMealSettingsCurrent()&&!this.data.conversationMealSettingsSaving&&!this.data.contextLocked&&this.data.conversationActionsEnabled!==false&&!this.workspaceBlocksConversation()&&!conversationBlocksMenu(this.conversation.state())
  },
  renderConversationMealSettings(){
   const draft=this.data.conversationMealSettingsDraft
   if(!draft)return
   const people=Number(draft.people),validPeople=String(draft.people).trim()!==''&&Number.isInteger(people)&&people>=1&&people<=50
   const checked=validateCounts(draft.counts),rows=compositionRows(draft)
   const invalidCounts=rows.some(row=>!Number.isInteger(row.count)||row.count<0||row.count>10)
   const error=!validPeople?'人数应为 1 至 50 的整数':!checked.valid?checked.error:String(draft.requirements||'').length>2000?'本餐要求请控制在 2000 字以内':''
   this.setData({conversationMealSettingsRows:rows.map(row=>({...row,minusDisabled:!Number.isInteger(row.count)||row.count<=0,plusDisabled:invalidCounts||checked.total>=10||row.count>=10})),conversationMealSettingsApplyDisabled:!!error,conversationMealSettingsError:error})
  },
  onConversationMealPeopleInput(event){
   if(!this.conversationMealSettingsEditable())return
   const draft=clone(this.data.conversationMealSettingsDraft);draft.people=event.detail.value
   const people=Number(draft.people)
   if(String(draft.people).trim()&&Number.isInteger(people)&&people>=1&&people<=50){draft.people=people;if(draft.compositionMode==='auto')draft.counts=normalizeContext(draft).counts}
   this.setData({conversationMealSettingsDraft:draft});this.renderConversationMealSettings()
  },
  onConversationMealPeopleStep(event){
   if(!this.conversationMealSettingsEditable())return
   const delta=Number(event.currentTarget.dataset.delta),people=Number(this.data.conversationMealSettingsDraft.people)
   if(![1,-1].includes(delta)||!Number.isInteger(people)||people<1||people>50)return
   this.onConversationMealPeopleInput({detail:{value:String(Math.max(1,Math.min(50,people+delta)))}})
  },
  onConversationMealCountInput(event){
   if(!this.conversationMealSettingsEditable())return
   const draft=clone(this.data.conversationMealSettingsDraft),type=event.currentTarget.dataset.type
   if(!compositionRows(draft).some(row=>row.type===type))return
   const value=String(event.detail.value)
   draft.compositionMode='manual';draft.counts[type]=/^\d+$/.test(value)?Number(value):value
   this.setData({conversationMealSettingsDraft:draft});this.renderConversationMealSettings()
  },
  onConversationMealCountStep(event){
   if(!this.conversationMealSettingsEditable())return
   const {type}=event.currentTarget.dataset,delta=Number(event.currentTarget.dataset.delta),row=this.data.conversationMealSettingsRows.find(item=>item.type===type)
   if(!row||![1,-1].includes(delta)||(delta===1?row.plusDisabled:row.minusDisabled))return
   this.onConversationMealCountInput({currentTarget:{dataset:{type}},detail:{value:String(row.count+delta)}})
  },
  onConversationMealRequirementsInput(event){
   if(!this.conversationMealSettingsEditable())return
   this.setData({conversationMealSettingsDraft:{...this.data.conversationMealSettingsDraft,requirements:event.detail.value}})
   this.renderConversationMealSettings()
  },
  onConversationMealSettingsAuto(){
   if(!this.conversationMealSettingsEditable())return
   try{this.setData({conversationMealSettingsDraft:normalizeContext({...this.data.conversationMealSettingsDraft,compositionMode:'auto'})});this.renderConversationMealSettings()}
   catch(error){this.setData({conversationMealSettingsError:'请先填写 1 至 50 人'})}
  },
  onConversationMealSettingsCancel(){
   if(this.data.conversationMealSettingsSaving)return
   if(this.conversationMealSettingsCurrent()&&this.store.state().pending){
    this.setData({conversationMealSettingsError:'暂未收到保存结果，请先查看是否已保存'});return
   }
   this._conversationMealSettingsBinding=null
   this.setData({conversationMealSettingsVisible:false,conversationMealSettingsDraft:null,conversationMealSettingsRows:[],conversationMealSettingsPending:false,conversationMealSettingsError:'',conversationMealSettingsApplyDisabled:false},()=>this.measureConversation())
  },
  async onConversationMealSettingsApply(){
   if(!this.conversationMealSettingsEditable())return
   this.renderConversationMealSettings()
   if(this.data.conversationMealSettingsApplyDisabled)return
   const binding=this._conversationMealSettingsBinding,store=this.store,local=store.state()
   if(!matchesWorkspaceReference(binding.reference,local.workspace,local.context)||binding.context!==JSON.stringify(local.context)){
    this.setData({conversationMealSettingsError:'本餐已变化，请取消后重新打开设置'});return
   }
   const submitted=normalizeContext(this.data.conversationMealSettingsDraft)
   // A no-op should not invalidate the current menu or create a workspace write.
   if(JSON.stringify(submitted)===binding.context&&!local.dirty){this.onConversationMealSettingsCancel();return}
   clearTimeout(this._draftTimer)
   this.setData({conversationMealSettingsSaving:true,conversationMealSettingsError:''});this.setWorkspaceBusy(true)
   const owns=()=>this._assistantAlive&&this.current()&&this.store===store&&this._scope===binding.scope&&this.conversation===binding.conversation&&this._conversationMealSettingsBinding===binding
   try{
    const operation=store.saveContext(submitted),pending=store.state().pending
    binding.context=JSON.stringify(submitted);binding.submitted=clone(submitted);binding.pendingRequestId=pending&&pending.body.requestId
    this.renderWorkspace()
    await operation;if(!owns())return
    const saved=store.state()
    if(saved.pending||saved.dirty||saved.syncStatus!=='synced')throw Error('settings_not_synced')
    this.setData({conversationMealSettingsVisible:false,conversationMealSettingsDraft:null,conversationMealSettingsRows:[],conversationMealSettingsPending:false},()=>this.measureConversation())
    this._conversationMealSettingsBinding=null;this.renderWorkspace()
   }catch(error){
    if(owns()){
     this.renderWorkspace()
     const state=store.state()
     if(!state.pending&&JSON.stringify(state.context)===JSON.stringify(local.context))binding.context=JSON.stringify(local.context)
     this.setData({conversationMealSettingsError:state.pending?'暂未收到保存结果，请先查看是否已保存':state.syncStatus==='conflict'?'本餐已变化，请先查看最新内容':'设置暂未保存，修改已保留，可以重试'})
    }
   }finally{
    if(this._assistantAlive&&this.current()&&this.store===store&&this._scope===binding.scope&&this.conversation===binding.conversation&&(this._conversationMealSettingsBinding===binding||!this._conversationMealSettingsBinding)){
     this.setData({conversationMealSettingsSaving:false});this.setWorkspaceBusy(false)
    }
   }
  },
  onConversationPreferences(){if(this.current())wx.navigateTo({url:'/pages/settings/settings'})},
  onConversationCurrentMenu(){
   if(!this.current())return
   if(this.data.conversationMealSettingsVisible){this.setData({conversationError:'请先完成或取消本餐设置，再查看菜单'});return}
   this.refreshConversationMenus()
   if(!this.data.conversationCurrentMenu){this.setData({conversationError:'当前还没有菜单，请先安排这一餐'});return}
   this.setData({conversationMenuExpanded:false,conversationCurrentMenuVisible:true,conversationScrollTarget:''},()=>{
    this.measureConversation();this.setData({conversationScrollTarget:'conversation-current-menu'})
   })
  },
  workspaceBlocksConversation(){const local=this.store&&this.store.state();return !!(this.data.busy || this._directDishBinding || local&&(local.pending || ['saving','unknown','conflict'].includes(local.syncStatus) || local.workspace&&local.workspace.status==='generating'))},
  canRunReferencedCommand(expectedRef){
   const binding=this._directDishBinding
   return !!this.conversation && this.data.conversationActionsEnabled!==false && !conversationBlocksMenu(this.conversation.state()) && (!binding || binding.conversation===this.conversation&&binding.store===this.store&&binding.scope===this._scope) && matchesWorkspaceReference(expectedRef,this.store.state().workspace,this.store.state().context)
  },
  async onConversationDishAction(event){
   if(!this.current())return
   if(event.detail&&event.detail.action==='current')return this.onConversationCurrentMenu()
   if(event.detail&&['undo','adopt'].includes(event.detail.action))return this.onConversationMenuAction(event.detail)
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
   finally{if(this._directDishBinding===binding){this._directDishBinding=null;if(this.current()&&binding.store===this.store&&conversation===this.conversation){this.refreshConversationMenus();this.setData({conversationCurrentMenuVisible:true})}}}
  },
  async onConversationMenuAction(detail){
   if(!this.current()||!this.conversation||!this.store||this.workspaceBlocksConversation()||this.data.conversationMealSettingsVisible)return
   const {cardId,action,expectedRef}=detail,conversation=this.conversation,store=this.store,scope=this._scope
   const state=conversation.state(),local=store.state()
   const card=cardId==='current-menu'?this.data.conversationCurrentMenu:(state.messages||[]).flatMap(m=>m.cards||[]).find(c=>c.id===cardId)
   const menu=presentMenuActions({card,workspace:local.workspace,conversationState:{...state,actionsEnabled:this.data.conversationActionsEnabled!==false},workspaceState:local})
   if(!(action==='undo'?menu.canUndo:menu.canAdopt)||!matchesWorkspaceReference(expectedRef,local.workspace,local.context)){
    if(!menu.adopted)this.setData({conversationError:'菜单已变化，请查看最新菜单后再操作'})
    return
   }
   const binding={conversation,store,scope};this._directDishBinding=binding
   const owns=()=>this._assistantAlive&&this.current()&&store===this.store&&scope===this._scope&&conversation===this.conversation
   const valid=()=>owns()&&this.data.conversationActionsEnabled!==false&&!conversationBlocksMenu(conversation.state())&&
    matchesWorkspaceReference(expectedRef,store.state().workspace,store.state().context)&&!store.state().dirty&&!store.state().pending&&store.state().syncStatus==='synced'
   this.setData({conversationError:'',errorMessage:''})
   try{
    if(action==='undo')return await this.runCommand('undo',{},expectedRef)
    const snapshot=require('./meal-save-target').freezeSaveSnapshot(local,scope),target={date:expectedRef.date,mealType:expectedRef.mealType}
    this.setWorkspaceBusy(true)
    const result=await (options.api||require('./api')).getMealWorkspace(target.date,target.mealType)
    if(!valid())return
    if(!matchesWorkspaceReference(expectedRef,result.workspace,result.workspace&&result.workspace.context)){
     await store.reloadLatest();if(!owns())return
     this.renderWorkspace();throw Error('菜单已更新，请查看最新菜单后采用')
    }
    if(result.plan){
     const platform=options.platform||wx
     const approved=await new Promise(resolve=>platform.showModal({
      title:'替换这餐的日历安排？',content:`${target.date} ${require('./meal-workspace-presentation').contextPresentation(local.context).mealName}\n采用：${local.workspace.draft.dishes.map(d=>d.name).join('、')}`,
      confirmText:'采用',cancelText:'取消',success:r=>resolve(!!r.confirm),fail:()=>resolve(false)
     }))
     if(!approved||!valid())return
    }
    const saved=await store.confirm(result.planRevision||0,target,snapshot)
    if(!owns())return
    this.completeCalendarSave(saved)
    await this.readWorkspace(local.context)
   }catch(error){
    if(owns())this.setData({errorMessage:store.state().pending?'保存结果暂未收到，请继续查看结果':safeText(error.message)||'保存未完成，请稍后重试'})
   }finally{
    if(this._directDishBinding===binding)this._directDishBinding=null
    if(owns()){this.setWorkspaceBusy(false);this.refreshConversationMenus()}
   }
  },
  async onConversationWorkspaceRecover(){
   const conversationState=this.conversation&&this.conversation.state()
   // A terminal response waiting only for a workspace read is not another
   // mutation. Reconcile the original local request before that read.
   const syncOnly=conversationState&&conversationState.workspaceSyncPending&&!conversationBlocksMenu({...conversationState,recoverable:false})
   if(!this.current()||this.data.busy||!this.store||conversationBlocksMenu(conversationState)&&!syncOnly)return
   const local=this.store.state()
   if(local.pending){
    const binding=this._conversationMealSettingsBinding,requestId=local.pending.body.requestId
    await this.onRetryWorkspace()
    if(binding&&binding===this._conversationMealSettingsBinding&&this.conversationMealSettingsCurrent()&&binding.pendingRequestId===requestId){
     const latest=this.store.state()
     if(!latest.pending&&latest.syncStatus==='synced'&&!latest.dirty&&JSON.stringify(latest.context)===JSON.stringify(binding.submitted)){
      this._conversationMealSettingsBinding=null
      this.setData({conversationMealSettingsVisible:false,conversationMealSettingsDraft:null,conversationMealSettingsRows:[],conversationMealSettingsPending:false,conversationMealSettingsError:''},()=>this.measureConversation())
     }else if(!latest.pending){
      const restored=local.pending.rollbackContext&&JSON.stringify(latest.context)===JSON.stringify(local.pending.rollbackContext.context)
      if(restored)binding.context=JSON.stringify(latest.context)
      this.setData({conversationMealSettingsError:latest.syncStatus==='conflict'||!restored?'本餐已变化，请取消后重新打开设置':'设置暂未保存，修改已保留，可以重试'})
     }
    }
    return
   }
   if(!['conflict','offline'].includes(local.syncStatus)&&!(syncOnly&&local.dirty))return
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
  onConversationSend(){if(this.conversation&&!this.data.conversationMealSettingsVisible&&!this.workspaceBlocksConversation()&&(!this.data.conversationBusy||this.data.conversationCanSteer)&&this.data.conversationActionsEnabled!==false){this._conversationForceBottom=true;return this.conversation.send(this.data.conversationInput)}},
  async onConversationRecover(){
   if(!this.conversation)return this.openConnectedConversation()
   const conversation=this.conversation,store=this.store,scope=this._scope,state=conversation.state()
   if(store&&state.workspaceSyncPending&&!conversationBlocksMenu({...state,recoverable:false})){
    const local=store.state()
    if(local.pending||local.dirty){
     await this.onConversationWorkspaceRecover()
     if(!this.current()||conversation!==this.conversation||store!==this.store||scope!==this._scope)return
     if(store.state().pending||store.state().dirty)return
    }
   }
   return conversation.recover()
  },
  onConversationWorkflow(){
   if(!this.current()||!this.conversation||this.data.conversationActionsEnabled===false||this.workspaceBlocksConversation())return
   const state=this.conversation.state(),view=presentWorkflow(state)
   if(state.busy||state.recoverable||state.confirmationPending||state.selectionPending||view.primaryAction!=='remaining')return
   const text=buildRemainingTaskPrefill({turn:state.turn})
   if(text)this.offerConversationInput(text,null,state.turn.turnId)
  },
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
  measureConversation(){if(typeof wx==='undefined'||!wx.createSelectorQuery)return;wx.createSelectorQuery().in(this).select('.connected-messages').boundingClientRect(rect=>{if(this._assistantAlive&&rect)this._conversationViewportHeight=rect.height}).exec()},
  onConversationScroll(event){const h=this._conversationViewportHeight;this._conversationAtBottom=!!h&&event.detail.scrollHeight-event.detail.scrollTop-h<64;if(!this._conversationAtBottom)this.setData({conversationScrollTarget:''})},
  onConversationBottom(){this._conversationAtBottom=true;this.setData({conversationHasNew:false})},
  onConversationLatest(){this._conversationAtBottom=true;this.setData({conversationScrollTarget:'',conversationHasNew:false},()=>this.setData({conversationScrollTarget:'conversation-end'}))},
  onConversationSelection(event){if(this.conversation&&!this.workspaceBlocksConversation()&&!this.data.conversationBusy)return this.conversation.selectShopping(event.detail.id,event.detail.selectedSourceKeys)},
  onConversationRepreview(event){if(this.conversation&&!this.workspaceBlocksConversation()&&!this.data.conversationBusy)return this.conversation.selectShopping(event.detail.id)},
  async onConversationUndo(event){
   if(this.data.conversationBusy || !this.current() || !this.conversation || this.data.conversationActionsEnabled===false)return
   const turn=this.conversation.state().turn,card=turn && (turn.cards || []).find(c=>c.id===event.detail.id),w=this.store.state().workspace,ref=card && card.workspaceRef
   if(!card || card.type!=='menu' || !card.data || !card.data.canUndo || !w || !ref || ref.workspaceId!==w.id || ref.workspaceRevision!==w.revision || ref.planVersion!==w.draft.planVersion){this.setData({conversationError:'本餐已变化，请核对当前菜单后再撤销'});return}
   return this.onConversationMenuAction({cardId:card.id,action:'undo',expectedRef:{...ref,date:w.context.date,mealType:w.context.mealType}})
  },
  onConversationVoice(){wx.showModal({title:'语音输入',content:'抱歉，该功能暂不可用',showCancel:false})},
  onConversationSettingsFocus(event){
   const id=event.currentTarget.id
   if(!this.data.conversationMealSettingsVisible||!['conversation-settings-people','conversation-settings-requirements'].includes(id))return
   this._conversationSettingsFocus=id
  },
  onConversationKeyboard(event){
   const height=Math.max(0,Number(event.detail.height)||0)
   this.setData({keyboardHeight:height},()=>{
    this.measureConversation()
    if(height&&this.data.conversationMealSettingsVisible&&this._conversationSettingsFocus){
     const target=this._conversationSettingsFocus
     this.setData({conversationSettingsScrollTarget:''},()=>this.setData({conversationSettingsScrollTarget:target}))
    }
   })
  },
  onConversationHome(){if(this.current())return require('./assistant-origin').returnFromPage(this,{},true)},
  onConversationOlder(){return this.conversation && this.conversation.loadOlder && this.conversation.loadOlder()},
 }
}
