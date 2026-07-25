const assert = require('node:assert/strict')
const test = require('node:test')

const {
  HOME_QUICK_OPTIONS,
  emptyCriteria,
  normalizeCriteria,
  toggleQuickOption,
  criteriaCount,
  criteriaSummary,
} = require('../../utils/recommendation-criteria')

test('home quick options are exactly home style, Sichuan and Cantonese', () => {
  assert.deepEqual(HOME_QUICK_OPTIONS.map(option => option.label), ['家常菜', '川菜', '粤菜'])
  assert.deepEqual(HOME_QUICK_OPTIONS.map(option => option.id), ['home', 'sichuan', 'cantonese'])
})

test('home quick selections toggle canonical hard filters without mutating input', () => {
  const original = emptyCriteria()
  const home = toggleQuickOption(original, 'home')
  const mixed = toggleQuickOption(toggleQuickOption(home, 'sichuan'), 'cantonese')

  assert.deepEqual(original, emptyCriteria())
  assert.deepEqual(home.includeTagCodes, ['HOME_STYLE'])
  assert.deepEqual(mixed.cuisineCodes, ['CANTONESE', 'SICHUAN'])
  assert.equal(criteriaCount(mixed), 3)

  const cleared = toggleQuickOption(mixed, 'sichuan')
  assert.deepEqual(cleared.cuisineCodes, ['CANTONESE'])
})

test('criteria normalization trims, deduplicates and bounds user values', () => {
  const criteria = normalizeCriteria({
    cuisineCodes: ['SICHUAN', ' SICHUAN ', 'CANTONESE'],
    includeTagCodes: ['HOME_STYLE', '', 'HOME_STYLE'],
    excludeTagCodes: ['FRY', ' FRY '],
    excludedIngredients: [' 花生 ', '花生', '香菜'.repeat(20)],
    maxCookMinutes: 37,
  })

  assert.deepEqual(criteria.cuisineCodes, ['CANTONESE', 'SICHUAN'])
  assert.deepEqual(criteria.includeTagCodes, ['HOME_STYLE'])
  assert.deepEqual(criteria.excludeTagCodes, ['FRY'])
  assert.deepEqual(criteria.excludedIngredients, ['花生', '香菜'.repeat(10)])
  assert.equal(criteria.maxCookMinutes, 37)
  assert.equal(criteriaSummary(criteria), '粤菜、川菜、家常菜、排除 1 项、忌口 2 项、37 分钟内')
})

test('criteria summaries use friendly labels for the complete catalog', () => {
  assert.equal(criteriaSummary({
    cuisineCodes: ['NORTHEAST'],
    includeTagCodes: ['STEAM', 'LOW_EFFORT'],
  }), '东北菜、省心好做、蒸')
})
