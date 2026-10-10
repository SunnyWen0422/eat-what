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

function environmentIdentity() {
  return encodeURIComponent(require('./config').getApiBaseUrl())
}

/**
 * 获取当前登录用户的唯一标识，用于本地缓存分用户隔离
 * 优先使用 userInfo.id，其次 openId，无有效身份时返回 guest 兜底
 */
function getCurrentUserIdentity() {
  const userInfo = wx.getStorageSync('userInfo') || {}
  if (userInfo.id) return `api_v2_${environmentIdentity()}:id_${userInfo.id}`
  if (userInfo.openId) return `api_v2_${environmentIdentity()}:open_${userInfo.openId}`

  // 未登录时返回 guest，避免本地功能完全不可用
  console.log('⚠️ 用户未登录，使用 guest 身份')
  return 'guest'
}

/**
 * 生成带用户前缀的本地缓存 key
 * 账户相同但 API 环境不同的缓存、待确认请求和工作区必须隔离。
 */
function getUserStorageKey(baseKey) {
  const identity = getCurrentUserIdentity()
  return `user:${identity === 'guest' ? 'api_v2_' + environmentIdentity() + ':guest' : identity}:${baseKey}`
}

/** Copy old keys only into their recorded API environment; retain originals and newer values. */
function preserveLegacyUserStorage(environment, runtime = wx) {
  if (typeof environment !== 'string' || !/^https?:\/\//.test(environment)) return 0
  const bindingKey = 'legacyUserStorageEnvironmentV1'
  let sourceEnvironment = runtime.getStorageSync(bindingKey)
  if (!sourceEnvironment) {
    // Retained unscoped keys can include former local operations. Never activate them
    // automatically in an online account when their original environment is uncertain.
    if (!/^http:\/\/127\.0\.0\.1:[0-9]+\/api$/.test(environment)) return 0
    sourceEnvironment = environment
    runtime.setStorageSync(bindingKey, sourceEnvironment)
  }
  if (typeof sourceEnvironment !== 'string' || !/^http:\/\/127\.0\.0\.1:[0-9]+\/api$/.test(sourceEnvironment)) return 0
  const keys = runtime.getStorageInfoSync().keys || []
  const existing = new Set(keys)
  let copied = 0
  for (const key of keys) {
    const match = /^user:(id_[^:]+|open_[^:]+|guest):(.*)$/.exec(key)
    if (!match) continue
    const destination = `user:api_v2_${encodeURIComponent(sourceEnvironment)}:${match[1]}:${match[2]}`
    if (existing.has(destination)) continue
    runtime.setStorageSync(destination, runtime.getStorageSync(key))
    existing.add(destination); copied += 1
  }
  return copied
}

module.exports = {
  formatTime,
  getCurrentUserIdentity,
  getUserStorageKey,
  preserveLegacyUserStorage
}

