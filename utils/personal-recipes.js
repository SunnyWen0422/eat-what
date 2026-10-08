// Unknown write outcomes retain the exact, account-scoped request for safe retry.
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
function createWriteJournal(options = {}) {
  const identity = options.identity || require('./account-identity').currentIdentity
  const key = options.key || require('./util').getUserStorageKey
  const read = options.read || (name => wx.getStorageSync(name))
  const write = options.write || ((name, value) => wx.setStorageSync(name, value))
  const remove = options.remove || (name => wx.removeStorageSync(name))
  const requestId = options.requestId || require('./meal-workspace').requestId
  const inFlight = new Map()
  const storageKey = action => key('personalRecipeWrite:' + action)
  function pending(action) { return clone(read(storageKey(action)) || null) }
  function run(action, body, send) {
    const scope = identity(), name = storageKey(action)
    if (inFlight.has(name)) return inFlight.get(name)
    const request = read(name) || { ...clone(body), requestId: requestId() }
    write(name, request)
    const promise = (async () => {
      try {
        const result = await send(clone(request))
        if (scope !== identity()) throw new Error('账号已切换，请重新进入')
        remove(name); return result
      } catch (error) {
        if (scope === identity() && error.statusCode >= 400 && error.statusCode < 500 && ![401,403,408,429].includes(error.statusCode)) remove(name)
        throw error
      }
    })()
    inFlight.set(name, promise)
    promise.then(() => inFlight.delete(name), () => inFlight.delete(name))
    return promise
  }
  return { pending, run }
}
function menuHandoff(menu) {
  if (!menu || !Number.isInteger(menu.menuId) || !Number.isInteger(menu.menuVersion) || menu.menuVersion < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(menu.menuDate) || !['breakfast','lunch','dinner'].includes(menu.menuMealType) || !Number.isInteger(menu.people) || menu.people < 1 || menu.people > 50 || !Array.isArray(menu.dishIds) || !menu.dishIds.length || menu.dishIds.length > 10 || menu.dishIds.some(id => !Number.isInteger(id) || id < 1)) throw new Error('菜单目标或版本无效，请重新读取')
  return { date: menu.menuDate, mealType: menu.menuMealType, menuId: menu.menuId, menuVersion: menu.menuVersion, menuDate: menu.menuDate, menuMealType: menu.menuMealType, people: menu.people, dishIds: [...menu.dishIds] }
}
function editableRecipeText(value) {
  let source = value
  if (typeof source === 'string') { try { source = JSON.parse(source) } catch (_) {} }
  if (Array.isArray(source)) return source.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n')
  return String(value || '').replace(/###|#/g, '\n')
}
module.exports = { createWriteJournal, menuHandoff, editableRecipeText }
