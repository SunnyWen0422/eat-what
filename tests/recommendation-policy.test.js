const test=require('node:test')
const assert=require('node:assert/strict')
const policy=require('../utils/recommendation-policy')
test('capability opt-in keeps explicit restrictions while putting wishes in separate fields',()=>{
 const original={criteria:{cuisineCodes:['SICHUAN'],includeTagCodes:[],excludeTagCodes:[],excludedIngredients:['花生'],maxCookMinutes:10}}
 const selected={cuisineCodes:['CANTONESE'],includeTagCodes:['LIGHT'],excludeTagCodes:[],excludedIngredients:['花生'],maxCookMinutes:20}
 const next=policy.applyWishes(original,selected,'balanced-v1')
 assert.deepEqual(next.criteria.cuisineCodes,['SICHUAN']);assert.equal(next.criteria.maxCookMinutes,10)
 assert.deepEqual(next.recommendationPreferences.includeTagCodes,['LIGHT']);assert.equal(next.recommendationPreferences.maxCookMinutes,20)
 assert.equal(policy.applyWishes(original,selected,null).criteria.maxCookMinutes,20)
 assert.equal(original.recommendationPolicy,undefined)
})
test('unconfirmed or unrelated versions never opt into soft semantics',()=>{
 assert.equal(policy.supported('future-v9'),false);assert.equal(policy.supported(undefined),false)
 assert.equal(policy.enable({criteria:{}},null).recommendationPolicy,undefined)
})
test('explicitly clearing old required preferences preserves separate exclusions',()=>{
 const context={criteria:{cuisineCodes:['SICHUAN'],includeTagCodes:['LIGHT'],maxCookMinutes:10,excludedIngredients:['花生']}}
 const next=policy.applyWishes(context,{excludedIngredients:['花生'],includeTagCodes:['SWEET_SOUR']},policy.VERSION,true)
 assert.deepEqual(next.criteria.cuisineCodes,[]);assert.deepEqual(next.criteria.includeTagCodes,[]);assert.equal(next.criteria.maxCookMinutes,null);assert.deepEqual(next.criteria.excludedIngredients,['花生'])
 assert.deepEqual(next.recommendationPreferences.includeTagCodes,['SWEET_SOUR'])
})
