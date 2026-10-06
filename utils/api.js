// utils/api.js - 后端API接口配置

const config = require('./config')

// ========================================
// 配置项
// ========================================

// 重试配置
const RETRY_CONFIG = {
  maxRetries: 3,           // 最多重试 3 次
  baseDelayMs: 1000,       // 基础延迟 1 秒
  maxDelayMs: 8000,        // 最大延迟 8 秒
  retryableStatuses: [     // 哪些 HTTP 状态码会触发重试
    502, 503, 504,         // 网关/服务不可用
    408,                   // 请求超时
    429                    // 限流
  ]
}

// ETag 缓存（用于条件请求，减少数据传输）
// 格式: { "https://...": { etag: "...", data: {...} } }
const etagCache = {}

/**
 * 判断是否为可重试的错误
 */
function isRetryable(statusCode, isNetworkError) {
  if (isNetworkError) return true  // 网络错误都可重试
  return RETRY_CONFIG.retryableStatuses.includes(statusCode)
}

/**
 * 延迟函数
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 计算退避延迟（指数退避 + 随机抖动）
 */
function calcBackoff(attempt) {
  const exp = Math.min(RETRY_CONFIG.maxDelayMs, RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt))
  const jitter = Math.random() * 1000  // 0-1000ms 随机抖动
  return exp + jitter
}

// 请求去重：同一 URL+method+body 的并发请求合并
const inFlightRequests = {}

function getRequestKey(url, method, data) {
  const identity = requestIdentity()
  try {
    return `${identity}:${method}:${url}:${JSON.stringify(data || {})}`
  } catch (_) {
    return `${identity}:${method}:${url}`
  }
}

/**
 * 执行单次 HTTP 请求（不包含重试逻辑）
 * @returns {Promise<{ statusCode, data }>}
 */
function executeHttpRequest(url, method, data, originalIdentity) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token') || ''
    const header = {
      'Content-Type': 'application/json'
    }
    if (token) {
      header['Authorization'] = `Bearer ${token}`
    }

    // ETag 条件请求：如果缓存中有该 URL 的 ETag，携带 If-None-Match
    const fullUrl = `${config.getApiBaseUrl()}${url}`
    const cacheKey = `${token}:${fullUrl}`
    const cached = etagCache[cacheKey]
    if (cached && cached.etag) {
      header['If-None-Match'] = cached.etag
    }

    wx.request({
      url: fullUrl,
      method,
      data,
      header,
      timeout: 15000,  // 15 秒超时
      success: (res) => {
        if (originalIdentity !== requestIdentity()) return reject({ statusCode: 401, isAccountChanged: true })
        // 304 Not Modified：后端数据未变，返回缓存数据
        if (res.statusCode === 304) {
          if (cached && cached.data) {
            console.log(`📦 ETag 命中 (304)，使用缓存: ${url}`)
            return resolve({ statusCode: 200, data: cached.data })
          }
          // 缓存不存在时降级为正常响应
          return resolve({ statusCode: 304, data: null })
        }

        // 提取并缓存 ETag（大小写兼容）
        const etag = res.header &&
          (res.header['ETag'] || res.header['etag'] || res.header['Etag'])
        if (etag && res.statusCode === 200) {
          etagCache[cacheKey] = { etag, data: res.data }
        }

        resolve({ statusCode: res.statusCode, data: res.data })
      },
      fail: (err) => {
        if (originalIdentity !== requestIdentity()) return reject({ statusCode: 401, isAccountChanged: true })
        reject({ isNetworkError: true, err })
      }
    })
  })
}

/**
 * 内部请求实现（带重试 + 401自动重登）
 * @param {String} url - 接口路径
 * @param {String} method - 请求方法
 * @param {Object} data - 请求数据
 * @param {Object} options - { silent, maxRetries, isAuthRetry }
 *   silent: true 则不弹 toast（后台静默请求）
 *   maxRetries: 最大重试次数（不含首次）
 *   isAuthRetry: 是否为 401 重新登录后的重试
 */
