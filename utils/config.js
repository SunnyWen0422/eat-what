// utils/config.js - 全局配置文件

// ========================================
// API配置
// ========================================

// 是否使用后端API（true=使用API，false=使用本地数据）
const USE_BACKEND_API = true  // 默认false，开发完成后改为true

// API 地址只有一个权威来源。需要切换部署环境时只修改此处。
const API_BASE_URL = 'https://chishenme.icu/api'

// ========================================
// 功能开关
// ========================================

// 是否启用用户登录
const ENABLE_LOGIN = true

// 是否启用触觉反馈
const ENABLE_VIBRATE = true

// 是否启用日志输出
const ENABLE_LOG = true

// ========================================
// 业务配置
// ========================================

// 最近菜品窗口大小（避免重复推荐）
const RECENT_DISH_WINDOW = 12

// 默认推荐方案数量
const RECOMMEND_PLAN_COUNT = 3

// 人数范围
const PEOPLE_RANGE = {
  min: 1,
  max: 10,
  default: 2
}

// 菜品数量范围
const DISH_COUNT_RANGE = {
  meat: { min: 0, max: 5, default: 2 },
  veg: { min: 0, max: 5, default: 2 },
  soup: { min: 0, max: 3, default: 1 },
  dessert: { min: 0, max: 3, default: 0 },
  staple: { min: 0, max: 3, default: 1 }
}

// ========================================
// 工具方法
// ========================================

/**
 * 获取当前环境的API地址
 */
function getApiBaseUrl() {
  return API_BASE_URL
}

/**
 * 日志输出
 */
function log(...args) {
  if (ENABLE_LOG) {
    console.log('[吃什么]', ...args)
  }
}

/**
 * 触觉反馈
 */
function vibrate(type = 'light') {
  if (ENABLE_VIBRATE) {
    wx.vibrateShort({ type })
  }
}

// ========================================
// 导出配置
// ========================================

module.exports = {
  // API配置
  USE_BACKEND_API,
  API_BASE_URL,
  getApiBaseUrl,
  
  // 功能开关
  ENABLE_LOGIN,
  ENABLE_VIBRATE,
  ENABLE_LOG,
  
  // 业务配置
  RECENT_DISH_WINDOW,
  RECOMMEND_PLAN_COUNT,
  PEOPLE_RANGE,
  DISH_COUNT_RANGE,
  
  // 工具方法
  log,
  vibrate
}

