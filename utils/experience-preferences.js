const { getUserStorageKey } = require('./util')

const MEALS = ['breakfast', 'lunch', 'dinner']
const TYPES = ['meat', 'veg', 'soup', 'staple', 'dessert', 'side']
const clone = value => JSON.parse(JSON.stringify(value))

function validComposition(composition) {
  if (!composition || !['auto', 'manual'].includes(composition.mode) || !composition.counts || Array.isArray(composition.counts)) return false
  const entries = Object.entries(composition.counts)
  if (!entries.length || entries.some(([type, count]) => !TYPES.includes(type) || !Number.isInteger(count) || count < 0 || count > 10)) return false
  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  return total >= 1 && total <= 10
}

/** Local presentation preferences. Resolve the account key on every synchronous operation.
 * Inject read/write/key for isolated tests; key callbacks must resolve the current account.
 * No workspace, plan, shopping or long-term recommendation data is written here.
 */
module.exports = function experiencePreferences({
  read = key => typeof wx !== 'undefined' && wx.getStorageSync ? wx.getStorageSync(key) : null,
  write = (key, value) => wx.setStorageSync(key, value),
  key = () => typeof wx !== 'undefined' && wx.getStorageSync ? getUserStorageKey('experiencePreferences') : 'user:guest:experiencePreferences',
} = {}) {
  const storageKey = () => typeof key === 'function' ? key() : getUserStorageKey(key)
  let failedRead = false
  function get() {
    let saved
    try { saved = read(storageKey()) || {}; failedRead = false }
    catch (error) {
      failedRead = true
      // Optional presentation settings must never prevent a sheet or core page
      // from opening. Prefer less motion until this account can be read again.
      return { reducedMotion: true, compositionByMeal: {} }
    }
    const compositionByMeal = {}
    for (const meal of MEALS) {
      const value = saved.compositionByMeal && saved.compositionByMeal[meal]
      if (validComposition(value)) compositionByMeal[meal] = clone(value)
    }
    return { reducedMotion: saved.reducedMotion === true, compositionByMeal }
  }
  function setReducedMotion(value) {
    if (typeof value !== 'boolean') throw new Error('动态效果设置需要布尔值')
    const next = { ...get(), reducedMotion: value }
    if (failedRead) throw new Error('本机体验设置暂未读到，请重试')
    write(storageKey(), clone(next))
    return next
  }
  function rememberComposition(mealType, composition) {
    if (!MEALS.includes(mealType)) throw new Error('请选择有效餐次')
    if (!validComposition(composition)) throw new Error('搭配数量应为整数，合计 1 至 10 道')
    const next = get()
    if (failedRead) throw new Error('本机体验设置暂未读到，请重试')
    next.compositionByMeal[mealType] = clone(composition)
    write(storageKey(), clone(next))
    return next
  }
  return { get, setReducedMotion, rememberComposition, readFailed: () => failedRead }
}
