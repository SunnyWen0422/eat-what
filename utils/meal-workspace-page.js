const api = require('./api')
const theme = require('./ui-tokens')
const { validateCounts, compositionRows } = require('./meal-composition')
const experiencePreferences = require('./experience-preferences')
const { contextPresentation } = require('./meal-workspace-presentation')
const { getCurrentUserIdentity, getUserStorageKey } = require('./util')
const { createWorkspaceStore, defaultTarget, resolveActiveTarget, normalizeContext, requestId } = require('./meal-workspace')
const { freezeSaveSnapshot, matchesSaveSnapshot, hasUnfinishedSource, saveTargetView, validateMealTarget } = require('./meal-save-target')
const { deriveActionFeedback, legacyLockNotice, interactionCommand } = require('./meal-action-feedback')
const { beginShoppingSelection } = require('./shopping-list')
const clone = value => JSON.parse(JSON.stringify(value))
const MEALS = ['breakfast', 'lunch', 'dinner']
const LABELS = ['早餐', '午餐', '晚餐']

module.exports = function workspacePage(options = {}) {
  const initialContext = normalizeContext({ ...defaultTarget(), people:2 })
  const voice = require('./workspace-voice').createVoiceHandlers(api)
  const actual = require('./meal-actual-entry').createMealActualEntry({api,onSaved:async function(){await this.readWorkspace(this.data.context)}})
  return {
    openMealActual(target) { return actual.openMealActual.call(this,target) },
    onActualText(e) { return actual.onActualText.call(this,e) },
    onActualMode(e){return actual.onActualMode.call(this,e)},
    onConfirmActual(){return actual.onConfirmActual.call(this)},
    closeMealActual() { return actual.closeMealActual.call(this) },
    disposeMealActual() { return actual.disposeMealActual.call(this) },
    onActualByPlan() { return actual.onActualByPlan.call(this) },
    onActualChanged() { return actual.onActualChanged.call(this) },
    onActualSkipped() { return actual.onActualSkipped.call(this) },
    onActualRetry() { return actual.onActualRetry.call(this) },
    onActualReload() { return actual.onActualReload.call(this) },
    submitMealActual(...args) { return actual.submitMealActual.call(this,...args) },
    sendMealActual(...args) { return actual.sendMealActual.call(this,...args) },
    onQuickActual() {if(this.current()&&!this.data.busy){const plan=this.data.linkedPlan;return this.openMealActual({date:this.data.context.date,mealType:this.data.context.mealType,planRevision:plan&&plan.revision,displayedPlanNames:plan?(plan.dishDetails||[]).map(d=>d.name).join('、'):''})}},
    voiceCurrent(run) { return voice.voiceCurrent.call(this,run) },
    onVoiceTap() { return voice.onVoiceTap.call(this) },
    onVoicePrivacyAgree() { return voice.onVoicePrivacyAgree.call(this) },
    onVoicePrivacyOpen() { return voice.onVoicePrivacyOpen.call(this) },
    cancelVoiceInput() { return voice.cancelVoiceInput.call(this) },
    disposeControlledHarness() { if(this._harness)this._harness.dispose();this._harness=null },
    controlledHarness() {
      if(this._harness)return this._harness
      const scope=this._scope,store=this.store,date=this.data.context.date,mealType=this.data.context.mealType
      this._harness=require('./controlled-harness').createControlledHarness({api,identity:getCurrentUserIdentity,
        read:key=>wx.getStorageSync(key),write:(key,value)=>wx.setStorageSync(key,value),
        current:()=>this.current()&&scope===this._scope&&store===this.store&&date===this.data.context.date&&mealType===this.data.context.mealType,
        confirm:content=>new Promise(resolve=>wx.showModal({title:'保存计划并查看周回顾',content,
          confirmText:'确认保存',cancelText:'取消',success:result=>resolve(!!result.confirm),fail:()=>resolve(false)}))})
      return this._harness
    },
    showControlledState(state) {
      const target=state.target
      this.setData({harnessStatus:state.status,harnessMessage:state.message||'',harnessReport:state.report||null,
        harnessRetryable:!!state.retryable,harnessTarget:target||null,
        harnessTargetLabel:target?`${target.date} ${LABELS[MEALS.indexOf(target.mealType)]||''}`:''})
    },
    async onSaveAndReview() {
      if(!this.current()||this.data.busy||!this.data.canConfirm||!this.store)return
      return this.runControlledFlow(false)
    },
    async onRecoverControlledTask() {
      if(!this.current()||this.data.busy||!this.store)return
      return this.runControlledFlow(true)
    },
    async runControlledFlow(recover) {
      const store=this.store,harness=this.controlledHarness(),scope=this._scope,target={date:this.data.context.date,mealType:this.data.context.mealType}
      const current=()=>this.current()&&store===this.store&&scope===this._scope&&this._harness===harness
      this.setWorkspaceBusy(true)
      try {
        const result=recover?await harness.recover():await harness.run({...target,...require('./meal-workflow').weekRange(target.date)})
        if(!current()||result.status==='account_changed')return
        this.showControlledState(result)
        if(['completed','partial_failed'].includes(result.status))wx.setStorageSync(getUserStorageKey('needRefreshCalendar'),Date.now())
        await this.readWorkspace(this.data.context)
      } catch(error) {
        if(current())this.setData({harnessMessage:error.message||'操作结果待查询，请恢复原任务',harnessRetryable:true,harnessStatus:'unknown'})
      } finally { if(current())this.setWorkspaceBusy(false) }
    },
    onControlledReport() {
      if(!this.current()||!this.data.harnessReport||!this.data.harnessTarget)return
      wx.navigateTo({url:`/pages/statistics/statistics?period=week&anchor=${encodeURIComponent(this.data.harnessTarget.date)}`})
    },
    data: {
      actionFeedback:null,legacyLockNotice:'',moreVisible:false,harnessStatus:'idle',harnessMessage:'',harnessReport:null,harnessRetryable:false,harnessTarget:null,harnessTargetLabel:'',
      actualText:'',actualVisible:false,actualNeedsReload:false,actualBusy:false,
      conversationNotice:'',pageTitle:options.mode==='assistant'?'本餐对话':options.mode==='result'?'本餐方案':'今天', mealName:'当前餐', workspaceEnabled: true, requirementsVisible:false, requirementsDraft:'', requirementsSaving:false, voicePhase:'idle', voicePrivacyVisible:false, primaryLabel:'生成本餐菜单', primaryAction:'onGenerate', showRequirements:true, legacyMeals: [], theme, loading: true, busy: false, errorMessage: '', syncLabel: '', syncStatus: 'loading',
      peopleVisible:false,compositionVisible:false,compositionContext:null,compositionRows:[],compositionTotal:0,compositionHint:'',compositionSaving:false,compositionApplyDisabled:true,conditionsNotice:'',compositionPreferenceNotice:'',filterSummary:'',
      peopleInput:'2',peopleError:'',hardExclusionSummary:'正在读取长期忌口',hasHardExclusions:false,hardExclusionsUnavailable:false,advancedVisible:false,
      context: initialContext, ...contextPresentation(initialContext),
      draft: { dishes: [], lockedDishIds: [], history: [], planVersion: 0 }, status: 'empty', linkedPlan: null, actual: null,
      mealLabels: LABELS, mealIndex: 0, settingsVisible: false, settingsContext: null, countRows: [], ownedText: '', settingsError: '',
      confirmationVisible: false, confirmationTitle: '', confirmationLabel: '', confirmationText: '', canConfirm: false, taskMessage: '', mode: options.mode || 'today', fontBase: theme.font.body, fontScale: 1,
      saveTarget:null,saveMealIndex:0,saveDateLabel:'',saveDishSummary:'',savePeople:2,saveCrossDayNotice:'',saveError:'',saveTargetLoading:false,saveTargetLocked:false,saveRecoveryPending:false,saveNeedsReplacement:false,saveReplacementApproved:false,
      saveState:'unsaved',savedTarget:null,savedMessage:'',midnightNotice:'',
    },
    async onLoad(params = {}) {
      this._alive = true; this._params = params
      const app = getApp(); if (app.waitForLogin) await app.waitForLogin()
      if (!this._alive) return
      return this.initializeWorkspace(params)
    },
    async initializeWorkspace(params = {}) {
      this.disposeControlledHarness();this.setData({actionFeedback:null,legacyLockNotice:'',moreVisible:false,conversationNotice:'',harnessStatus:'idle',harnessMessage:'',harnessReport:null,harnessRetryable:false,harnessTarget:null,harnessTargetLabel:''})
      if(this.disposeMealActual)this.disposeMealActual();this.setData({actualVisible:false,actualBusy:false});if(this.cancelVoiceInput)this.cancelVoiceInput();this._requirementsBinding=null;this._requirementsOperation=null;this._compositionBinding=null;this.setData({peopleVisible:false,compositionVisible:false,compositionContext:null,compositionSaving:false,conditionsNotice:'',compositionPreferenceNotice:'',requirementsVisible:false,voicePhase:'idle',voicePrivacyVisible:false});
      this.stopTimers(); if (this.store) this.store.dispose(); this.store=null; this._draftSave=null;this._actionError=null; this._preservedContext=null;this._confirmation=null;this._exposed=null
      this._scope = getCurrentUserIdentity(); const initEpoch = this._initEpoch = (this._initEpoch || 0) + 1; const initScope = this._scope
      const savedTarget=wx.getStorageSync(getUserStorageKey('activeMealTarget'))
      const target = resolveActiveTarget(options.mode || 'today', params, savedTarget)
      // The existing account-scoped cache remains the source of truth. A new
      // natural day must not orphan an unfinished menu or unknown request.
      if((options.mode || 'today')==='today' && !params.date && savedTarget && savedTarget.date && MEALS.includes(savedTarget.mealType)) {
        const cached=wx.getStorageSync(`user:${this._scope}:meal-workspace:${savedTarget.date}:${savedTarget.mealType}`)
        if(hasUnfinishedSource(cached))Object.assign(target,{date:savedTarget.date,mealType:savedTarget.mealType})
      }
      const pendingPlan = wx.getStorageSync(getUserStorageKey('pendingRecipeRecord'))
      if (pendingPlan) { target.date = pendingPlan.date; target.mealType = pendingPlan.mealType }
      if (params.date) target.date = params.date
      if (MEALS.includes(params.mealType)) target.mealType = params.mealType
      // Keep following-Today handoffs current without committing explicit/history-import targets early.
      if ((options.mode || 'today') === 'today' && !params.date && !pendingPlan) {
        wx.setStorageSync(getUserStorageKey('activeMealTarget'), {...target,selectedOn:defaultTarget().date})
      }
      this.setData({loading:true,busy:false,errorMessage:'',syncLabel:'',feedbackNotice:'',legacyMeals:[],legacyNotice:'',conflictDraftAvailable:false,context:normalizeContext({...target,people:2}),draft:{dishes:[],history:[],lockedDishIds:[]},linkedPlan:null,actual:null,status:'empty',settingsContext:null,settingsVisible:false,confirmationVisible:false,canConfirm:false,saveTarget:null,saveError:'',saveTargetLoading:false,saveTargetLocked:false,saveRecoveryPending:false,saveState:'unsaved',savedTarget:null,savedMessage:'',midnightNotice:''})
      this.setData({...contextPresentation(this.data.context),peopleInput:'2',peopleError:'',hardExclusionSummary:'正在读取长期忌口',hasHardExclusions:false,hardExclusionsUnavailable:false,advancedVisible:false})
      let people = 2
      try {
        const result = await api.getUserPreferences()
        if (!this.current() || initEpoch !== this._initEpoch || initScope !== this._scope) return
        const saved = result && result.preferences || result || {}, savedPeople = Number(saved.defaultPeople)
        people = Number.isInteger(savedPeople) && savedPeople >= 1 && savedPeople <= 50 ? savedPeople : 2
        const version = wx.getStorageSync('recommendationOptionsCurrentVersion') || 1
        this.setData({hardExclusionSummary:require('./meal-workspace-presentation').hardExclusionSummary(saved,wx.getStorageSync(`recommendationOptionsV${version}`)),hasHardExclusions:!!((saved.excludedIngredients || []).length || (saved.excludedTagCodes || []).length),hardExclusionsUnavailable:false})
      }
      catch (error) { if (!this.current() || initEpoch !== this._initEpoch || initScope !== this._scope) return; this.setData({ syncLabel: '常用人数暂未读到，本餐默认两人', hardExclusionSummary:'长期忌口暂未读到，请到“我的”核对',hardExclusionsUnavailable:true }) }
      let fontScale = 1
      if (wx.getAppBaseInfo) { const info = wx.getAppBaseInfo(); fontScale = info.fontSizeScaleFactor || (info.fontSizeSetting ? info.fontSizeSetting / 16 : 1) }
      this.store = createWorkspaceStore()
      this.setData({ loading: true, busy: false, errorMessage: '', context: normalizeContext({ ...target, people }), draft: { dishes: [], history: [], lockedDishIds: [] }, linkedPlan: null, actual: null, settingsContext: null, settingsVisible: false, confirmationVisible: false, fontScale: Math.max(1, fontScale) })
      this._experiencePreferences = experiencePreferences()
      const remembered = this._experiencePreferences.get().compositionByMeal[target.mealType]
      await this.readWorkspace(target, { people, ...(remembered && remembered.mode === 'manual' ? { compositionMode:'manual', counts:remembered.counts } : {}) })
      if (!this.current() || initEpoch !== this._initEpoch || initScope !== this._scope) return
      if(options.mode==='assistant' && !params.import){this.onOpenRequirements()}
      if(params.import==='history') {
        const key=getUserStorageKey('pendingLegacyMealImport'),handoff=wx.getStorageSync(key),store=this.store
        if(handoff&&handoff.date===target.date&&handoff.mealType===target.mealType) {
          try {
            const session=await api.getAssistantSession(handoff.sessionId)
            if(!this.current()||initEpoch!==this._initEpoch||initScope!==this._scope||store!==this.store)return
            const meal=require('./legacy-meal-import').resolveHistoryMeal(session,handoff)
            const importedTarget={date:meal.date,mealType:meal.mealType}
            wx.setStorageSync(getUserStorageKey('activeMealTarget'),importedTarget);this._params=importedTarget
            wx.removeStorageSync(key);store.edit({...this.data.context,people:meal.people});this.renderWorkspace()
            await this.runCommand('select',{dishIds:meal.dishIds})
          } catch(error) {if(this.current()&&initEpoch===this._initEpoch&&store===this.store)this.setData({errorMessage:error.message||'导入未完成，当前方案仍保留'})}
        }
      }
      const selectionKey=getUserStorageKey('workspaceSelectedDishes')
      const selected = wx.getStorageSync(selectionKey)
      if (selected && selected.date === target.date && selected.mealType === target.mealType && this.current()) {
        const latest=this.store.state().workspace
        if(Object.prototype.hasOwnProperty.call(selected,'expectedWorkspaceId') && ((latest?latest.id:null)!==selected.expectedWorkspaceId || (latest?latest.revision:null)!==selected.expectedWorkspaceRevision)) {
          this.setData({errorMessage:'本餐已在另一处变化，请核对最新安排后重新加入菜品。原方案和选菜意图都已保留。'})
          return
        }
        const ids=selected.dishIds
        if(!Array.isArray(ids)||!ids.length||ids.length>10||ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length){this.setData({errorMessage:'选菜信息无效，请返回菜谱核对，原菜单仍保留'});return}
        const selection = { dishIds: ids }
        if (selected.menuId != null) {
          if (selected.menuDate !== target.date || selected.menuMealType !== target.mealType ||
              !Number.isInteger(selected.people) || selected.people < 1 || selected.people > 50) {
            this.setData({errorMessage:'菜单应用信息已失效，请返回菜单重新选择日期和餐次'})
            return
          }
          Object.assign(selection, {menuId:selected.menuId,menuVersion:selected.menuVersion,
            menuDate:selected.menuDate,menuMealType:selected.menuMealType})
          this.store.edit({...this.data.context,people:selected.people});this.renderWorkspace()
        }
        if(await this.runCommand('select', selection) && this.current() && selectionKey===getUserStorageKey('workspaceSelectedDishes') && JSON.stringify(wx.getStorageSync(selectionKey))===JSON.stringify(selected)) wx.removeStorageSync(selectionKey)
      }
      if(this.current() && params.save==='1')this.onConfirmPlan()
      if(this.current()&&api.previewControlledTask)this.showControlledState(this.controlledHarness().state())
    },
    async loadLegacyMeals() {
      const key=getUserStorageKey('assistantSessionId'),id=wx.getStorageSync(key),scope=this._scope
      if(!id || !api.getAssistantSession)return
      try {const session=await api.getAssistantSession(id);if(!this.current() || scope!==this._scope)return;this._legacySession=id;this.setData({legacyMeals:require('./legacy-meal-import').mealsFromSession(session)})}
      catch(error) {if(this.current() && scope===this._scope)this.setData({legacyNotice:'旧助手草稿暂未读到，可重新进入重试'})}
    },
    async onImportLegacyMeal(e) {
      if(!this.current() || this.data.busy)return
      const row=this.data.legacyMeals[Number(e.currentTarget.dataset.index)],scope=this._scope,id=this._legacySession
      if(!row || !id)return
      try {
        const latest=require('./legacy-meal-import').mealsFromSession(await api.getAssistantSession(id));if(!this.current() || scope!==this._scope)return
        const meal=latest.find(m=>m.date===row.date && m.mealType===row.mealType)
        if(!meal || meal.version!==row.version){this.setData({legacyMeals:latest,legacyNotice:'旧草稿已更新，请检查后再导入'});return}
        await this.switchTarget({date:meal.date,mealType:meal.mealType});if(!this.current() || scope!==this._scope)return
        this.store.edit({...this.data.context,people:meal.people});this.renderWorkspace();return this.runCommand('select',{dishIds:meal.dishIds})
      } catch(error) {if(this.current() && scope===this._scope)this.setData({errorMessage:error.message || '导入未完成，旧草稿仍保留'})}
    },
    current() { return this._alive && this._scope === getCurrentUserIdentity() },
    async onShow() {
      if (!this._scope) return
      if (!this.current()) return this.initializeWorkspace(this._params || {})
      const target = resolveActiveTarget(options.mode || 'today', this._params || {}, wx.getStorageSync(getUserStorageKey('activeMealTarget')))
      const state=this.store && this.store.state()
      const keepDraft=this.data.confirmationVisible || hasUnfinishedSource(state)
      if (target && (target.date !== this.data.context.date || target.mealType !== this.data.context.mealType)) {
        if(keepDraft && target.date!==this.data.context.date) this.setData({midnightNotice:`北京时间已跨日，当前菜单仍归属${this.data.context.date}。保存时可选择新的日期。`})
        else if(!this.data.confirmationVisible)return this.switchTarget(target,{followToday:options.mode!=='assistant'&&options.mode!=='result'&&!(this._params||{}).date})
      }
      // A save preview is a frozen source. Foreground refresh must not replace it.
      if(this.data.confirmationVisible || state && state.pending){this.renderWorkspace();return}
      const filterKey=getUserStorageKey('pendingRecommendationCriteria'), filter=wx.getStorageSync(filterKey)
      if(filter && this.store) {wx.removeStorageSync(filterKey);this.store.edit({...this.data.context,criteria:filter});this.renderWorkspace();this.scheduleDraftSave()}
      if (!this.data.busy) { await this.readWorkspace(this.data.context); await this.refreshHardExclusions() }
    },
    async refreshHardExclusions() {
      const scope=this._scope,store=this.store,epoch=this._initEpoch
      const ticket=this._exclusionRefreshTicket=(this._exclusionRefreshTicket || 0)+1
      const owns=()=>this.current() && scope===this._scope && store===this.store && epoch===this._initEpoch && ticket===this._exclusionRefreshTicket
      try {
        const result=await api.getUserPreferences()
        if(!owns())return
        const saved=result && result.preferences || result || {},version=wx.getStorageSync('recommendationOptionsCurrentVersion') || 1
        this.setData({hardExclusionSummary:require('./meal-workspace-presentation').hardExclusionSummary(saved,wx.getStorageSync(`recommendationOptionsV${version}`)),hasHardExclusions:!!((saved.excludedIngredients || []).length || (saved.excludedTagCodes || []).length),hardExclusionsUnavailable:false})
      } catch(error) {if(owns())this.setData({hardExclusionSummary:'长期忌口暂未读到，请到“我的”核对',hardExclusionsUnavailable:true})}
    },
    onHide() { this.cancelVoiceInput(); clearTimeout(this._pollTimer); clearTimeout(this._draftTimer) },
    onUnload() { this.disposeControlledHarness();this.disposeMealActual();this.cancelVoiceInput(); this._alive = false; this.stopTimers(); if (this.store) this.store.dispose() },
    stopTimers() { clearTimeout(this._exposureTimer); clearTimeout(this._pollTimer); clearTimeout(this._draftTimer) },
    async readWorkspace(target = this.data.context, defaults = {}) {
      if (!this.store || !this.current()) return
      const store = this.store
      try { const result=await store.load(target.date, target.mealType, defaults); if (result && result.superseded || !this.current() || store !== this.store) return; this.setData({ errorMessage: '' }) }
      catch (error) { if(error.superseded)return; if (this.current() && store === this.store) this.setData({ errorMessage: error.message || '本餐暂未同步，可重试' }) }
      if (this.current() && store === this.store) { this.renderWorkspace(); this.setData({ loading: false }); this.pollTask() }
    },
    setWorkspaceBusy(busy) {
      this.setData({ busy })
      this.renderWorkspace()
    },
    renderWorkspace() {
      if (!this.current()) return
      const state = this.store.state(), w = state.workspace
      const labels = { synced: '已同步', unsynced: '本机修改尚未同步', saving: '正在同步', unknown: '上次保存结果待确认', offline: '离线内容，仅供查看；恢复后请重试', conflict: '本餐已在另一处更新，请查看最新内容' }
      const draft = w && w.draft || { dishes: [], history: [], lockedDishIds: [], planVersion: 0 }
      const confirmation=w && w.confirmation,source=state.context || this.data.context
      const savedTarget=confirmation && confirmation.date && confirmation.mealType ? {date:confirmation.date,mealType:confirmation.mealType} : null
      const saveState=confirmation ? confirmation.planVersion===draft.planVersion && !state.dirty && w.status!=='needs_regeneration' ? 'saved' : 'changed' : 'unsaved'
      const savedView=savedTarget ? saveTargetView({sourceTarget:source},savedTarget) : null
      const action=state.lastAction
      const actionFeedback=action ? deriveActionFeedback({before:action.before,after:{...state,actionReceipt:action.receipt,actionTask:action.task},command:action.command,requestId:action.command.requestId,pending:this.data.busy,error:this._actionError}) : null
      const rowBusy=actionFeedback && actionFeedback.state==='pending' && action.command.command==='replace' ? action.command.dishId : null
      this.setData({actionFeedback,legacyLockNotice:legacyLockNotice(draft)})
      this.setData({ context: state.context || this.data.context, draft: { ...draft, dishes: (draft.dishes || []).map(d => ({ ...d, locked: (draft.lockedDishIds || []).includes(d.id), actionBusy:d.id===rowBusy, actionMessage:actionFeedback && actionFeedback.state==='success' && actionFeedback.dishId===d.id ? actionFeedback.message : '' })) },
        status: w && w.status==='planned' && confirmation && (!savedTarget || savedTarget.date===source.date && savedTarget.mealType===source.mealType) && confirmation.planRevision!==state.linked.planRevision ? 'plan_changed' : w && w.status || 'empty', mealIndex: MEALS.indexOf((state.context || this.data.context).mealType), syncStatus: state.syncStatus, syncLabel: labels[state.syncStatus] || '',
        linkedPlan: state.linked.plan || null, actual: state.linked.actual || null, taskMessage: w && w.message || '', suggestedTarget: w && w.suggestedTarget || null, suggestedMealLabel: w && w.suggestedTarget ? LABELS[MEALS.indexOf(w.suggestedTarget.mealType)] : '',
        canConfirm: !!w && ['draft', 'planned'].includes(w.status) && !!draft.dishes.length && !state.dirty && !state.pending && state.syncStatus === 'synced',
        saveState,savedTarget,savedMessage:savedView ? `已保存到${savedView.label}` : '',saveTargetLocked:!!this.data.busy || !!state.pending,saveRecoveryPending:!!state.pending && state.pending.type==='confirm' })
      const context=this.data.context
      if(!this.data.peopleError)this.setData({peopleInput:String(context.people)})
      this.setData({todayDate:defaultTarget().date,pageTitle:this.data.mode==='assistant'?'本餐对话':this.data.mode==='result'?'本餐方案':'今天',mealName:LABELS[MEALS.indexOf(context.mealType)] || '当前餐',
        mealViewKey:`${this._scope}:${context.date}:${context.mealType}:${draft.planVersion || 0}`,
        ...contextPresentation(context),
        conditionsNotice:w && w.status === 'needs_regeneration' ? '条件已更新' : ''})
      this.setData(require('./meal-workspace-presentation').deriveWorkspacePresentation({...this.data, busy:this.data.busy}));
      if(state.pending && state.pending.type==='confirm' && !this._confirmation)this.restoreSavePreview(state)
      if (w && w.status === 'draft' && state.syncStatus === 'synced') this.expose(w)
    },
    expose(w) {
      const key = `${this._scope}:${w.id}:${w.draft.planVersion}`
      if (this._exposed === key) return
      this._exposed=key; const scope=this._scope
      const body={requestId:`exposed-${w.id}-${w.draft.planVersion}`,workspaceId:w.id,expectedWorkspaceRevision:w.revision,planVersion:w.draft.planVersion,eventType:'exposed'}
      const send=attempt=>api.recordBehaviorEvent(body).catch(error=>{
        if(!this.current() || scope!==this._scope || this._exposed!==key)return
        console.warn('workspace_exposure_failed',error.statusCode || 'network')
        if(attempt<2 && (!error.statusCode || error.statusCode>=500))this._exposureTimer=setTimeout(()=>send(attempt+1),attempt?10000:2000)
      })
      send(0)
    },
    onPrimaryAction() {
      if(this.data.primaryDisabled || this.data.loading)return
      const allowed=['onGenerate','onRetryWorkspace','onLoadLatest','onCancelTask','onViewPlan','onViewRecipes','onViewSavedMeal','onConfirmPlan','onOpenRequirements','onRegenerate','onOpenComposition']
      if(allowed.includes(this.data.primaryAction))return this[this.data.primaryAction]()
    },
    onOpenRequirements() {
      if(!this.current() || this.data.busy || this.data.contextLocked)return
      const w=this.store && this.store.state().workspace
      this._requirementsBinding={scope:this._scope,store:this.store,date:this.data.context.date,meal:this.data.context.mealType,id:w && w.id}
      this.onCloseComposition();this.onClosePeople();this.onCloseMealSettings();
      this.setData({requirementsVisible:true,requirementsDraft:this.data.context.requirements || '',requirementsSaving:false,errorMessage:''})
    },
    async onContinueMealConversation() {
      if(!this.current() || this.data.contextLocked || this.data.requirementsSaving)return
      const store=this.store,scope=this._scope,epoch=this._initEpoch,binding=this._requirementsBinding,date=this.data.context.date,meal=this.data.context.mealType
      if(!binding)return
      const applied=await this.onApplyRequirements()
      if(!applied || applied.binding!==binding || this._requirementsOperation!==applied || !this.current() || this.store!==store || this._scope!==scope || this._initEpoch!==epoch || this.data.context.date!==date || this.data.context.mealType!==meal || this.data.requirementsVisible)return
      const state=store.state()
      if(state.syncStatus!=='synced' || state.pending || state.dirty || this.data.context.requirements!==applied.submitted)return
      if(this.data.mode==='assistant'){this.setData({conversationNotice:'已应用本餐要求，点击生成或换一套继续安排。'});return}
      return this.onOpenAssistantView()
    },
    onRequirementsDraftInput(e) {this.setData({requirementsDraft:e.detail.value})},
    onClearRequirements() {if(!this.data.requirementsSaving)this.setData({requirementsDraft:''})},
    onCancelRequirements() {this.cancelVoiceInput();this.setData({requirementsVisible:false,requirementsDraft:this.data.context.requirements || '',requirementsSaving:false});this._requirementsBinding=null;this._requirementsOperation=null},
    async onApplyRequirements() {
      const binding=this._requirementsBinding,store=this.store,w=store && store.state().workspace
      if(!binding || this.data.contextLocked || this.data.requirementsSaving || !this.current() || binding.store!==store || binding.scope!==this._scope || binding.date!==this.data.context.date || binding.meal!==this.data.context.mealType || binding.id!=null && binding.id!==(w && w.id))return
      const submitted=this.data.requirementsDraft,operation={binding,submitted};this._requirementsOperation=operation
      this.cancelVoiceInput();this.store.edit({...this.data.context,requirements:submitted});this.setData({requirementsSaving:true});this.renderWorkspace()
      const ownsSheet=()=>this.current() && this.store===store && this._requirementsOperation===operation && this._requirementsBinding===binding && binding.scope===this._scope && binding.date===this.data.context.date && binding.meal===this.data.context.mealType
      try {await this.flushDraft();if(!ownsSheet())return;if(this.data.requirementsDraft!==submitted){this.setData({errorMessage:'先前的内容已保存，新输入仍保留，请再次应用'});this.renderWorkspace();return}this.setData({requirementsVisible:false});this._requirementsBinding=null;this.renderWorkspace();return operation}
      catch(error){if(ownsSheet()){this.renderWorkspace();this.setData({errorMessage:error.message || '文字已保留，请重试同步'})}}
      finally{if(ownsSheet() || this._requirementsOperation===operation && this._requirementsBinding===null && this.store===store && this.current())this.setData({requirementsSaving:false})}
    },
    async pollTask() {
      clearTimeout(this._pollTimer)
      if (!this.current() || !this.store || this.store.state().pending) return
      const w = this.store.state().workspace
      if (!w || w.status !== 'generating') return
      const taskId = w.taskId, scope = this._scope, store = this.store
      this._pollTimer = setTimeout(async () => {
        if (!this.current() || scope !== this._scope || store !== this.store) return
        try { const task = await api.getWorkspaceTask(w.id, taskId); if (!this.current() || store !== this.store) return
          if (['queued', 'running'].includes(task.status)) this.pollTask()
          else await this.readWorkspace(this.data.context)
        } catch (error) { if (this.current() && store === this.store) this.setData({ errorMessage: '任务状态暂未读到，重试会恢复当前餐' }) }
      }, 750)
    },
    onRequirementInput(e) {
      if (!this.store || !this.current()) return
      this.store.edit({ ...this.data.context, requirements: e.detail.value }); this.renderWorkspace()
      this.scheduleDraftSave()
    },
    scheduleDraftSave() {
      clearTimeout(this._draftTimer); const store = this.store
      this._draftTimer = setTimeout(async () => {
        if (!this.current() || store !== this.store || ['offline', 'unknown', 'conflict'].includes(store.state().syncStatus)) return
        try { await this.flushDraft(); if (this.current() && store === this.store) { this.renderWorkspace(); if (store.state().dirty) this.scheduleDraftSave() } }
        catch (error) { if (this.current() && store === this.store) { this.renderWorkspace(); this.setData({ errorMessage: error.message || '输入已保留，请重试同步' }) } }
      }, 500)
    },
    async flushDraft() {
      const store=this.store
      if(this._draftSave) await this._draftSave
      if(!this.current() || store!==this.store)return
      const operation=store.save();this._draftSave=operation
      try {await operation} finally {if(this._draftSave===operation)this._draftSave=null}
    },
    async runCommand(command, extra = {}) {
      if (this.data.busy || !this.store || !this.current()) return
      if(this.store.state().pending || this.data.syncStatus==='conflict' || this.data.status==='generating' && command!=='cancel')return
      if(this.data.peopleError && ['generate','regenerate','select'].includes(command))return
      if (getCurrentUserIdentity() === 'guest') return this.onLogin()
      clearTimeout(this._draftTimer); const store = this.store
      this._actionError=null;this.setData({ errorMessage: '' }); this.setWorkspaceBusy(true)
      try { await this.flushDraft(); if(!this.current() || store!==this.store)return false; const operation=store.command(command, interactionCommand(command,extra));this.renderWorkspace();await operation; if (this.current() && store === this.store) { this.renderWorkspace(); this.pollTask(); return true } }
      catch (error) { if (this.current() && store === this.store) { this._actionError=error;this.renderWorkspace(); this.setData({ errorMessage: error.message || '安排未完成，输入和原方案已保留' }) } }
      finally { if (this.current() && store === this.store) this.setWorkspaceBusy(false) }
    },
    async onSuggestedTarget() {
      if(!this.current() || !this.data.suggestedTarget || this.data.busy)return
      const requirements=this.data.context.requirements,target=this.data.suggestedTarget,scope=this._scope
      await this.switchTarget(target)
      if(!this.current() || scope!==this._scope)return
      this.store.edit({...this.data.context,requirements});this.renderWorkspace();return this.runCommand('generate')
    },
    onGenerate() { if(!this.data.peopleError)return this.runCommand('generate') },
    onRegenerate() { return this.runCommand('regenerate') },
    onUndo(e) {
      if(e && e.detail && e.detail.requestId && (!this.data.actionFeedback || this.data.actionFeedback.requestId!==e.detail.requestId || !this.data.actionFeedback.undoAvailable))return
      return this.runCommand('undo')
    },
    onCancelTask() { return this.runCommand('cancel') },
    onReplace(e) { return this.runCommand('replace', { dishId: Number(e.detail && e.detail.id || e.currentTarget.dataset.id) }) },
    onKeep(e) { return this.runCommand(e.currentTarget.dataset.locked ? 'release' : 'keep', { dishId: Number(e.currentTarget.dataset.id) }) },
    onConfirmPlan() {
      if (!this.data.canConfirm || this.data.peopleError || this.data.busy || !this.current()) return
      const state = this.store.state()
      try {
        const snapshot=freezeSaveSnapshot(state,this._scope)
        this._confirmation={scope:this._scope,store:this.store,snapshot,target:{...snapshot.sourceTarget},planRevision:state.linked.planRevision || 0,plan:state.linked.plan || null}
        this.setData({confirmationVisible:true,saveTarget:{...snapshot.sourceTarget},saveDishSummary:this.data.draft.dishes.map(d=>d.name).join('、'),saveError:'',saveTargetLoading:false,saveReplacementApproved:false})
        this.renderSaveTarget()
      } catch(error) {this.setData({errorMessage:error.message})}
    },
    savePanelCurrent(capture=this._confirmation) {return !!capture && this.data.confirmationVisible && this.current() && capture.scope===this._scope && capture.store===this.store && capture===this._confirmation},
    restoreSavePreview(state) {
      const pending=state.pending,w=state.workspace,body=pending.body
      if(!w || w.id!==pending.id || w.revision!==body.expectedWorkspaceRevision || w.draft.planVersion!==body.planVersion)return
      try {
        const snapshot=freezeSaveSnapshot({...state,context:w.context,dirty:false,pending:null,syncStatus:'synced'},this._scope)
        const target=validateMealTarget({date:body.targetDate || snapshot.sourceTarget.date,mealType:body.targetMealType || snapshot.sourceTarget.mealType})
        this._confirmation={scope:this._scope,store:this.store,snapshot,target,planRevision:body.expectedPlanRevision,plan:null}
        this.setData({confirmationVisible:true,saveDishSummary:w.draft.dishes.map(d=>d.name).join('、'),saveReplacementApproved:false,saveError:'上次保存结果待确认，请查询并重试原保存',saveTargetLoading:false,saveTargetLocked:true})
        this.renderSaveTarget()
      } catch(error) {this.setData({errorMessage:error.message || '原保存信息暂未恢复，请重试原请求'})}
    },
    renderSaveTarget() {
      const capture=this._confirmation
      if(!this.savePanelCurrent(capture))return
      const view=saveTargetView(capture.snapshot,capture.target),plan=capture.plan
      this.setData({saveTarget:{...capture.target},savePeople:capture.snapshot.people,saveMealIndex:MEALS.indexOf(capture.target.mealType),saveDateLabel:view.label,saveCrossDayNotice:view.crossDayNotice,saveNeedsReplacement:!!plan,
        confirmationTitle:'保存到日历',confirmationLabel:plan ? this.data.saveReplacementApproved ? '确认替换' : '继续，核对替换' : '保存到日历',
        confirmationText:plan ? `原安排：${plan.recipeName || (plan.dishDetails || []).map(d=>d.name).join('、')}\n本餐菜单：${this.data.saveDishSummary}\n替换后只更新计划，不记录实际吃过。` : '仅保存计划，不记录吃过。'})
    },
    onCloseConfirmation() { if (!this.data.busy) {this._confirmation=null;this.setData({ confirmationVisible:false,saveTargetLoading:false,saveError:'' })} },
    onSaveTargetDate(e) {return this.changeSaveTarget({date:e.detail.value,mealType:this.data.saveTarget && this.data.saveTarget.mealType})},
    onSaveTargetMeal(e) {return this.changeSaveTarget({date:this.data.saveTarget && this.data.saveTarget.date,mealType:MEALS[Number(e.detail.value)]})},
    async changeSaveTarget(target) {
      const capture=this._confirmation
      if(!this.savePanelCurrent(capture) || this.data.saveTargetLocked)return
      try {capture.target=validateMealTarget(target)} catch(error) {this.setData({saveError:error.message});return}
      capture.plan=null;capture.planRevision=null;this.setData({saveError:'',saveReplacementApproved:false});this.renderSaveTarget()
      return this.readSaveTarget(capture)
    },
    async readSaveTarget(capture=this._confirmation) {
      if(!this.savePanelCurrent(capture))return
      const ticket=capture.readTicket=(capture.readTicket || 0)+1,target={...capture.target}
      this.setData({saveTargetLoading:true,saveError:''})
      try {
        const result=await api.getMealWorkspace(target.date,target.mealType)
        if(!this.savePanelCurrent(capture) || ticket!==capture.readTicket)return
        capture.plan=result.plan || null;capture.planRevision=result.planRevision || 0
        this.setData({saveReplacementApproved:false});this.renderSaveTarget()
      } catch(error) {if(this.savePanelCurrent(capture) && ticket===capture.readTicket){capture.planRevision=null;this.setData({saveError:error.message || '目标安排暂未读到，请重新核对'})}}
      finally {if(this.savePanelCurrent(capture) && ticket===capture.readTicket)this.setData({saveTargetLoading:false})}
    },
    async onRefreshSaveTarget() {
      const capture=this._confirmation
      if(!this.savePanelCurrent(capture) || this.data.busy || this.store.state().pending)return
      this.setData({saveTargetLoading:true,saveError:''})
      try {
        const source=capture.snapshot.sourceTarget,result=await api.getMealWorkspace(source.date,source.mealType)
        if(!this.savePanelCurrent(capture))return
        this.store.revalidateConfirmation(capture.snapshot,result.workspace);this.renderWorkspace()
        await this.readSaveTarget(capture)
      } catch(error) {if(this.savePanelCurrent(capture))this.setData({saveError:error.message || '原菜单暂未核对，请保留当前面板'})}
      finally {if(this.savePanelCurrent(capture))this.setData({saveTargetLoading:false})}
    },
    onApproveReplacement() {
      const capture = this._confirmation, state = this.store && this.store.state()
      if (!this.savePanelCurrent(capture) || this.data.busy || this.data.saveTargetLoading || this.data.saveTargetLocked || this.data.saveError || this.data.peopleError || capture.planRevision==null) return
      if(!matchesSaveSnapshot(capture.snapshot,state,this._scope)){this.setData({saveError:'菜单或方案已变化，请重新打开面板核对'});return}
      if(capture.plan && !this.data.saveReplacementApproved){this.setData({saveReplacementApproved:true});this.renderSaveTarget();return}
      return this.saveConfirmation(capture.planRevision,capture.target,capture.snapshot)
    },
    completeCalendarSave(result,request) {
      const w=result && result.workspace,receipt=w && w.confirmation
      if(!receipt || request && (receipt.requestId!==request.requestId || receipt.planVersion!==request.planVersion))return false
      if(request && (receipt.date!==(request.targetDate || this.data.context.date) || receipt.mealType!==(request.targetMealType || this.data.context.mealType)))return false
      this._confirmation=null;this.setData({confirmationVisible:false,saveTargetLoading:false,saveError:''})
      wx.removeStorageSync(getUserStorageKey('pendingRecipeRecord'));wx.setStorageSync(getUserStorageKey('needRefreshCalendar'),Date.now());return true
    },
    async saveConfirmation(revision,target,snapshot) {
      if (this.data.busy || !this.current()) return
      const store = this.store; this.setData({ errorMessage: '' }); this.setWorkspaceBusy(true)
      try { const result=await store.confirm(revision,target,snapshot); if (this.current() && store === this.store) {
        this.completeCalendarSave(result); await this.readWorkspace(this.data.context)
      } } catch (error) { if (this.current() && store === this.store) {this.renderWorkspace();this.setData({saveError:error.message || '保存结果待确认，请重试原请求',errorMessage:error.message || '保存结果待确认，请重试原请求',saveReplacementApproved:false})} }
      finally { if (this.current() && store === this.store) this.setWorkspaceBusy(false) }
    },
    async onRetryWorkspace() {
      if (!this.store || this.data.busy || !this.current()) return
      const store = this.store,pending=store.state().pending; this.setWorkspaceBusy(true)
      try { this._actionError=null;const result=await store.retry(); if (this.current() && store === this.store) {if(pending && pending.type==='confirm')this.completeCalendarSave(result,pending.body);this.setData({ errorMessage: '' }); await this.readWorkspace(this.data.context) } }
      catch (error) { if (this.current() && store === this.store) { this.renderWorkspace(); this.setData({ errorMessage: error.message || '重试未完成，输入仍保留' }) } }
      finally { if (this.current() && store === this.store) this.setWorkspaceBusy(false) }
    },
    async onLoadLatest() {
      if (!this.current() || this.data.busy) return
      const store = this.store, localContext = clone(this.data.context)
      this.setWorkspaceBusy(true); this._preservedContext = localContext
      try { await store.reloadLatest(); if (this.current() && store === this.store) { this.renderWorkspace(); this.setData({ errorMessage: '', conflictDraftAvailable: true }) } }
      catch (error) { if (this.current() && store === this.store) this.setData({ errorMessage: error.message }) }
      finally { if (this.current() && store === this.store) this.setWorkspaceBusy(false) }
    },
    onRestoreLocalDraft() { if (this.current() && this._preservedContext) { this.store.edit(this._preservedContext); this.renderWorkspace(); this.setData({ conflictDraftAvailable: false }); this.scheduleDraftSave() } },
    onOpenPeople() {
      if(!this.current() || !this.store || this.data.loading || this.data.contextLocked || this.data.busy || this.data.requirementsSaving)return
      this.onCancelRequirements();this.onCloseComposition();this.onCloseMealSettings();
      this.setData({peopleVisible:true})
    },
    onClosePeople() { if(!this.data.busy)this.setData({peopleVisible:false}) },
    onOpenComposition() {
      if(!this.current() || !this.store || this.data.loading || this.data.contextLocked || this.data.busy || this.data.requirementsSaving)return
      this.onCancelRequirements();this.onClosePeople();this.onCloseMealSettings();this.onCloseConfirmation()
      const w=this.store.state().workspace
      this._compositionBinding={scope:this._scope,store:this.store,date:this.data.context.date,meal:this.data.context.mealType,id:w && w.id}
      this.setData({compositionVisible:true,compositionContext:clone(this.data.context),compositionSaving:false,errorMessage:''})
      this.renderComposition()
    },
    onCloseComposition() {
      if(this.data.compositionSaving)return
      this._compositionBinding=null;this.setData({compositionVisible:false,compositionContext:null})
    },
    compositionCurrent() {
      const b=this._compositionBinding,w=this.store && this.store.state().workspace
      return !!b && this.current() && b.store===this.store && b.scope===this._scope && b.date===this.data.context.date && b.meal===this.data.context.mealType && (b.id==null || b.id===(w && w.id))
    },
    renderComposition() {
      const c=this.data.compositionContext
      if(!c)return
      const checked=validateCounts(c.counts),rows=compositionRows(c)
      const invalidCategory=rows.some(row=>!Number.isInteger(row.count) || row.count<0 || row.count>10)
      this.setData({compositionRows:rows.map(row=>({...row,minusDisabled:!Number.isInteger(row.count) || row.count<=0,plusDisabled:invalidCategory || checked.total>=10 || row.count>=10})),
        compositionTotal:checked.total,compositionHint:checked.error,compositionApplyDisabled:!checked.valid,
        compositionDraftModeLabel:c.compositionMode==='manual'?'手动搭配':'按人数自动搭配'})
    },
    onCompositionInput(e) {
      if(!this.compositionCurrent() || this.data.contextLocked || this.data.compositionSaving)return
      const type=e.currentTarget.dataset.type,c=clone(this.data.compositionContext)
      if(!compositionRows(c).some(row=>row.type===type))return
      const value=String(e.detail.value)
      c.compositionMode='manual';c.counts[type]=/^\d+$/.test(value)?Number(value):value
      this.setData({compositionContext:c});this.renderComposition()
    },
    onCompositionStep(e) {
      if(!this.compositionCurrent() || this.data.contextLocked || this.data.compositionSaving)return
      const {type}=e.currentTarget.dataset,delta=Number(e.currentTarget.dataset.delta)
      const row=this.data.compositionRows.find(item=>item.type===type)
      if(!row || ![1,-1].includes(delta) || (delta===1?row.plusDisabled:row.minusDisabled))return
      return this.onCompositionInput({currentTarget:{dataset:{type}},detail:{value:String(row.count+delta)}})
    },
    onCompositionPreset(e) {
      if(!this.compositionCurrent() || this.data.contextLocked || this.data.compositionSaving)return
      const presets={'one-meat-two-veg':{meat:1,veg:2},'two-meat-one-veg':{meat:2,veg:1},'one-meat-one-veg-soup':{meat:1,veg:1,soup:1}}
      const counts=presets[e.currentTarget.dataset.id]
      if(!counts)return
      this.setData({compositionContext:{...this.data.compositionContext,compositionMode:'manual',counts:clone(counts)}});this.renderComposition()
    },
    onCompositionAuto() {
      if(!this.compositionCurrent() || this.data.contextLocked || this.data.compositionSaving)return
      this.setData({compositionContext:normalizeContext({...this.data.compositionContext,compositionMode:'auto'})});this.renderComposition()
    },
    async onApplyComposition() {
      if(!this.compositionCurrent() || this.data.contextLocked || this.data.compositionSaving || this.data.peopleError)return
      const c=this.data.compositionContext,checked=validateCounts(c.counts)
      if(!checked.valid){this.renderComposition();return}
      const binding=this._compositionBinding,store=this.store,submitted=normalizeContext({...this.data.context,compositionMode:c.compositionMode,counts:c.counts})
      const owns=()=>this.current() && store===this.store && this._compositionBinding===binding && binding.scope===this._scope && binding.date===this.data.context.date && binding.meal===this.data.context.mealType
      clearTimeout(this._draftTimer);this.store.edit(submitted);this.setData({compositionSaving:true,errorMessage:''});this.setWorkspaceBusy(true)
      try {
        await this.flushDraft();if(!owns())return
        const state=store.state()
        if(state.dirty || state.pending || state.syncStatus!=='synced')throw new Error('搭配尚未同步，请核对最新内容后再应用')
        // Optional local suggestions must not turn a confirmed context save into failure.
        if(submitted.compositionMode==='manual') {
          try {this._experiencePreferences.rememberComposition(submitted.mealType,{mode:'manual',counts:submitted.counts});this.setData({compositionPreferenceNotice:''})}
          catch(error){this.setData({compositionPreferenceNotice:'本餐搭配已应用，本机常用搭配暂未记住'})}
        }
        this.setData({compositionVisible:false,compositionContext:null});this._compositionBinding=null;this.renderWorkspace()
      } catch(error) {if(owns()){this.renderWorkspace();this.setData({errorMessage:error.message || '搭配已保留，请重试同步'})}}
      finally {if(owns() || this.current() && store===this.store && this._compositionBinding===null){this.setData({compositionSaving:false});this.setWorkspaceBusy(false)}}
    },
    onPeopleInput(e) {
      if(!this.current() || !this.store || this.data.loading || this.data.contextLocked || this.data.busy)return
      this.onCloseConfirmation()
      const value=e.detail.value,people=Number(value)
      if(!String(value).trim() || !Number.isInteger(people) || people<1 || people>50){
        this.setData({peopleInput:value,peopleError:'人数应为 1 至 50 的整数'})
        this.setData(require('./meal-workspace-presentation').deriveWorkspacePresentation(this.data));return
      }
      this.setData({peopleError:''});this.store.edit({...this.data.context,people});this.renderWorkspace();this.scheduleDraftSave()
    },
    onPeopleStep(e) {
      const delta=Number(e.currentTarget.dataset.delta)
      if(delta!==1 && delta!==-1)return
      return this.onPeopleInput({detail:{value:String(Math.max(1,Math.min(50,this.data.context.people+delta)))}})
    },
    onToggleAdvanced() {if(this.current() && !this.data.busy)this.setData({advancedVisible:!this.data.advancedVisible})},
    onOpenMealSettings() {
      if (!this.current() || this.data.busy || this.data.contextLocked) return
      const c = clone(this.data.context)
      this.onCancelRequirements();this.onCloseComposition();this.onClosePeople();
      this.setData({ settingsVisible: true, settingsContext: c, ownedText: c.ownedIngredients.join('、'), settingsError: '' }); this.renderCounts()
    },
    onCloseMealSettings() { if (!this.data.busy) this.setData({ settingsVisible: false,settingsContext:null }) },
    onPeopleSetting(e) { this.setData({ 'settingsContext.people': e.detail.value }) },
    onTimeSetting(e) { this.setData({ 'settingsContext.totalCookMinutes': e.detail.value || null }) },
    onOwnedSetting(e) { this.setData({ ownedText: e.detail.value }) },
    onCountSetting(e) { const c = clone(this.data.settingsContext); c.compositionMode = 'manual'; c.counts[e.currentTarget.dataset.type] = Number(e.detail.value); this.setData({ settingsContext: c }) },
    renderCounts() { this.setData({ countRows: Object.entries(this.data.settingsContext.counts).map(([type, count]) => ({ type, count, label: ({ meat: '荤菜', veg: '素菜', soup: '汤', staple: '主食', dessert: '甜品', side: '配餐' })[type] })) }) },
    onManualMode() {
      const c = clone(this.data.settingsContext); c.compositionMode = 'manual';
      if (c.mealType !== 'breakfast') c.counts = { meat: c.counts.meat || 0, veg: c.counts.veg || 0, soup: c.counts.soup || 0, staple: c.counts.staple || 0, dessert: c.counts.dessert || 0 }
      this.setData({ settingsContext: c }); this.renderCounts()
    },
    onRestoreAuto() { try { const c = normalizeContext({ ...this.data.settingsContext, compositionMode: 'auto' }); this.setData({ settingsContext: c }); this.renderCounts() } catch (error) { this.setData({ settingsError: error.message }) } },
    async onApplyMealSettings() {
      if (!this.current() || this.data.contextLocked) return
      try { const c = normalizeContext({ ...this.data.settingsContext, totalCookMinutes: this.data.settingsContext.totalCookMinutes ? Number(this.data.settingsContext.totalCookMinutes) : null, ownedIngredients: this.data.ownedText.split(/[、,，\n]/).map(s => s.trim()).filter(Boolean) });
        this.store.edit(c); this.setData({ settingsVisible: false, settingsContext: null }); this.renderWorkspace(); this.scheduleDraftSave()
      } catch (error) { this.setData({ settingsError: error.message }) }
    },
    onToggleExtraActions(){if(this.current() && !this.data.busy)this.setData({moreVisible:true})},
    onCloseMore(){if(!this.data.busy)this.setData({moreVisible:false})},
    onSaveReusableMenu() {
      if (!this.current() || this.data.busy || !this.data.draft.dishes.length) return
      const state = this.store.state()
      if (state.pending || state.dirty || state.syncStatus !== 'synced') return this.setData({ errorMessage: '本餐尚未同步，请先核对原结果，再存为常用菜单。' })
      wx.setStorageSync(getUserStorageKey('activeMealTarget'), { date: this.data.context.date, mealType: this.data.context.mealType })
      wx.setStorageSync(getUserStorageKey('openPersonalMenuForm'), true)
      this.setData({ moreVisible: false }); wx.switchTab({ url: '/pages/customize/customize' })
    },
    onReturnToday() { return this.switchTarget(defaultTarget(),{followToday:true}) },
    onDateTarget(e) { return this.switchTarget({ date: e.detail.value, mealType: this.data.context.mealType }) },
    onMealTarget(e) {
      const followToday = (options.mode || 'today') === 'today' && !(this._params || {}).date &&
        this.data.context.date === defaultTarget().date && !wx.getStorageSync(getUserStorageKey('pendingRecipeRecord'))
      return this.switchTarget({ date: this.data.context.date, mealType: MEALS[Number(e.detail.value)] }, { followToday })
    },
    async switchTarget(target,options={}) { if (!this.current() || this.data.busy) return; wx.setStorageSync(getUserStorageKey('activeMealTarget'), {...target,selectedOn:defaultTarget().date}); this._params = options.followToday?{}:{...target,selectedOn:defaultTarget().date}; return this.initializeWorkspace(this._params) },
    onChooseDishes() { if (this.current()) { wx.setStorageSync(getUserStorageKey('activeMealTarget'), { date: this.data.context.date, mealType: this.data.context.mealType });wx.setStorageSync(getUserStorageKey('recipeSelectionIntent'),true); wx.switchTab({ url: '/pages/customize/customize' }) } },
    onDishOpen(e) { const id = e.currentTarget.dataset.id || e.detail.id; if (id) wx.navigateTo({ url: `/pages/dish-detail/dish-detail?id=${id}&people=${this.data.context.people}` }) },
    onViewRecipes() { const plan=this.data.linkedPlan;if(plan){wx.navigateTo({url:`/pages/meal-cooking/meal-cooking?date=${this.data.context.date}&mealType=${this.data.context.mealType}&planRevision=${plan.revision}`});return}if(this.data.status==='planned' && plan) {const id=(plan.dishIds || [])[0];if(id)wx.navigateTo({url:`/pages/dish-detail/dish-detail?id=${id}&people=${plan.targetPeople || this.data.context.people}`});else this.onViewPlan();return} const first=this.data.draft.dishes[0];if(first)this.onDishOpen({currentTarget:{dataset:{id:first.id}}});else this.onViewPlan() },
    onViewPlan() { wx.navigateTo({ url: '/pages/calendar-detail/calendar-detail?date=' + this.data.context.date + '&mealType=' + this.data.context.mealType }) },
    onViewSavedMeal() {if(!this.current() || !this.data.savedTarget)return;const target=this.data.savedTarget;wx.navigateTo({url:`/pages/calendar-detail/calendar-detail?date=${target.date}&mealType=${target.mealType}`})},
    onShoppingPreview() {
      if (!this.current()) return
      const plan = this.data.linkedPlan; if (!plan) return
      beginShoppingSelection({ source: 'workspace', targetPeople: plan.targetPeople, sources: [{ sourceDate: this.data.context.date, sourceMealType: this.data.context.mealType, targetPeople: plan.targetPeople, dishIds: plan.dishIds, dishes: plan.dishDetails || [] }] })
      wx.navigateTo({ url: '/pages/shopping-preview/shopping-preview' })
    },
    onOpenAssistant() { return this.onOpenRequirements() },
    onOpenShoppingList(){if(this.current())wx.navigateTo({url:'/pages/shopping-list/shopping-list'})},
    async openWorkspaceRoute(route){
      if(!this.current() || this.data.busy)return
      const scope=this._scope,store=this.store
      try{await this.flushDraft();if(!this.current() || this._scope!==scope || this.store!==store)return;wx.navigateTo({url:`${route}?date=${this.data.context.date}&mealType=${this.data.context.mealType}`})}
      catch(error){if(this.current() && this.store===store)this.setData({errorMessage:error.message || '本餐尚未保存，内容已保留'})}
    },
    onOpenMealResult(){return this.openWorkspaceRoute('/pages/result/result')},
    onOpenAssistantView(){return this.openWorkspaceRoute('/pages/chat/chat')},
    onOpenAdvancedAssistant() { if(this.current())wx.navigateTo({ url: `/pages/assistant-history/assistant-history?date=${this.data.context.date}&mealType=${this.data.context.mealType}` }) },
    onOpenFilter() { if(this.current()){wx.setStorageSync(getUserStorageKey('editingRecommendationCriteria'),this.data.context.criteria);wx.navigateTo({ url: '/pages/recommend-filter/recommend-filter' })} },
    onReview() { if(this.current())wx.navigateTo({ url: '/pages/statistics/statistics?period=week&anchor='+encodeURIComponent(this.data.context.date) }) },
    onLogin() { wx.showToast({ title: '登录后可跨设备保存本餐', icon: 'none' }); wx.switchTab({ url: '/pages/profile/profile' }) },
    onShareAppMessage() { return { title: '把今天这一餐安排好', path: '/pages/index/index' } },
  }
}
