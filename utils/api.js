// utils/api.js - 后端API接口配置

// ========================================
// 配置项
// ========================================

// API基础地址
// 开发环境：本地服务器
// 生产环境：需要改为实际的HTTPS域名
const API_BASE_URL = 'http://localhost:8080/api'

// 如果部署到服务器，修改为：
// const API_BASE_URL = 'https://your-domain.com/api'

// ========================================
// 通用请求方法
// ========================================

/**
 * 通用请求方法
 * @param {String} url - 接口路径
 * @param {String} method - 请求方法 GET/POST/PUT/DELETE
 * @param {Object} data - 请求数据
 */
function request(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${url}`,
      method: method,
      data: data,
      header: {
        'Content-Type': 'application/json'
      },
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.data)
        } else {
          console.error('请求失败:', res)
          reject(res)
        }
      },
      fail: (err) => {
        console.error('网络错误:', err)
        wx.showToast({
          title: '网络请求失败',
          icon: 'none'
        })
        reject(err)
      }
    })
  })
}

// ========================================
// 菜品相关接口
// ========================================

/**
 * 获取所有菜品
 * @param {Object} params - 查询参数 {type, keyword, userId}
 */
function getDishes(params = {}) {
  let queryString = ''
  if (params.type) queryString += `type=${params.type}&`
  if (params.keyword) queryString += `keyword=${encodeURIComponent(params.keyword)}&`
  if (params.userId) queryString += `userId=${params.userId}&`
  
  return request(`/dishes?${queryString}`, 'GET')
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
// 用户相关接口（待实现）
// ========================================

/**
 * 用户登录
 * @param {Object} userData - 用户信息
 */
function login(userData) {
  return request('/user/login', 'POST', userData)
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

// ========================================
// 导出接口
// ========================================

module.exports = {
  // 配置
  API_BASE_URL,
  
  // 通用方法
  request,
  
  // 菜品接口
  getDishes,
  searchDishes,
  createCustomDish,
  getDishById,
  
  // 用户接口
  login,
  
  // 菜谱接口
  saveRecipe,
  getMyRecipes,
  deleteRecipe,
  
  // 推荐接口
  getRecommendations
}

