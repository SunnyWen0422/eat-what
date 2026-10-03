const UNIT_FAMILY = {
  g: 'mass', kg: 'mass', ml: 'volume', l: 'volume', count: 'count',
}

function parseIngredientText(text) {
  const source = String(text || '').trim()
  if (!source) return { displayName: '', quantityText: '', parseStatus: 'FAILED', warnings: ['EMPTY_SOURCE'] }
  const parts = source.split('|')
  if (parts.length >= 3) {
    const displayName = parts[0].trim()
    const rawValue = parts[1].trim()
    const rawUnit = parts[2].trim()
    const numeric = rawValue.match(/(\d+(?:\.\d+)?)/)
    const unitCode = normalizeUnit(rawUnit)
    return {
      displayName,
      canonicalName: displayName.replace(/\s+/g, '').toLowerCase(),
      quantityValue: numeric ? Number(numeric[1]) : null,
      quantityText: rawValue + rawUnit,
      unitCode,
      unitFamily: UNIT_FAMILY[unitCode] || 'unknown',
      parseStatus: numeric ? 'PARSED' : 'NEEDS_ADJUSTMENT',
      sourceText: source,
      warnings: numeric ? [] : ['UNPARSED_QUANTITY'],
    }
  }
  const numeric = source.match(/(\d+(?:\.\d+)?)/)
  return {
    displayName: source.replace(/\s*\d+(?:\.\d+)?\s*(克|千克|公斤|毫升|升|个|只|枚|根)?/, '').trim() || source,
    quantityValue: numeric ? Number(numeric[1]) : null,
    quantityText: numeric ? source.slice(numeric.index) : source,
    unitCode: 'unknown',
    unitFamily: 'unknown',
    parseStatus: numeric ? 'PARTIAL' : 'NEEDS_ADJUSTMENT',
    sourceText: source,
    warnings: ['LOCAL_FALLBACK'],
  }
}

function normalizeUnit(unit) {
  const value = String(unit || '').trim().toLowerCase()
  if (value === '克' || value === 'g') return 'g'
  if (value === '千克' || value === '公斤' || value === 'kg') return 'kg'
  if (value === '毫升' || value === 'ml') return 'ml'
  if (value === '升' || value === 'l') return 'l'
  if (/个|只|枚|根/.test(value)) return 'count'
  return value || 'unknown'
}

function normalizeLocalIngredient(item) {
  const parsed = parseIngredientText(item && (item.sourceText || item.text || item.displayName || ''))
  return { ...parsed, ...item, canonicalName: item.canonicalName || parsed.canonicalName || parsed.displayName }
}

function scaleLocalQuantity(item, basePeople, targetPeople) {
  if (!Number.isFinite(item.quantityValue) || !Number.isFinite(basePeople) || basePeople <= 0) {
    return { ...item, calculationStatus: 'NEEDS_ADJUSTMENT', source: 'local-fallback' }
  }
  const scaled = item.quantityValue * Number(targetPeople || basePeople) / basePeople
  return {
    ...item,
    quantityValue: item.unitFamily === 'count' ? Math.ceil(scaled) : Number(scaled.toFixed(4)),
    quantityText: `${item.unitFamily === 'count' ? Math.ceil(scaled) : Number(scaled.toFixed(4))}${item.unitCode || ''}`,
    calculationStatus: 'CALCULATED',
    source: 'local-fallback',
  }
}

function mergeLocalItems(items) {
  const result = []
  const indexes = new Map()
  for (const item of items || []) {
    const key = [item.selectionKey || item.sourceDishId || '', item.canonicalName || item.displayName || '', item.unitFamily || 'unknown', item.unitCode || 'unknown', item.normalizedVariant || ''].join('|')
    const canMerge = item.parseStatus === 'PARSED' && !item.userOverride && Number.isFinite(item.quantityValue) && item.unitFamily !== 'unknown'
    if (!canMerge || !indexes.has(key)) {
      indexes.set(key, result.length)
      result.push({ ...item })
      continue
    }
    const existing = result[indexes.get(key)]
    existing.quantityValue += item.quantityValue
    existing.quantityText = formatShoppingQuantity(existing)
  }
  return result
}

function formatShoppingQuantity(item) {
  if (!item || !Number.isFinite(item.quantityValue)) return item && item.quantityText ? item.quantityText : '需调整'
  const value = item.unitFamily === 'count' ? Math.ceil(item.quantityValue) : Number(item.quantityValue.toFixed(4))
  return `${value}${item.unitCode || ''}`
}

function buildPurchaseSummary(dishes) {
  const mergeable = new Map()
  const separateItems = []
  for (const dish of dishes || []) {
    for (const item of dish.items || []) {
      const safe = item.parseStatus === 'PARSED' && !item.userOverride && Number.isFinite(item.quantityValue) && ['mass', 'volume', 'count'].includes(item.unitFamily)
      if (!safe) {
        separateItems.push({ ...item, sourceDishNames: [dish.dishName], sourceDishLabel: dish.dishName })
        continue
      }
      const key = `${item.canonicalName || item.displayName}|${item.unitFamily}|${item.unitCode}|${item.normalizedVariant || ''}`
      if (!mergeable.has(key)) {
        mergeable.set(key, { ...item, itemIds: item.id ? [item.id] : [], sources: [{ date: dish.sourceDate, mealType: dish.sourceMealType, dishName: dish.dishName }], checkedItems: item.checked ? 1 : 0, totalItems: 1, sourceDishNames: [dish.dishName], sourceDishLabel: dish.dishName, quantityText: formatShoppingQuantity(item) })
      } else {
        const current = mergeable.get(key)
        current.quantityValue += item.quantityValue
        if (item.id) current.itemIds.push(item.id)
        current.sources.push({ date: dish.sourceDate, mealType: dish.sourceMealType, dishName: dish.dishName })
        current.checkedItems += item.checked ? 1 : 0
        current.totalItems += 1
        if (!current.sourceDishNames.includes(dish.dishName)) current.sourceDishNames.push(dish.dishName)
        current.sourceDishLabel = current.sourceDishNames.join('、')
        current.quantityText = formatShoppingQuantity(current)
      }
    }
  }
  return { mergeableItems: [...mergeable.values()].map(item => ({ ...item, checkedState: item.checkedItems === 0 ? 'none' : item.checkedItems === item.totalItems ? 'all' : 'partial' })), separateItems }
}

module.exports = {
  parseIngredientText,
  normalizeLocalIngredient,
  scaleLocalQuantity,
  mergeLocalItems,
  formatShoppingQuantity,
  buildPurchaseSummary,
}
