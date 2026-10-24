const test = require('node:test'), assert = require('node:assert/strict')
const { presentRecipeIngredients, recipeNotes, cleanRecipeText, parseIngredient } = require('../utils/recipe-display')
const {canonicalDish,fixedCalculation}=require('./fixtures/canonical-dish')
test('fixed recipe amounts and discretionary seasoning are readable without modifying the recipe', () => {
  const dish = canonicalDish({id:1,ingredientsAmounts:'鸡蛋|2|枚|主料|打散#盐|适量|g|调料|'})
  const before = JSON.stringify(dish), result = presentRecipeIngredients(dish)
  assert.deepEqual(result.lines, ['鸡蛋 2枚（打散）', '盐 适量'])
  assert.equal(result.basis, '整道菜用量'); assert.equal(JSON.stringify(dish), before)
})
test('legacy material and quality fields cannot provide a second recipe source', () => {
  const result = presentRecipeIngredients({cl:'胡椒#快手#锡纸',quality:{ingredients:[{name:'胡椒',rawQuantity:'用量待核实'}]}})
  assert.deepEqual(result, {rows:[],lines:[],basis:''})
})
test('different diner counts preserve fixed amounts, preparation and basis', () => {
  const dish=canonicalDish({id:1,ingredientsAmounts:[{name:'豆腐',quantity:250,unit:'g',preparation:'切成小块'}]})
  for(const diners of [null,1,2,8]){
    const result=presentRecipeIngredients({...dish,scaledRecipe:fixedCalculation(dish,{},diners)})
    assert.deepEqual(result.lines,['豆腐 250克（切成小块）']);assert.equal(result.basis,'整道菜用量')
  }
  assert.equal(parseIngredient({name:'盐',quantityText:'用量待核实',rawQuantity:'少许',unit:'克'}).amount, '少许')
  assert.equal(parseIngredient('盐适量').amount, '适量')
})
test('only useful nonduplicate cooking tips appear beneath ingredients', () => {
  assert.deepEqual(recipeNotes({tips:'翻面前等底部定型#暂无#家常#2名成年人用量+15%冗余',methods:'炒#翻面前等底部定型#加热锅具后倒油',steps:'加热锅具后倒油'}), ['翻面前等底部定型'])
  assert.equal(cleanRecipeText('250克（2名成年人总量+15%冗余）（原使用量仅供参考）'), '250克')
})
