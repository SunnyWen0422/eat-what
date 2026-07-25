const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function createWx(overrides = {}) {
  const storage = new Map(Object.entries(overrides.initialStorage || {}))
  const calls = []
  const wx = {
    calls,
    storage,
    getStorageSync(key) { return clone(storage.get(key)) },
    setStorageSync(key, value) { storage.set(key, clone(value)); calls.push(['setStorageSync', key, clone(value)]) },
    removeStorageSync(key) { storage.delete(key); calls.push(['removeStorageSync', key]) },
    clearStorageSync() { storage.clear() },
    request(options) {
      calls.push(['request', options])
      if (overrides.request) return overrides.request(options)
      queueMicrotask(() => options.success && options.success({ statusCode: 200, data: {}, header: {} }))
    },
    login(options) { calls.push(['login']); queueMicrotask(() => options.success && options.success({ code: 'test-code' })) },
    showToast(options) { calls.push(['showToast', options]) },
    showModal(options) { calls.push(['showModal', options]); queueMicrotask(() => options.success && options.success({ confirm: true, cancel: false, content: '测试' })) },
    showActionSheet(options) { calls.push(['showActionSheet', options]); queueMicrotask(() => options.success && options.success({ tapIndex: 0 })) },
    showLoading(options) { calls.push(['showLoading', options]) },
    hideLoading() { calls.push(['hideLoading']) },
    stopPullDownRefresh() { calls.push(['stopPullDownRefresh']) },
    navigateTo(options) { calls.push(['navigateTo', options]); options.success && options.success() },
    navigateBack(options = {}) { calls.push(['navigateBack', options]); options.success && options.success() },
    switchTab(options) { calls.push(['switchTab', options]); options.success && options.success() },
    redirectTo(options) { calls.push(['redirectTo', options]); options.success && options.success() },
    reLaunch(options) { calls.push(['reLaunch', options]); options.success && options.success() },
    vibrateShort(options) { calls.push(['vibrateShort', options]) },
    getAccountInfoSync() { return { miniProgram: { envVersion: 'develop', version: 'test' } } },
    getNetworkTypeSync() { return { networkType: 'wifi' } },
    previewImage(options) { calls.push(['previewImage', options]) },
    chooseImage(options) { calls.push(['chooseImage', options]); queueMicrotask(() => options.success && options.success({ tempFilePaths: ['temp://avatar.jpg'] })) },
    ...overrides,
  }
  delete wx.initialStorage
  return wx
}

function setByPath(target, expression, value) {
  const parts = expression.replace(/\[(\d+)\]/g, '.$1').split('.')
  let current = target
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index]
    if (current[key] == null) current[key] = /^\d+$/.test(parts[index + 1]) ? [] : {}
    current = current[key]
  }
  current[parts[parts.length - 1]] = value
}

function attachPageRuntime(page) {
  page.data = clone(page.data || {})
  page.setData = function setData(updates, callback) {
    for (const [key, value] of Object.entries(updates || {})) setByPath(this.data, key, clone(value))
    if (callback) callback.call(this)
  }
  return page
}

function freshRequire(filePath, mocks = {}) {
  const absolute = path.resolve(filePath)
  delete require.cache[absolute]
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request]
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(absolute)
  } finally {
    Module._load = originalLoad
  }
}

function installGlobals({ wx = createWx(), app = null } = {}) {
  const appValue = app || {
    globalData: { loginReady: true, isLoggedIn: true, userInfo: { id: 1, nickname: '测试用户' }, allDishes: null },
    waitForLogin: () => Promise.resolve(),
    doLogin: () => Promise.resolve(),
    precacheDishes: () => Promise.resolve(),
  }
  global.wx = wx
  global.getApp = () => appValue
  global.getCurrentPages = () => []
  return { wx, app: appValue }
}

function loadPage(filePath, { wx, app, mocks = {} } = {}) {
  const runtime = installGlobals({ wx, app })
  let captured
  global.Page = definition => { captured = definition }
  freshRequire(filePath, mocks)
  if (!captured) throw new Error(`Page() was not called by ${filePath}`)
  return { page: attachPageRuntime(captured), ...runtime }
}

function loadApp(filePath, { wx, mocks = {} } = {}) {
  const runtime = installGlobals({ wx })
  let captured
  global.App = definition => { captured = definition }
  freshRequire(filePath, mocks)
  if (!captured) throw new Error(`App() was not called by ${filePath}`)
  return { appDefinition: captured, ...runtime }
}

function createApiMock(overrides = {}) {
  const defaults = {
    request: async () => ({ success: true, data: [] }),
    requestSilent: async () => ({ success: true, plans: [] }),
    login: async () => ({ success: true, token: 'token', user: { id: 1 } }),
    getUserInfo: async () => ({ success: true, user: { id: 1, nickname: '测试用户' } }),
    updateUserInfo: async fields => ({ success: true, user: { id: 1, ...fields } }),
    getDishes: async () => ({ list: [], total: 0, page: 1, pageSize: 20 }),
    getDishesLite: async () => [],
    getDishesLiteByType: async () => [],
    searchDishes: async () => [],
    createCustomDish: async dish => ({ id: 99, ...dish }),
    getCustomDishes: async () => [],
    getDishById: async id => ({ id, name: '测试菜', type: 'veg', tags: '' }),
    getAdminUsers: async () => ({ list: [], data: [], total: 0, page: 1, pageSize: 20 }),
    getAdminUser: async id => ({ success: true, user: { id, nickname: '测试用户' }, customDishes: [] }),
    createAdminUserDish: async (id, dish) => ({ success: true, dish: { id: 99, userId: id, ...dish } }),
    deleteAdminUserDish: async () => ({ success: true }),
    getRecommendations: async () => ({ success: true, plans: [] }),
    getRecommendationOptions: async () => ({ metadataVersion: 1, groups: {} }),
    getUserPreferences: async () => ({ success: true, preferences: {} }),
    updateUserPreferences: async preferences => ({ success: true, preferences }),
    getSingleRecommendation: async () => ({ success: false }),
    saveRecipeRecord: async value => value,
    getRecipeRecordsByDate: async () => [],
    getRecipeRecordDates: async () => [],
    updateRecipeRecord: async () => ({}),
    deleteRecipeRecord: async () => ({}),
    deleteRecipeRecordByDateAndMeal: async () => ({}),
    getStatistics: async () => ({ success: true, statistics: {}, daysWithRecords: 0, dishes: [] }),
    addFavoriteDish: async () => ({ success: true }),
    removeFavoriteDish: async () => ({ success: true }),
    checkFavoriteDish: async () => ({ isFavorite: false }),
    batchCheckFavoriteDishes: async () => [],
    getFavoriteDishes: async () => [],
    sendChat: async () => ({ success: true, reply: '测试回复', dishes: [] }),
  }
  return { ...defaults, ...overrides }
}

function pageFiles(root) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  return config.pages.map(route => ({ route, js: path.join(root, `${route}.js`), wxml: path.join(root, `${route}.wxml`) }))
}

module.exports = {
  attachPageRuntime,
  createApiMock,
  createWx,
  freshRequire,
  installGlobals,
  loadApp,
  loadPage,
  pageFiles,
}
