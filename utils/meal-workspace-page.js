const api = require('./api')
const theme = require('./ui-tokens')
const { getCurrentUserIdentity, getUserStorageKey } = require('./util')
const { createWorkspaceStore, defaultTarget, resolveActiveTarget, normalizeContext, requestId } = require('./meal-workspace')
const { beginShoppingSelection } = require('./shopping-list')
const clone = value => JSON.parse(JSON.stringify(value))
const MEALS = ['breakfast', 'lunch', 'dinner']
const LABELS = ['早餐', '午餐', '晚餐']

module.exports = function workspacePage(options = {}) {
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
      harnessStatus:'idle',harnessMessage:'',harnessReport:null,harnessRetryable:false,harnessTarget:null,harnessTargetLabel:'',
      actualText:'',actualVisible:false,actualNeedsReload:false,actualBusy:false,
      pageTitle:options.mode==='assistant'?'这餐的想法':options.mode==='result'?'本餐方案':'今天', mealName:'当前餐', workspaceEnabled: true, requirementsVisible:false, requirementsDraft:'', requirementsSaving:false, voicePhase:'idle', voicePrivacyVisible:false, primaryLabel:'帮我安排这餐', primaryAction:'onGenerate', showRequirements:true, legacyMeals: [], theme, loading: true, busy: false, errorMessage: '', syncLabel: '', syncStatus: 'loading',
      context: { ...defaultTarget(), people: 2, requirements: '', compositionMode: 'auto', counts: { meat: 1, veg: 1 }, ownedIngredients: [] },
      draft: { dishes: [], lockedDishIds: [], history: [], planVersion: 0 }, status: 'empty', linkedPlan: null, actual: null,
      mealLabels: LABELS, mealIndex: 0, settingsVisible: false, settingsContext: null, countRows: [], ownedText: '', settingsError: '',
      confirmationVisible: false, confirmationText: '', canConfirm: false, taskMessage: '', mode: options.mode || 'today', fontBase: theme.font.body, fontScale: 1,
    },
    async onLoad(params = {}) {
      this._alive = true; this._params = params
      const app = getApp(); if (app.waitForLogin) await app.waitForLogin()
      if (!this._alive) return
      return this.initializeWorkspace(params)
    },
    async initializeWorkspace(params = {}) {
      this.disposeControlledHarness();this.setData({harnessStatus:'idle',harnessMessage:'',harnessReport:null,harnessRetryable:false,harnessTarget:null,harnessTargetLabel:''})
      if(this.disposeMealActual)this.disposeMealActual();this.setData({actualVisible:false,actualBusy:false});if(this.cancelVoiceInput)this.cancelVoiceInput();this._requirementsBinding=null;this.setData({requirementsVisible:false,voicePhase:'idle',voicePrivacyVisible:false});
      this.stopTimers(); if (this.store) this.store.dispose(); this.store=null; this._draftSave=null; this._preservedContext=null;this._confirmation=null;this._exposed=null
      this._scope = getCurrentUserIdentity(); const initEpoch = this._initEpoch = (this._initEpoch || 0) + 1; const initScope = this._scope
      const target = resolveActiveTarget(options.mode || 'today', params, wx.getStorageSync(getUserStorageKey('activeMealTarget')))
      const pendingPlan = wx.getStorageSync(getUserStorageKey('pendingRecipeRecord'))
      if (pendingPlan) { target.date = pendingPlan.date; target.mealType = pendingPlan.mealType }
      if (params.date) target.date = params.date
      if (MEALS.includes(params.mealType)) target.mealType = params.mealType
      this.setData({loading:true,busy:false,errorMessage:'',syncLabel:'',feedbackNotice:'',legacyMeals:[],legacyNotice:'',conflictDraftAvailable:false,context:normalizeContext({...target,people:2}),draft:{dishes:[],history:[],lockedDishIds:[]},linkedPlan:null,actual:null,status:'empty',settingsContext:null,settingsVisible:false,confirmationVisible:false,canConfirm:false})
      let people = 2
      try { const saved = await api.getUserPreferences(); if (!this.current() || initEpoch !== this._initEpoch || initScope !== this._scope) return; people = saved.defaultPeople || 2 }
      catch (error) { if (!this.current() || initEpoch !== this._initEpoch || initScope !== this._scope) return; this.setData({ syncLabel: '常用人数暂未读到，本餐默认两人' }) }
      let fontScale = 1
      if (wx.getAppBaseInfo) { const info = wx.getAppBaseInfo(); fontScale = info.fontSizeScaleFactor || (info.fontSizeSetting ? info.fontSizeSetting / 16 : 1) }
      this.store = createWorkspaceStore()
      this.setData({ loading: true, busy: false, errorMessage: '', context: normalizeContext({ ...target, people }), draft: { dishes: [], history: [], lockedDishIds: [] }, linkedPlan: null, actual: null, settingsContext: null, settingsVisible: false, confirmationVisible: false, fontScale: Math.max(1, fontScale) })
      await this.readWorkspace(target, { people })
      if (!this.current() || initEpoch !== this._initEpoch || initScope !== this._scope) return
      if(options.mode==='assistant') await this.loadLegacyMeals()
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
      const selected = wx.getStorageSync(getUserStorageKey('workspaceSelectedDishes'))
      if (selected && selected.date === target.date && selected.mealType === target.mealType && this.current()) {
        const latest=this.store.state().workspace
        if(Object.prototype.hasOwnProperty.call(selected,'expectedWorkspaceId') && ((latest?latest.id:null)!==selected.expectedWorkspaceId || (latest?latest.revision:null)!==selected.expectedWorkspaceRevision)) {
          this.setData({errorMessage:'本餐已在另一处变化，请核对最新安排后重新加入菜品。原方案和选菜意图都已保留。'})
          return
        }
        const selection = { dishIds: selected.dishIds }
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
        if(await this.runCommand('select', selection)) wx.removeStorageSync(getUserStorageKey('workspaceSelectedDishes'))
      }
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
    onShow() {
      if (!this._scope) return
      if (!this.current()) return this.initializeWorkspace(this._params || {})
      const target = resolveActiveTarget(options.mode || 'today', this._params || {}, wx.getStorageSync(getUserStorageKey('activeMealTarget')))
      if (target && (target.date !== this.data.context.date || target.mealType !== this.data.context.mealType)) return this.switchTarget(target,{followToday:options.mode!=='assistant'&&options.mode!=='result'&&!(this._params||{}).date})
      const filterKey=getUserStorageKey('pendingRecommendationCriteria'), filter=wx.getStorageSync(filterKey)
      if(filter && this.store) {wx.removeStorageSync(filterKey);this.store.edit({...this.data.context,criteria:filter});this.renderWorkspace();this.scheduleDraftSave()}
      if (!this.data.busy) return this.readWorkspace(this.data.context)
    },
    onHide() { this.cancelVoiceInput(); clearTimeout(this._pollTimer); clearTimeout(this._draftTimer) },
    onUnload() { this.disposeControlledHarness();this.disposeMealActual();this.cancelVoiceInput(); this._alive = false; this.stopTimers(); if (this.store) this.store.dispose() },
    stopTimers() { clearTimeout(this._exposureTimer); clearTimeout(this._pollTimer); clearTimeout(this._draftTimer) },
    async readWorkspace(target = this.data.context, defaults = {}) {
      if (!this.store || !this.current()) return
      const store = this.store
      try { await store.load(target.date, target.mealType, defaults); if (!this.current() || store !== this.store) return; this.setData({ errorMessage: '' }) }
      catch (error) { if (this.current() && store === this.store) this.setData({ errorMessage: error.message || '本餐暂未同步，可重试' }) }
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
      this.setData({ context: state.context || this.data.context, draft: { ...draft, dishes: (draft.dishes || []).map(d => ({ ...d, locked: (draft.lockedDishIds || []).includes(d.id) })) },
        status: w && w.status==='planned' && w.confirmation && w.confirmation.planRevision!==state.linked.planRevision ? 'plan_changed' : w && w.status || 'empty', mealIndex: MEALS.indexOf((state.context || this.data.context).mealType), syncStatus: state.syncStatus, syncLabel: labels[state.syncStatus] || '',
        linkedPlan: state.linked.plan || null, actual: state.linked.actual || null, taskMessage: w && w.message || '', suggestedTarget: w && w.suggestedTarget || null, suggestedMealLabel: w && w.suggestedTarget ? LABELS[MEALS.indexOf(w.suggestedTarget.mealType)] : '',
        canConfirm: !!w && ['draft', 'planned'].includes(w.status) && !!draft.dishes.length && !state.dirty && !state.pending && state.syncStatus === 'synced' })
      const context=this.data.context
      this.setData({todayDate:defaultTarget().date,pageTitle:this.data.mode==='assistant'?'这餐的想法':this.data.mode==='result'?'本餐方案':'今天',mealName:LABELS[MEALS.indexOf(context.mealType)] || '当前餐',
        mealViewKey:`${this._scope}:${context.date}:${context.mealType}:${draft.planVersion || 0}`,
        compositionLabel:Object.entries(context.counts || {}).filter(([,n])=>Number(n)>0).map(([type,n])=>`${n}${({meat:'荤',veg:'素',soup:'汤',staple:'主食',dessert:'甜品',side:'配菜'})[type] || type}`).join(' · ')})
      this.setData(require('./meal-workspace-presentation').deriveWorkspacePresentation({...this.data, busy:this.data.busy}));
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
      const allowed=['onGenerate','onRetryWorkspace','onLoadLatest','onCancelTask','onViewPlan','onViewRecipes','onConfirmPlan','onOpenRequirements']
      if(allowed.includes(this.data.primaryAction))return this[this.data.primaryAction]()
    },
    onOpenRequirements() {
      if(!this.current() || this.data.busy)return
      const w=this.store && this.store.state().workspace
      this._requirementsBinding={scope:this._scope,store:this.store,date:this.data.context.date,meal:this.data.context.mealType,id:w && w.id}
      this.setData({requirementsVisible:true,requirementsDraft:this.data.context.requirements || '',requirementsSaving:false,errorMessage:''})
    },
    onRequirementsDraftInput(e) {this.setData({requirementsDraft:e.detail.value})},
    onCancelRequirements() {this.cancelVoiceInput();this.setData({requirementsVisible:false,requirementsDraft:this.data.context.requirements || '',requirementsSaving:false});this._requirementsBinding=null},
    async onApplyRequirements() {
      const binding=this._requirementsBinding,store=this.store,w=store && store.state().workspace
      if(!binding || this.data.requirementsSaving || !this.current() || binding.store!==store || binding.scope!==this._scope || binding.date!==this.data.context.date || binding.meal!==this.data.context.mealType || binding.id!=null && binding.id!==(w && w.id))return
      const submitted=this.data.requirementsDraft
      this.cancelVoiceInput();this.store.edit({...this.data.context,requirements:submitted});this.setData({requirementsSaving:true});this.renderWorkspace()
      const ownsSheet=()=>this.current() && this.store===store && this._requirementsBinding===binding && binding.scope===this._scope && binding.date===this.data.context.date && binding.meal===this.data.context.mealType
      try {await this.flushDraft();if(!ownsSheet())return;if(this.data.requirementsDraft!==submitted){this.setData({errorMessage:'先前的内容已保存，新输入仍保留，请再次应用'});this.renderWorkspace();return}this.setData({requirementsVisible:false});this._requirementsBinding=null;this.renderWorkspace()}
      catch(error){if(ownsSheet())this.setData({errorMessage:error.message || '文字已保留，请重试同步'})}
      finally{if(ownsSheet() || this._requirementsBinding===null && this.store===store && this.current())this.setData({requirementsSaving:false})}
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
      if (getCurrentUserIdentity() === 'guest') return this.onLogin()
      clearTimeout(this._draftTimer); const store = this.store
      this.setData({ errorMessage: '' }); this.setWorkspaceBusy(true)
      try { await this.flushDraft(); if(!this.current() || store!==this.store)return false; await store.command(command, extra); if (this.current() && store === this.store) { this.renderWorkspace(); this.pollTask(); return true } }
      catch (error) { if (this.current() && store === this.store) { this.renderWorkspace(); this.setData({ errorMessage: error.message || '安排未完成，输入和原方案已保留' }) } }
      finally { if (this.current() && store === this.store) this.setWorkspaceBusy(false) }
    },
    async onSuggestedTarget() {
      if(!this.current() || !this.data.suggestedTarget || this.data.busy)return
      const requirements=this.data.context.requirements,target=this.data.suggestedTarget,scope=this._scope
      await this.switchTarget(target)
      if(!this.current() || scope!==this._scope)return
      this.store.edit({...this.data.context,requirements});this.renderWorkspace();return this.runCommand('generate')
    },
    onGenerate() { return this.runCommand('generate') },
    onRegenerate() { return this.runCommand('regenerate') },
    onUndo() { return this.runCommand('undo') },
    onCancelTask() { return this.runCommand('cancel') },
    onReplace(e) { return this.runCommand('replace', { dishId: Number(e.currentTarget.dataset.id) }) },
    onKeep(e) { return this.runCommand(e.currentTarget.dataset.locked ? 'release' : 'keep', { dishId: Number(e.currentTarget.dataset.id) }) },
    onConfirmPlan() {
      if (!this.data.canConfirm || this.data.busy || !this.current()) return
      const state = this.store.state()
      if (state.linked.plan) {
        this._confirmation = { scope: this._scope, id: state.workspace.id, revision: state.workspace.revision, planVersion: state.workspace.draft.planVersion, planRevision: state.linked.planRevision }
        this.setData({ confirmationVisible: true, confirmationText: `原安排：${state.linked.plan.recipeName}\n新方案：${this.data.draft.dishes.map(d => d.name).join('、')}\n日期：${this.data.context.date} ${LABELS[this.data.mealIndex]}` })
      } else return this.saveConfirmation(state.linked.planRevision || 0)
    },
    onCloseConfirmation() { if (!this.data.busy) this.setData({ confirmationVisible: false }) },
    onApproveReplacement() {
      const capture = this._confirmation, state = this.store && this.store.state()
      if (!capture || !this.current() || capture.scope !== this._scope || !state.workspace || capture.id !== state.workspace.id || capture.revision !== state.workspace.revision) return
      return this.saveConfirmation(capture.planRevision)
    },
    async saveConfirmation(revision) {
      if (this.data.busy || !this.current()) return
      const store = this.store; this.setData({ errorMessage: '' }); this.setWorkspaceBusy(true)
      try { await store.confirm(revision); if (this.current() && store === this.store) {
        this.setData({ confirmationVisible: false }); wx.removeStorageSync(getUserStorageKey('pendingRecipeRecord')); wx.setStorageSync(getUserStorageKey('needRefreshCalendar'), Date.now()); await this.readWorkspace(this.data.context)
      } } catch (error) { if (this.current() && store === this.store) { this.renderWorkspace(); this.setData({ errorMessage: error.message || '保存结果待确认，请重试原请求' }) } }
      finally { if (this.current() && store === this.store) this.setWorkspaceBusy(false) }
    },
    async onRetryWorkspace() {
      if (!this.store || this.data.busy || !this.current()) return
      const store = this.store; this.setWorkspaceBusy(true)
      try { await store.retry(); if (this.current() && store === this.store) { this.setData({ errorMessage: '' }); await this.readWorkspace(this.data.context) } }
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
    onOpenMealSettings() {
      if (!this.current() || this.data.busy) return
      const c = this.data.settingsContext || clone(this.data.context)
      this.setData({ settingsVisible: true, settingsContext: c, ownedText: c.ownedIngredients.join('、'), settingsError: '' }); this.renderCounts()
    },
    onCloseMealSettings() { if (!this.data.busy) this.setData({ settingsVisible: false }) },
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
      if (!this.current()) return
      try { const c = normalizeContext({ ...this.data.settingsContext, totalCookMinutes: this.data.settingsContext.totalCookMinutes ? Number(this.data.settingsContext.totalCookMinutes) : null, ownedIngredients: this.data.ownedText.split(/[、,，\n]/).map(s => s.trim()).filter(Boolean) });
        this.store.edit(c); this.setData({ settingsVisible: false, settingsContext: null }); this.renderWorkspace(); this.scheduleDraftSave()
      } catch (error) { this.setData({ settingsError: error.message }) }
    },
    onToggleExtraActions(){this.setData({showExtraActions:!this.data.showExtraActions})},
    onReturnToday() { return this.switchTarget(defaultTarget(),{followToday:true}) },
    onDateTarget(e) { return this.switchTarget({ date: e.detail.value, mealType: this.data.context.mealType }) },
    onMealTarget(e) { return this.switchTarget({ date: this.data.context.date, mealType: MEALS[Number(e.detail.value)] }) },
    async switchTarget(target,options={}) { if (!this.current() || this.data.busy) return; wx.setStorageSync(getUserStorageKey('activeMealTarget'), {...target,selectedOn:defaultTarget().date}); this._params = options.followToday?{}:{...target,selectedOn:defaultTarget().date}; return this.initializeWorkspace(this._params) },
    onChooseDishes() { if (this.current()) { wx.setStorageSync(getUserStorageKey('activeMealTarget'), { date: this.data.context.date, mealType: this.data.context.mealType });wx.setStorageSync(getUserStorageKey('recipeSelectionIntent'),true); wx.switchTab({ url: '/pages/customize/customize' }) } },
    onDishOpen(e) { const id = e.currentTarget.dataset.id || e.detail.id; if (id) wx.navigateTo({ url: `/pages/dish-detail/dish-detail?id=${id}&people=${this.data.context.people}` }) },
    onViewRecipes() { const plan=this.data.linkedPlan;if(plan){wx.navigateTo({url:`/pages/meal-cooking/meal-cooking?date=${this.data.context.date}&mealType=${this.data.context.mealType}&planRevision=${plan.revision}`});return}if(this.data.status==='planned' && plan) {const id=(plan.dishIds || [])[0];if(id)wx.navigateTo({url:`/pages/dish-detail/dish-detail?id=${id}&people=${plan.targetPeople || this.data.context.people}`});else this.onViewPlan();return} const first=this.data.draft.dishes[0];if(first)this.onDishOpen({currentTarget:{dataset:{id:first.id}}});else this.onViewPlan() },
    onViewPlan() { wx.navigateTo({ url: '/pages/calendar-detail/calendar-detail?date=' + this.data.context.date + '&mealType=' + this.data.context.mealType }) },
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