function doRequest(url, method = 'GET', data = null, options = {}) {
  const {
    silent = false,
    maxRetries = RETRY_CONFIG.maxRetries,
    isAuthRetry = false
  } = options

  let lastError = null

  // 请求去重：如果同一个请求已经在进行中，复用其结果
  const reqKey = getRequestKey(url, method, data) + (isAuthRetry ? ':auth-retry' : '')
  const originalIdentity = requestIdentity()
  if (inFlightRequests[reqKey]) {
    console.log('复用进行中的请求')
    return inFlightRequests[reqKey]
  }

  async function attempt(attemptIndex) {
    if (originalIdentity !== requestIdentity()) throw { statusCode: 401, isAccountChanged: true }
    try {
      const { statusCode, data: resData } = await executeHttpRequest(url, method, data, originalIdentity)
      if (originalIdentity !== requestIdentity()) throw { statusCode: 401, isAccountChanged: true }

      // 成功
      if (statusCode === 200) {
        return resData
      }

      // 401：token 失效，自动重登（仅一次）
      if (statusCode === 401 && !isAuthRetry) {
        console.log('🔄 Token 失效，尝试自动重新登录...')
        try {
          await autoReLogin()
          if (originalIdentity !== requestIdentity()) {
            throw { statusCode: 401, isAccountChanged: true }
          }
          // 重新登录后用新 token 重试（仅一次，防止死循环）
          return await doRequest(url, method, data, {
            silent,
            maxRetries: 0,       // 401 重试不再走网络重试
            isAuthRetry: true
          })
        } catch (authErr) {
          if (authErr && authErr.isAccountChanged) throw authErr
          console.error('❌ 自动重新登录失败:', authErr)
          if (!silent) {
            wx.showToast({ title: '登录已过期，请重新打开', icon: 'none', duration: 2000 })
          }
          throw { statusCode: 401, data: resData, isAuthError: true }
        }
      }

      // 可重试的状态码
      if (attemptIndex < maxRetries && isRetryable(statusCode, false)) {
        const backoff = calcBackoff(attemptIndex)
        console.log(`⏳ 请求失败(HTTP ${statusCode})，${backoff / 1000}s 后第 ${attemptIndex + 1}/${maxRetries} 次重试...`)
        await delay(backoff)
        return attempt(attemptIndex + 1)
      }

      // 不可重试的错误
      lastError = { statusCode, data: resData }
      console.error(`❌ 请求失败(HTTP ${statusCode}):`, resData)
      if (!silent && resData && resData.message) {
        wx.showToast({ title: resData.message, icon: 'none', duration: 2000 })
      }
      throw lastError

    } catch (err) {
      // 网络错误
      if (err && err.isNetworkError) {
        if (attemptIndex < maxRetries) {
          const backoff = calcBackoff(attemptIndex)
          console.log(`⏳ 网络波动，${backoff / 1000}s 后第 ${attemptIndex + 1}/${maxRetries} 次重试...`)
          await delay(backoff)
          return attempt(attemptIndex + 1)
        }
        // 重试耗尽
        lastError = err
        console.error('❌ 网络请求失败（重试耗尽）:', err.err)
        if (!silent) {
          wx.showToast({ title: '网络连接失败，请检查网络', icon: 'none', duration: 2500 })
        }
        throw lastError
      }
      // 其他错误直接抛出
      throw err
    }
  }

  const promise = attempt(0)
  inFlightRequests[reqKey] = promise
  // 请求完成后清理（无论成功失败）
  const cleanup = () => { delete inFlightRequests[reqKey] }
  promise.then(cleanup, cleanup)
  return promise
}

/**
 * 通用请求方法（对外暴露，默认显示 toast）
 */
function request(url, method = 'GET', data = null) {
  return doRequest(url, method, data, { silent: false, maxRetries: 1 })
}

/**
 * 静默请求方法（后台调用，不弹 toast，更多重试次数）
 */
