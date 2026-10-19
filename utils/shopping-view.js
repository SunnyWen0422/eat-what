const { normalizeQuantitySafety, formatShoppingQuantity, isSafeQuantity } = require('./shopping-ingredients')
const { cleanRecipeText, recipeSourceText } = require('./recipe-display')

const presentation = require('./shopping-display')

const mealNames = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }
const identity = (kind, parts) => `${kind}:${JSON.stringify(parts)}`

/** Normalize both current and legacy source receipts without inventing a manual origin. */
function normalizeShoppingSource(source = {}) {
  const sourceDate = source.sourceDate || source.date || ''
  const sourceMealType = source.sourceMealType || source.mealType || ''
  const dishId = source.dishId == null ? source.sourceDishId == null ? null : source.sourceDishId : source.dishId
  const dishName = source.dishName || source.sourceDishName || ''
  const key = identity('source', [sourceDate, sourceMealType, dishId, dishName, source.selectionKey || source.shoppingDishId || ''])
  return { sourceDate, sourceMealType, dishId, dishName, key }
}

function sourceLabel(source) {
  const normalized = normalizeShoppingSource(source)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(normalized.sourceDate) ? `${Number(normalized.sourceDate.slice(5, 7))}月${Number(normalized.sourceDate.slice(8))}日` : normalized.sourceDate
  const meal = [date, mealNames[normalized.sourceMealType] || normalized.sourceMealType].filter(Boolean).join(' ')
  return [meal, normalized.dishName].filter(Boolean).join(' · ') || '手动添加'
}

/** Derive both views from source items, filtering BEFORE any display-only merge.
 * Counts always describe the full source list; no business copy is persisted here.
 */
function buildShoppingView(list = {}, status = 'pending') {
  const checked = status === 'checked', rows = [], groups = [], mergeable = new Map()
  let pendingCount = 0, checkedCount = 0
  for (const dish of list.dishes || []) {
    const source = normalizeShoppingSource(dish), items = []
    for (const raw of dish.items || []) {
      raw.checked === true ? checkedCount++ : pendingCount++
      if ((raw.checked === true) !== checked) continue
      const item = normalizeQuantitySafety(raw)
      const stableId = item.id != null ? item.id : item.clientKey || (item.sourceLineNo != null ? item.sourceLineNo : [item.sourceText, item.displayName, item.quantityText])
      const itemKey = identity('item', [source.key, stableId])
      const origin = { ...source, key: itemKey, sourceKey: itemKey, itemId: item.id, sourceLabel: sourceLabel(source), quantityText: item.quantityText || '用量待确认', sourceQuantityText: item.sourceQuantityText || item.sourceText || item.quantityText || '用量待确认', warnings:item.warnings || [], userOverride: item.userOverride === true, note: !source.dishId && !source.sourceDate && source.dishName === '手动添加' ? item.sourceQuantityText || '' : '' }
      // Presentation only: source text, warnings, IDs and calculation safety remain unchanged.
      origin.sourceDisplayText = recipeSourceText(origin.sourceQuantityText)
      origin.quantityDisplayText = presentation.quantityText(origin.quantityText, item)
      origin.displayWarnings = [...new Set(origin.warnings.map(cleanRecipeText).map(text=>/^(原始数量或份数需要核对|原始份数不明|请按人数调整用量)$/.test(text)?'请按人数调整用量':text).filter(text=>text && !/^[A-Z_]+$/.test(text) && !/^(用量待核对|用量待确认|用量待核实|原始份数不明|请按人数调整用量)$/.test(text)))]
      const quantityLabel = presentation.quantityText(item.userOverride ? item.quantityText : formatShoppingQuantity(item), item)
      const name=presentation.ingredientName(item)
      const value = { ...item, sourceDisplayText:origin.sourceDisplayText, displayWarnings:origin.displayWarnings, key: itemKey, sourceKey:itemKey, rowKey: itemKey, name, quantityUncertain:!item.userOverride && (!isSafeQuantity(item) || !!(item.warnings || []).length), quantityLabel, itemIds: item.id == null ? [] : [item.id], sources: [origin], sourceCount: 1, sourceLabel: origin.sourceLabel, checkedState: checked ? 'all' : 'none' }
      items.push(value)
      const safe = isSafeQuantity(item)
      const key = safe ? identity('ingredient', [item.canonicalName || item.displayName, item.unitFamily, item.unitCode, item.normalizedVariant || '']) : itemKey
      if (!safe || !mergeable.has(key)) {
        const row = { ...value, key, rowKey: key, itemIds: [...value.itemIds], sources: [...value.sources] }
        rows.push(row)
        if (safe) mergeable.set(key, row)
      } else {
        const row = mergeable.get(key)
        // An overflow is unknown, never a believable quantity or an implicit zero.
        row.quantityValue = Number.isFinite(row.quantityValue) && Number.isFinite(row.quantityValue + item.quantityValue) ? row.quantityValue + item.quantityValue : null
        row.quantityText = row.quantityValue == null ? '用量待确认' : formatShoppingQuantity(row)
        row.quantityLabel = presentation.quantityText(row.quantityText, row)
        row.itemIds.push(...value.itemIds)
        row.sources.push(origin)
        row.sourceCount = row.sources.length
        row.sourceLabel = row.sources.map(entry => entry.sourceLabel).join('；')
        row.warnings = [...new Set([...(row.warnings || []), ...(item.warnings || [])])]
        row.quantityUncertain = row.quantityValue == null || row.quantityUncertain || value.quantityUncertain
      }
    }
    if (items.length) groups.push({ ...dish, ...source, sourceLabel: sourceLabel(source), items })
  }
  return { pendingCount, checkedCount, summaryRowCount: rows.length, rows, groups }
}

/** A reverse check is safe only for a confirmed homogeneous transition.
 * The version belongs to the receipt, never a guessed or refreshed list version.
 */
function createCheckUndo(beforeList, response, itemIds) {
  if (!beforeList || !Number.isSafeInteger(beforeList.version) || !response || response.success === false || !Array.isArray(itemIds) || !itemIds.length) return null
  const after = response.list || response
  if (!Array.isArray(after.dishes) || !Number.isSafeInteger(after.version) || after.version <= Number(beforeList.version)) return null
  if (beforeList.listId != null && after.listId != null && String(beforeList.listId) !== String(after.listId)) return null
  const ids = [...new Set(itemIds)]
  const before = new Map(), current = new Map()
  for (const dish of beforeList.dishes || []) for (const item of dish.items || []) before.set(String(item.id), item.checked)
  for (const dish of after.dishes) for (const item of dish.items || []) current.set(String(item.id), item.checked)
  if (ids.some(id => id == null || !before.has(String(id)) || !current.has(String(id)))) return null
  const previousChecked = before.get(String(ids[0]))
  if (typeof previousChecked !== 'boolean' || ids.some(id => before.get(String(id)) !== previousChecked || typeof current.get(String(id)) !== 'boolean' || current.get(String(id)) === previousChecked)) return null
  return { itemIds: ids, previousChecked, expectedListVersion: after.version }
}

function shoppingAddMessage(receipt = {}) {
  const { addedItemCount, mergedItemCount } = receipt
  return Number.isSafeInteger(addedItemCount) && addedItemCount >= 0 && Number.isSafeInteger(mergedItemCount) && mergedItemCount >= 0
    ? `已加入购物清单：新增${addedItemCount}项，合并${mergedItemCount}项` : '已加入购物清单'
}

module.exports = { shoppingAddMessage, normalizeShoppingSource, buildShoppingView, createCheckUndo }
