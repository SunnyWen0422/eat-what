const test=require('node:test'),assert=require('node:assert/strict')
test('recommendation reasons render only bounded server facts',()=>{
 const {presentRecommendationEvidence}=require('../utils/recommendation-evidence')
 assert.deepEqual(presentRecommendationEvidence({codes:['OWNED_INGREDIENT_MATCH','EXPLICIT_PREFERENCE_MATCH','KNOWN_TIME_MATCH','NUTRITION_GUARANTEED']}),['包含你填写的已有食材','符合已保存的口味偏好'])
 assert.deepEqual(presentRecommendationEvidence({codes:['NUTRITION_GUARANTEED']}),[])
})
