const api=require('../../utils/api')
const flow=require('../../utils/meal-workflow')
const progress=require('../../utils/cooking-progress')
const {getUserStorageKey}=require('../../utils/util')
const actual=require('../../utils/meal-actual-entry').createMealActualEntry({api,onSaved:async function(){await this.onShow()}})
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
 data:{recipeMode:false,actualText:'',actualVisible:false,actualNeedsReload:false,actualBusy:false,fontBase:require('../../utils/font-scale').base,fontScale:require('../../utils/font-scale')(),loading:true,errorMessage:'',dishes:[],steps:[],dishName:'',dishIndex:0,stepIndex:0},
 onLoad(options){this._recipeId=Number(options.recipeId);this.setData({recipeMode:Number.isSafeInteger(this._recipeId)&&this._recipeId>0});this._target={date:options.date,mealType:options.mealType,planRevision:Number(options.planRevision)};this._alive=true},
 onUnload(){this.disposeMealActual();this._alive=false;this._epoch=(this._epoch||0)+1},
 async onShow(){
  const epoch=this._epoch=(this._epoch||0)+1,scope=getUserStorageKey('cooking')
  if(this._scope!==scope){this.disposeMealActual();this.setData({actualVisible:false,actualQuick:false,actualText:'',actualSavedMessage:'',actualBusy:false,actualUnknown:false})}
  this._scope=scope
  this.setData({loading:true,errorMessage:'',dishes:[],steps:[],canRecordActual:!this.data.recipeMode&&this._target.date<=flow.today()})
  try{
   if(this.data.recipeMode){
    const dish=await api.getDishById(this._recipeId)
    if(!this._alive||scope!==getUserStorageKey('cooking')||epoch!==this._epoch)return
    if(!dish||Number(dish.id)!==this._recipeId)throw Error('这份菜谱已不可用，请返回继续选菜。')
    let raw=dish.steps||dish.step||''
    if(typeof raw==='string'){try{const parsed=JSON.parse(raw);if(Array.isArray(parsed))raw=parsed}catch(error){}}
    const stepsList=Array.isArray(raw)?raw.map(String):String(raw).split(/###|#|\n/).map(s=>s.trim()).filter(Boolean)
    this._progressContext={scope,date:'recipe-'+dish.id,mealType:'recipe',planRevision:dish.contentVersion||'unversioned'}
    this._progress=progress.loadProgress(wx,this._progressContext);this.setData({dishes:[{...dish,stepsList}]});this.onChooseDish({currentTarget:{dataset:{index:0}}});return
   }
   const overview=await api.getMealOverview(this._target.date,this._target.date)
   if(!this._alive||scope!==getUserStorageKey('cooking')||epoch!==this._epoch)return
   const plan=flow.mealViews(overview,this._target.date).find(m=>m.mealType===this._target.mealType).plan
   if(!plan||plan.revision!==this._target.planRevision)throw Error('本餐安排已变化，请返回核对后重新进入做饭模式。')
   const dishes=(plan.dishDetails||[]).map(d=>({...d,stepsList:Array.isArray(d.steps)?d.steps.map(String):String(d.steps||d.step||'').split(/###|#|\n/).map(s=>s.trim()).filter(Boolean)}))
   if(!dishes.length || (plan.dishIds||[]).some(id=>!dishes.some(d=>Number(d.id||d.dishId)===Number(id))))throw Error('计划快照不完整，请返回核对做法。')
   this._progressContext={...this._target,scope};this._progress=progress.loadProgress(wx,this._progressContext);this.setData({dishes});this.onChooseDish({currentTarget:{dataset:{index:0}}})
  }catch(error){if(this._alive&&scope===getUserStorageKey('cooking')&&epoch===this._epoch)this.setData({errorMessage:error.message||'做法暂未读取，请重试',planChanged:!!(error.message&&/安排已变化|快照不完整/.test(error.message))})}
  finally{if(this._alive&&scope===getUserStorageKey('cooking')&&epoch===this._epoch)this.setData({loading:false})}
 },
 onChooseDish(e){const index=Number(e.currentTarget.dataset.index),dish=this.data.dishes[index];if(!dish)return;const steps=dish.stepsList;this.setData({dishIndex:index,dishName:dish.name,steps,stepIndex:Math.min(Math.max(0,Number(this._progress[String(dish.id||dish.dishId)])||0),Math.max(0,steps.length-1))})},
 onNextStep(){if(!this._alive||this._scope!==getUserStorageKey('cooking'))return;const dish=this.data.dishes[this.data.dishIndex];if(!dish)return;const next=Math.min(this.data.stepIndex+1,Math.max(0,this.data.steps.length-1));this._progress[String(dish.id||dish.dishId)]=next;progress.saveProgress(wx,this._progressContext,this._progress);this.setData({stepIndex:next})},
 onPreviousStep(){if(!this._alive||this._scope!==getUserStorageKey('cooking'))return;const dish=this.data.dishes[this.data.dishIndex];if(!dish)return;const previous=Math.max(0,this.data.stepIndex-1);this._progress[String(dish.id||dish.dishId)]=previous;progress.saveProgress(wx,this._progressContext,this._progress);this.setData({stepIndex:previous})},
 onActualAdjustment(){if(this.data.actualBusy || this.data.actualLoading || this.data.actualUnknown)return;this.setData({actualQuick:false,actualMode:'changed'})},
 onRecordActual(){if(this.data.recipeMode)return;if(this._alive&&this._scope===getUserStorageKey('cooking'))return this.openMealActual({...this._target,quick:true,displayedPlanNames:this.data.dishes.map(d=>d.name).join('、')})},
 onErrorAction(){return this.data.planChanged?this.onReturnWorkspace():this.onShow()},
 onReturnWorkspace(){if(this.data.recipeMode){if(this._alive&&this._scope===getUserStorageKey('cooking'))wx.redirectTo({url:'/pages/dish-detail/dish-detail?id='+this._recipeId});return}if(this._alive&&this._scope===getUserStorageKey('cooking'))wx.redirectTo({url:`/pages/result/result?date=${this._target.date}&mealType=${this._target.mealType}`})},
})
