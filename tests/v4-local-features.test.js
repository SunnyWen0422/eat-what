const test = require('node:test')
const assert = require('node:assert/strict')

test('presentation prioritizes an unknown write over an already saved plan', () => {
  const { deriveWorkspacePresentation } = require('../utils/meal-workspace-presentation')
  const result = deriveWorkspacePresentation({ status: 'planned', syncStatus: 'unknown', linkedPlan: { id: 1 }, context: { date: '2026-10-06', mealType: 'dinner' } })
  assert.equal(result.primaryAction, 'onRetryWorkspace')
})
test('a changed requirement cannot be confirmed and a planned meal opens all recipes', () => {
  const { deriveWorkspacePresentation: derive } = require('../utils/meal-workspace-presentation')
  assert.equal(derive({ status: 'needs_regeneration', syncStatus: 'synced' }).primaryAction, 'onGenerate')
  assert.equal(derive({ status: 'planned', syncStatus: 'synced', linkedPlan: { id: 1 } }).primaryAction, 'onViewRecipes')
  assert.equal(derive({ status: 'generating', syncStatus: 'synced' }).primaryAction, 'onCancelTask')
})
test('V4 prices keep different manual ingredient rows separate and actual zero does not mark purchased', () => {
  const prices = require('../utils/shopping-prices')
  const a = { id: 11, canonicalName: 'manual-a', displayName: '番茄', quantityText: '2个' }
  const b = { id: 12, canonicalName: 'manual-b', displayName: '番茄', quantityText: '2个' }
  assert.notEqual(prices.ingredientKey(a), prices.ingredientKey(b))
  const list = { dishes: [{ items: [a, b] }], expenses: { [prices.ingredientKey(a)]: { amount: '0.00' } } }
  const result = prices.buildPricing(list, {}, '2026-10-06')
  assert.equal(result.rows.length, 2); assert.equal(result.actualText, '¥0.00')
  assert.equal(result.pendingText, '—'); assert.equal(a.checked, undefined)
})
test('reference quotes use trusted quantities and retain missing or stale values as unknown', () => {
  const p = require('../utils/shopping-prices')
  const item = { sourceDishId: 1, canonicalName: '番茄', quantityValue: 300, unitCode: 'g', unitFamily: 'mass', parseStatus: 'PARSED', calculationStatus: 'CALCULATED' }
  const q = { status: 'AVAILABLE', quoteDate: '2026-10-06', price: '6.00', unitQuantity: 500, unitCode: 'g', unitFamily: 'mass' }
  assert.equal(p.estimate(item, q, '2026-10-06'), 360)
  assert.equal(p.estimate({ ...item, userOverride: true }, q, '2026-10-06'), null)
  assert.equal(p.estimate(item, { ...q, quoteDate: '2026-09-01' }, '2026-10-06'), null)
  assert.throws(() => p.amountCents('1e2')); assert.throws(() => p.amountCents('-1'))
})
test('same recipe ingredient across two meals records one actual spend and estimates both quantities', () => {
  const p = require('../utils/shopping-prices')
  const item = { sourceDishId: 1, canonicalName: '番茄', quantityValue: 300, quantityText: '300克', unitCode: 'g', unitFamily: 'mass', parseStatus: 'PARSED', calculationStatus: 'CALCULATED' }
  const key = p.ingredientKey(item)
  const list = { dishes: [{ dishId: 1, items: [item] }, { dishId: 1, items: [{ ...item, checked: true }] }], expenses: { [key]: { amount: '9.00' } } }
  const result = p.buildPricing(list, { [key]: { status: 'AVAILABLE', quoteDate: '2026-10-06', price: '6.00', unitQuantity: 500, unitCode: 'g', unitFamily: 'mass' } }, '2026-10-06')
  assert.equal(result.actualText, '¥9.00'); assert.equal(result.pendingText, '¥3.60'); assert.equal(result.recorded, 1)
})
test('cooking progress is scoped by account and plan revision', () => {
  const p = require('../utils/cooking-progress'); const values = new Map()
  const storage = { getStorageSync: k => values.get(k), setStorageSync: (k, v) => values.set(k, v) }
  const context = { scope: 'A', date: '2026-10-06', mealType: 'dinner', planRevision: 3 }
  p.saveProgress(storage, context, { '1': 2, '2': 0 })
  assert.deepEqual(p.loadProgress(storage, context), { '1': 2, '2': 0 })
  assert.deepEqual(p.loadProgress(storage, { ...context, scope: 'B' }), {})
  assert.deepEqual(p.loadProgress(storage, { ...context, planRevision: 4 }), {})
})
