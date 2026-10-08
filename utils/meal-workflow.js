const mealNames = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }
function parseDay(value) { const [y, m, d] = String(value).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d, 12) }
function formatDay(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function today() { const d = new Date(Date.now() + 8 * 3600000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` }
function shiftDay(value, amount) { const d = parseDay(value); d.setDate(d.getDate() + amount); return formatDay(d) }
function monthRange(year, month) { return { startDate: formatDay(new Date(year, month - 1, 1, 12)), endDate: formatDay(new Date(year, month, 0, 12)) } }
function weekRange(value) { const d = parseDay(value); const startDate = shiftDay(value, -((d.getDay() + 6) % 7)); return { startDate, endDate: shiftDay(startDate, 6) } }
function mealViews(overview, day) {
  return Object.keys(mealNames).map(mealType => {
    const plan = (overview.plans || []).find(p => String(p.recordDate || p.recordDateString).slice(0, 10) === day && p.mealType === mealType) || null
    const actual = (overview.consumptions || []).find(p => p.mealDate === day && p.mealType === mealType) || null
    const status = actual ? actual.status : 'unrecorded'
    const statusLabel = status === 'eaten' ? '已记录实际用餐' : status === 'skipped' ? '已取消安排' : plan ? plan.recordOrigin === 'legacy' ? '历史安排 · 未确认实际用餐' : '已安排 · 未确认吃过' : '还没有安排'
    return { planRevision: plan ? plan.revision : (overview.planRevisions || {})[`${day}|${mealType}`] || 0, mealType, label: mealNames[mealType], plan, actual, status, statusLabel, actualNames: actual && actual.status === 'eaten' ? (actual.actualDishes || []).map(d => d.name).join('、') : '' }
  })
}
function buildActualEntries(text, meal, usePlanIdentity = true) {
  const history = meal.actual && meal.actual.actualDishes || [], retained = new Set()
  const planned = usePlanIdentity && meal.plan ? meal.plan.dishDetails || [] : []
  return String(text || '').split(/[\n、，,]/).map(name => name.trim()).filter(Boolean).map(name => {
    const index = history.findIndex((dish, i) => dish.name === name && !retained.has(i))
    if (index >= 0) { retained.add(index); return { retainedEntryIndex: index } }
    const matches = planned.filter(dish => dish.name === name)
    const ids = matches.map(dish => Number(dish.dishId || dish.id))
    // A name shared by different dishes is insufficient evidence of identity.
    if (ids.length && ids.every(id => Number.isSafeInteger(id) && id > 0) && new Set(ids).size === 1) return { dishId: ids[0] }
    return { name }
  })
}
function requestId(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}` }
function errorMessage(error, fallback = '操作失败，请重试') { return error && error.statusCode === 409 ? (error.data && error.data.message || '内容已更新，请重新加载并确认修改') : error && error.data && (error.data.message || error.data.error) || fallback }
module.exports = { mealNames, parseDay, formatDay, today, shiftDay, monthRange, weekRange, mealViews, buildActualEntries, requestId, errorMessage }
