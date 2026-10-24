const descriptors=new Set(['快手','干锅','手撕','爽口','锡纸','脆皮','广式'])
function presentRecipeQuality(dish={}) { return require('./canonical-recipe').nutritionView(dish.scaledRecipe || dish.recipe && {servings:dish.recipe.baseServings,nutrition:dish.recipe.calculatedNutrition}) }
function dishCategoryLabel(value) {
 const type=String(value||'').trim()
 const labels={meat:'荤菜',veg:'素菜',soup:'汤品',staple:'主食',dessert:'甜品',side:'配餐'}
 return labels[type] || (/^[\u3400-\u9fff]{1,12}$/.test(type)?type:'未分类')
}
function editRecipeQualityNotice() { return '' }
function presentRecipeLines(value,ingredients=false){
 let source=value
 if(typeof source==='string'){try{source=JSON.parse(source)}catch(_){}}
 const {readableRecipeLine}=require('./personal-recipes')
 const lines=Array.isArray(source)?source:typeof source==='string'?source.split(/###|#|\n/):source&&typeof source==='object'?[source]:[]
 return lines.map(row=>{
  return readableRecipeLine(row)
 }).filter(line=>line&&line!=='请补充这一项'&&line.trim()).map(line=>line.trim())
}
function recipeDurationLabel(dish={}) { const n=dish.recipe && dish.recipe.timing && dish.recipe.timing.totalMinutes; return typeof n==='number' && Number.isFinite(n) && n>=0 ? n+' 分钟' : '' }
module.exports={presentRecipeQuality,dishCategoryLabel,editRecipeQualityNotice,presentRecipeLines,recipeDurationLabel}
