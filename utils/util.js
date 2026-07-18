const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

/**
 * 获取当前登录用户的唯一标识，用于本地缓存分用户隔离
 * 优先使用 userInfo.id，其次 openId，无有效身份时返回 guest 兜底
 */
function getCurrentUserIdentity() {
  const userInfo = wx.getStorageSync('userInfo') || {}
  if (userInfo.id) return `id_${userInfo.id}`
  if (userInfo.openId) return `open_${userInfo.openId}`

  // 未登录时返回 guest，避免本地功能完全不可用
  console.log('⚠️ 用户未登录，使用 guest 身份')
  return 'guest'
}

/**
 * 生成带用户前缀的本地缓存 key
 * 例如 baseKey='recipeRecords' → 'user:id_123:recipeRecords'
 */
function getUserStorageKey(baseKey) {
  const identity = getCurrentUserIdentity()
  return `user:${identity}:${baseKey}`
}

module.exports = {
  formatTime,
  getCurrentUserIdentity,
  getUserStorageKey
}

