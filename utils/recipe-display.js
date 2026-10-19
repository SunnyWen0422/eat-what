// Reading presentation only: original amounts never authorize scaling or procurement.
const { readableRecipeLine } = require('./personal-recipes')
const descriptors = new Set(['快手', '干锅', '手撕', '爽口', '锡纸', '脆皮', '广式'])
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
function cleanRecipeText(value) {
  return text(value)
    .replace(/(?:\d+|两|二|一)\s*(?:名|位|个)?成年人(?:总量|用量)?\s*(?:[+＋]\s*(?:\d+(?:\.\d+)?\s*[%％]\s*)?冗余)?/g, '')
    .replace(/(?:[+＋]\s*)?\d+(?:\.\d+)?\s*[%％]\s*冗余/g, '')
    .replace(/(?:原始?使用量|原使用量|原始用量|原用量)\s*[，,：:]?\s*仅供参考/g, '')
    .replace(/[（(]\s*[）)]/g, '').replace(/\s+/g, ' ').replace(/^[·，,；;\s]+|[·，,；;\s]+$/g, '').trim()
}
function rowsOf(value) {
  if (typeof value === 'string') { try { return rowsOf(JSON.parse(value)) } catch (_) {} }
  return Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : text(value).split(/###|#|\n/).filter(Boolean)
}
function amountText(value, unit) {
  const amount = cleanRecipeText(value)
  if (!amount || /^(?:用量)?(?:待核实|待核对|待确认|未知|需核对|未填写|UNKNOWN|UNVERIFIED)$/i.test(amount)) return ''
  const suffix = cleanRecipeText(unit)
  return amount + (suffix && !amount.endsWith(suffix) && !/^(适量|少许|少量|若干)$/.test(amount) ? suffix : '')
}
function parseIngredient(value) {
  if (value && typeof value === 'object') {
    const name = cleanRecipeText(value.name || value.ingredientName || value.ingredient || value.displayName)
    const amount = [value.quantityText, value.rawQuantity, value.quantity, value.amount].map(x => amountText(x, value.rawUnit || value.unit)).find(Boolean) || ''
    return { name, amount, preparation: cleanRecipeText(value.preparation || value.note) }
  }
  const source = text(value), parts = source.split('|').map(x => x.trim())
  if (parts.length >= 3 && parts.length <= 7) return { name: cleanRecipeText(parts[0]), amount: amountText(parts[1], parts[2]), preparation: cleanRecipeText(parts[4]) }
  const line = cleanRecipeText(readableRecipeLine(source))
  const match = line.match(/^(.+?)(?:[：:\s]+|(?=\d|适量|少许))((?:约\s*)?(?:\d|[一二三四五六七八九十半]+(?:个|勺|碗|杯)|适量|少许).*)$/)
  return match ? { name: match[1].trim(), amount: match[2].trim(), preparation: '' } : { name: line, amount: '', preparation: '' }
}
function ingredientLine(row) { return row.name + (row.amount ? ' ' + row.amount : '') + (row.preparation ? '（' + row.preparation + '）' : '') }
function recipeSourceText(value) { return text(value).includes('|') ? ingredientLine(parseIngredient(value)) : cleanRecipeText(value) }
function presentRecipeIngredients(dish = {}) {
  const raw = rowsOf(dish.ingredientsAmounts || dish.cl).map(parseIngredient).filter(row => row.name && !descriptors.has(row.name))
  const facts = dish.quality && Array.isArray(dish.quality.ingredients) ? dish.quality.ingredients : []
  const rejected = new Set(facts.filter(x => x.identityStatus === 'REJECTED').flatMap(x => [cleanRecipeText(x.name), parseIngredient(x.rawText || '').name]))
  const represented = new Set(facts.flatMap(x => [cleanRecipeText(x.name), parseIngredient(x.rawText || '').name]))
  const ingredients = facts.length ? facts.filter(x => x.identityStatus !== 'REJECTED').map(fact => {
    const evidence = parseIngredient(fact.rawText || '')
    const original = raw.find(x => x.name === cleanRecipeText(fact.name) || x.name === evidence.name) || {}
    const verified = dish.quality.reviewStatus === 'VERIFIED' && fact.identityStatus === 'VERIFIED' && fact.quantityStatus === 'VERIFIED' && Number(fact.quantityValue) > 0
    return { name: cleanRecipeText(fact.name) || original.name || evidence.name,
      amount: verified ? amountText(fact.quantityValue, fact.unit) : amountText(fact.rawQuantity, fact.rawUnit || fact.unit) || evidence.amount || original.amount || '',
      preparation: cleanRecipeText(fact.preparation) || evidence.preparation || original.preparation || '' }
  }).concat(raw.filter(row => !represented.has(row.name))) : raw
  const rows = ingredients.filter(x => x.name && !rejected.has(x.name) && !descriptors.has(x.name))
    .map(row => ({ ...row, wide: row.name.length > 12 || row.amount.length > 18 || row.preparation.length > 20 }))
  const q = dish.quality || {}
  return { rows, lines: rows.map(ingredientLine), basis: q.servingsStatus === 'VERIFIED' && Number(q.basePeople) > 0 ? `原方 ${q.basePeople} 人份` : '原方用量' }
}
function recipeNotes(dish = {}) {
  const steps = rowsOf(dish.steps || dish.step).map(x => cleanRecipeText(readableRecipeLine(x)))
  const notes = rowsOf(dish.tips).concat(rowsOf(dish.methods)).map(x => cleanRecipeText(readableRecipeLine(x)))
  // Do not turn short factual cooking methods into an extra section or repeat steps.
  return [...new Set(notes)].filter(x => x.length >= 6 && !/^(无|暂无|无特殊|见步骤|同上|家常|适量|无备注)[。.!！\s]*$/.test(x) && !steps.includes(x))
}
module.exports = { cleanRecipeText, parseIngredient, ingredientLine, recipeSourceText, presentRecipeIngredients, recipeNotes }
