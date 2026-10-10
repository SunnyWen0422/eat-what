function deriveWorkspacePresentation(value) {
  const { status, syncStatus, actual, linkedPlan, canConfirm, busy, peopleError } = value
  const recovering = ['unknown', 'offline', 'conflict'].includes(syncStatus)
  let primaryAction = 'onGenerate', primaryLabel = '生成本餐菜单'
  if (syncStatus === 'unknown' || syncStatus === 'offline') { primaryAction = 'onRetryWorkspace'; primaryLabel = '核对并重试同步' }
  else if (syncStatus === 'conflict') { primaryAction = 'onLoadLatest'; primaryLabel = '读取最新安排' }
  else if (status === 'generating') { primaryAction = 'onCancelTask'; primaryLabel = '停止本次安排' }
  else if (status === 'plan_changed') { primaryAction = 'onViewPlan'; primaryLabel = '查看最新安排' }
  else if (status === 'draft' && canConfirm) { primaryAction = 'onConfirmPlan'; primaryLabel = '保存到日历' }
  else if (actual && actual.status === 'eaten') { primaryAction = 'onViewPlan'; primaryLabel = '查看 / 修改实际记录' }
  else if (status === 'planned' && linkedPlan) { primaryAction = 'onViewRecipes'; primaryLabel = '开始做饭 · 本餐全部做法' }
  else if (status === 'needs_regeneration') primaryLabel = '重新生成本餐菜单'
  else if (status === 'needs_input') { primaryAction = 'onOpenRequirements'; primaryLabel = '调整本餐要求' }
  return { primaryAction, primaryLabel, primaryDisabled: !!busy || (!!peopleError && ['onGenerate', 'onConfirmPlan'].includes(primaryAction)), contextLocked: !!busy || recovering || status === 'generating', showRequirements: status === 'empty' || !(value.draft && value.draft.dishes && value.draft.dishes.length) }
}

function hardExclusionSummary(preferences, options) {
  const groups = (options || require('./recommendation-options').FALLBACK_OPTIONS).groups || {}
  const labels = Object.values(groups).flat().reduce((all, item) => ({ ...all, [item.code]: item.label }), {})
  const exclusions = [...(preferences.excludedIngredients || []), ...(preferences.excludedTagCodes || []).map(code => labels[code] || code)]
  return exclusions.length ? `长期忌口：${exclusions.join('、')}` : '长期忌口：未设置'
}

module.exports = { deriveWorkspacePresentation, hardExclusionSummary }
