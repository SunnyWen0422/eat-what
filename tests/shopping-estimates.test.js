const test = require('node:test'), assert = require('node:assert/strict')
const prices = require('../utils/shopping-prices')
const fixture = require('./fixtures/shopping-estimates.json')
for (const example of fixture.cases) test('official estimate parity: ' + example.name, () => {
  const item = { ...fixture.baseItem, ...example.item }, quote = { ...fixture.baseQuote, ...example.quote }
  assert.equal(prices.estimate(item, quote, fixture.today), example.expectedCents)
  if (example.name === 'spec mismatch' || example.name === 'similar name is not equivalent') {
    const view = prices.buildPricing({ dishes: [{ dishId: 1, items: [item] }] }, { [prices.ingredientKey(item)]: quote }, fixture.today)
    assert.equal(view.rows[0].quote, null)
  }
})
test('partial known subtotal, source-line coverage and official attribution match Java fixture; actual zero is separate', () => {
  const items = fixture.summary.items.map(item => ({ ...fixture.baseItem, ...item }))
  const quotes = { [prices.ingredientKey(items[0])]: fixture.baseQuote }
  const list = { dishes: [{ dishId: 1, items }], expenses: { [prices.ingredientKey(items[0])]: { amount: '0.00' } } }
  const before = JSON.stringify(list)
  const view = prices.buildPricing(list, quotes, fixture.today)
  assert.deepEqual(view.estimateSummary, fixture.summary.expected)
  assert.equal(view.pendingText, '¥3.60'); assert.equal(view.actualText, '¥0.00')
  assert.equal(JSON.stringify(list), before)
  assert.deepEqual(prices.summarizeEstimate(list, {}, fixture.today), { scope: 'pending_source_items', coveredCount: 0, missingCount: 2, totalCount: 2, knownSubtotalCents: null, totalCents: null, complete: false, quoteDates: [], sources: [] })
})
test('complete and empty lists do not call an unknown total zero', () => {
  const item = fixture.baseItem, key = prices.ingredientKey(item)
  const complete = prices.summarizeEstimate({ dishes: [{ dishId: 1, items: [item] }] }, { [key]: fixture.baseQuote }, fixture.today)
  assert.equal(complete.complete, true); assert.equal(complete.totalCents, 360)
  const empty = prices.summarizeEstimate({ dishes: [] }, {}, fixture.today)
  assert.equal(empty.complete, false); assert.equal(empty.knownSubtotalCents, null); assert.equal(empty.totalCents, null)
})
test('subtotal stays within the same exact integer boundary as Java', () => {
  const limit = fixture.numericBoundary, item = { ...fixture.baseItem, ...limit.item }, quote = { ...fixture.baseQuote, ...limit.quote }
  const summary = prices.summarizeEstimate({ dishes: [{ dishId: 1, items: Array.from({ length: limit.repeat }, () => ({ ...item })) }] }, { [prices.ingredientKey(item)]: quote }, fixture.today)
  assert.equal(summary.coveredCount, limit.coveredCount); assert.equal(summary.missingCount, limit.missingCount)
  assert.equal(summary.knownSubtotalCents, limit.knownSubtotalCents); assert.equal(summary.totalCents, null)
})
