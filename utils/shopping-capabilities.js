const api = require('./api')
const { getUserStorageKey } = require('./util')
const { getApiBaseUrl } = require('./config')
const RETRY_MS = 5 * 60 * 1000
const pending = new Map()
const key = () => getUserStorageKey('shoppingCapabilitiesV2:' + getApiBaseUrl())
const disabled = () => ({ pricesEnabled: false, expensesEnabled: false, platforms: [
  { name: '叮咚买菜', enabled: false }, { name: '盒马', enabled: false }
] })
function read() { return wx.getStorageSync(key()) || {} }
function config() {
  const entry = read(), value = entry.config || disabled()
  return { ...value, pricesEnabled: value.pricesEnabled === true && !(entry.quoteRetryAt > Date.now()) }
}
function notice() {
  const entry = read()
  if (entry.unavailable) return '价格与花费服务尚未开放，购物清单可继续使用'
  if (entry.quoteRetryAt > Date.now()) return '参考价服务尚未开放，实际花费可正常记录'
  return entry.error ? '暂时无法检查价格服务，已保留本机记录' : ''
}
async function refresh() {
  const scope = key(), token = wx.getStorageSync('token'), previous = read()
  if (!token || previous.retryAt > Date.now()) return config()
  const requestKey = scope + ':' + token
  if (pending.has(requestKey)) return pending.get(requestKey)
  const task = (async () => {
    let entry
    try {
      const result = await api.getShoppingPurchaseOptions()
      entry = { ...previous, retryAt: Date.now() + RETRY_MS, unavailable: false, error: false, config: {
        pricesEnabled: result.pricesEnabled === true, expensesEnabled: result.expensesEnabled === true,
        platforms: Array.isArray(result.platforms) ? result.platforms : disabled().platforms
      } }
    } catch (error) {
      const unavailable = error && error.statusCode === 404
      entry = { ...previous, retryAt: Date.now() + (unavailable ? RETRY_MS : 30000),
        unavailable, error: !unavailable, config: unavailable ? disabled() : previous.config || disabled() }
    }
    // Never publish a response into a different account/environment's cache.
    if (scope === key() && token === wx.getStorageSync('token')) wx.setStorageSync(scope, entry)
    return config()
  })()
  pending.set(requestKey, task)
  try { return await task } finally { pending.delete(requestKey) }
}
function markQuotesUnavailable() {
  wx.setStorageSync(key(), { ...read(), quoteRetryAt: Date.now() + RETRY_MS })
}
module.exports = { config, notice, refresh, markQuotesUnavailable }