function requestSilent(url, method = 'GET', data = null) {
  return doRequest(url, method, data, { silent: true, maxRetries: RETRY_CONFIG.maxRetries })
}

// Assistant operations are user-visible tasks. Retrying a timed-out message
// can append the same turn twice, so these calls fail fast and let the page
// keep the current plan while offering an explicit retry button.
function assistantRequest(url, method = 'GET', data = null) {
  return doRequest(url, method, data, { silent: true, maxRetries: 0 })
}

/**
 * 自动重新登录：调用 wx.login 和后端登录接口，刷新 token 和用户信息
 */
function autoReLogin() {
  const originalIdentity = requestIdentity()
  return new Promise((resolve, reject) => {
    wx.login({
      success: async (res) => {
        if (originalIdentity !== requestIdentity()) return reject({ statusCode: 401, isAccountChanged: true })
        if (!res.code) {
          console.error('wx.login 获取 code 失败:', res.errMsg)
          return reject(new Error(res.errMsg || '获取登录凭证失败'))
        }

        try {
          const result = await login({ code: res.code })
          if (originalIdentity !== requestIdentity()) throw { statusCode: 401, isAccountChanged: true }
          if (result && result.success) {
            const user = wx.getStorageSync('userInfo') || {}
            if ((user.id && String(user.id) !== String(result.user && result.user.id)) ||
              (user.openId && !user.id && user.openId !== (result.user && result.user.openId))) {
              throw { statusCode: 401, isAccountChanged: true }
            }
            try {
              wx.setStorageSync('token', result.token)
              wx.setStorageSync('userInfo', result.user)
            } catch (e) {
              console.warn('⚠️ 存储已满，token 写入失败:', e.message || e)
            }
            // 更新全局 userInfo（如果 app 实现了）
            const app = getApp && getApp()
            if (app && app.globalData) {
              app.globalData.userInfo = result.user
            }
            resolve(result)
          } else {
            wx.removeStorageSync('token')
            wx.removeStorageSync('userInfo')
            wx.showToast({
              title: (result && result.message) || '自动登录失败',
              icon: 'none'
            })
            reject(new Error((result && result.message) || '自动登录失败'))
          }
        } catch (err) {
          if (err && err.isAccountChanged) return reject(err)
          console.error('自动登录请求失败:', err)
          wx.showToast({
            title: '自动登录失败，请重试',
            icon: 'none'
          })
          reject(err)
        }
      },
      fail: (err) => {
        console.error('wx.login 失败:', err)
        reject(err)
      }
    })
  })
}

// ========================================
// 菜品相关接口
// ========================================

/**
 * 获取菜品列表（支持分页）
 * @param {Object} params - 查询参数 {type, keyword, page, pageSize}
 */
function getDishes(params = {}) {
  const pairs = []
  const add = (key, value) => {
    if (value === undefined || value === null || value === '') return
    const text = Array.isArray(value) ? value.join(',') : String(value)
    if (text) pairs.push(`${key}=${encodeURIComponent(text)}`)
  }
  add('type', params.type)
  add('keyword', params.keyword)
  add('cuisineCodes', params.cuisineCodes)
  add('tagCodes', params.tagCodes)
  add('methodCodes', params.methodCodes)
  add('excludeTagCodes', params.excludeTagCodes)
  add('excludedIngredients', params.excludedIngredients)
  add('maxCookMinutes', params.maxCookMinutes)
  add('page', params.page)
  add('pageSize', params.pageSize)

  return request(`/dishes?${pairs.join('&')}`, 'GET')
}

// 请求去重键必须按账号隔离，但不能把 token 写入日志或键名输出。
function requestIdentity() {
  const user = wx.getStorageSync('userInfo') || {}
  if (user.id) return `id:${user.id}`
  if (user.openId) return `open:${user.openId}`
  const token = String(wx.getStorageSync('token') || '')
  let hash = 2166136261
  for (let index = 0; index < token.length; index += 1) hash = Math.imul(hash ^ token.charCodeAt(index), 16777619)
  return token ? `token:${hash >>> 0}` : 'anonymous'
}

