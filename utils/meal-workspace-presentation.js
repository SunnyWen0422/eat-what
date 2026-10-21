const { compositionRows, compositionSummary, missingCounts, normalizeDishType, validateCounts } = require('./meal-composition')
const { validateMealTarget } = require('./meal-save-target')

function checkedTarget(value) {
  try { return validateMealTarget(value) } catch (_) { return null }
}

function targetLabel(target) {
  const [year, month, day] = target.date.split('-').map(Number)
  return `${year}年${month}月${day}日${{ breakfast:'早餐', lunch:'午餐', dinner:'晚餐' }[target.mealType]}`
}

// Display only: the journey owns precedence and actions; the receipt owns its target.
function continuityPresentation(value, journey, workspaceNotice) {
  const context = value.context || {}, target = checkedTarget(context), savedTarget = checkedTarget(value.savedTarget)
  const contextLabel = target ? targetLabel(target) + (Number.isInteger(context.people) && context.people > 0 ? ` · ${context.people}人` : '') : '当前餐'
  const recovery = journey.recovery, state = recovery && recovery.state
  const hasMenu = !!(value.draft && value.draft.dishes && value.draft.dishes.length)
  const saved = savedTarget && ['saved', 'changed'].includes(value.saveState)
  let menuState = hasMenu ? 'draft' : 'empty', resultNotice = null
  if (state === 'unknown') menuState = 'recover'
  else if (state === 'conflict') menuState = 'conflict'
  else if (state === 'busy') menuState = 'working'
  else if (state === 'unapplied') menuState = 'changed'
  else if (state === 'confirmation') menuState = 'draft'
  else if (value.saveState === 'changed' || value.status === 'plan_changed') menuState = 'changed'
  else if (saved && value.saveState === 'saved') menuState = 'saved'

  const rowPending = state === 'busy' && recovery.kind === 'workspace' && value.actionFeedback && value.actionFeedback.kind === 'replace' && value.actionFeedback.state === 'pending'
  if (rowPending) {
    // The affected dish owns replacement progress. Keep only the old receipt here.
    if (saved) resultNotice = { kind:'info', text:`此前已保存到${targetLabel(savedTarget)}，日历安排仍保留`, target:savedTarget, action:'onViewSavedMeal' }
  } else if (recovery) {
    const text = { unknown:'本次结果待核对，原菜单仍保留', conflict:'这餐已有更新，请先读取最新安排', busy:'正在处理本餐', unapplied:'条件已修改，按新条件换一套后生效', confirmation:'本餐安排待确认' }[state] || recovery.label
    resultNotice = {
      kind: state === 'busy' ? 'loading' : state === 'confirmation' ? 'info' : 'warning',
      text: text + (saved ? `。此前已保存到${targetLabel(savedTarget)}，本次操作尚未确认保存` : ''),
      target: journey.primary.target, action: journey.primary.action,
    }
  } else if (workspaceNotice) {
    const savedText = saved ? `。此前已保存到${targetLabel(savedTarget)}` + (value.saveState === 'changed' ? '；当前菜单有修改，尚未保存' : '') : ''
    resultNotice = { kind:workspaceNotice.kind, text:workspaceNotice.text + savedText, target, action:journey.primary.action }
  } else if (saved) {
    resultNotice = { kind:menuState === 'saved' ? 'success' : 'info',
      text:menuState === 'saved' ? `已保存到${targetLabel(savedTarget)}` : `此前已保存到${targetLabel(savedTarget)}。当前菜单有修改，尚未保存`,
      target:savedTarget, action:'onViewSavedMeal' }
  }
  return { contextLabel, menuState, resultNotice }
}

function contextPresentation(context) {
  const balanced=require('./recommendation-policy').supported(context.recommendationPolicy)
  let summary=require('./recommendation-criteria').criteriaSummary(require('./recommendation-policy').wishes(context))
  if(balanced)summary=summary.replace(/(\d+)分钟内/g,'期望 $1 分钟')
  if(context.candidateScope==='favorites')summary=['仅从收藏中选',summary].filter(Boolean).join(' · ')
  return {
    dateLabel:`${Number(context.date.slice(5,7))}月${Number(context.date.slice(8,10))}日`,
    compositionLabel:compositionSummary(context),
    compositionModeLabel:context.compositionMode === 'manual' ? '手动搭配' : '按人数自动搭配',
    filterSummary:summary,
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
  let workspaceNotice=null
  const recovery=journey.recovery,feedback=value.actionFeedback
  if(recovery&&recovery.state==='unknown')workspaceNotice={kind:'warning',text:recovery.kind==='workspace'?'上次结果待核对，原菜单仍保留':recovery.label}
  else if(recovery&&recovery.state==='conflict')workspaceNotice={kind:'warning',text:'这餐已有更新，请先读取最新安排'}
  else if(status==='generating'&&!(feedback&&feedback.kind==='replace'&&feedback.state==='pending'))workspaceNotice={kind:'loading',text:'正在安排这餐'}
  else if(recovery&&recovery.state==='unapplied')workspaceNotice={kind:'warning',text:'条件已修改，按新条件换一套后生效'}
  else if(status==='needs_input')workspaceNotice={kind:'warning',text:missingCompositionLabel||compositionUnknownNotice||'请补充要求或调整条件后再试',action:missing.length||unknown?'composition':'requirements'}
  else if(value.errorMessage)workspaceNotice={kind:'error',text:require('./meal-workflow').errorMessage({message:value.errorMessage},'暂未完成，请稍后再试，原菜单仍保留')}
  else if(status==='failed')workspaceNotice={kind:'warning',text:'安排暂未完成，可以重试或自己选菜',action:'choose'}
  else if(feedback&&feedback.state==='error')workspaceNotice={kind:'error',text:require('./meal-workflow').errorMessage({message:feedback.message},'这次调整未完成，原菜单仍保留')}
  else if(feedback&&feedback.state==='unknown')workspaceNotice={kind:'warning',text:'刚才的操作仍待核对，原菜单已保留'}
  const showActionFeedback=!!(!workspaceNotice&&feedback&&feedback.state==='success'&&feedback.kind==='undo')
  const showMenuUndo=!!((value.draft&&value.draft.history||[]).length&&!showActionFeedback)
  return { ...continuityPresentation(value, journey, workspaceNotice), workspaceNotice,showActionFeedback,showMenuUndo,journeyRecovery:journey.recovery, hasMenu:!!dishes.length, settingsInitiallyCollapsed:!!dishes.length, generationLimitNotice, missingCompositionLabel, compositionUnknownNotice, primaryAction, primaryLabel, primaryDisabled: !!busy || (!!peopleError && ['onGenerate', 'onRegenerate', 'onConfirmPlan'].includes(primaryAction)), contextLocked: !!busy || recovering || status === 'generating' || !!journey.recovery&&['unknown','conflict','busy'].includes(journey.recovery.state), showRequirements: status === 'empty' || !(value.draft && value.draft.dishes && value.draft.dishes.length) }
}

function hardExclusionSummary(preferences, options) {
  const groups = (options || require('./recommendation-options').FALLBACK_OPTIONS).groups || {}
  const labels = Object.values(groups).flat().reduce((all, item) => ({ ...all, [item.code]: item.label }), {})
  const exclusions = [...(preferences.excludedIngredients || []), ...(preferences.excludedTagCodes || []).map(code => labels[code] || code)]
  return exclusions.length ? `长期忌口：${exclusions.join('、')}` : '长期忌口：未设置'
}

module.exports = { contextPresentation, deriveWorkspacePresentation, hardExclusionSummary }
