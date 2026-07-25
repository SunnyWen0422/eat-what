const api = require('./api')
const { recommendPlans, getAllDishes } = require('./recommend')

function normalizeDish(dish, favoriteIds) {
  return {
    id: dish.id,
    name: dish.name,
    type: dish.type,
    tags: typeof dish.tags === 'string' && dish.tags
      ? dish.tags.split(',').map(tag => tag.trim()).filter(Boolean)
      : (dish.tags || []),
    image: (dish.image || '').replace(/^http:/, 'https:'),
    kcal: dish.kcal || null,
    difficulty: dish.difficulty || '',
    cookTime: dish.cookTime || '',
    cookMinutes: dish.cookMinutes || null,
    cuisineCode: dish.cuisineCode || '',
    tagCodes: dish.tagCodes || '',
    metadataVersion: dish.metadataVersion || 1,
    ingredientsAmounts: dish.ingredientsAmounts || '',
    step: dish.step || '',
    isFavorite: favoriteIds.has(dish.id),
  }
}

function createRecommendationFlow(dependencies = {}) {
  const backendApi = dependencies.api || api
  const localRecommend = dependencies.localRecommend || recommendPlans
  const loadAllDishes = dependencies.getAllDishes || getAllDishes
  const wxRuntime = dependencies.wx || wx
  const appProvider = dependencies.appProvider || (() => getApp())
  const backendTimeoutMs = dependencies.backendTimeoutMs || 2500

  function normalizeBackendPlans(result) {
    if (!result || !result.success || !Array.isArray(result.plans)) return []
    const favoriteIds = new Set(result.favoriteIds || [])
    return result.plans
      .map(plan => ({ dishes: (plan.dishes || []).map(dish => normalizeDish(dish, favoriteIds)) }))
      .filter(plan => plan.dishes.length > 0)
  }

  function getCachedDishPool() {
    const app = appProvider()
    const globalDishes = app && app.globalData && app.globalData.allDishes
    if (Array.isArray(globalDishes) && globalDishes.length > 0) return globalDishes
    const localDishes = wxRuntime.getStorageSync('cachedAllDishes')
    return Array.isArray(localDishes) && localDishes.length > 0 ? localDishes : null
  }

  async function refreshBackend(params) {
    const result = await backendApi.getRecommendations(params)
    const plans = normalizeBackendPlans(result)
    plans.warnings = Array.isArray(result && result.warnings) ? result.warnings : []
    plans.appliedCriteria = result && result.appliedCriteria ? result.appliedCriteria : null
    return plans
  }

  function refreshBackendWithTimeout(params) {
    let timeoutId
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Recommendation backend timed out')), backendTimeoutMs)
    })
    return Promise.race([refreshBackend(params), timeout]).finally(() => clearTimeout(timeoutId))
  }

  async function generate(params) {
    const cachedDishes = getCachedDishPool()
    let backendWarnings = []
    let appliedCriteria = null
    let backendUnavailable = false

    try {
      const plans = await refreshBackendWithTimeout(params)
      backendWarnings = plans.warnings || []
      appliedCriteria = plans.appliedCriteria || null
      if (plans.length > 0) {
        return {
          plans,
          source: 'backend',
          dishPool: cachedDishes,
          shouldRefresh: false,
          warnings: backendWarnings,
          appliedCriteria,
        }
      }
    } catch (error) {
      backendUnavailable = true
      console.warn('Backend recommendation unavailable; using local recommendation:', error)
    }

    if (cachedDishes) {
      const plans = await localRecommend(params, cachedDishes)
      if (plans && plans.length > 0) {
        return { plans, source: 'cache', dishPool: cachedDishes, shouldRefresh: false, warnings: backendWarnings, appliedCriteria }
      }
    }

    const dishPool = cachedDishes || await loadAllDishes()
    const plans = await localRecommend(params, dishPool)
    const warnings = backendWarnings.length || (plans && plans.length) || !backendUnavailable
      ? backendWarnings
      : ['网络暂时不可用，本地菜品也没有同时满足当前条件。']
    return { plans: plans || [], source: 'local', dishPool, shouldRefresh: false, warnings, appliedCriteria }
  }

  return { generate, getCachedDishPool, normalizeBackendPlans, refreshBackend }
}

const defaultFlow = createRecommendationFlow()

module.exports = {
  createRecommendationFlow,
  generateRecommendation: defaultFlow.generate,
  normalizeBackendPlans: defaultFlow.normalizeBackendPlans,
  refreshBackendRecommendation: defaultFlow.refreshBackend,
}
