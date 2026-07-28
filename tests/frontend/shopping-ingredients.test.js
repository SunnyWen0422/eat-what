const assert = require('node:assert/strict')
const test = require('node:test')
const ingredients = require('../../utils/shopping-ingredients')

test('parses structured ingredient text and scales without a second allowance', () => {
  const item = ingredients.parseIngredientText('猪排|345|克|主料|切片')
  assert.equal(item.displayName, '猪排')
  assert.equal(item.quantityValue, 345)
  assert.equal(item.unitFamily, 'mass')
  const scaled = ingredients.scaleLocalQuantity(item, 2, 4)
  assert.equal(scaled.quantityValue, 690)
})

test('same ingredient in different dishes remains separate', () => {
  const items = ingredients.mergeLocalItems([
    { selectionKey: 'dish-a', canonicalName: '猪排', quantityValue: 300, quantityText: '300g', unitCode: 'g', unitFamily: 'mass', parseStatus: 'PARSED' },
    { selectionKey: 'dish-b', canonicalName: '猪排', quantityValue: 400, quantityText: '400g', unitCode: 'g', unitFamily: 'mass', parseStatus: 'PARSED' },
  ])
  assert.equal(items.length, 2)
})

test('purchase summary is derived and records sources', () => {
  const summary = ingredients.buildPurchaseSummary([
    { dishName: '炸猪排', items: [{ canonicalName: '猪排', displayName: '猪排', quantityValue: 300, quantityText: '300g', unitCode: 'g', unitFamily: 'mass', parseStatus: 'PARSED' }] },
    { dishName: '葱烧大排', items: [{ canonicalName: '猪排', displayName: '猪排', quantityValue: 400, quantityText: '400g', unitCode: 'g', unitFamily: 'mass', parseStatus: 'PARSED' }] },
  ])
  assert.equal(summary.mergeableItems[0].quantityValue, 700)
  assert.equal(summary.mergeableItems[0].sourceDishLabel, '炸猪排、葱烧大排')
})
