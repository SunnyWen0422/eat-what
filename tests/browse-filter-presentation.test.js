const test = require('node:test'), assert = require('node:assert/strict')
const groups = { cuisine: [{ code: 'SICHUAN', label: '川菜' }], flavor: [{ code: 'LIGHT', label: '清淡' }], method: [{ code: 'STEAM', label: '蒸' }] }
const criteria = { cuisineCodes: ['SICHUAN', 'CANTONESE'], tagCodes: ['LIGHT'], methodCodes: ['STEAM'], maxCookMinutes: 30, excludedIngredients: ['花生'], excludeTagCodes: ['SPICY'] }
test('active filters project the existing option labels and retain unknown codes', () => {
  const { activeBrowseFilters } = require('../utils/browse-filter-presentation')
  const rows = activeBrowseFilters(criteria, groups)
  assert.deepEqual(rows.map(x => x.label), ['川菜', 'CANTONESE', '清淡', '蒸', '30分钟内'])
  assert.equal(new Set(rows.map(x => x.key)).size, rows.length)
  assert.equal(rows.some(x => /花生|SPICY/.test(x.label)), false)
})
test('remove one filter preserves all other state', () => {
  const { removeBrowseFilter } = require('../utils/browse-filter-presentation')
  const before = { ...criteria, query: '鸡蛋', selectedIds: [1, 2] }
  assert.deepEqual(removeBrowseFilter(before, 'cuisineCodes:SICHUAN'), { ...before, cuisineCodes: ['CANTONESE'] })
  assert.deepEqual(before.cuisineCodes, ['SICHUAN', 'CANTONESE'])
  assert.deepEqual(removeBrowseFilter(before, 'excludedIngredients:花生'), before)
  assert.deepEqual(removeBrowseFilter(before, 'maxCookMinutes'), { ...before, maxCookMinutes: null })
})
