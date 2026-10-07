const flow=require('./meal-workflow')
const {getUserStorageKey}=require('./util')
function createMealActualEntry({api,onSaved=async()=>{},wx:providedWx,scope=()=>getUserStorageKey('mealActual'),today=flow.today}) {
  const platform=()=>providedWx||wx
  const owns=(page,binding)=>page._actualBinding===binding&&binding.scope===scope()&&page._actualAlive!==false
  const planNames=meal=>meal.plan?(meal.plan.dishDetails||[]).map(d=>d.name).filter(Boolean).join('、')||meal.plan.recipeName||'':''
  const planChanged=(b,meal)=>Number.isFinite(b.planRevision)&&b.planRevision!==meal.planRevision
  return {
    async openMealActual(target) {
      if(!target||!/^\d{4}-\d{2}-\d{2}$/.test(target.date)||!flow.mealNames[target.mealType])return
      const binding={...target,scope:scope()},key=binding.scope+`:pending:${target.date}:${target.mealType}`
      this._actualAlive=true;this._actualBinding=binding;binding.key=key
      this.setData({actualVisible:true,actualLoading:true,actualBusy:false,actualError:'',actualText:'',actualMode:'changed',actualPlanChanged:false,actualPlanNames:'',actualOriginalPlanNames:target.displayedPlanNames||'',actualTitle:`${target.date} ${flow.mealNames[target.mealType]}`,actualUnknown:false,actualNeedsReload:false,actualHasPlan:false,actualCanRecord:target.date<=today()})
      try {
        const overview=await api.getMealOverview(target.date,target.date)
        if(!owns(this,binding))return
        const meal=flow.mealViews(overview,target.date).find(m=>m.mealType===target.mealType)
        binding.meal=meal;binding.expectedRevision=meal.actual?meal.actual.revision:0;binding.expectedPlanRevision=meal.planRevision
        const pending=platform().getStorageSync(key)
        binding.pending=pending&&pending.scope===binding.scope?pending:null
        const changed=planChanged(binding,meal)
        const mode=binding.pending?(binding.pending.body.status==='skipped'?'skipped':binding.pending.body.usePlan?'byPlan':'changed'):meal.actual&&meal.actual.status==='eaten'?'changed':meal.actual&&meal.actual.status==='skipped'?'skipped':meal.plan&&!changed?'byPlan':'changed'
        this.setData({actualMode:mode,actualHasPlan:!!meal.plan,actualPlanChanged:changed,actualPlanNames:planNames(meal),actualText:binding.pending?binding.pending.text:meal.actualNames||(changed?binding.displayedPlanNames:'')||planNames(meal),actualUnknown:!!binding.pending,actualError:binding.pending?'上次保存结果待确认，请使用原请求重试':changed?'显示过的计划已变化，请返回核对；也可以填写实际做过的菜后保存变化记录':''})
      }catch(error){if(owns(this,binding))this.setData({actualNeedsReload:true,actualError:flow.errorMessage(error,'本餐暂未读取，请重试')})}
      finally{if(owns(this,binding))this.setData({actualLoading:false})}
    },
    onActualText(e){if(!this.data.actualUnknown&&!this.data.actualBusy)this.setData({actualText:e.detail.value})},
    onActualMode(e){
      if(this.data.actualUnknown||this.data.actualBusy||this.data.actualLoading)return
      const mode=e.currentTarget&&e.currentTarget.dataset.mode
      if(!['byPlan','changed','skipped'].includes(mode)||mode!=='changed'&&!this.data.actualHasPlan)return
      this.setData({actualMode:mode})
    },
    onConfirmActual(){
      if(this.data.actualMode==='byPlan')return this.onActualByPlan()
      if(this.data.actualMode==='skipped')return this.onActualSkipped()
      return this.onActualChanged()
    },
    closeMealActual(){if(!this.data.actualBusy){this._actualBinding=null;this.setData({actualVisible:false})}},
    disposeMealActual(){this._actualAlive=false;this._actualBinding=null},
    onActualByPlan(){return this.submitMealActual('eaten',true)},
    onActualChanged(){return this.submitMealActual('eaten',false)},
    onActualSkipped(){return this.submitMealActual('skipped',false)},
    onActualRetry(){const b=this._actualBinding;if(b&&b.pending)return this.sendMealActual(b,b.pending)},
    async onActualReload(){
      const b=this._actualBinding
      if(!b||!owns(this,b)||b.pending||this.data.actualBusy||this.data.actualLoading)return
      this.setData({actualLoading:true})
      try{
        const overview=await api.getMealOverview(b.date,b.date)
        if(!owns(this,b))return
        const meal=flow.mealViews(overview,b.date).find(m=>m.mealType===b.mealType)
        b.meal=meal;b.expectedRevision=meal.actual?meal.actual.revision:0;b.expectedPlanRevision=meal.planRevision
        this.setData({actualNeedsReload:false,actualHasPlan:!!meal.plan,actualPlanChanged:planChanged(b,meal),actualPlanNames:planNames(meal),actualError:'已读取最新记录，输入已保留；请核对当前计划后再次确认'})
      }catch(error){if(owns(this,b))this.setData({actualNeedsReload:true,actualError:flow.errorMessage(error,'暂时无法核对本餐，请重试')})}
      finally{if(owns(this,b))this.setData({actualLoading:false})}
    },
    async submitMealActual(status,usePlan) {
      const b=this._actualBinding
      if(!b||!owns(this,b)||this.data.actualBusy||this.data.actualLoading||!b.meal)return
      if(b.pending)return this.setData({actualError:'上次保存结果未知，请先重试原请求'})
      if(status==='eaten'&&b.date>today())return this.setData({actualError:'不能提前记录未来用餐'})
      if(usePlan&&!b.meal.plan)return this.setData({actualError:'本餐没有可确认的安排'})
      if(usePlan&&planChanged(b,b.meal))return this.setData({actualError:'显示过的计划已被替换，请返回核对最新安排；实际做过的菜可用变化记录保存'})
      let dishes=[]
      if(status==='eaten'&&!usePlan){
        const previous=b.meal.actual&&b.meal.actual.actualDishes||[],used=new Set()
        dishes=String(this.data.actualText||'').split(/[\n、，,]/).map(s=>s.trim()).filter(Boolean).map(name=>{
          const index=previous.findIndex((dish,i)=>dish.name===name&&!used.has(i))
          if(index>=0){used.add(index);return {retainedEntryIndex:index}}
          return {name}
        })
        if(!dishes.length||dishes.length>30)return this.setData({actualError:'请填写1至30道实际菜品，每行一道；外食也可自由记录'})
      }
      const operation={scope:b.scope,date:b.date,mealType:b.mealType,text:this.data.actualText||'',body:{status,usePlan,dishes,expectedRevision:b.expectedRevision,expectedPlanRevision:b.expectedPlanRevision,requestId:flow.requestId('actual')}}
      return this.sendMealActual(b,operation)
    },
    async sendMealActual(b,operation) {
      if(!owns(this,b)||this.data.actualBusy)return
      b.pending=operation;platform().setStorageSync(b.key,operation)
      this.setData({actualBusy:true,actualError:''})
      try {
        await api.saveMealConsumption(b.date,b.mealType,operation.body)
        platform().removeStorageSync(b.key)
        if(!owns(this,b))return
        this.setData({actualVisible:false,actualBusy:false,actualUnknown:false});this._actualBinding=null
        await onSaved.call(this,b)
      }catch(error){
        if(!owns(this,b))return
        if(error.statusCode&&error.statusCode<500){b.pending=null;platform().removeStorageSync(b.key);this.setData({actualUnknown:false,actualNeedsReload:error.statusCode===409,actualError:flow.errorMessage(error,'记录未保存，请重新读取本餐再提交')});if(error.statusCode===409)b.meal=null}
        else this.setData({actualUnknown:true,actualError:'保存结果待确认，输入已保留；请重试原请求'})
      }finally{if(owns(this,b))this.setData({actualBusy:false})}
    },
  }
}
module.exports={createMealActualEntry}
