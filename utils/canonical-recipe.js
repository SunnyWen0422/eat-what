// The server owns quantities, rounding, allocations and nutrition. No text inference.
const unitLabels = { g: '克', ml: '毫升', unit: '个', piece:'个' }
const factLabels = { DIET_VEGAN:'纯素', DIET_OVO_LACTO:'蛋奶素', DIET_LACTO_OVO:'蛋奶素', ALLERGEN_SOY:'大豆', ALLERGEN_WHEAT:'小麦', ALLERGEN_EGG:'蛋', ALLERGEN_MILK:'奶', ALLERGEN_FISH:'鱼', ALLERGEN_CRUSTACEAN:'甲壳类', ALLERGEN_MOLLUSC:'软体贝类', ALLERGEN_PEANUT:'花生', ALLERGEN_TREE_NUT:'坚果', ALLERGEN_SESAME:'芝麻' }
function recipeOf(dish) {
  const recipe = dish && dish.recipe
  if (!recipe || recipe.quantityPolicy!=='fixed-recipe-v1' || recipe.scaling || !Array.isArray(recipe.ingredients) || !recipe.ingredients.length || !Array.isArray(recipe.steps) || !recipe.steps.length || !(recipe.baseServings === null || typeof recipe.baseServings === 'number' && recipe.baseServings > 0)) throw Error('菜谱数据版本不可用，请重新读取')
  recipe.ingredients.forEach(line => { if (line.scaleRule || !line.ingredient || !line.ingredient.name || line.ingredient.id !== line.ingredientId) throw Error('食材资料不完整，请重新读取') })
  return recipe
}
function amount(quantity, unit, quantityKind) { return quantityKind === 'discretionary' ? '适量' : quantity == null ? '' : String(quantity) + (unitLabels[unit] || unit || '') }
function servingLabel() { return '整道菜用量' }
function fixedCalculation(value, diners = null) {
  if(!value || value.quantityPolicy!=='fixed-recipe-v1' || value.quantityBasis!=='fixed_recipe' || value.portionBasis!=='equal_share_reference' || value.diners!==diners || diners===null && value.nutrition && value.nutrition.perServing!==null)throw Error('菜谱用量规则已更新，请重新读取')
  return value
}
function optionalRows(dish, scaled) { return recipeOf(dish).ingredients.filter(line=>line.optional).map(line=>({id:line.id,name:line.ingredient.name,enabled:scaled ? scaled.ingredients.some(row=>row.lineId===line.id && row.enabled !== false) : line.defaultEnabled !== false})) }
function ingredientRows(dish, scaled) {
  const recipe = recipeOf(dish)
  if(scaled)fixedCalculation(scaled,scaled.diners)
  const rows = scaled ? scaled.ingredients : recipe.ingredients
  if (!Array.isArray(rows) || rows.length !== recipe.ingredients.length) throw Error('份量计算不完整，请重试')
  return rows.filter(line => line.enabled !== false && (scaled || line.defaultEnabled !== false)).map(line => {
    const original = recipe.ingredients.find(row => row.id === (line.lineId || line.id))
    if (!original || original.ingredientId !== line.ingredientId) throw Error('食材版本已变化，请重新读取')
    const name = original.ingredient.name, preparation = original.preparation || '', value = amount(line.quantity, line.unit, line.quantityKind || original.quantityKind)
    return { id:original.id, name, amount:value, preparation, optional:original.optional === true, wide:name.length>12 || preparation.length>20 || value.length>18 }
  })
}
function stepLines(dish, scaled) {
  const recipe = recipeOf(dish)
  return (scaled ? scaled.steps : recipe.steps).map(step => {
    const text = require('./recipe-steps').stripStepNumber(step.text)
    if (/\{\{\s*amount\b/.test(text)) throw Error('步骤用量暂未读到，请重新读取')
    const additions = Object.entries(step.ingredientQuantities || {}).map(([id, value]) => {
      const line = recipe.ingredients.find(row => row.id === id)
      if (!line) throw Error('步骤食材不完整，请重试')
      const object = value !== null && typeof value === 'object'
      return line.ingredient.name + ' ' + amount(object ? value.quantity : value, object ? value.unit : line.unit, object ? value.quantityKind : line.quantityKind)
    })
    return text + (additions.length ? '\n本步用量：' + additions.join('、') : '')
  })
}
function facts(dish) {
  const recipe = recipeOf(dish)
  const source=dish.scaledRecipe || recipe
  return { dietary:(source.dietaryCodes || []).map(code=>factLabels[code] || code), allergens:(source.allergenCodes || []).map(code=>factLabels[code] || code), dietaryKnown:Array.isArray(source.dietaryCodes), allergensKnown:Array.isArray(source.allergenCodes) }
}
function nutritionView(scaled) {
  const nutrition=scaled && scaled.nutrition, total = nutrition && nutrition.total
  const available=!!total && nutrition.completeness === 'complete' && ['energyKcal','proteinG','fatG','carbohydrateG','fiberG','sodiumMg'].every(key=>typeof total[key]==='number'&&Number.isFinite(total[key])&&total[key]>=0)
  return { nutritionAvailable:available, nutritionText:available ? `约 ${Math.round(total.energyKcal)} 千卡` : '', nutritionNote:available?'仅参考':'' }
}
module.exports = { recipeOf, ingredientRows, stepLines, amount, facts, nutritionView, fixedCalculation, servingLabel, optionalRows }
