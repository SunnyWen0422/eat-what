const { normalizeCriteria } = require('./recommendation-criteria')
const { normalizePreferences } = require('./preference-store')

function codes(value) {
  if (Array.isArray(value)) return new Set(value.map(item => String(item).trim().toUpperCase()).filter(Boolean))
  return new Set(String(value || '').split(',').map(item => item.trim().toUpperCase()).filter(Boolean))
}

function matchesCriteria(dish, criteria) {
  const value = normalizeCriteria(criteria)
  const dishTags = codes(dish.tagCodes)
  const cuisineCode = String(dish.cuisineCode || '').trim().toUpperCase()
  if (value.cuisineCodes.length && !value.cuisineCodes.includes(cuisineCode)) return false
  if (value.includeTagCodes.length && !value.includeTagCodes.some(code => dishTags.has(code))) return false
  if (value.excludeTagCodes.some(code => dishTags.has(code))) return false
  if (value.maxCookMinutes && (!Number(dish.cookMinutes) || Number(dish.cookMinutes) > value.maxCookMinutes)) return false
  const ingredients = `${dish.cl || ''} ${dish.ingredientsAmounts || ''}`.toLowerCase()
  if (value.excludedIngredients.some(item => ingredients.includes(item.toLowerCase()))) return false
  return true
}

function scoreDish(dish, preferences, recentNames) {
  const value = normalizePreferences(preferences)
  const dishTags = codes(dish.tagCodes)
  const cuisineCode = String(dish.cuisineCode || '').trim().toUpperCase()
  let score = 0
  if (value.preferredCuisineCodes.includes(cuisineCode)) score += 30
  score += Math.min(24, value.preferredTagCodes.filter(code => dishTags.has(code)).length * 12)
  if (recentNames.has(dish.name)) score -= 40
  return score
}

function mergeHardCriteria(criteria, preferences) {
  const current = normalizeCriteria(criteria)
  const saved = normalizePreferences(preferences)
  const limits = [current.maxCookMinutes, saved.maxCookMinutes].filter(Boolean)
  return normalizeCriteria({
    ...current,
    excludeTagCodes: [...current.excludeTagCodes, ...saved.excludedTagCodes],
    excludedIngredients: [...current.excludedIngredients, ...saved.excludedIngredients],
    maxCookMinutes: limits.length ? Math.min(...limits) : null,
  })
}

function filterAndRankDishes(dishes, options = {}) {
  const savedPreferences = normalizePreferences(options.preferences)
  const criteria = mergeHardCriteria(options.criteria, savedPreferences)
  const preferences = options.useSavedPreferences === false ? normalizePreferences({}) : savedPreferences
  const recentNames = new Set(Array.isArray(options.recentNames) ? options.recentNames : [])
  return (Array.isArray(dishes) ? dishes : [])
    .filter(dish => matchesCriteria(dish, criteria))
    .map((dish, index) => ({ dish, index, score: scoreDish(dish, preferences, recentNames) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(item => item.dish)
}

module.exports = { filterAndRankDishes, matchesCriteria, scoreDish }
