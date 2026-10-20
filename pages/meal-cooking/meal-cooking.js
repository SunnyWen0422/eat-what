const api=require('../../utils/api')
const flow=require('../../utils/meal-workflow')
const progress=require('../../utils/cooking-progress')
const recipe=require('../../utils/recipe-quality')
function readingDish(dish){const ingredients=require('../../utils/recipe-display').presentRecipeIngredients(dish);return {...dish,stepsList:recipe.presentRecipeLines(dish.steps||dish.step),ingredientsList:ingredients.lines,ingredientNotice:ingredients.basis}}
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
 data:{cookingActionHeight:176,reducedMotion:false,ingredientsVisible:false,recipeMode:false,actualText:'',actualVisible:false,actualNeedsReload:false,actualBusy:false,fontBase:require('../../utils/font-scale').base,fontScale:require('../../utils/font-scale')(),loading:true,errorMessage:'',dishes:[],steps:[],dishName:'',dishIndex:0,stepIndex:0},
 onLoad(options){this._recipeId=Number(options.recipeId);this.setData({recipeMode:Number.isSafeInteger(this._recipeId)&&this._recipeId>0});this._target={date:options.date,mealType:options.mealType,planRevision:Number(options.planRevision)};this._alive=true},
 onUnload(){this.disposeMealActual();this._ingredientReturnPosition=null;this._alive=false;this._epoch=(this._epoch||0)+1},
 onReady(){this.measureCookingActions()},
 onResize(){this.measureCookingActions()},
 onPageScroll(e){this._scrollTop=Number.isFinite(e.scrollTop)?Math.max(0,e.scrollTop):0},
 measureCookingActions(){
  if(!this._alive||!wx.createSelectorQuery)return
  const epoch=this._epoch,scope=this._scope,serial=this._positionSerial
  const measure=()=>{
   if(!this._alive||epoch!==this._epoch||serial!==this._positionSerial||scope!==getUserStorageKey('cooking'))return
   wx.createSelectorQuery().in(this).select('.cooking-bottom').boundingClientRect(rect=>{
    if(this._alive&&epoch===this._epoch&&serial===this._positionSerial&&scope===getUserStorageKey('cooking')&&rect&&rect.height>0)this.setData({cookingActionHeight:Math.ceil(rect.height)+16})
   }).exec()
  }
  if(wx.nextTick)wx.nextTick(measure);else measure()
 },
 async onShow(){
  const epoch=this._epoch=(this._epoch||0)+1,scope=getUserStorageKey('cooking')
  this._ingredientReturnPosition=null
  this.setData({ingredientsVisible:false,reducedMotion:require('../../utils/experience-preferences')().get().reducedMotion})
  if(this._scope!==scope){this.disposeMealActual();this.setData({actualVisible:false,actualQuick:false,actualText:'',actualSavedMessage:'',actualBusy:false,actualUnknown:false,ingredientsVisible:false})}
  this._scope=scope
  this.setData({loading:true,errorMessage:'',planChanged:false,resumeNotice:'',dishes:[],steps:[],canRecordActual:!this.data.recipeMode&&this._target.date<=flow.today()})
  try{
   if(this.data.recipeMode){
    const dish=await api.getDishById(this._recipeId)
    if(!this._alive||scope!==getUserStorageKey('cooking')||epoch!==this._epoch)return
    if(!dish||Number(dish.id)!==this._recipeId)throw Error('这份菜谱已不可用，请返回继续选菜。')
    this._progressContext={scope,date:'recipe-'+dish.id,mealType:'recipe',planRevision:'recipe-v2'}
    this.initializeReading([readingDish(dish)]);return
   }
   require('../../utils/meal-save-target').validateMealTarget(this._target)
   const overview=await api.getMealOverview(this._target.date,this._target.date)
   if(!this._alive||scope!==getUserStorageKey('cooking')||epoch!==this._epoch)return
   const plan=flow.mealViews(overview,this._target.date).find(m=>m.mealType===this._target.mealType).plan
   if(!plan||plan.revision!==this._target.planRevision)throw Error('本餐安排已变化，请返回核对后重新进入做饭模式。')
   const dishes=(plan.dishDetails||[]).map(readingDish)
   if(!dishes.length || (plan.dishIds||[]).some(id=>!dishes.some(d=>Number(d.id||d.dishId)===Number(id))))throw Error('本餐做法信息不完整，请返回核对菜谱。')
   this._progressContext={...this._target,scope};this.initializeReading(dishes)
  }catch(error){if(this._alive&&scope===getUserStorageKey('cooking')&&epoch===this._epoch)this.setData({errorMessage:flow.errorMessage(error,'做法暂未读到，请重新读取。'),planChanged:!!(error.message&&/安排已变化|做法信息不完整/.test(error.message))})}
  finally{if(this._alive&&scope===getUserStorageKey('cooking')&&epoch===this._epoch)this.setData({loading:false})}
 },
 initializeReading(dishes){this._reading=progress.restoreReading(wx,this._progressContext,dishes);this.setData({dishes,resumeNotice:this._reading.changed?'做法已更新，变化的菜品从第一步开始':''});this.onChooseDish({currentTarget:{dataset:{index:this._reading.dishIndex}}})},
 onChooseDish(e){
  if(!this._alive||this._scope!==getUserStorageKey('cooking')||!this._reading)return
  const index=Number(e.currentTarget.dataset.index),dish=this.data.dishes[index];if(!Number.isInteger(index)||!dish)return
  const id=String(dish.id||dish.dishId),steps=dish.stepsList.map(require('../../utils/recipe-steps').stripStepNumber)
  this._ingredientReturnPosition=null;this._positionSerial=(this._positionSerial||0)+1
  this._reading.activeDishId=id;this.persistReading()
  this.setData({ingredientsVisible:false,dishIndex:index,dishName:dish.name,steps,ingredients:dish.ingredientsList,ingredientNotice:dish.ingredientNotice,stepIndex:this._reading.entries[id].stepIndex},()=>this.measureCookingActions())
 },
 onHide(){this._ingredientReturnPosition=null;this._positionSerial=(this._positionSerial||0)+1;if(this._alive&&this._scope===getUserStorageKey('cooking')&&this._reading)this.persistReading()},
 persistReading(){if(!progress.saveReading(wx,this._progressContext,this._reading))this.setData({resumeNotice:'阅读位置暂未保存，仍可继续查看做法'})},
 ingredientPositionCurrent(position){
  const dish=this.data.dishes[this.data.dishIndex]
  return !!position&&this._alive&&this._scope===getUserStorageKey('cooking')&&position.serial===this._positionSerial&&position.scope===this._scope&&position.epoch===this._epoch&&dish&&position.dishId===String(dish.id||dish.dishId)&&position.fingerprint===progress.contentFingerprint(dish)&&position.stepIndex===this.data.stepIndex
 },
 onIngredients(){
  if(!this._alive||this._scope!==getUserStorageKey('cooking')||!this._reading)return
  if(this.data.ingredientsVisible)return this.closeIngredients()
  const dish=this.data.dishes[this.data.dishIndex];if(!dish)return
  this._positionSerial=(this._positionSerial||0)+1
  this._ingredientReturnPosition={serial:this._positionSerial,scope:this._scope,epoch:this._epoch,dishId:String(dish.id||dish.dishId),fingerprint:progress.contentFingerprint(dish),stepIndex:this.data.stepIndex,scrollTop:this._scrollTop||0}
  this.setData({ingredientsVisible:true})
 },
 closeIngredients(){
  const position=this._ingredientReturnPosition;this._ingredientReturnPosition=null
  this.setData({ingredientsVisible:false},()=>{
   if(!this.data.ingredientsVisible&&this.ingredientPositionCurrent(position)&&wx.pageScrollTo)wx.pageScrollTo({scrollTop:position.scrollTop,duration:0})
  })
 },
 onNextStep(){return this.moveStep(1)},onPreviousStep(){return this.moveStep(-1)},
 moveStep(amount){
  if(!this._alive||this._scope!==getUserStorageKey('cooking')||!this._reading)return
  const dish=this.data.dishes[this.data.dishIndex];if(!dish||!this.data.steps.length)return
  const next=Math.min(Math.max(this.data.stepIndex+amount,0),this.data.steps.length-1)
  if(next===this.data.stepIndex)return
  this._ingredientReturnPosition=null
  this._reading.entries[String(dish.id||dish.dishId)].stepIndex=next;this.persistReading()
  this._positionSerial=(this._positionSerial||0)+1
  const position={serial:this._positionSerial,scope:this._scope,epoch:this._epoch,dishId:String(dish.id||dish.dishId),fingerprint:progress.contentFingerprint(dish),stepIndex:next}
  this.setData({ingredientsVisible:false,stepIndex:next},()=>{this.measureCookingActions();if(this.ingredientPositionCurrent(position)&&wx.pageScrollTo)wx.pageScrollTo({selector:'#cooking-step-heading',duration:this.data.reducedMotion?0:180})})
 },
 onActualAdjustment(){if(this.data.actualBusy || this.data.actualLoading || this.data.actualUnknown)return;this.setData({actualQuick:false,actualMode:'changed'})},
 onRecordActual(){if(this.data.recipeMode||!this.data.canRecordActual||this._target.date>flow.today())return;if(this._alive&&this._scope===getUserStorageKey('cooking'))return this.openMealActual({...this._target,quick:true,displayedPlanNames:this.data.dishes.map(d=>d.name).join('、')})},
 onErrorAction(){return this.data.planChanged?this.onReturnWorkspace():this.onShow()},
 onReturnWorkspace(){if(this.data.recipeMode){if(this._alive&&this._scope===getUserStorageKey('cooking'))wx.redirectTo({url:'/pages/dish-detail/dish-detail?id='+this._recipeId});return}if(this._alive&&this._scope===getUserStorageKey('cooking'))wx.redirectTo({url:`/pages/result/result?date=${this._target.date}&mealType=${this._target.mealType}`})},
})