/**
 * 获取所有菜品（轻量版 - 只返回推荐所需的必要字段）
 * 用于前端推荐算法，大幅减少数据传输量
 * @param {Object} params - 查询参数 {type, keyword}
 */
function getDishesLite(params = {}) {
  let queryString = ''
  if (params.type) queryString += `type=${params.type}&`
  if (params.keyword) queryString += `keyword=${encodeURIComponent(params.keyword)}&`
  if (params.limit) queryString += `limit=${params.limit}&`
  
  return requestSilent(`/dishes/lite?${queryString}`, 'GET')
}

/**
 * 按分类获取菜品（懒加载，只取 top-N，减少数据传输）
 * @param {String} type - 菜品类型 meat/veg/soup/dessert
 * @param {Number} limit - 每类最多取多少条（默认 100）
 */
function getDishesLiteByType(type, limit = 100) {
  return requestSilent(`/dishes/lite?type=${type}&limit=${limit}`, 'GET')
}

/**
 * 搜索菜品
 * @param {String} keyword - 搜索关键词
 * @param {String} type - 菜品类型（可选）
 */
function searchDishes(keyword, type = null) {
  let url = `/dishes/search?keyword=${encodeURIComponent(keyword)}`
  if (type) url += `&type=${type}`
  return request(url, 'GET')
}

/**
 * 创建自定义菜品
 * @param {Object} dish - 菜品对象
 */
function createCustomDish(dish) {
  return request('/dishes/custom', 'POST', dish)
}

function updateCustomDish(id, dish) {
  return request(`/dishes/custom/${encodeURIComponent(id)}`, 'PUT', dish)
}

function deleteCustomDish(id) {
  return request(`/dishes/custom/${encodeURIComponent(id)}`, 'DELETE')
}

/**
 * 根据ID获取菜品
 * @param {Number} id - 菜品ID
 */
function getDishById(id) {
  return request(`/dishes/${id}`, 'GET')
}

// ========================================
// 用户相关接口
// ========================================

/**
 * 用户登录
 * @param {Object} loginData - 登录数据 { code: string }
 */
function login(loginData) {
  return doRequest('/users/login', 'POST', loginData, { silent: false, maxRetries: 2 })
}

/**
 * 手机号快捷登录
 * @param {String} phoneCode - getPhoneNumber 返回的 code
 */
function phoneLogin(phoneCode) {
  return doRequest('/users/phone-login', 'POST', { code: phoneCode }, { silent: true, maxRetries: 1 })
}

/**
 * 获取当前用户信息
 */
function getUserInfo() {
  return request('/users/info', 'GET')
}

/**
 * 更新用户信息
 * @param {Object} userInfo - 用户信息 { nickname, avatar }
 */
function updateUserInfo(userInfo) {
  return request('/users/info', 'PUT', userInfo)
}

function getUserPreferences() {
  return requestSilent('/users/preferences', 'GET')
}

function updateUserPreferences(preferences) {
  return requestSilent('/users/preferences', 'PUT', preferences)
}

// ========================================
// 推荐相关接口
// ========================================

/**
 * 生成推荐
 * @param {Object} params - 推荐参数
 */
function getRecommendations(params) {
  return requestSilent('/recommend', 'POST', params)
}

function getRecommendationOptions() {
  return requestSilent('/recommend/options', 'GET')
}

/**
 * 获取单道推荐菜品（从整体数据中随机抽取）
 * @param {String} type - 菜品类型 meat/veg/soup
 * @param {Array} excludeIds - 需要排除的菜品ID数组
 */
function getSingleRecommendation(type, excludeIds = []) {
  const excludeParam = excludeIds.length > 0 ? `&exclude=${excludeIds.join(',')}` : ''
  return requestSilent(`/recommend/single?type=${type}${excludeParam}`, 'GET')
}

