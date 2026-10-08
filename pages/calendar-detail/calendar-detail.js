const api = require('../../utils/api')
const { getUserStorageKey } = require('../../utils/util')
const { beginShoppingSelection } = require('../../utils/shopping-list')
const flow = require('../../utils/meal-workflow')
Page({
  data: { fontBase: require('../../utils/font-scale').base, fontScale: require('../../utils/font-scale')(), selectedDate: '', meals: [], loading: true, errorMessage: '', mutating: false, formVisible: false, formMode: '', formTitle: '', formMeal: '', formName: '', formPeople: '2', formActual: '', copyDate: '', formError: '', canRecord: true },
  onLoad(options) { this.setData({ focusedMeal:flow.mealNames[options.mealType]?options.mealType:'', selectedDate: options.date || flow.today(), copyDate: flow.shiftDay(options.date || flow.today(), 1), canRecord: (options.date || flow.today()) <= flow.today() }) },
  onShow() { this.loadMealRecords() },
  onMoreMeal(e) { const type=e.currentTarget.dataset.meal; if(!this.data.mutating && this.meal(type))this.setData({expandedMeal:this.data.expandedMeal===type?'':type}) },
  onUnload() { this._unloaded = true; this._epoch = (this._epoch || 0) + 1 },
  async loadMealRecords() {
    const epoch = this._epoch = (this._epoch || 0) + 1, scope = getUserStorageKey('mealView'), current = () => !this._unloaded && epoch === this._epoch && scope === getUserStorageKey('mealView')
    if (this._viewScope !== scope) { this._signature = null; this.setData({ meals: [], overview: null, formVisible: false, formName: '', formActual: '', mutating: false, expandedMeal: '' }) }
    this._viewScope = scope
    this.setData({ loading: true, errorMessage: '' })
    try {
      const overview = await api.getMealOverview(this.data.selectedDate, this.data.selectedDate)
      if (current()) this.setData({ meals: flow.mealViews(overview, this.data.selectedDate), overview },()=>{if(current()&&this.data.focusedMeal&&wx.pageScrollTo)wx.pageScrollTo({selector:'#meal-'+this.data.focusedMeal,duration:0})})
    } catch (error) { if (current()) this.setData({ errorMessage: flow.errorMessage(error, '读取失败，请重试。实际用餐记录没有被修改。') }) }
    finally { if (current()) this.setData({ loading: false }) }
  },
  meal(type) { return this.data.meals.find(m => m.mealType === type) },
  onEditPlan(e) {
    const type=e.currentTarget.dataset.meal, value=this.meal(type)
    this.setData({ formVisible: true, formMode: 'plan', formMeal: type, formTitle: `${flow.mealNames[type]}安排`, formName: value.plan ? value.plan.recipeName : '', formPeople: String(value.plan && value.plan.targetPeople || 2), formError: '' })
  },
  onActualDifferent(e) {
    const type=e.currentTarget.dataset.meal, value=this.meal(type)
    this.setData({ formVisible: true, formMode: 'actual', formMeal: type, formTitle: `记录实际${flow.mealNames[type]}`, formActual: value.actualNames || '', formError: '' })
  },
  onCopy(e) {
    const type=e.currentTarget.dataset.meal
    this.setData({ formVisible: true, formMode: 'copy', formMeal: type, formTitle: `复制${flow.mealNames[type]}安排`, copyDate: flow.shiftDay(this.data.selectedDate, 1), formError: '' })
  },
  onName(e) { this.setData({ formName: e.detail.value }) }, onPeople(e) { this.setData({ formPeople: e.detail.value }) },
  onActualInput(e) { this.setData({ formActual: e.detail.value }) }, onCopyDate(e) { this.setData({ copyDate: e.detail.value }) },
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
  onEaten(e) { const type=e.currentTarget.dataset.meal; return this.run(()=>this.consumption(type,'eaten',true),'已记录实际用餐') },
  onSkip(e) {
    const type=e.currentTarget.dataset.meal, scope=this._viewScope
    wx.showModal({ title:'取消本餐安排？', content:'保留原计划，标记这餐未按安排用餐。不会计入已吃餐次。', confirmText:'确认取消', success:r=>{if(r.confirm && scope===getUserStorageKey('mealView'))this.run(()=>this.consumption(type,'skipped',false),'已取消本餐安排')} })
  },
  onUndoActual(e) { const type=e.currentTarget.dataset.meal, scope=this._viewScope; wx.showModal({title:'撤销实际记录？',content:'原安排会保留，饮食回顾将重新计算。',success:r=>{if(r.confirm && scope===getUserStorageKey('mealView'))this.run(()=>this.consumption(type,'unrecorded',false),'已撤销实际记录')}}) },
  async saveForm() {
    const type=this.data.formMeal,value=this.meal(type)
    if(this.data.formMode==='actual') {
      const entries=flow.buildActualEntries(this.data.formActual,value)
      if(!entries.length)return this.setData({formError:'请填写实际吃过的菜品，每行一道。'})
      return this.run(()=>this.consumption(type,'eaten',false,entries),'已保存实际用餐')
    }
    if(this.data.formMode==='copy') {
      if(this.data.copyDate===this.data.selectedDate)return this.setData({formError:'请选择另一天。'})
      return this.run(async(scope)=>{
        const overview=await api.getMealOverview(this.data.copyDate,this.data.copyDate), target=flow.mealViews(overview,this.data.copyDate).find(x=>x.mealType===type)
        if(target.plan) {
          const approved=await new Promise(resolve=>wx.showModal({title:'该餐次已有安排',content:`原安排：${target.plan.recipeName}\n将复制：${value.plan.recipeName}\n实际用餐记录会保留。`,confirmText:'覆盖安排',success:r=>resolve(r.confirm),fail:()=>resolve(false)}))
          if(!approved)throw {cancelled:true}
        }
        const body={recipeName:value.plan.recipeName,dishIds:value.plan.dishIds || [],targetPeople:value.plan.targetPeople || 2,isManual:value.plan.isManual,expectedRevision:target.planRevision || 0}
        body.requestId=this.stableRequest(`copy-${this.data.copyDate}-${type}`,body)
        if(this._unloaded || scope!==getUserStorageKey('mealView'))throw {cancelled:true}
        await api.saveMealPlan(this.data.copyDate,type,body)
      },'已复制安排')
    }
    if(!this.data.formName.trim())return this.setData({formError:'请填写安排名称。'})
    const people=Number(this.data.formPeople)
    if(!Number.isInteger(people)||people<1||people>50)return this.setData({formError:'人数应为 1 至 50 的整数。'})
    const body={recipeName:this.data.formName.trim(),dishIds:value.plan ? value.plan.dishIds || [] : [],targetPeople:people,isManual:value.plan ? value.plan.isManual : 1,expectedRevision:value.planRevision || 0}
    body.requestId=this.stableRequest(`plan-${type}`,body)
    return this.run(()=>api.saveMealPlan(this.data.selectedDate,type,body),'已保存安排')
  },
  onDeleteMeal(e) {
    const type=e.currentTarget.dataset.meal,value=this.meal(type),scope=this._viewScope
    wx.showModal({title:'删除本餐计划？',content:'已经确认的实际用餐会保留。',success:r=>{if(r.confirm && scope===getUserStorageKey('mealView')){const body={expectedRevision:value.plan.revision};body.requestId=this.stableRequest(`remove-${type}`,body);this.run(()=>api.removeMealPlan(this.data.selectedDate,type,body),'已删除计划')}}})
  },
  onChooseRecipe(e) {
    const type=e.currentTarget.dataset.meal,value=this.meal(type)
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
