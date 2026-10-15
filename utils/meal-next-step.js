const {validateMealTarget}=require('./meal-save-target')
const {normalizeShoppingSource}=require('./shopping-view')
const meals=['breakfast','lunch','dinner']
function distinctMealSources(dishes) {
 const targets=new Map()
 for(const dish of Array.isArray(dishes)?dishes:[]) {
  const source=normalizeShoppingSource(dish)
  try{const target=validateMealTarget({date:source.sourceDate,mealType:source.sourceMealType});targets.set(target.date+':'+target.mealType,target)}catch(error){}
 }
 return [...targets.values()].sort((a,b)=>a.date.localeCompare(b.date)||meals.indexOf(a.mealType)-meals.indexOf(b.mealType))
}
function mealSourceUrl(value){const target=validateMealTarget(value);return `/pages/calendar-detail/calendar-detail?date=${target.date}&mealType=${target.mealType}`}
module.exports={distinctMealSources,mealSourceUrl}