// ========================================
// 菜谱记录相关接口
// ========================================

/**
 * 保存菜谱记录
 * @param {Object} record - 菜谱记录对象
 */
function saveRecipeRecord(record) {
  return request('/recipe-records', 'POST', record)
}

/**
 * 获取指定日期的菜谱记录
 * @param {String} date - 日期 (YYYY-MM-DD)
 */
function getRecipeRecordsByDate(date) {
  return request(`/recipe-records/date/${date}`, 'GET')
}

/**
 * 获取日期范围内的记录日期
 * @param {String} startDate - 开始日期 (YYYY-MM-DD)
 * @param {String} endDate - 结束日期 (YYYY-MM-DD)
 */
function getRecipeRecordDates(startDate, endDate) {
  return request(`/recipe-records/dates?startDate=${startDate}&endDate=${endDate}`, 'GET')
}

/**
 * 更新菜谱记录
 * @param {Number} id - 记录ID
 * @param {Object} record - 菜谱记录对象
 */
function updateRecipeRecord(id, record) {
  return request(`/recipe-records/${id}`, 'PUT', record)
}

/**
 * 删除菜谱记录
 * @param {Number} id - 记录ID
 */
function deleteRecipeRecord(id) {
  return request(`/recipe-records/${id}`, 'DELETE')
}

/**
 * 删除指定日期和餐次的记录
 * @param {String} date - 日期 (YYYY-MM-DD)
 * @param {String} mealType - 餐次类型
 */
function deleteRecipeRecordByDateAndMeal(date, mealType) {
  return request(`/recipe-records/date/${date}/meal/${mealType}`, 'DELETE')
}

/**
 * 获取饮食统计数据
 * @param {String} startDate - 开始日期 (YYYY-MM-DD)
 * @param {String} endDate - 结束日期 (YYYY-MM-DD)
 */
function getStatistics(startDate, endDate) {
  return request(`/recipe-records/statistics?startDate=${startDate}&endDate=${endDate}`, 'GET')
}

// ========================================
// 收藏菜品接口
// ========================================

/**
 * 添加菜品收藏
 * @param {Number} dishId - 菜品ID
 */
function addFavoriteDish(dishId) {
  return request('/favorite-dishes', 'POST', { dishId })
}

/**
 * 取消菜品收藏
 * @param {Number} dishId - 菜品ID
 */
function removeFavoriteDish(dishId) {
  return request(`/favorite-dishes/${dishId}`, 'DELETE')
}

/**
 * 检查是否已收藏菜品
 * @param {Number} dishId - 菜品ID
 */
function checkFavoriteDish(dishId) {
  return request(`/favorite-dishes/check?dishId=${dishId}`, 'GET')
}

/**
 * 批量检查菜品收藏状态
 * @param {Array} dishIds - 菜品ID数组
 */
function batchCheckFavoriteDishes(dishIds) {
  return request('/favorite-dishes/batch-check', 'POST', dishIds)
}

/**
 * 获取收藏的菜品列表
 */
function getFavoriteDishes() {
  return request('/favorite-dishes', 'GET')
}

// ========================================
// AI 聊天接口
// ========================================

function sendChat(message, userId) {
  return requestSilent('/chat/sync', 'POST', { message: message, user_id: String(userId || 'guest') })
}

// ========================================
// 餐食安排助手接口
// ========================================

function createAssistantSession(options = {}) {
  const payload = {}
  if (options.sessionId) payload.session_id = String(options.sessionId)
  // user_id is only a compatibility hint for the internal service. The Java
  // gateway derives the authenticated identity from the request token.
  if (options.userId) payload.user_id = String(options.userId)
  return assistantRequest('/assistant/sessions', 'POST', payload)
}

function getAssistantSession(sessionId) {
  return assistantRequest(`/assistant/sessions/${encodeURIComponent(sessionId)}`, 'GET')
}

