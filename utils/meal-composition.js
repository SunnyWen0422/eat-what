/** Composition counts are dish counts, never portion or nutrition estimates. */
const TYPES = ['meat', 'veg', 'soup', 'staple', 'dessert', 'side']
const LABELS = { meat: '荤菜', veg: '素菜', soup: '汤', staple: '主食', dessert: '甜品', side: '配餐' }
const SHORT = { meat: '荤', veg: '素', soup: '汤', staple: '主食', dessert: '甜品', side: '配餐' }
const ALIASES = { '荤菜': 'meat', '素菜': 'veg', '汤': 'soup', '汤品': 'soup', '主食': 'staple', '甜品': 'dessert', '配餐': 'side', '配菜': 'side' }

/** @returns {{valid:boolean,total:number,error:string}} */
function validateCounts(counts) {
  const error = '每类菜数应为 0 至 10 的整数，合计至少 1 道、最多 10 道'
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) return { valid: false, total: 0, error }
  const entries = Object.entries(counts)
  const total = entries.reduce((sum, [, count]) => sum + (typeof count === 'number' && Number.isFinite(count) ? count : 0), 0)
  const valid = entries.length > 0 && entries.every(([type, count]) => TYPES.includes(type) && Number.isInteger(count) && count >= 0 && count <= 10) && total >= 1 && total <= 10
  return { valid, total, error: valid ? '' : error }
}

function compositionRows(context = {}) {
  const types = context.mealType === 'breakfast' ? ['staple', 'side', 'meat', 'veg', 'soup', 'dessert'] : TYPES
  return types.map(type => ({ type, label: LABELS[type], count: context.counts && context.counts[type] != null ? context.counts[type] : 0 }))
}
function compositionSummary(context = {}) {
  return compositionRows(context).filter(row => Number(row.count) > 0).map(row => `${row.count}${SHORT[row.type]}`).join(' · ')
}
function normalizeDishType(type) {
  return TYPES.includes(type) ? type : Object.prototype.hasOwnProperty.call(ALIASES, type) ? ALIASES[type] : null
}

/** Side is the legacy breakfast bucket for non-staples without an explicit category.
 * Explicit soup/dessert/etc counts take precedence so a dish is never counted twice.
 * Unknown categories are ignored; callers must disclose incomplete classification.
 */
function missingCounts(expected = {}, actualTypes = [], mealType = 'breakfast') {
  const actual = {}
  for (const value of actualTypes) {
    let type = normalizeDishType(value)
    if (!type) continue
    if (mealType === 'breakfast' && expected.side > 0 && type !== 'staple' && !(expected[type] > 0)) type = 'side'
    actual[type] = (actual[type] || 0) + 1
  }
  return TYPES.filter(type => expected[type] > (actual[type] || 0)).map(type => ({ type, count: expected[type] - (actual[type] || 0) }))
}
module.exports = { validateCounts, compositionRows, compositionSummary, missingCounts, normalizeDishType }
