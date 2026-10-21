const { normalizeCriteria } = require('./recommendation-criteria')
const VERSION='balanced-v1'
const supported=version=>version===VERSION
function enable(context,version){return supported(version)?{...context,recommendationPolicy:VERSION,recommendationPreferences:normalizeCriteria(context.recommendationPreferences)}:{...context}}
function wishes(context){return normalizeCriteria(context.recommendationPolicy===VERSION?{...context.recommendationPreferences,excludeTagCodes:(context.criteria||{}).excludeTagCodes,excludedIngredients:(context.criteria||{}).excludedIngredients}:context.criteria)}
function applyWishes(context,input,version,clearRequired=false){
 const selected=normalizeCriteria(input)
 if(!supported(version))return {...context,criteria:selected}
 const hard=normalizeCriteria(context.criteria)
 if(clearRequired){hard.cuisineCodes=[];hard.includeTagCodes=[];hard.maxCookMinutes=null}
 return {...enable(context,version),criteria:{...hard,excludeTagCodes:selected.excludeTagCodes,excludedIngredients:selected.excludedIngredients},recommendationPreferences:{...selected,excludeTagCodes:[],excludedIngredients:[]}}
}
module.exports={VERSION,supported,enable,wishes,applyWishes}