function sendAssistantMessage(sessionId, message, options = {}) {
  const payload = { message: String(message || '') }
  if (options.idempotencyKey) payload.idempotency_key = String(options.idempotencyKey)
  if (options.parentTaskId) payload.parent_task_id = String(options.parentTaskId)
  return assistantRequest(`/assistant/sessions/${encodeURIComponent(sessionId)}/messages`, 'POST', payload)
}

function deleteAssistantSession(sessionId) {
  return assistantRequest(`/assistant/sessions/${encodeURIComponent(sessionId)}`, 'DELETE')
}

function previewAssistantAction(sessionId, actionType, planVersion = 1, payload = null) {
  const body = { action_type: actionType, plan_version: Number(planVersion) || 1 }
  if (payload && typeof payload === 'object') body.payload = payload
  return assistantRequest(`/assistant/sessions/${encodeURIComponent(sessionId)}/actions/preview`, 'POST', {
    ...body,
  })
}

function confirmAssistantAction(sessionId, payload = {}) {
  return assistantRequest(`/assistant/sessions/${encodeURIComponent(sessionId)}/actions/confirm`, 'POST', {
    action_type: payload.actionType || payload.action_type,
    plan_version: Number(payload.planVersion || payload.plan_version) || 1,
    preview_token: String(payload.previewToken || payload.preview_token || ''),
    idempotency_key: String(payload.idempotencyKey || payload.idempotency_key || ''),
    ...(payload.payload && typeof payload.payload === 'object' ? { payload: payload.payload } : {}),
  })
}

function undoAssistantPlan(sessionId, planVersion) {
  const payload = {}
  if (planVersion !== undefined && planVersion !== null) payload.plan_version = Number(planVersion)
  return assistantRequest(`/assistant/sessions/${encodeURIComponent(sessionId)}/undo`, 'POST', payload)
}

function getAssistantTask(taskId, sessionId) {
  const suffix = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''
  return assistantRequest(`/assistant/tasks/${encodeURIComponent(taskId)}${suffix}`, 'GET')
}

function getAssistantTaskEvents(taskId, sessionId) {
  const suffix = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ''
  return assistantRequest(`/assistant/tasks/${encodeURIComponent(taskId)}/events${suffix}`, 'GET')
}

function cancelAssistantTask(taskId, sessionId) {
  return assistantRequest(`/assistant/tasks/${encodeURIComponent(taskId)}/cancel`, 'POST', sessionId ? { session_id: sessionId } : {})
}

function getAssistantTools() {
  return assistantRequest('/assistant/tools', 'GET')
}

function getCustomDishes() {
  return request('/dishes/custom', 'GET')
}

// ========================================
// 购物清单接口
// ========================================

function createShoppingPreview(payload) {
  return request('/shopping-list/preview', 'POST', payload)
}

function getShoppingList(status = 'all', options = {}) {
  return doRequest(`/shopping-list?status=${encodeURIComponent(status)}`, 'GET', null, { silent: false, maxRetries: 1, ...options })
}

function batchAddShoppingItems(payload) {
  return request('/shopping-list/items:batch-add', 'POST', payload)
}

function patchShoppingItem(itemId, payload) {
  return request(`/shopping-list/items/${encodeURIComponent(itemId)}`, 'PATCH', payload)
}

function deleteShoppingItem(itemId, payload = {}) {
  return request(`/shopping-list/items/${encodeURIComponent(itemId)}`, 'DELETE', payload)
}

function clearShoppingList(payload) {
  return request('/shopping-list:clear', 'POST', payload)
}

// ========================================
// 管理后台接口
// ========================================

function getAdminUsers(params = {}) {
  const pairs = []
  if (params.keyword) pairs.push(`keyword=${encodeURIComponent(params.keyword)}`)
  if (params.page) pairs.push(`page=${encodeURIComponent(params.page)}`)
  if (params.pageSize) pairs.push(`pageSize=${encodeURIComponent(params.pageSize)}`)
  return request(`/admin/users${pairs.length ? `?${pairs.join('&')}` : ''}`, 'GET')
}

