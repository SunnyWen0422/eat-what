// utils/api.js - 后端API接口配置

// ========================================
// 配置项
// ========================================

// API基础地址
// 开发环境：本地服务器
// 生产环境：需要改为实际的HTTPS域名
const API_BASE_URL = 'https://chishenme.icu/api'

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

/**
 * 执行单次 HTTP 请求（不包含重试逻辑）
 * @returns {Promise<{ statusCode, data }>}
 */
function executeHttpRequest(url, method, data) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token') || ''
    const header = {
      'Content-Type': 'application/json'
    }
    if (token) {
      header['Authorization'] = `Bearer ${token}`
    }

    // ETag 条件请求：如果缓存中有该 URL 的 ETag，携带 If-None-Match
    const fullUrl = `${API_BASE_URL}${url}`
    const cached = etagCache[fullUrl]
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
          etagCache[fullUrl] = { etag, data: res.data }
        }

        resolve({ statusCode: res.statusCode, data: res.data })
      },
      fail: (err) => {
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

  async function attempt(attemptIndex) {
    try {
      const { statusCode, data: resData } = await executeHttpRequest(url, method, data)

      // 成功
      if (statusCode === 200) {
        return resData
      }

      // 401：token 失效，自动重登（仅一次）
      if (statusCode === 401 && !isAuthRetry) {
        console.log('🔄 Token 失效，尝试自动重新登录...')
        try {
          await autoReLogin()
          // 重新登录后用新 token 重试（仅一次，防止死循环）
          return await doRequest(url, method, data, {
            silent,
            maxRetries: 0,       // 401 重试不再走网络重试
            isAuthRetry: true
          })
        } catch (authErr) {
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

  return attempt(0)
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

/**
 * 自动重新登录：调用 wx.login 和后端登录接口，刷新 token 和用户信息
 */
function autoReLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: async (res) => {
        if (!res.code) {
          console.error('wx.login 获取 code 失败:', res.errMsg)
          return reject(new Error(res.errMsg || '获取登录凭证失败'))
        }

        try {
          const result = await login({ code: res.code })
          if (result && result.success) {
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
  let queryString = ''
  if (params.type) queryString += `type=${params.type}&`
  if (params.keyword) queryString += `keyword=${encodeURIComponent(params.keyword)}&`
  if (params.page) queryString += `page=${params.page}&`
  if (params.pageSize) queryString += `pageSize=${params.pageSize}&`

  return request(`/dishes?${queryString}`, 'GET')
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

// ========================================
// 菜谱相关接口（待实现）
// ========================================

/**
 * 保存菜谱
 * @param {Object} recipe - 菜谱对象
 */
function saveRecipe(recipe) {
  return request('/recipes', 'POST', recipe)
}

/**
 * 获取我的菜谱
 */
function getMyRecipes() {
  return request('/recipes', 'GET')
}

/**
 * 删除菜谱
 * @param {Number} id - 菜谱ID
 */
function deleteRecipe(id) {
  return request(`/recipes/${id}`, 'DELETE')
}

// ========================================
// 推荐相关接口（待实现）
// ========================================

/**
 * 生成推荐
 * @param {Object} params - 推荐参数
 */
function getRecommendations(params) {
  return request('/recommend', 'POST', params)
}

/**
 * 获取单道推荐菜品（从整体数据中随机抽取）
 * @param {String} type - 菜品类型 meat/veg/soup
 * @param {Array} excludeIds - 需要排除的菜品ID数组
 */
function getSingleRecommendation(type, excludeIds = []) {
  const excludeParam = excludeIds.length > 0 ? `&exclude=${excludeIds.join(',')}` : ''
  return request(`/recommend/single?type=${type}${excludeParam}`, 'GET')
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
// 收藏相关接口
// ========================================

/**
 * 添加收藏
 * @param {Number} dishId - 菜品ID
 */
function addFavorite(dishId) {
  return request('/favorites', 'POST', { dishId })
}

/**
 * 取消收藏
 * @param {Number} dishId - 菜品ID
 */
function cancelFavorite(dishId) {
  return request(`/favorites/${dishId}`, 'DELETE')
}

/**
 * 获取收藏列表
 */
function getFavorites() {
  return request('/favorites', 'GET')
}

/**
 * 检查是否已收藏
 * @param {Number} dishId - 菜品ID
 */
function checkFavorite(dishId) {
  return request(`/favorites/check/${dishId}`, 'GET')
}

/**
 * 获取收藏数量
 */
function getFavoriteCount() {
  return request('/favorites/count', 'GET')
}

// ========================================
// 收藏菜品接口（新功能）
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
// 购物清单相关接口（占位实现）
// 注意：如果后端尚未提供对应 API，这些函数调用会返回失败信息，
// 但至少保证 utils/api.js 能正常加载，避免 app 启动时报 ReferenceError。
// ========================================

/**
 * 生成购物清单
 * @param {Object} params - 生成参数
 */
function generateShoppingList(params = {}) {
  return request('/shopping-list/generate', 'POST', params)
}

/**
 * 获取购物清单
 */
function getShoppingList() {
  return request('/shopping-list', 'GET')
}

/**
 * 更新购物清单（例如勾选/数量修改）
 * @param {Object} payload
 */
function updateShoppingList(payload) {
  return request('/shopping-list', 'PUT', payload)
}

// ========================================
// 导出接口
// ========================================

module.exports = {
  // 配置
  API_BASE_URL,

  // 通用方法
  request,
  requestSilent,

  // 菜品接口
  getDishes,
  getDishesLite,
  getDishesLiteByType,
  searchDishes,
  createCustomDish,
  getDishById,

  // 用户接口
  login,
  getUserInfo,
  updateUserInfo,

  // 收藏接口（旧 - 待移除）
  addFavorite,
  cancelFavorite,
  getFavorites,
  checkFavorite,
  getFavoriteCount,

  // 收藏菜品接口（新）
  addFavoriteDish,
  removeFavoriteDish,
  checkFavoriteDish,
  batchCheckFavoriteDishes,
  getFavoriteDishes,

  // 购物清单接口
  generateShoppingList,
  getShoppingList,
  updateShoppingList,

  // 菜谱接口
  saveRecipe,
  getMyRecipes,
  deleteRecipe,

  // 推荐接口
  getRecommendations,
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

