const api = require('./api')
const flow = require('./meal-workflow')
const { getUserStorageKey } = require('./util')

// The original request is retained after a timeout, so a retry can replay its server log.
async function savePlan(owner, date, mealType, draft, expectedRevision) {
  const scope = getUserStorageKey('mealView')
  if (owner._planOwnerScope && owner._planOwnerScope !== scope) throw { statusCode: 401 }
  const signature = JSON.stringify([scope, date, mealType, draft])
  let pending = owner._pendingPlanWrite
  if (!pending || pending.signature !== signature) {
    const overview = await api.getMealOverview(date, date)
    if (scope !== getUserStorageKey('mealView')) throw { statusCode: 401 }
    const view = flow.mealViews(overview, date).find(item => item.mealType === mealType)
    const revision = view.plan ? view.plan.revision : view.planRevision || 0
    if (expectedRevision != null && expectedRevision !== revision) throw { statusCode: 409 }
    if (view.plan) {
      const approved = await new Promise(resolve => wx.showModal({ title: '更新该餐安排？', content: `${date} ${flow.mealNames[mealType]}\n原安排：${view.plan.recipeName}\n新安排：${draft.recipeName}\n实际用餐记录会保留。`, confirmText: '更新安排', success: r => resolve(r.confirm), fail: () => resolve(false) }))
      if (!approved) return false
    }
    pending = { signature, date, mealType, body: { ...draft, expectedRevision: revision, requestId: flow.requestId('plan') } }
    owner._pendingPlanWrite = pending
  }
  try {
    if (scope !== getUserStorageKey('mealView')) { owner._pendingPlanWrite = null; throw { statusCode: 401 } }
    await api.saveMealPlan(pending.date, pending.mealType, pending.body)
    if (scope !== getUserStorageKey('mealView')) return false
    owner._pendingPlanWrite = null
    wx.setStorageSync(getUserStorageKey('needRefreshCalendar'), true)
    return true
  } catch (error) {
    if (error.statusCode === 409) owner._pendingPlanWrite = null
    throw error
  }
}
module.exports = { savePlan }
