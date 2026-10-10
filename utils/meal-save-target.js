const clone = value => JSON.parse(JSON.stringify(value))
const canonical = value => JSON.stringify(value, function (key, item) {
  return item && typeof item === 'object' && !Array.isArray(item)
    ? Object.keys(item).sort().reduce((out, name) => { out[name] = item[name]; return out }, {}) : item
})
const MEALS = ['breakfast', 'lunch', 'dinner']
const LABELS = ['早餐', '午餐', '晚餐']

/** A real Gregorian day; never let Date silently roll an invalid picker value. */
function validateMealTarget(target) {
  const date = target && target.date
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('请指定有效日期（年-月-日）')
  const [year, month, day] = date.split('-').map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) throw new Error('请指定真实有效的日期')
  if (!MEALS.includes(target.mealType)) throw new Error('请指定有效餐次')
  return { date, mealType: target.mealType }
}

/** @returns {SaveSnapshot} An immutable copy, bound to the source account and revision. */
function freezeSaveSnapshot(state, scope) {
  const w = state && state.workspace, draft = w && w.draft
  if (!scope || !w || !draft || !draft.dishes || !draft.dishes.length || state.dirty || state.pending || state.syncStatus !== 'synced') throw new Error('菜单尚未同步，请先核对当前方案')
  const dishIds = draft.dishes.map(d => d.id)
  if (dishIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Error('菜单菜品信息已失效，请重新安排')
  const sourceTarget = Object.freeze(validateMealTarget(state.context))
  return Object.freeze({ scope, workspaceId: w.id, workspaceRevision: w.revision, planVersion: draft.planVersion,
    sourceTarget, dishIds: Object.freeze(clone(dishIds)), people: state.context.people, contextFingerprint: canonical(state.context) })
}

function matchesSaveSnapshot(snapshot, state, scope) {
  try { return canonical(snapshot) === canonical(freezeSaveSnapshot(state, scope)) } catch (error) { return false }
}

/** Foreground and cached Today reopening must agree about unfinished input. */
function hasUnfinishedSource(state) {
  if (!state) return false
  if (state.pending || state.dirty) return true
  const w = state.workspace, draft = w && w.draft
  return !!(draft && (draft.dishes || []).length && (w.status === 'needs_regeneration' || !w.confirmation || w.confirmation.planVersion !== draft.planVersion))
}

function saveTargetView(snapshot, target, now = new Date()) {
  const checked = validateMealTarget(target), source = validateMealTarget(snapshot.sourceTarget)
  const label = `${Number(checked.date.slice(5, 7))}月${Number(checked.date.slice(8, 10))}日${LABELS[MEALS.indexOf(checked.mealType)]}`
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)
  return { label, fullDate: checked.date, crossDayNotice: source.date !== checked.date || source.date !== today
    ? `日期按北京时间。原菜单仍归属${source.date}，本次只保存到${checked.date}。` : '' }
}

module.exports = { validateMealTarget, freezeSaveSnapshot, matchesSaveSnapshot, hasUnfinishedSource, saveTargetView }
