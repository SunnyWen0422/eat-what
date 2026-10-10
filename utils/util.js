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

/** Bind legacy keys once, before copying. Retain originals and newer values. */
function preserveLegacyUserStorage(environment, runtime = wx) {
  const markerKey = 'legacyUserStorageMigrationV1'
  const legacyKey = /^user:(id_[^:]+|open_[^:]+|guest):(.*)$/
  const validEnvironment = value => typeof value === 'string' && /^http:\/\/127\.0\.0\.1:[0-9]+\/api$/.test(value)
  const bindingKey = 'legacyUserStorageEnvironmentV1'
  const keys = runtime.getStorageInfoSync().keys || []
  const existing = new Set(keys)
  let migration
  if (existing.has(markerKey)) {
    migration = runtime.getStorageSync(markerKey)
    if (!migration || migration.version !== 1 || typeof migration.completed !== 'boolean' ||
        !(migration.environment === null || validEnvironment(migration.environment)) ||
        !Array.isArray(migration.keys) || migration.keys.some(key => typeof key !== 'string' || !legacyKey.test(key)) ||
        !Number.isInteger(migration.nextIndex) || migration.nextIndex < 0 || migration.nextIndex > migration.keys.length) {
      throw new Error('Legacy storage migration state cannot be verified')
    }
  } else {
    // Earlier releases copied legacy keys but did not record their provenance.
    // Any scoped storage without our marker makes the old keys' origin uncertain.
    const previouslyScoped = keys.some(key => key.startsWith('user:api_'))
    const bindingExists = existing.has(bindingKey)
    const binding = bindingExists ? runtime.getStorageSync(bindingKey) : null
    const originalKeys = keys.filter(key => legacyKey.test(key))
    // An older binding proves origin, not which requests were already consumed.
    // Do not replay its retained originals when upgrading without a journal.
    migration = { version: 1, environment: bindingExists ? (validEnvironment(binding) ? binding : null) :
      (!previouslyScoped && validEnvironment(environment) ? environment : null),
      keys: originalKeys, nextIndex: bindingExists ? originalKeys.length : 0, completed: false }
    // A failed write must stop before any copies or environment switch. An unknown
    // origin stays unknown even after apiEnvironment is set by a later launch.
    runtime.setStorageSync(markerKey, migration)
  }
  if (migration.environment !== null) {
    if (existing.has(bindingKey)) {
      if (runtime.getStorageSync(bindingKey) !== migration.environment) throw new Error('Legacy storage origin differs')
    } else runtime.setStorageSync(bindingKey, migration.environment)
  }
  if (migration.completed) return 0
  let copied = 0
  for (let index = migration.nextIndex; migration.environment !== null && index < migration.keys.length; index++) {
    const key = migration.keys[index]
    // Claim before copying: pages may consume a copied request even if launch
    // later fails. Never replay claimed keys, including uncertain copy outcomes.
    // Their originals remain available for explicit recovery instead.
    const claimed = { ...migration, nextIndex: index + 1 }
    runtime.setStorageSync(markerKey, claimed)
    migration = claimed
    if (!existing.has(key)) continue
    const match = legacyKey.exec(key)
    const destination = `user:api_v2_${encodeURIComponent(migration.environment)}:${match[1]}:${match[2]}`
    if (existing.has(destination)) continue
    runtime.setStorageSync(destination, runtime.getStorageSync(key))
    existing.add(destination); copied += 1
  }
  // Write a new object so a failed storage write cannot mutate the persisted state.
  runtime.setStorageSync(markerKey, { ...migration, completed: true })
  return copied
}

module.exports = {
  formatTime,
  getCurrentUserIdentity,
  getUserStorageKey,
  preserveLegacyUserStorage
}


