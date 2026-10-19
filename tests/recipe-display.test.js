const test = require('node:test'), assert = require('node:assert/strict')
const { presentRecipeIngredients, recipeNotes, cleanRecipeText, parseIngredient } = require('../utils/recipe-display')
test('original amounts are readable without changing quality or scaling eligibility', () => {
  const dish = { ingredientsAmounts: '鸡蛋|2|枚|主料|打散||2名成年人总量+15%冗余#盐|适量|克|调料|||2名成年人用量+15%冗余', quality: { reviewStatus: 'UNVERIFIED', ingredients: [{name:'鸡蛋',identityStatus:'UNVERIFIED',quantityStatus:'UNKNOWN',rawText:'鸡蛋|2|枚|主料|打散||2名成年人总量+15%冗余'}, {name:'盐',identityStatus:'UNVERIFIED',quantityStatus:'UNKNOWN'}] } }
  const before = JSON.stringify(dish), result = presentRecipeIngredients(dish)
  assert.deepEqual(result.lines, ['鸡蛋 2枚（打散）', '盐 适量'])
  assert.equal(result.basis, '原方用量'); assert.equal(JSON.stringify(dish), before)
})
test('missing amounts stay absent and rejected non-ingredients do not return', () => {
  const result = presentRecipeIngredients({cl:'胡椒#快手#锡纸',quality:{ingredients:[{name:'胡椒',rawQuantity:'用量待核实'},{name:'锡纸',identityStatus:'REJECTED'}]}})
  assert.deepEqual(result.lines, ['胡椒']); assert.equal(result.rows[0].amount, '')
})
test('verified quantities retain their basis while raw units and useful preparation remain legible', () => {
  const result = presentRecipeIngredients({quality:{reviewStatus:'VERIFIED',servingsStatus:'VERIFIED',basePeople:2,ingredients:[{name:'豆腐',identityStatus:'VERIFIED',quantityStatus:'VERIFIED',quantityValue:250,unit:'克',preparation:'切成小块'}]}})
  assert.deepEqual(result.lines, ['豆腐 250克（切成小块）']); assert.equal(result.basis, '原方 2 人份')
  assert.equal(parseIngredient({name:'盐',quantityText:'用量待核实',rawQuantity:'少许',unit:'克'}).amount, '少许')
  assert.equal(parseIngredient('盐适量').amount, '适量')
})
test('only useful nonduplicate cooking tips appear beneath ingredients', () => {
  assert.deepEqual(recipeNotes({tips:'翻面前等底部定型#暂无#家常#2名成年人用量+15%冗余',methods:'炒#翻面前等底部定型#加热锅具后倒油',steps:'加热锅具后倒油'}), ['翻面前等底部定型'])
  assert.equal(cleanRecipeText('250克（2名成年人总量+15%冗余）（原使用量仅供参考）'), '250克')
})
