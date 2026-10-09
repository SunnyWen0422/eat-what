const meals = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }
function deriveWorkspacePresentation(value) {
  const { status, syncStatus, actual, linkedPlan, context = {}, canConfirm, busy } = value
  let primaryAction = 'onGenerate', primaryLabel = '帮我安排这餐'
  if (syncStatus === 'unknown' || syncStatus === 'offline') { primaryAction = 'onRetryWorkspace'; primaryLabel = '核对并重试同步' }
  else if (syncStatus === 'conflict') { primaryAction = 'onLoadLatest'; primaryLabel = '读取最新安排' }
  else if (status === 'generating') { primaryAction = 'onCancelTask'; primaryLabel = '停止本次安排' }
  else if (status === 'plan_changed') { primaryAction = 'onViewPlan'; primaryLabel = '查看最新安排' }
  else if (actual && actual.status === 'eaten') { primaryAction = 'onViewPlan'; primaryLabel = '查看 / 修改实际记录' }
  else if (status === 'planned' && linkedPlan) { primaryAction = 'onViewRecipes'; primaryLabel = '开始做饭 · 本餐全部做法' }
  else if (status === 'draft' && canConfirm) { primaryAction = 'onConfirmPlan'; primaryLabel = `就吃这个 · ${context.date || ''}${meals[context.mealType] || '当前餐'}` }
  else if (status === 'needs_regeneration') primaryLabel = '按新要求重新安排'
  else if (status === 'needs_input') { primaryAction = 'onOpenRequirements'; primaryLabel = '补充这餐要求' }
  return { primaryAction, primaryLabel, primaryDisabled: !!busy, showRequirements: status === 'empty' || !(value.draft && value.draft.dishes && value.draft.dishes.length) }
}
module.exports = { deriveWorkspacePresentation }