function getAdminUser(userId) {
  return request(`/admin/users/${encodeURIComponent(userId)}`, 'GET')
}

function createAdminUserDish(userId, dish) {
  return request(`/admin/users/${encodeURIComponent(userId)}/dishes`, 'POST', dish)
}

function deleteAdminUserDish(userId, dishId) {
  return request(`/admin/users/${encodeURIComponent(userId)}/dishes/${encodeURIComponent(dishId)}`, 'DELETE')
}

function getAdminOverview() {
  return request('/admin/overview', 'GET')
}

function updateAdminUserStatus(userId, status) {
  return request(`/admin/users/${encodeURIComponent(userId)}/status`, 'PATCH', { status })
}

function getAdminDishes(params = {}) {
  const pairs = []
  ;['scope', 'keyword', 'type', 'published', 'ownerId', 'page', 'pageSize'].forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      pairs.push(`${key}=${encodeURIComponent(params[key])}`)
    }
  })
  return request(`/admin/dishes${pairs.length ? `?${pairs.join('&')}` : ''}`, 'GET')
}

function getAdminDish(dishId) {
  return request(`/admin/dishes/${encodeURIComponent(dishId)}`, 'GET')
}

function updateAdminDish(dishId, dish) {
  return request(`/admin/dishes/${encodeURIComponent(dishId)}`, 'PUT', dish)
}

function updateAdminDishStatus(dishId, published) {
  return request(`/admin/dishes/${encodeURIComponent(dishId)}/status`, 'PATCH', { published })
}

function updateAdminUserDish(userId, dishId, dish) {
  return request(`/admin/users/${encodeURIComponent(userId)}/dishes/${encodeURIComponent(dishId)}`, 'PUT', dish)
}

function getAdminAuditLogs(params = {}) {
  const pairs = []
  ;['adminId', 'targetUserId', 'action', 'from', 'to', 'page', 'pageSize'].forEach(key => {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      pairs.push(`${key}=${encodeURIComponent(params[key])}`)
    }
  })
  return request(`/admin/audit-logs${pairs.length ? `?${pairs.join('&')}` : ''}`, 'GET')
}

// ========================================
// 导出接口
// ========================================

