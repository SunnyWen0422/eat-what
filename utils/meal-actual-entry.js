const flow=require('./meal-workflow')
const {getUserStorageKey}=require('./util')
function createMealActualEntry({api,onSaved=async()=>{},wx:providedWx,scope=()=>getUserStorageKey('mealActual'),today=flow.today}) {
  const platform=()=>providedWx||wx
  const owns=(page,binding)=>page._actualBinding===binding&&binding.scope===scope()&&page._actualAlive!==false
  return {
    async openMealActual(target) {
      if(!target||!/^\d{4}-\d{2}-\d{2}$/.test(target.date)||!flow.mealNames[target.mealType])return
      const binding={...target,scope:scope()},key=binding.scope+`:pending:${target.date}:${target.mealType}`
      this._actualAlive=true;this._actualBinding=binding;binding.key=key
      this.setData({actualVisible:true,actualLoading:true,actualBusy:false,actualError:'',actualText:'',actualTitle:`${target.date} ${flow.mealNames[target.mealType]}`,actualUnknown:false,actualNeedsReload:false,actualHasPlan:false,actualCanRecord:target.date<=today()})
      try {
        const overview=await api.getMealOverview(target.date,target.date)
        if(!owns(this,binding))return
        const meal=flow.mealViews(overview,target.date).find(m=>m.mealType===target.mealType)
        binding.meal=meal;binding.expectedRevision=meal.actual?meal.actual.revision:0;binding.expectedPlanRevision=meal.planRevision
        const pending=platform().getStorageSync(key)
        binding.pending=pending&&pending.scope===binding.scope?pending:null
        this.setData({actualHasPlan:!!meal.plan,actualText:binding.pending?binding.pending.text:meal.actualNames||meal.plan&&meal.plan.recipeName||'',actualUnknown:!!binding.pending,actualError:binding.pending?'上次保存结果待确认，请使用原请求重试':''})
      }catch(error){if(owns(this,binding))this.setData({actualNeedsReload:true,actualError:flow.errorMessage(error,'本餐暂未读取，请重试')})}
      finally{if(owns(this,binding))this.setData({actualLoading:false})}
    },
    onActualText(e){if(!this.data.actualUnknown&&!this.data.actualBusy)this.setData({actualText:e.detail.value})},
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
        this.setData({actualNeedsReload:false,actualHasPlan:!!meal.plan,actualError:'已读取最新记录，输入已保留；请核对后再次确认'})
      }catch(error){if(owns(this,b))this.setData({actualNeedsReload:true,actualError:flow.errorMessage(error,'暂时无法核对本餐，请重试')})}
      finally{if(owns(this,b))this.setData({actualLoading:false})}
    },
    async submitMealActual(status,usePlan) {
      const b=this._actualBinding
      if(!b||!owns(this,b)||this.data.actualBusy||this.data.actualLoading||!b.meal)return
      if(b.pending)return this.setData({actualError:'上次保存结果未知，请先重试原请求'})
      if(status==='eaten'&&b.date>today())return this.setData({actualError:'不能提前记录未来用餐'})
      if(usePlan&&!b.meal.plan)return this.setData({actualError:'本餐没有可确认的安排'})
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
