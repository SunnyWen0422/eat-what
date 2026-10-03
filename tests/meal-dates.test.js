const test = require('node:test')
const assert = require('node:assert/strict')
const dates = require('../utils/meal-workflow')
test('月范围按真实天数且周范围从周一开始', () => {
  assert.deepEqual(dates.monthRange(2026, 2), { startDate: '2026-02-01', endDate: '2026-02-28' })
  assert.deepEqual(dates.weekRange('2026-10-01'), { startDate: '2026-09-28', endDate: '2026-10-04' })
})
test('计划和实际记录均出现在当日餐次视图，撤销实际记录不抹掉计划', () => {
  const model = dates.mealViews({ plans: [{ id: 1, recordDate: '2026-10-01', mealType: 'dinner', recipeName: '鱼', revision: 2 }], consumptions: [{ mealDate: '2026-10-01', mealType: 'dinner', status: 'eaten', revision: 1, actualDishes: [{ name: '面' }] }] }, '2026-10-01')
  assert.equal(model[2].plan.recipeName, '鱼')
  assert.equal(model[2].actualNames, '面')
  assert.equal(model[2].statusLabel, '已记录实际用餐')
})
