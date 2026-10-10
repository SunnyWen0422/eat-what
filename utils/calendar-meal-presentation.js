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
  return {mode,dishes:eaten?(actual.actualDishes||[]):plan?(plan.dishDetails||[]):[],actions,originalPlan:eaten?(actual.plannedSnapshot||null):null}
}
module.exports={calendarMealPresentation}
