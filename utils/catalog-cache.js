/** Public recipe rows belong to their API source; retained unscoped caches are never activated. */
function createCatalogCache(options = {}) {
  const runtime = options.wx || wx
  const appProvider = options.appProvider || (() => typeof getApp === 'function' ? getApp() : null)
  const currentSource = options.getApiBaseUrl || (() => require('./config').getApiBaseUrl())
  const key = source => `catalog:api_v1_${encodeURIComponent(source)}`
  const usable = rows => Array.isArray(rows) && rows.length > 0
  function assertSource(source) {
    if (source !== currentSource()) {
      const error = new Error('服务环境已切换，请重新加载菜品')
      error.isEnvironmentChanged = true
      throw error
    }
  }
  function read() {
    const source = currentSource(), app = appProvider()
    if (app && app.globalData && app.globalData.allDishesSource === source && usable(app.globalData.allDishes)) return app.globalData.allDishes
    try {
      const cached = runtime.getStorageSync(key(source))
      if (cached && cached.schemaVersion === 1 && cached.source === source && usable(cached.dishes)) return cached.dishes
    } catch (_) { /* Storage unavailable: a fresh API read can still succeed. */ }
    return null
  }
  function write(dishes, source = currentSource()) {
    assertSource(source)
    if (!Array.isArray(dishes)) return
    const app = appProvider()
    if (app && app.globalData) {
      app.globalData.allDishes = dishes
      app.globalData.allDishesSource = source
    }
    try { runtime.setStorageSync(key(source), { schemaVersion: 1, source, dishes, savedAt: Date.now() }) }
    catch (_) { console.warn('菜库缓存未写入，本次仍可使用已读取的菜品') }
  }
  return { currentSource, assertSource, read, write }
}

module.exports = { createCatalogCache }
