const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')

test('recommendation filter page applies canonical criteria and has a clear action', () => {
  const pagePath = path.join(root, 'pages/recommend-filter/recommend-filter.js')
  assert.equal(fs.existsSync(pagePath), true)
  const source = fs.readFileSync(pagePath, 'utf8')

  assert.match(source, /onApply/)
  assert.match(source, /onClear/)
  assert.match(source, /pendingRecommendationCriteria/)
})

test('settings uses canonical preference codes instead of legacy booleans', () => {
  const source = fs.readFileSync(path.join(root, 'pages/settings/settings.js'), 'utf8')

  assert.match(source, /preferredCuisineCodes/)
  assert.match(source, /createPreferenceStore/)
  assert.doesNotMatch(source, /lowCalorie|preferChuan|preferYue/)
})
