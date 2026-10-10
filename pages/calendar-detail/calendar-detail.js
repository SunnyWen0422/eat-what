const api = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')
const { beginShoppingSelection } = require('../../utils/shopping-list')
const flow = require('../../utils/meal-workflow')
const {calendarMealPresentation}=require('../../utils/calendar-meal-presentation')
const actual=require('../../utils/meal-actual-entry').createMealActualEntry({api,onSaved:async function(){await this.loadMealRecords();this.refreshFlags()}})
Page({
  openMealActual(...args){return actual.openMealActual.call(this,...args)},
  onActualText(...args){return actual.onActualText.call(this,...args)},
  onActualMode(...args){return actual.onActualMode.call(this,...args)},
  onConfirmActual(...args){return actual.onConfirmActual.call(this,...args)},
  closeMealActual(...args){return actual.closeMealActual.call(this,...args)},
  disposeMealActual(...args){return actual.disposeMealActual.call(this,...args)},
  onActualByPlan(...args){return actual.onActualByPlan.call(this,...args)},
  onActualChanged(...args){return actual.onActualChanged.call(this,...args)},
  onActualSkipped(...args){return actual.onActualSkipped.call(this,...args)},
  onActualRetry(...args){return actual.onActualRetry.call(this,...args)},
  onActualReload(...args){return actual.onActualReload.call(this,...args)},
  submitMealActual(...args){return actual.submitMealActual.call(this,...args)},
  sendMealActual(...args){return actual.sendMealActual.call(this,...args)},
  data: { actualVisible:false,actualBusy:false,actualText:'',actualMode:'changed',copyUnknown:false,copyPendingMeal:'',fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(), selectedDate: '', meals: [], loading: true, errorMessage: '', mutating: false, formVisible: false, formMode: '', formTitle: '', formMeal: '', formName: '', formPeople: '2', formActual: '', copyDate: '', formError: '', canRecord: true },
  onLoad(options) { const day=options.date || flow.today();this.setData({ dateHeading:`${Number(day.slice(5,7))}月${Number(day.slice(8,10))}日${flow.mealNames[options.mealType]?' '+flow.mealNames[options.mealType]:''}`,focusedMeal:flow.mealNames[options.mealType]?options.mealType:'', selectedDate: options.date || flow.today(), copyDate: flow.shiftDay(options.date || flow.today(), 1), canRecord: (options.date || flow.today()) <= flow.today() }) },
  onShow() { this.loadMealRecords() },
  onAdjustMeal(e) { const type=e.currentTarget.dataset.meal;if(this.data.mutating || !this.meal(type)?.plan || this._viewScope!==getUserStorageKey('mealView'))return;this.setData({adjustMeal:this.data.adjustMeal===type?'':type,manageMeal:'',expandedMeal:''}) },
  onManageMeal(e) { const type=e.currentTarget.dataset.meal;if(this.data.mutating || this._viewScope!==getUserStorageKey('mealView'))return;this.setData({manageMeal:this.data.manageMeal===type?'':type,adjustMeal:'',expandedMeal:''}) },
  onOriginalPlan(e) { const type=e.currentTarget.dataset.meal;this.setData({originalMeal:this.data.originalMeal===type?'':type}) },
  onActualAdjustment(){if(this.data.actualBusy || this.data.actualLoading || this.data.actualUnknown)return;this.setData({actualQuick:false,actualMode:'changed'})},
  onMoreMeal(e) { const type=e.currentTarget.dataset.meal; if(!this.data.mutating && this.meal(type))this.setData({expandedMeal:this.data.expandedMeal===type?'':type}) },
  onUnload() { this.disposeMealActual(); this._unloaded = true; this._epoch = (this._epoch || 0) + 1 },
  async loadMealRecords() {
    const epoch = this._epoch = (this._epoch || 0) + 1, scope = getUserStorageKey('mealView'), current = () => !this._unloaded && epoch === this._epoch && scope === getUserStorageKey('mealView')
    if (this._viewScope !== scope) { this.disposeMealActual();this._signature = null; this.setData({ meals: [], overview: null, formVisible: false, formName: '', formActual: '', mutating: false, expandedMeal: '',adjustMeal:'',manageMeal:'',originalMeal:'',actualSavedMessage:'',actualVisible:false,actualQuick:false,actualText:'',actualBusy:false,actualUnknown:false,copyUnknown:false,copyPendingMeal:'' }) }
    this._viewScope = scope
    this.updateCopyPending()
    this.setData({ loading: true, errorMessage: '' })
    try {
      const overview = await api.getMealOverview(this.data.selectedDate, this.data.selectedDate)
      if (current()) this.setData({ meals: flow.mealViews(overview, this.data.selectedDate).map(meal=>({...meal,presentation:calendarMealPresentation({...meal,date:this.data.selectedDate,today:flow.today()}),statusLabel:meal.status==='eaten'?'已吃':meal.status==='skipped'?'这餐没吃':meal.plan?'已安排 · 未记录':'未记录'})), overview, canRecord:this.data.selectedDate<=flow.today() },()=>{if(current()&&this.data.focusedMeal&&wx.pageScrollTo)wx.pageScrollTo({selector:'#meal-'+this.data.focusedMeal,duration:0})})
    } catch (error) { if (current()) this.setData({ errorMessage: flow.errorMessage(error, '读取失败，请重试。实际用餐记录没有被修改。') }) }
    finally { if (current()) this.setData({ loading: false }) }
  },
  meal(type) { return this.data.meals.find(m => m.mealType === type) },
  onEditPlan(e) {
    const type=e.currentTarget.dataset.meal, value=this.meal(type)
    if(!value || this.data.mutating || this._viewScope!==getUserStorageKey('mealView'))return
    this.setData({ formVisible: true, formMode: 'plan', formMeal: type, formTitle: `${flow.mealNames[type]}安排`, formName: value.plan ? value.plan.recipeName : '', formPeople: String(value.plan && value.plan.targetPeople || 2), formError: '' })
  },
  async onActualDifferent(e) {
    await this.openActualFor(e,'changed')
  },
  async openActualFor(e,mode) {
    const type=e.currentTarget.dataset.meal,value=this.meal(type)
    if(!value || this.data.mutating || this.data.actualBusy || this._unloaded || this._viewScope!==getUserStorageKey('mealView'))return
    const opening=this.openMealActual({date:this.data.selectedDate,mealType:type,planRevision:value.planRevision,quick:mode==='byPlan',displayedPlanNames:value.plan?(value.plan.dishDetails||[]).map(d=>d.name).join('、'):''})
    const binding=this._actualBinding
    await opening
    if(this._actualBinding===binding && binding?.meal && !this.data.actualUnknown && !this._unloaded && this._viewScope===getUserStorageKey('mealView'))this.setData({actualMode:mode==='byPlan' && binding.meal.actual?.status==='eaten'?'changed':mode})
  },
  onCopy(e) {
    const type=e.currentTarget.dataset.meal
    const pending=this.readPendingCopy()
    if((!this.meal(type)?.plan&&!pending) || this.data.mutating || this._viewScope!==getUserStorageKey('mealView'))return
    const meal=pending?pending.mealType:type
    this.setData({ formVisible: true, formMode: 'copy', formMeal: meal, formTitle: pending?'确认刚才的复制':`复制${flow.mealNames[meal]}安排`, copyDate: pending?pending.date:flow.shiftDay(this.data.selectedDate, 1), copyUnknown:!!pending,formError:pending?'上次复制结果待确认，将使用原日期和原请求重试':'' })
  },
  onName(e) { this.setData({ formName: e.detail.value }) }, onPeople(e) { this.setData({ formPeople: e.detail.value }) },
  onActualInput(e) { this.setData({ formActual: e.detail.value }) }, onCopyDate(e) { if(this.data.mutating || this.readPendingCopy())return;this.setData({ copyDate: e.detail.value }) },
  closeForm() { if (!this.data.mutating) this.setData({ formVisible: false, formError: '' }) },
  async run(operation, success) {
    if (this.data.mutating) return
    const scope=this._viewScope
    if(this._unloaded || scope!==getUserStorageKey('mealView')) { this.loadMealRecords(); return }
    this.setData({ mutating: true, formError: '', errorMessage: '' })
    try { await operation(scope); if(this._unloaded || scope!==getUserStorageKey('mealView'))return; this.setData({ formVisible: false }); wx.showToast({ title: success, icon: 'success' }); await this.loadMealRecords(); this.refreshFlags() }
    catch(error) { if(error.cancelled)return; if(!this._unloaded && scope===getUserStorageKey('mealView'))this.setData({ formError: flow.errorMessage(error), errorMessage: flow.errorMessage(error) }) }
    finally { if(!this._unloaded && scope===getUserStorageKey('mealView'))this.setData({ mutating: false }) }
  },
  stableRequest(kind, payload) {
    const signature=JSON.stringify([kind,payload]); if(signature!==this._signature){this._signature=signature;this._requestId=flow.requestId(kind)}
    return this._requestId
  },
  consumption(type, status, usePlan, dishes) {
    const value=this.meal(type), body={ status, usePlan, dishes: dishes || [], expectedPlanRevision: value.plan ? value.plan.revision : 0, expectedRevision: value.actual ? value.actual.revision : 0 }
    body.requestId=this.stableRequest(`meal-${type}`,body)
    return api.saveMealConsumption(this.data.selectedDate,type,body)
  },
  onRecordMeal(e){return this.meal(e.currentTarget.dataset.meal)?.plan?this.onEaten(e):this.onActualDifferent(e)},
  onEaten(e) { return this.openActualFor(e,'byPlan') },
  onSkip(e) { return this.openActualFor(e,'skipped') },
  async onUndoActual(e) {
    await this.openActualFor(e,'undo')
    if(this.data.actualUnknown || this._unloaded)return
    const binding=this._actualBinding
    wx.showModal({title:'撤销实际记录？',content:'原安排会保留，饮食回顾将重新计算。',success:r=>{if(r.confirm && this._actualBinding===binding)this.submitMealActual('unrecorded',false)}})
  },
  async saveForm() {
    const type=this.data.formMeal,value=this.meal(type)
    if(this.data.formMode==='actual') {
      const entries=flow.buildActualEntries(this.data.formActual,value)
      if(!entries.length)return this.setData({formError:'请填写实际吃过的菜品，每行一道。'})
      return this.run(()=>this.consumption(type,'eaten',false,entries),'已保存实际用餐')
    }
    if(this.data.formMode==='copy') {
      const pending=this.readPendingCopy()
      if(pending)return this.run(()=>this.sendCopyCommand(pending),'已复制安排')
      if(!value?.plan)return this.setData({formError:'原安排已变化，请返回核对'})
      if(this.data.copyDate===this.data.selectedDate)return this.setData({formError:'请选择另一天。'})
      const date=this.data.copyDate,sourceDate=this.data.selectedDate,source=JSON.parse(JSON.stringify(value.plan))
      return this.run(async(scope)=>{
        const overview=await api.getMealOverview(date,date), target=flow.mealViews(overview,date).find(x=>x.mealType===type)
        if(this._unloaded || scope!==getUserStorageKey('mealView'))throw {cancelled:true}
        if(target.plan) {
          const approved=await new Promise(resolve=>wx.showModal({title:'该餐次已有安排',content:`原安排：${target.plan.recipeName}\n将复制：${source.recipeName}\n实际用餐记录会保留。`,confirmText:'覆盖安排',success:r=>resolve(r.confirm),fail:()=>resolve(false)}))
          if(!approved)throw {cancelled:true}
        }
        if(this._unloaded || scope!==getUserStorageKey('mealView'))throw {cancelled:true}
        const body={recipeName:source.recipeName,dishIds:source.dishIds || [],targetPeople:source.targetPeople || 2,isManual:source.isManual==null?0:source.isManual,expectedRevision:target.planRevision || 0,requestId:flow.requestId('copy')}
        const operation={scope,sourceDate,sourcePlanRevision:source.revision,date,mealType:type,body}
        wx.setStorageSync(this.copyJournalKey(sourceDate),operation)
        this.updateCopyPending()
        await this.sendCopyCommand(operation)
      },'已复制安排')
    }
    if(!this.data.formName.trim())return this.setData({formError:'请填写安排名称。'})
    const people=Number(this.data.formPeople)
    if(!Number.isInteger(people)||people<1||people>50)return this.setData({formError:'人数应为 1 至 50 的整数。'})
    const body={recipeName:this.data.formName.trim(),dishIds:value.plan ? value.plan.dishIds || [] : [],targetPeople:people,isManual:value.plan ? value.plan.isManual : 1,expectedRevision:value.planRevision || 0}
    body.requestId=this.stableRequest(`plan-${type}`,body)
    return this.run(()=>api.saveMealPlan(this.data.selectedDate,type,body),'已保存安排')
  },
  copyJournalKey(date=this.data.selectedDate){return getUserStorageKey('calendarCopy')+':'+date},
  readPendingCopy(){
    const pending=wx.getStorageSync(this.copyJournalKey())
    return pending&&pending.scope===getUserStorageKey('mealView')&&pending.sourceDate===this.data.selectedDate&&flow.mealNames[pending.mealType]&&pending.body?.requestId?pending:null
  },
  updateCopyPending(){const pending=this.readPendingCopy();this.setData({copyPendingMeal:pending?pending.mealType:'',copyUnknown:!!pending})},
  onRecoverCopy(){const pending=this.readPendingCopy();if(pending)this.onCopy({currentTarget:{dataset:{meal:pending.mealType}}})},
  async sendCopyCommand(operation){
    if(this._unloaded || operation.scope!==getUserStorageKey('mealView'))throw {cancelled:true}
    const key=this.copyJournalKey(operation.sourceDate)
    const clear=()=>{const saved=wx.getStorageSync(key);if(saved?.body?.requestId===operation.body.requestId)wx.removeStorageSync(key)}
    try{
      await api.saveMealPlan(operation.date,operation.mealType,operation.body)
      clear()
      if(!this._unloaded && operation.scope===getUserStorageKey('mealView'))this.updateCopyPending()
    }catch(error){
      if(error.statusCode&&error.statusCode<500&&!error.isAccountChanged)clear()
      if(!this._unloaded && operation.scope===getUserStorageKey('mealView'))this.updateCopyPending()
      if(!error.statusCode||error.statusCode>=500||error.isAccountChanged)throw {...error,data:{message:'复制结果待确认，请重试原请求；原安排和实际记录会保留。'}}
      throw error
    }
  },
  onDeleteMeal(e) {
    const type=e.currentTarget.dataset.meal,value=this.meal(type),scope=this._viewScope
    if(!value?.plan || this.data.mutating || scope!==getUserStorageKey('mealView'))return
    wx.showModal({title:'移除这餐安排？',content:'已经确认的实际用餐会保留。',success:r=>{if(r.confirm && scope===getUserStorageKey('mealView')){const body={expectedRevision:value.plan.revision};body.requestId=this.stableRequest(`remove-${type}`,body);this.run(()=>api.removeMealPlan(this.data.selectedDate,type,body),'已移除安排')}}})
  },
  onChooseRecipe(e) {
    const type=e.currentTarget.dataset.meal,value=this.meal(type)
    if(!value || this.data.mutating || this._viewScope!==getUserStorageKey('mealView'))return
    wx.setStorageSync(getUserStorageKey('pendingRecipeRecord'),{date:this.data.selectedDate,mealType:type,expectedRevision:value.planRevision || 0,targetPeople:value.plan && value.plan.targetPeople || 2})
    if(require('../../utils/config').ENABLE_MEAL_WORKSPACE)wx.setStorageSync(getUserStorageKey('activeMealTarget'),{date:this.data.selectedDate,mealType:type})
    wx.switchTab({url:'/pages/customize/customize'})
  },
  onAddMealToShoppingList(e) {
    const type=e.currentTarget.dataset.meal,value=this.meal(type), plan=value.plan
    if(!plan || !(plan.dishIds || []).length)return wx.showToast({title:'请先从菜谱选择菜品',icon:'none'})
    const source={sourceDate:this.data.selectedDate,sourceMealType:type,dishIds:plan.dishIds,targetPeople:plan.targetPeople || 2,dishes:plan.dishDetails || []}
    beginShoppingSelection({sources:[source],dishIds:plan.dishIds,targetPeople:source.targetPeople,source:'calendar-detail',dishes:source.dishes})
    wx.navigateTo({url:'/pages/shopping-preview/shopping-preview'})
  },
  onViewDish(e) {
    const { id, meal, source, people } = e.currentTarget.dataset
    if (!id || this._unloaded || (this._viewScope && this._viewScope !== getUserStorageKey('mealView'))) return
    const value = this.meal(meal)
    const actual = source === 'actual' && value && value.actual
    const actualPeople = actual && (actual.targetPeople || actual.plannedSnapshot && actual.plannedSnapshot.targetPeople)
    const requested = Number(people || actualPeople || value && value.plan && value.plan.targetPeople || 2)
    const targetPeople = Number.isInteger(requested) && requested >= 1 && requested <= 50 ? requested : 2
    wx.navigateTo({ url: `/pages/dish-detail/dish-detail?id=${encodeURIComponent(id)}&people=${targetPeople}` })
  },
  onLogin() { wx.switchTab({url:'/pages/profile/profile'}) },
  refreshFlags() { for(const key of ['needRefreshStats','needRefreshCalendar'])wx.setStorageSync(getUserStorageKey(key),true) }
})
