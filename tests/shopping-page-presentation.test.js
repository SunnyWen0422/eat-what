const test = require('node:test')
const assert = require('node:assert/strict')
const { shoppingPagePresentation } = require('../utils/shopping-page-presentation')

test('nonempty shopping emphasizes checking', () => {
  for (const counts of [{pendingCount:2,checkedCount:0},{pendingCount:0,checkedCount:2}]) {
    const result = shoppingPagePresentation(counts)
    assert.equal(result.addEmphasis, 'secondary')
    assert.equal(result.emptyAction, '')
  }
  assert.equal(shoppingPagePresentation({}).addEmphasis, 'primary')
  assert.equal(shoppingPagePresentation({}).emptyAction, '从日历准备食材')
})
test('source context is derived without inferring eaten or picking a mixed meal', () => {
  const sourceMeals=[{date:'2026-10-16',mealType:'dinner',label:'2026-10-16 晚餐'}]
  assert.equal(shoppingPagePresentation({pendingCount:1,sourceMeals}).contextLabel, sourceMeals[0].label)
  assert.equal(shoppingPagePresentation({checkedCount:1,sourceMeals:[...sourceMeals,{date:'2026-10-17',mealType:'lunch'}]}).contextLabel,'来自2个餐次 · 选择查看')
  for(const state of [{loading:true},{offline:true},{drafts:[{}]}]) assert.equal(shoppingPagePresentation(state).emptyAction,'')
})
