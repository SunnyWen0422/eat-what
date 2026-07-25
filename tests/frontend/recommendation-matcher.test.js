const assert = require('node:assert/strict')
const test = require('node:test')

const { filterAndRankDishes } = require('../../utils/recommendation-matcher')

test('local fallback honors canonical hard filters before applying preference weights', () => {
  const dishes = [
    { id: 1, name: '川味家常菜', type: 'meat', cuisineCode: 'SICHUAN', tagCodes: 'HOME_STYLE,SPICY', cookMinutes: 20, ingredientsAmounts: '牛肉,青椒' },
    { id: 2, name: '粤式家常菜', type: 'meat', cuisineCode: 'CANTONESE', tagCodes: 'HOME_STYLE,LIGHT', cookMinutes: 15, ingredientsAmounts: '鸡肉,花生' },
    { id: 3, name: '未知时长川菜', type: 'meat', cuisineCode: 'SICHUAN', tagCodes: 'HOME_STYLE', ingredientsAmounts: '牛肉' },
  ]

  const filtered = filterAndRankDishes(dishes, {
    criteria: {
      cuisineCodes: ['SICHUAN'],
      includeTagCodes: ['HOME_STYLE'],
      excludeTagCodes: [],
      excludedIngredients: ['花生'],
      maxCookMinutes: 30,
    },
    preferences: { preferredCuisineCodes: ['CANTONESE'], preferredTagCodes: ['LIGHT'] },
    recentNames: [],
  })

  assert.deepEqual(filtered.map(dish => dish.id), [1])
})

test('persisted preferences are skipped when the request disables them', () => {
  const dishes = [
    { id: 1, name: '川菜', cuisineCode: 'SICHUAN', tagCodes: 'SPICY' },
    { id: 2, name: '粤菜', cuisineCode: 'CANTONESE', tagCodes: 'LIGHT' },
  ]

  const ranked = filterAndRankDishes(dishes, {
    criteria: {},
    preferences: { preferredCuisineCodes: ['CANTONESE'], preferredTagCodes: ['LIGHT'] },
    useSavedPreferences: false,
    recentNames: [],
  })

  assert.deepEqual(ranked.map(dish => dish.id), [1, 2])
})

test('permanent exclusions still filter local fallback when preference ranking is disabled', () => {
  const dishes = [
    { id: 1, name: 'fried', cuisineCode: 'SICHUAN', tagCodes: 'FRY', cookMinutes: 20, ingredientsAmounts: 'beef' },
    { id: 2, name: 'plain', cuisineCode: 'SICHUAN', tagCodes: 'HOME_STYLE', cookMinutes: 20, ingredientsAmounts: 'chicken' },
  ]

  const filtered = filterAndRankDishes(dishes, {
    criteria: {},
    preferences: { excludedTagCodes: ['FRY'], excludedIngredients: ['peanut'], maxCookMinutes: 30 },
    useSavedPreferences: false,
  })

  assert.deepEqual(filtered.map(dish => dish.id), [2])
})

test('multiple wanted tags use any-match semantics', () => {
  const dishes = [
    { id: 1, name: 'spicy', tagCodes: 'SPICY' },
    { id: 2, name: 'light', tagCodes: 'LIGHT' },
    { id: 3, name: 'plain', tagCodes: 'HOME_STYLE' },
  ]

  const filtered = filterAndRankDishes(dishes, {
    criteria: { includeTagCodes: ['SPICY', 'LIGHT'] },
  })

  assert.deepEqual(filtered.map(dish => dish.id), [1, 2])
})
