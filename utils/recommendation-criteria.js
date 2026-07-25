const HOME_QUICK_OPTIONS = [
  { id: 'home', label: '家常菜', kind: 'tag', code: 'HOME_STYLE' },
  { id: 'sichuan', label: '川菜', kind: 'cuisine', code: 'SICHUAN' },
  { id: 'cantonese', label: '粤菜', kind: 'cuisine', code: 'CANTONESE' },
]

const CODE_LABELS = {
  HOME_STYLE: '家常菜',
  SICHUAN: '川菜',
  CANTONESE: '粤菜',
  NORTHEAST: '东北菜',
  HUNAN: '湘菜',
  JIANGNAN: '江浙沪',
  SHANDONG: '鲁菜',
  FUJIAN: '闽菜',
  NORTHWEST: '西北风味',
  QUICK: '快手',
  LOW_EFFORT: '省心好做',
  LUNCH: '午餐',
  DINNER: '晚餐',
  GATHERING: '朋友聚餐',
  VEGETARIAN: '素食',
  HEALTHY: '健康食谱',
  SPICY: '香辣',
  NUMB_SPICY: '麻辣',
  SOUR_SPICY: '酸辣',
  SWEET_SOUR: '酸甜',
  TOMATO: '番茄味',
  LIGHT: '清淡',
  STEAM: '蒸',
  STIR_FRY: '炒',
  BRAISE: '烧焖',
  STEW: '炖煲',
  BAKE: '烤',
  FRY: '煎炸',
  COLD_MIX: '凉拌',
}

function emptyCriteria() {
  return {
    cuisineCodes: [],
    includeTagCodes: [],
    excludeTagCodes: [],
    excludedIngredients: [],
    maxCookMinutes: null,
  }
}

function uniqueCodes(values, max = 20) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim().toUpperCase())
    .filter(Boolean))]
    .sort()
    .slice(0, max)
}

function uniqueIngredients(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim().slice(0, 20))
    .filter(Boolean))]
    .sort()
    .slice(0, 30)
}

function normalizeCriteria(value = {}) {
  const minutes = Number(value.maxCookMinutes)
  return {
    cuisineCodes: uniqueCodes(value.cuisineCodes, 12),
    includeTagCodes: uniqueCodes(value.includeTagCodes),
    excludeTagCodes: uniqueCodes(value.excludeTagCodes),
    excludedIngredients: uniqueIngredients(value.excludedIngredients),
    maxCookMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(240, Math.round(minutes)) : null,
  }
}

function toggleValue(values, code) {
  const next = new Set(values)
  if (next.has(code)) next.delete(code)
  else next.add(code)
  return [...next].sort()
}

function toggleQuickOption(criteria, optionId) {
  const normalized = normalizeCriteria(criteria)
  const option = HOME_QUICK_OPTIONS.find(item => item.id === optionId)
  if (!option) return normalized
  if (option.kind === 'cuisine') normalized.cuisineCodes = toggleValue(normalized.cuisineCodes, option.code)
  else normalized.includeTagCodes = toggleValue(normalized.includeTagCodes, option.code)
  return normalized
}

function isQuickOptionSelected(criteria, optionId) {
  const normalized = normalizeCriteria(criteria)
  const option = HOME_QUICK_OPTIONS.find(item => item.id === optionId)
  if (!option) return false
  const values = option.kind === 'cuisine' ? normalized.cuisineCodes : normalized.includeTagCodes
  return values.includes(option.code)
}

function criteriaCount(criteria) {
  const value = normalizeCriteria(criteria)
  return value.cuisineCodes.length + value.includeTagCodes.length + value.excludeTagCodes.length + value.excludedIngredients.length + (value.maxCookMinutes ? 1 : 0)
}

function criteriaSummary(criteria) {
  const value = normalizeCriteria(criteria)
  const parts = []
  for (const code of [...value.cuisineCodes, ...value.includeTagCodes]) parts.push(CODE_LABELS[code] || code)
  if (value.excludeTagCodes.length) parts.push(`排除 ${value.excludeTagCodes.length} 项`)
  if (value.excludedIngredients.length) parts.push(`忌口 ${value.excludedIngredients.length} 项`)
  if (value.maxCookMinutes) parts.push(`${value.maxCookMinutes} 分钟内`)
  return parts.join('、')
}

module.exports = {
  CODE_LABELS,
  HOME_QUICK_OPTIONS,
  criteriaCount,
  criteriaSummary,
  emptyCriteria,
  isQuickOptionSelected,
  normalizeCriteria,
  toggleQuickOption,
}
