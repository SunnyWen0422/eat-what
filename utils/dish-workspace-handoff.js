function buildDishSelection(id,response,target) {
 if(!Number.isSafeInteger(Number(id))||Number(id)<1)throw Error('菜品无效，请重新读取')
 const w=response&&response.workspace
 const ids=[...new Set([...(w&&w.draft&&w.draft.dishes||[]).map(x=>Number(x.id)),Number(id)])]
 if(ids.some(x=>!Number.isSafeInteger(x)||x<1)||ids.length>10)throw Error('一餐最多安排 10 道菜，请先调整当前餐')
 return {...target,dishIds:ids,expectedWorkspaceId:w?w.id:null,expectedWorkspaceRevision:w?w.revision:null}
}
async function addDishToWorkspace(id,{api,wx,storageKey,current}) {
 const rules=require('./meal-workspace'),target=rules.resolveActiveTarget('result',{},wx.getStorageSync(storageKey('activeMealTarget')))
 const response=await api.getMealWorkspace(target.date,target.mealType)
 if(!current())return
 const selection=buildDishSelection(id,response,target)
 wx.setStorageSync(storageKey('workspaceSelectedDishes'),selection)
 wx.setStorageSync(storageKey('activeMealTarget'),{...target,selectedOn:rules.defaultTarget().date})
 wx.navigateTo({url:`/pages/result/result?date=${target.date}&mealType=${target.mealType}`})
}
module.exports={buildDishSelection,addDishToWorkspace}
