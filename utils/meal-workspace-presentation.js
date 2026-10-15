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
  const journey=require('./meal-journey-presentation').deriveMealJourney({workspace:{id:value.workspaceId,context,draft:value.draft,status},plan:linkedPlan,actual,pendingReceipts:value.pendingReceipts||[],syncStatus,busy,dirty:value.dirty,canConfirm,savedTarget:value.savedTarget,saveState:value.saveState})
  const primaryAction=journey.primary.action,primaryLabel=journey.primary.label
  return { journeyRecovery:journey.recovery, hasMenu:!!dishes.length, settingsInitiallyCollapsed:!!dishes.length, generationLimitNotice, missingCompositionLabel, compositionUnknownNotice, primaryAction, primaryLabel, primaryDisabled: !!busy || (!!peopleError && ['onGenerate', 'onRegenerate', 'onConfirmPlan'].includes(primaryAction)), contextLocked: !!busy || recovering || status === 'generating' || !!journey.recovery&&['unknown','conflict','busy'].includes(journey.recovery.state), showRequirements: status === 'empty' || !(value.draft && value.draft.dishes && value.draft.dishes.length) }
}

function hardExclusionSummary(preferences, options) {
  const groups = (options || require('./recommendation-options').FALLBACK_OPTIONS).groups || {}
  const labels = Object.values(groups).flat().reduce((all, item) => ({ ...all, [item.code]: item.label }), {})
  const exclusions = [...(preferences.excludedIngredients || []), ...(preferences.excludedTagCodes || []).map(code => labels[code] || code)]
  return exclusions.length ? `长期忌口：${exclusions.join('、')}` : '长期忌口：未设置'
}

module.exports = { contextPresentation, deriveWorkspacePresentation, hardExclusionSummary }
