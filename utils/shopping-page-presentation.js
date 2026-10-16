const { mealNames } = require('./meal-workflow')

// Presentation only: source targets are supplied by distinctMealSources, never
// inferred from checked items, the active filter, or today's date.
function shoppingPagePresentation({ pendingCount = 0, checkedCount = 0, sourceMeals = [], drafts = [], loading = false, offline = false } = {}) {
  const nonempty = pendingCount + checkedCount > 0
  const meal = sourceMeals.length === 1 ? sourceMeals[0] : null
  return {
    contextLabel: meal ? meal.label || `${meal.date} ${mealNames[meal.mealType] || meal.mealType}` : sourceMeals.length > 1 ? `来自${sourceMeals.length}个餐次 · 选择查看` : '',
    addEmphasis: nonempty ? 'secondary' : 'primary',
    emptyAction: !nonempty && !loading && !offline && !drafts.length ? '从日历准备食材' : '',
  }
}
module.exports = { shoppingPagePresentation }
