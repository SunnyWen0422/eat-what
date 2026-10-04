const test = require('node:test')
const assert = require('node:assert/strict')
const { buildPurchaseSummary } = require('../utils/shopping-ingredients')

function group(id, date, checked, variant = '') {
  return { selectionKey: `${date}-dinner-${id}`, dishName: '番茄炒蛋', sourceDate: date, sourceMealType: 'dinner', items: [{ id, canonicalName: '鸡蛋', displayName: '鸡蛋', normalizedVariant: variant, quantityValue: 2, quantityText: '2个', unitFamily: 'count', unitCode: '个', parseStatus: 'PARSED', calculationStatus: 'CALCULATED', servingsVerified: true, checked }] }
}
test('采购汇总保留不同餐次来源及部分已买状态', () => {
  const result = buildPurchaseSummary([group(1, '2026-10-01', true), group(2, '2026-10-02', false)])
  assert.equal(result.mergeableItems.length, 1)
  assert.equal(result.mergeableItems[0].quantityValue, 4)
  assert.deepEqual(result.mergeableItems[0].itemIds, [1, 2])
  assert.equal(result.mergeableItems[0].checkedState, 'partial')
  assert.equal(result.mergeableItems[0].sources.length, 2)
})
test('不同食材形态不能被汇总合并', () => {
  const result = buildPurchaseSummary([group(1, '2026-10-01', false, '熟'), group(2, '2026-10-02', false, '生')])
  assert.equal(result.mergeableItems.length, 2)
})
