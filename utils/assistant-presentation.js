const suggestions=[
 {id:'arrange',label:'安排这餐',text:'按当前人数和要求安排这餐'},
 {id:'replace',label:'换道菜',text:'帮我换一道菜'},
 {id:'shopping',label:'准备食材',text:'准备这餐的采购清单'},
 {id:'arrangements',label:'看看安排',text:'看看我已有的用餐安排'},
]
function buildAssistantSuggestions({hasMenu,available}) {
 return available?suggestions.filter(s=>hasMenu || ['arrange','arrangements'].includes(s.id)).map(s=>({...s})):[]
}
// Source explanation only. Java still resolves and validates effective constraints.
function buildAssistantContextSummary({workspace,preferencesSnapshot,options,preferencesState}={}) {
 const context=workspace&&workspace.context||{},mealRows=[],savedRows=[]
 const short=value=>value.length>200?value.slice(0,200)+'…':value
 const text=value=>typeof value==='string'?short(value.replace(/[\x00-\x1f\x7f]/g,' ').trim()):''
 const labels={...require('./recommendation-criteria').CODE_LABELS}
 Object.values(options&&options.groups||{}).forEach(group=>(Array.isArray(group)?group:[]).forEach(item=>{if(item&&item.code&&item.label)labels[item.code]=text(item.label)}))
 const list=(values,codes=false)=>short([...new Set((Array.isArray(values)?values:[]).slice(0,30).map(value=>text(codes?labels[value]||value:value)).filter(Boolean))].join('、'))
 const add=(rows,id,label,value)=>{if(value)rows.push({id,label,text:value})}
 const minutes=value=>Number.isInteger(value)&&value>0?value:null
 const meal={breakfast:'早餐',lunch:'午餐',dinner:'晚餐'}[context.mealType]||'当前餐'
 const date=/^\d{4}-\d{2}-\d{2}$/.test(context.date||'')?context.date:'日期待核对'
 const people=Number.isInteger(context.people)&&context.people>=1&&context.people<=50?` · ${context.people}人`:''
 add(mealRows,'requirements','本餐要求',text(context.requirements)||'未填写临时要求')
 if(context.counts)add(mealRows,'composition','菜品搭配',require('./meal-composition').compositionSummary(context))
 add(mealRows,'owned','手边食材',list(context.ownedIngredients))
 if(minutes(context.totalCookMinutes))add(mealRows,'total-time','时间输入',`整餐用时上限 ${context.totalCookMinutes} 分钟`)
 const criteria=context.criteria||{}
 add(mealRows,'cuisines','本餐菜系',list(criteria.cuisineCodes,true))
 add(mealRows,'include','本餐筛选',list(criteria.includeTagCodes,true))
 add(mealRows,'exclude','本餐排除',list([...(criteria.excludedIngredients||[]),...(criteria.excludeTagCodes||[]).map(code=>labels[code]||code)]))
 if(minutes(criteria.maxCookMinutes))add(mealRows,'dish-time','本餐单菜上限',`单菜最多 ${criteria.maxCookMinutes} 分钟`)
 let unavailableLabel=''
 if(preferencesState!=='ready'||!preferencesSnapshot)unavailableLabel=preferencesState==='loading'?'正在读取已保存偏好':'已保存偏好暂未读到，请到长期偏好页核对'
 else {
  const saved=preferencesSnapshot
  add(savedRows,'hard-exclusions','长期忌口',list([...(saved.excludedIngredients||[]),...(saved.excludedTagCodes||[]).map(code=>labels[code]||code)])||'未设置长期忌口')
  add(savedRows,'saved-cuisines','常用菜系',list(saved.preferredCuisineCodes,true))
  add(savedRows,'saved-tags','常用偏好',list(saved.preferredTagCodes,true))
  if(Number.isInteger(saved.defaultPeople)&&saved.defaultPeople>=1&&saved.defaultPeople<=50)add(savedRows,'saved-people','常用人数',`${saved.defaultPeople}人（本餐人数见上方）`)
  if(minutes(saved.maxCookMinutes))add(savedRows,'saved-time','长期单菜上限',`单菜最多 ${saved.maxCookMinutes} 分钟`)
  if(Number.isInteger(saved.avoidRecentDays)&&saved.avoidRecentDays>=0)add(savedRows,'saved-recent','近期避重',`${saved.avoidRecentDays}天`)
 }
 return {targetLabel:`${date} · ${meal}${people}`,mealRows,savedRows,unavailableLabel}
}
module.exports={buildAssistantSuggestions,buildAssistantContextSummary}
