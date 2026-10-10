const test = require('node:test'), assert = require('node:assert/strict')
const { serverDate } = require('../utils/server-date')
test('zone-less server dates use Beijing time without platform string parsing', () => {
  assert.equal(serverDate('2026-04-29 16:10:39').toISOString(), '2026-04-29T08:10:39.000Z')
  assert.equal(serverDate('2026-04-29T16:10:39.12').toISOString(), '2026-04-29T08:10:39.120Z')
  assert.equal(serverDate('2026-04-29T08:10:39Z').toISOString(), '2026-04-29T08:10:39.000Z')
})
test('invalid server dates do not become invented registration times', () => {
  for (const value of [null, '', 'unknown', '2026-02-30 12:00:00', '2026-04-29 24:00:00', '2026-13-01 00:00:00']) assert.equal(serverDate(value), null)
})
