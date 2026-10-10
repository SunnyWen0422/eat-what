const { validateMealTarget } = require('./meal-save-target')
const LABELS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }
const TYPES = { meat: '荤菜', veg: '素菜', soup: '汤', staple: '主食', dessert: '甜品', side: '配餐' }
const targetLabel = target => `${Number(target.date.slice(5, 7))}月${Number(target.date.slice(8, 10))}日 ${LABELS[target.mealType]}`
function selectedIds(state) {
  const dishes = state && state.workspace && state.workspace.draft && state.workspace.draft.dishes || []
  const ids = [...new Set(dishes.map(dish => Number(dish.id)))]
  if (ids.some(id => !Number.isSafeInteger(id) || id < 1) || ids.length > 10) throw Error('本餐菜品信息需重新核对')
  return ids
}
/** @returns {SelectedMealView} Display-only projection of the existing workspace. */
function deriveSelectedMeal(state, target) {
  const safe = state && state.syncStatus !== 'account_changed' ? state : {}, w = safe.workspace
  const destination = validateMealTarget(safe.context || target)
  const dishIds = selectedIds(safe), confirmation = w && w.confirmation
  const savedTarget = confirmation && confirmation.date && confirmation.mealType ? validateMealTarget(confirmation) : null
  const saveState = confirmation ? confirmation.planVersion === w.draft.planVersion && !safe.dirty && w.status !== 'needs_regeneration' ? 'saved' : 'changed' : 'unsaved'
  const message = !dishIds.length ? '还没选菜，选好后保存到日历' : saveState === 'saved' ? `已保存到${targetLabel(savedTarget || destination)}` : saveState === 'changed' ? '本餐修改未保存到日历' : '本餐草稿未保存到日历'
  return { target: destination, dishIds, count: dishIds.length, saveState, savedTarget, message, targetLabel: targetLabel(destination), people: safe.context && safe.context.people || 2 }
}
/** Append never mutates or truncates the authoritative draft. */
function appendSelectedDish(state, dishId) {
  const id = Number(dishId)
  if (!Number.isSafeInteger(id) || id < 1) throw Error('菜品无效，请重新读取')
  const ids = selectedIds(state)
  if (!ids.includes(id)) ids.push(id)
  if (ids.length > 10) throw Error('一餐最多安排 10 道菜，请先调整当前餐')
  return ids
}
function selectionComposition(dishes, mealType) {
  const counts = {}
  for (const dish of dishes) {
    const type = mealType === 'breakfast' ? dish.type === 'staple' ? 'staple' : 'side' : dish.type
    if (!TYPES[type]) throw Error('菜品分类暂未读到，请重新核对')
    counts[type] = (counts[type] || 0) + 1
  }
  return { counts, label: Object.keys(TYPES).filter(type => counts[type]).map(type => `${counts[type]} ${TYPES[type]}`).join('、') }
}
module.exports = { deriveSelectedMeal, appendSelectedDish, selectionComposition, targetLabel }
