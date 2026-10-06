const api=require('../../utils/api')
const flow=require('../../utils/meal-workflow')
const progress=require('../../utils/cooking-progress')
const {getUserStorageKey}=require('../../utils/util')
const actual=require('../../utils/meal-actual-entry').createMealActualEntry({api,onSaved:async function(){await this.onShow()}})
Page({
 openMealActual(...args){return actual.openMealActual.call(this,...args)},
 onActualText(...args){return actual.onActualText.call(this,...args)},
 closeMealActual(...args){return actual.closeMealActual.call(this,...args)},
 disposeMealActual(...args){return actual.disposeMealActual.call(this,...args)},
 onActualByPlan(...args){return actual.onActualByPlan.call(this,...args)},
 onActualChanged(...args){return actual.onActualChanged.call(this,...args)},
 onActualSkipped(...args){return actual.onActualSkipped.call(this,...args)},
 onActualRetry(...args){return actual.onActualRetry.call(this,...args)},
 onActualReload(...args){return actual.onActualReload.call(this,...args)},
 submitMealActual(...args){return actual.submitMealActual.call(this,...args)},
 sendMealActual(...args){return actual.sendMealActual.call(this,...args)},
 data:{actualText:'',actualVisible:false,actualNeedsReload:false,actualBusy:false,fontBase:require('../../utils/font-scale').base,fontScale:require('../../utils/font-scale')(),loading:true,errorMessage:'',dishes:[],steps:[],dishName:'',dishIndex:0,stepIndex:0},
 onLoad(options){this._target={date:options.date,mealType:options.mealType,planRevision:Number(options.planRevision)};this._alive=true},
 onUnload(){this.disposeMealActual();this._alive=false;this._epoch=(this._epoch||0)+1},
 async onShow(){
  const epoch=this._epoch=(this._epoch||0)+1,scope=this._scope=getUserStorageKey('cooking')
  this.setData({loading:true,errorMessage:'',dishes:[],steps:[]})
  try{
   const overview=await api.getMealOverview(this._target.date,this._target.date)
   if(!this._alive||scope!==getUserStorageKey('cooking')||epoch!==this._epoch)return
   const plan=flow.mealViews(overview,this._target.date).find(m=>m.mealType===this._target.mealType).plan
   if(!plan||plan.revision!==this._target.planRevision)throw Error('本餐安排已变化，请返回核对后重新进入做饭模式。')
   const dishes=(plan.dishDetails||[]).map(d=>({...d,stepsList:Array.isArray(d.steps)?d.steps.map(String):String(d.steps||d.step||'').split(/###|#|\n/).map(s=>s.trim()).filter(Boolean)}))
   if(!dishes.length || (plan.dishIds||[]).some(id=>!dishes.some(d=>Number(d.id||d.dishId)===Number(id))))throw Error('计划快照不完整，请返回核对做法。')
   this._progressContext={...this._target,scope};this._progress=progress.loadProgress(wx,this._progressContext);this.setData({dishes});this.onChooseDish({currentTarget:{dataset:{index:0}}})
  }catch(error){if(this._alive&&scope===getUserStorageKey('cooking')&&epoch===this._epoch)this.setData({errorMessage:error.message||'做法暂未读取，请重试'})}
  finally{if(this._alive&&scope===getUserStorageKey('cooking')&&epoch===this._epoch)this.setData({loading:false})}
 },
 onChooseDish(e){const index=Number(e.currentTarget.dataset.index),dish=this.data.dishes[index];if(!dish)return;const steps=dish.stepsList;this.setData({dishIndex:index,dishName:dish.name,steps,stepIndex:Math.min(Math.max(0,Number(this._progress[String(dish.id||dish.dishId)])||0),Math.max(0,steps.length-1))})},
 onNextStep(){if(!this._alive||this._scope!==getUserStorageKey('cooking'))return;const dish=this.data.dishes[this.data.dishIndex];if(!dish)return;const next=Math.min(this.data.stepIndex+1,Math.max(0,this.data.steps.length-1));this._progress[String(dish.id||dish.dishId)]=next;progress.saveProgress(wx,this._progressContext,this._progress);this.setData({stepIndex:next})},
 onPreviousStep(){if(!this._alive||this._scope!==getUserStorageKey('cooking'))return;const dish=this.data.dishes[this.data.dishIndex];if(!dish)return;const previous=Math.max(0,this.data.stepIndex-1);this._progress[String(dish.id||dish.dishId)]=previous;progress.saveProgress(wx,this._progressContext,this._progress);this.setData({stepIndex:previous})},
 onRecordActual(){if(this._alive&&this._scope===getUserStorageKey('cooking'))this.openMealActual({date:this._target.date,mealType:this._target.mealType})},
})