module.exports = {
  getAssistantSessions: ({cursor,limit=20}={}) => assistantRequest('/assistant/sessions?limit='+limit+(cursor?'&cursor='+encodeURIComponent(cursor):''),'GET'),
  createVoiceSession: () => doRequest('/assistant/voice/session','POST',{}, {silent:true,maxRetries:0}),
  getShoppingPurchaseOptions: () => requestSilent('/shopping-list/purchase-options','GET'),
  getIngredientPriceQuotes: items => requestSilent('/ingredient-prices/query','POST',{items}),
  saveShoppingExpense: body => doRequest('/shopping-list/expenses','POST',body,{silent:true,maxRetries:0}),
  getMealWorkspace: (date, mealType) => requestSilent(`/meal-workspaces/current?date=${encodeURIComponent(date)}&mealType=${encodeURIComponent(mealType)}`, 'GET'),
  createMealWorkspace: body => doRequest('/meal-workspaces', 'POST', body, { silent: true, maxRetries: 0 }),
  saveWorkspaceContext: (id, body) => doRequest(`/meal-workspaces/${encodeURIComponent(id)}/context`, 'PATCH', body, { silent: true, maxRetries: 0 }),
  commandMealWorkspace: (id, body) => doRequest(`/meal-workspaces/${encodeURIComponent(id)}/commands`, 'POST', body, { silent: true, maxRetries: 0 }),
  confirmMealWorkspace: (id, body) => doRequest(`/meal-workspaces/${encodeURIComponent(id)}/confirm`, 'POST', body, { silent: true, maxRetries: 0 }),
  getWorkspaceTask: (id, taskId) => requestSilent(`/meal-workspaces/${encodeURIComponent(id)}/tasks/${encodeURIComponent(taskId)}`, 'GET'),
  getWorkspaceRequest: (id, key) => requestSilent(`/meal-workspaces/${encodeURIComponent(id)}/requests/${encodeURIComponent(key)}`, 'GET'),
  recordBehaviorEvent: body => doRequest('/behavior-events', 'POST', body, { silent: true, maxRetries: 0 }),
  commandAssistantPlan: (sessionId, body) => assistantRequest(`/assistant/sessions/${encodeURIComponent(sessionId)}/plan-commands`, 'POST', body),
  getMealOverview: (start, end) => requestSilent(`/recipe-records/overview?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`, 'GET'),
  getDietReview: (start, end) => requestSilent(`/diet-reviews?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`, 'GET'),
  saveMealConsumption: (date, meal, body) => doRequest(`/meal-consumptions/${encodeURIComponent(date)}/${encodeURIComponent(meal)}`, 'PUT', body, { silent: true, maxRetries: 0 }),
  saveMealPlan: (date, meal, body) => doRequest(`/meal-plans/${encodeURIComponent(date)}/${encodeURIComponent(meal)}`, 'PUT', body, { silent: true, maxRetries: 0 }),
  removeMealPlan: (date, meal, body) => doRequest(`/meal-plans/${encodeURIComponent(date)}/${encodeURIComponent(meal)}`, 'DELETE', body, { silent: true, maxRetries: 0 }),
  addManualShoppingItem: body => doRequest('/shopping-list/manual-items', 'POST', body, { silent: true, maxRetries: 0 }),
  checkShoppingItems: body => doRequest('/shopping-list/items:batch-check', 'POST', body, { silent: true, maxRetries: 0 }),
  patchShoppingItemConfirmed: (id, body) => doRequest(`/shopping-list/items/${encodeURIComponent(id)}/confirmed`, 'PATCH', body, { silent: true, maxRetries: 0 }),
  deleteShoppingItemConfirmed: (id, body) => doRequest(`/shopping-list/items/${encodeURIComponent(id)}:delete`, 'POST', body, { silent: true, maxRetries: 0 }),
  // 通用方法
  request,
  requestSilent,

  // 菜品接口
  getDishes,
  getDishesLite,
  getDishesLiteByType,
  searchDishes,
  createCustomDish,
  updateCustomDish,
  deleteCustomDish,
  getCustomDishes,
  getDishById,
  createShoppingPreview,
  getShoppingList,
  batchAddShoppingItems,
  patchShoppingItem,
  deleteShoppingItem,
  clearShoppingList,

  // 管理后台接口
  getAdminUsers,
  getAdminUser,
  createAdminUserDish,
  deleteAdminUserDish,
  getAdminOverview,
  updateAdminUserStatus,
  getAdminDishes,
  getAdminDish,
  updateAdminDish,
  updateAdminDishStatus,
  updateAdminUserDish,
  getAdminAuditLogs,

  // 用户接口
  login,
  phoneLogin,
  getUserInfo,
  updateUserInfo,
  getUserPreferences,
  updateUserPreferences,

  // 收藏菜品接口
  addFavoriteDish,
  removeFavoriteDish,
  checkFavoriteDish,
  batchCheckFavoriteDishes,
  getFavoriteDishes,

  // AI聊天
  sendChat,
  createAssistantSession,
  getAssistantSession,
  sendAssistantMessage,
  getAssistantTask,
  getAssistantTaskEvents,
  cancelAssistantTask,
  deleteAssistantSession,
  previewAssistantAction,
  confirmAssistantAction,
  undoAssistantPlan,
  getAssistantTools,

  // 推荐接口
  getRecommendations,
  getRecommendationOptions,
  getSingleRecommendation,

  // 菜谱记录接口
  saveRecipeRecord,
  getRecipeRecordsByDate,
  getRecipeRecordDates,
  updateRecipeRecord,
  deleteRecipeRecord,
  deleteRecipeRecordByDateAndMeal,
  getStatistics
}

