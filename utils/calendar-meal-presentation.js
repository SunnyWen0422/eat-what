/** One calendar record per account, date and meal. */
function calendarMealPresentation({plan,date,today}) {
 const dishes=plan?(plan.dishDetails||[]):[]
 const summary=dishes.map(d=>d.name).filter(Boolean).join('、') || (plan?plan.recipeName||'':'')
 return {mode:plan?'recorded':'empty',statusLabel:plan?(date>today?'已保存':'已记录'):'没有记录',summary,dishes,
  primary:plan?{kind:'prepare',label:'准备食材'}:{kind:'arrange',label:'安排这一餐'},
  actions:plan?['adjustPlan','copyPlan','removePlan']:['arrange'],originalPlan:null}
}
function calendarDayLabel({date,selected,hasPlan}) {
 const [year,month,day]=date.split('-').map(Number)
 return [`${year}年${month}月${day}日`,selected?'已选中':'',hasPlan?'有餐次记录':'暂无记录'].filter(Boolean).join('，')
}
module.exports={calendarMealPresentation,calendarDayLabel}
