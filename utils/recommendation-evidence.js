const labels={CURRENT_WISH_RECENT:'按本餐想吃搭配，包含近期吃过的菜',CURRENT_WISH_MATCH:'已搭配符合本餐想吃的菜',WISH_CYCLE_EXHAUSTED:'偏好菜本轮已推荐，先为你换些新菜',RECENT_ACTUAL_FALLBACK:'新候选不足，搭配了近期吃过的菜',OWNED_INGREDIENT_MATCH:'包含你填写的已有食材',EXPLICIT_PREFERENCE_MATCH:'符合已保存的口味偏好',RECENT_ACTUAL_AVOIDED:'避开了近期已记录的菜',KNOWN_TIME_MATCH:'符合已选单菜用时上限'}
function presentRecommendationEvidence(value){
 const codes=value&&Array.isArray(value.codes)?value.codes:[]
 return [...new Set(codes)].filter(code=>Object.prototype.hasOwnProperty.call(labels,code)).slice(0,2).map(code=>labels[code])
}
module.exports={presentRecommendationEvidence}
