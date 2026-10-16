/** Read-only calendar view. Plans and consumption records remain separate commands. */
function calendarMealPresentation({plan,actual,date,today}) {
  const eaten=actual && actual.status==='eaten', skipped=actual && actual.status==='skipped'
  const mode=skipped?'skipped':eaten?(plan?'eaten':'actualOnly'):plan?'planned':'empty'
  const actions=[]
  if(plan)actions.push('adjustPlan','copyPlan','removePlan')
  else if(!eaten&&!skipped)actions.push('arrange')
  if(date<=today){
    if(eaten)actions.push('correctActual')
    else actions.push('recordEaten')
    if(plan&&!skipped)actions.push('recordSkipped')
    if(actual&&actual.status!=='unrecorded')actions.push('clearActual')
  }
  const primary=eaten||skipped?{kind:'correctActual',label:'更正实际记录'}:plan?date<=today?{kind:'recordEaten',label:'记录这餐'}:{kind:'prepare',label:'准备食材'}:{kind:'arrange',label:'安排这一餐'}
  const statusLabel=[plan?'已安排':'',eaten?'已记录吃过':skipped?'已记录这餐没吃':plan?'没有实际记录':'没有记录'].filter(Boolean).join(' · ')
  return {mode,statusLabel,primary,dishes:eaten?(actual.actualDishes||[]):plan?(plan.dishDetails||[]):[],actions,originalPlan:eaten?(actual.plannedSnapshot||null):null}
}
function calendarDayLabel({date,selected,hasPlan,hasActual,eaten,skipped}) {
  const [year,month,day]=date.split('-').map(Number)
  return [`${year}年${month}月${day}日`,selected?'已选中':'',hasPlan?'有安排':'',hasActual||eaten||skipped?'部分餐次已记录实际情况':'未记录实际用餐',eaten?'有餐次吃过':'',skipped?'已记录这餐没吃':''].filter(Boolean).join('，')
}
module.exports={calendarMealPresentation,calendarDayLabel}
