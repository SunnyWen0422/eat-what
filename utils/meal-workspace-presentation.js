const { compositionRows, compositionSummary, missingCounts, normalizeDishType, validateCounts } = require('./meal-composition')

function contextPresentation(context) {
  return {
    dateLabel:`${Number(context.date.slice(5,7))}月${Number(context.date.slice(8,10))}日`,
    compositionLabel:compositionSummary(context),
    compositionModeLabel:context.compositionMode === 'manual' ? '手动搭配' : '按人数自动搭配',
    filterSummary:require('./recommendation-criteria').criteriaSummary(context.criteria),
  }
}

function deriveWorkspacePresentation(value) {
  const { status, syncStatus, actual, linkedPlan, canConfirm, busy, peopleError } = value
  const dishes = value.draft && value.draft.dishes || []
  const context = value.context || {}
  const unknown = dishes.some(dish => !normalizeDishType(dish.type))
  const missing = status === 'needs_input' && !unknown && validateCounts(context.counts).valid ? missingCounts(context.counts, dishes.map(dish => dish.type), context.mealType) : []
  const labels = Object.fromEntries(compositionRows(context).map(row => [row.type,row.label]))
  const missingCompositionLabel = missing.length ? '还缺' + missing.map(row => `${row.count}道${labels[row.type]}`).join('、') : ''
  const compositionUnknownNotice = status === 'needs_input' && unknown ? '部分菜品分类未提供，无法确认准确缺额。可调整搭配、筛选或自己选菜。' : ''
  const generationLimitNotice = ['needs_input','failed'].includes(status) ? '自动安排尚未完成，当前菜单仍保留。智能服务不可用时，仍可自己选菜、查看做法或日历。' : ''
  const recovering = ['unknown', 'offline', 'conflict'].includes(syncStatus)
  let primaryAction = 'onGenerate', primaryLabel = '生成本餐菜单'
  if (syncStatus === 'unknown' || syncStatus === 'offline') { primaryAction = 'onRetryWorkspace'; primaryLabel = '核对并重试同步' }
  else if (syncStatus === 'conflict') { primaryAction = 'onLoadLatest'; primaryLabel = '读取最新安排' }
  else if (status === 'generating') { primaryAction = 'onCancelTask'; primaryLabel = '停止本次安排' }
  else if (status === 'plan_changed') { primaryAction = 'onViewPlan'; primaryLabel = '查看最新安排' }
  else if (status === 'draft' && canConfirm) { primaryAction = 'onConfirmPlan'; primaryLabel = '保存到日历' }
  else if (value.saveState === 'saved' && value.savedTarget && (value.savedTarget.date !== context.date || value.savedTarget.mealType !== context.mealType)) { primaryAction = 'onViewSavedMeal'; primaryLabel = '查看已保存的这餐' }
  else if (actual && actual.status === 'eaten') { primaryAction = 'onViewPlan'; primaryLabel = '查看 / 修改实际记录' }
  else if (status === 'planned' && linkedPlan) { primaryAction = 'onViewRecipes'; primaryLabel = '开始做饭 · 本餐全部做法' }
  else if (status === 'needs_regeneration') { primaryAction = 'onRegenerate'; primaryLabel = context.compositionMode === 'manual' ? '按新搭配换一套' : '按新条件换一套' }
  else if (status === 'needs_input') { primaryAction = 'onOpenRequirements'; primaryLabel = '调整本餐要求' }
  return { generationLimitNotice, missingCompositionLabel, compositionUnknownNotice, primaryAction, primaryLabel, primaryDisabled: !!busy || (!!peopleError && ['onGenerate', 'onRegenerate', 'onConfirmPlan'].includes(primaryAction)), contextLocked: !!busy || recovering || status === 'generating', showRequirements: status === 'empty' || !(value.draft && value.draft.dishes && value.draft.dishes.length) }
}

function hardExclusionSummary(preferences, options) {
  const groups = (options || require('./recommendation-options').FALLBACK_OPTIONS).groups || {}
  const labels = Object.values(groups).flat().reduce((all, item) => ({ ...all, [item.code]: item.label }), {})
  const exclusions = [...(preferences.excludedIngredients || []), ...(preferences.excludedTagCodes || []).map(code => labels[code] || code)]
  return exclusions.length ? `长期忌口：${exclusions.join('、')}` : '长期忌口：未设置'
}

module.exports = { contextPresentation, deriveWorkspacePresentation, hardExclusionSummary }
