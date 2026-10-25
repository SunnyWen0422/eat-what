const test=require('node:test'),assert=require('node:assert/strict')
const {criteriaSummary}=require('../utils/recommendation-criteria')
const {normalizeOptions,sanitizeCriteriaForOptions}=require('../utils/recommendation-options')
const {contextPresentation,hardExclusionSummary}=require('../utils/meal-workspace-presentation')
const options={metadataVersion:4,groups:{cuisine:[],flavor:[{code:'INTENSITY_LIGHT',label:'清淡'}],scene:[],diet:[],method:[]},constraintOptions:[{code:'ALLERGEN_PEANUT',label:'花生'}]}
test('canonical labels come from current options and hard allergens survive editing',()=>{
 const current=normalizeOptions(options)
 assert.equal(criteriaSummary({includeTagCodes:['INTENSITY_LIGHT']},current),'清淡')
 assert.deepEqual(sanitizeCriteriaForOptions({excludeTagCodes:['ALLERGEN_PEANUT']},current).excludeTagCodes,['ALLERGEN_PEANUT'])
 assert.equal(hardExclusionSummary({excludedTagCodes:['ALLERGEN_PEANUT']},current),'长期忌口：花生')
})
test('workspace uses current cached labels and describes desired time as a preference',t=>{
 const previous=global.wx;t.after(()=>{global.wx=previous})
 global.wx={getStorageSync:key=>key==='recommendationOptionsCurrentVersion'?4:options}
 const result=contextPresentation({date:'2026-10-25',mealType:'dinner',people:2,recommendationPolicy:'balanced-v1',recommendationPreferences:{includeTagCodes:['INTENSITY_LIGHT'],maxCookMinutes:20}})
 assert.match(result.filterSummary,/清淡/);assert.match(result.filterSummary,/期望 20 分钟/);assert.doesNotMatch(result.filterSummary,/INTENSITY|分钟内/)
})
test('missing labels never leak internal taxonomy codes',()=>{
 assert.equal(criteriaSummary({includeTagCodes:['UNAVAILABLE_CODE']},{groups:{}}),'已选 1 项')
 const normalized=normalizeOptions({groups:{flavor:[{code:'NEW_INTERNAL_CODE'}]}})
 assert.equal(normalized.groups.flavor[0].label,'其他选项')
 assert.doesNotMatch(criteriaSummary({includeTagCodes:['NEW_INTERNAL_CODE']},normalized),/NEW_INTERNAL_CODE/)
 assert.equal(criteriaSummary({includeTagCodes:['NEW_INTERNAL_CODE']},{groups:{flavor:[{code:'NEW_INTERNAL_CODE',label:'NEW_INTERNAL_CODE'}]}}),'已选 1 项')
})
