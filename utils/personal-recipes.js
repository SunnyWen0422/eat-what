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
  const canonicalAction = action => action === 'menu:new' ? 'menu:create' : /^menu:\d+$/.test(action) ? 'menu:edit:' + action.slice(5) : action
  const storageKey = action => key('personalRecipeWrite:' + canonicalAction(action))
  function pending(action) {
    const canonical = canonicalAction(action), name = storageKey(canonical)
    const legacy = canonical === 'menu:create' ? 'menu:new' : canonical.startsWith('menu:edit:') ? 'menu:' + canonical.slice(10) : null
    if (!read(name) && legacy) {
      const oldName = key('personalRecipeWrite:' + legacy), original = read(oldName)
      if (original) { write(name, clone(original)); remove(oldName) }
    }
    return clone(read(name) || null)
  }
  function run(action, body, send) {
    const scope = identity(), name = storageKey(action)
    if (inFlight.has(name)) return inFlight.get(name)
    const request = pending(action) || { ...clone(body), requestId: requestId() }
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
  require('./meal-save-target').validateMealTarget({ date: menu.menuDate, mealType: menu.menuMealType })
  if (new Set(menu.dishIds).size !== menu.dishIds.length) throw new Error('菜单菜品重复，请重新读取')
  return { date: menu.menuDate, mealType: menu.menuMealType, menuId: menu.menuId, menuVersion: menu.menuVersion, menuDate: menu.menuDate, menuMealType: menu.menuMealType, people: menu.people, dishIds: [...menu.dishIds] }
}
function editableRecipeText(value) {
  let source = value
  if (typeof source === 'string') { try { source = JSON.parse(source) } catch (_) {} }
  if (Array.isArray(source)) return source.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n')
  return String(value || '').replace(/###|#/g, '\n')
}
// Only untouched JSON structures bypass the legacy plain-text separator representation.
function recipeFieldPayload(original, text) {
  const input = String(text || '').trim()
  if (input === editableRecipeText(original).trim()) {
    if (Array.isArray(original)) return JSON.stringify(original)
    try { if (Array.isArray(JSON.parse(original))) return original } catch (_) {}
  }
  return input.replace(/\n/g, '#')
}
function recipeForm(dish = {}) {
  return { name: dish.name || '', ingredients: editableRecipeText(dish.ingredientsAmounts || dish.cl), steps: editableRecipeText(dish.steps || dish.step),
    cookMinutes: dish.cookMinutes == null ? '' : String(dish.cookMinutes), servingDescription: dish.fl || '', image: dish.image || '' }
}
function recipeEditBody(dish, form, type) {
  const body = { expectedVersion: dish.contentVersion, name: form.name.trim(), type,
    cl: recipeFieldPayload(dish.ingredientsAmounts || dish.cl, form.ingredients), step: recipeFieldPayload(dish.steps || dish.step, form.steps),
    cookMinutes: String(form.cookMinutes || '').trim() === '' ? null : Number(form.cookMinutes) }
  if (String(form.servingDescription || '') !== String(dish.fl || '')) Object.assign(body, { editServingDescription: true, fl: String(form.servingDescription || '').trim() || null })
  if (String(form.image || '') !== String(dish.image || '')) Object.assign(body, { editImage: true, image: String(form.image || '').trim() || null })
  return body
}
function recipeValidation(form, original) {
  for (const [field, label] of [['name','菜品名称'],['ingredients','食材用料'],['steps','烹饪步骤']]) if (!String(form[field] || '').trim()) return { field, message: '请输入' + label }
  const minutes = String(form.cookMinutes || '').trim()
  if (minutes && (!Number.isInteger(Number(minutes)) || Number(minutes) < 1 || Number(minutes) > 240)) return { field: 'cookMinutes', message: '烹饪时间应为 1 至 240 分钟' }
  if (form.image && (!original || String(form.image) !== String(original.image || '')) && !/^https:\/\/[^\s]+$/i.test(String(form.image).trim())) return { field: 'image', message: '图片请填写 HTTPS 地址，也可以留空' }
  return null
}
module.exports = { createWriteJournal, menuHandoff, editableRecipeText, recipeFieldPayload, recipeForm, recipeEditBody, recipeValidation }
