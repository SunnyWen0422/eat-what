// Unknown write outcomes retain the exact, account-scoped request for safe retry.
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
function createWriteJournal(options = {}) {
  const identity = options.identity || require('./account-identity').currentIdentity
  const key = options.key || require('./util').getUserStorageKey
  const read = options.read || (name => wx.getStorageSync(name))
  const keys = options.keys || (() => wx.getStorageInfoSync().keys || [])
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
  // Enumerate only the current account + API environment; never replay on discovery.
  function pendingCopies() {
    const prefix = storageKey('dish:copy:')
    return keys().filter(name => typeof name === 'string' && name.startsWith(prefix)).flatMap(name => {
      const suffix = name.slice(prefix.length), id = Number(suffix)
      if (!/^[1-9]\d*$/.test(suffix) || !Number.isSafeInteger(id)) return []
      const request = read(name)
      if (!request || typeof request.requestId !== 'string' || !request.requestId.trim() || typeof request.expectedVersion !== 'string' || !request.expectedVersion) return []
      return [{ id, name: typeof request.name === 'string' && request.name.trim() ? request.name.trim().slice(0, 255) : '菜谱副本' }]
    }).sort((a, b) => a.id - b.id)
  }
  function pendingDeletes(kind) {
    if (!['dish', 'menu'].includes(kind)) return []
    const prefix = storageKey(kind + ':delete:')
    return keys().filter(name => typeof name === 'string' && name.startsWith(prefix)).flatMap(name => {
      const suffix = name.slice(prefix.length), id = Number(suffix), request = read(name)
      if (!/^[1-9]\d*$/.test(suffix) || !Number.isSafeInteger(id) || !request || !request.requestId || !request.expectedVersion) return []
      return [{ id, request: JSON.stringify(request), name: (kind === 'dish' ? '菜谱' : '菜单') + '（编号 ' + id + '）' }]
    }).sort((a, b) => a.id - b.id)
  }
  function run(action, body, send) {
    const scope = identity(), name = storageKey(action)
    const current = () => scope === identity() && name === storageKey(action)
    if (inFlight.has(name)) return inFlight.get(name)
    const request = pending(action) || { ...clone(body), requestId: requestId() }
    write(name, request)
    const promise = (async () => {
      try {
        const result = await send(clone(request))
        if (!current()) throw new Error('账号或服务已切换，请重新进入')
        remove(name); return result
      } catch (error) {
        if (current() && error.statusCode >= 400 && error.statusCode < 500 && ![401,403,408,429].includes(error.statusCode)) remove(name)
        throw error
      }
    })()
    inFlight.set(name, promise)
    promise.then(() => inFlight.delete(name), () => inFlight.delete(name))
    return promise
  }
  return { pending, pendingCopies, pendingDeletes, run }
}
function menuHandoff(menu) {
  if (!menu || !Number.isInteger(menu.menuId) || !Number.isInteger(menu.menuVersion) || menu.menuVersion < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(menu.menuDate) || !['breakfast','lunch','dinner'].includes(menu.menuMealType) || !Number.isInteger(menu.people) || menu.people < 1 || menu.people > 50 || !Array.isArray(menu.dishIds) || !menu.dishIds.length || menu.dishIds.length > 10 || menu.dishIds.some(id => !Number.isInteger(id) || id < 1)) throw new Error('菜单目标或版本无效，请重新读取')
  require('./meal-save-target').validateMealTarget({ date: menu.menuDate, mealType: menu.menuMealType })
  if (new Set(menu.dishIds).size !== menu.dishIds.length) throw new Error('菜单菜品重复，请重新读取')
  return { date: menu.menuDate, mealType: menu.menuMealType, menuId: menu.menuId, menuVersion: menu.menuVersion, menuDate: menu.menuDate, menuMealType: menu.menuMealType, people: menu.people, dishIds: [...menu.dishIds] }
}
function legacyIngredientLine(value) {
  if (typeof value !== 'string') return value
  const p = value.split('|').map(x => x.trim())
  // Require the established numeric quantity + unit columns, not arbitrary prose.
  if (p.length < 3 || p.length > 7 || !p[0] || !/^\d+(?:\.\d+)?$/.test(p[1]) || !/^(克|千克|公斤|斤|两|毫升|升|个|只|条|片|块|根|颗|勺|汤匙|茶匙|杯|碗|袋|盒|把|适量)$/.test(p[2])) return value
  return p[0] + ' ' + p[1] + p[2] + (p[4] ? '（' + p[4] + '）' : '')
}
function readableRecipeLine(item) {
  if (typeof item === 'string') return legacyIngredientLine(item)
  if (!item || typeof item !== 'object') return item == null ? '' : String(item)
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
  // Render recipe content, never internal JSON, media URLs or evidence fields.
  const step = text(item.text) || text(item.instruction) || text(item.description) || text(item.step)
  if (step) return step
  const name = text(item.name) || text(item.ingredientName) || text(item.ingredient)
  if (!name) return '请补充这一项'
  const amount = text(item.quantityText) || text(item.quantity) || text(item.amount) || text(item.rawQuantity)
  const unit = amount && !text(item.quantityText) ? text(item.unit) || text(item.rawUnit) : ''
  const note = text(item.note) || text(item.preparation)
  return name + (amount ? ' ' + amount + unit : '') + (note ? '（' + note + '）' : '')
}
function editableRecipeText(value) {
  let source = value
  if (typeof source === 'string') { try { source = JSON.parse(source) } catch (_) {} }
  if (Array.isArray(source)) return source.map(readableRecipeLine).join('\n')
  return String(value || '').split(/###|#|\n/).map(legacyIngredientLine).join('\n')
}
// Untouched content retains all original evidence columns and separator spelling.
function recipeFieldPayload(original, text) {
  const input = String(text || '').trim()
  if (input === editableRecipeText(original).trim()) {
    if (Array.isArray(original)) return JSON.stringify(original)
    if (typeof original === 'string') return original
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
function recipeCopyBody(dish, form, type) {
  return { ...recipeEditBody(dish, form, type), editCopy: true }
}
function recipeValidation(form, original) {
  for (const [field, label] of [['name','菜品名称'],['ingredients','食材用料'],['steps','烹饪步骤']]) if (!String(form[field] || '').trim()) return { field, message: '请输入' + label }
  const minutes = String(form.cookMinutes || '').trim()
  if (minutes && (!Number.isInteger(Number(minutes)) || Number(minutes) < 1 || Number(minutes) > 240)) return { field: 'cookMinutes', message: '烹饪时间应为 1 至 240 分钟' }
  if (form.image && (!original || String(form.image) !== String(original.image || '')) && !/^https:\/\/[^\s]+$/i.test(String(form.image).trim())) return { field: 'image', message: '图片请填写 HTTPS 地址，也可以留空' }
  return null
}
module.exports = { createWriteJournal, menuHandoff, readableRecipeLine,editableRecipeText, recipeFieldPayload, recipeForm, recipeEditBody, recipeCopyBody, recipeValidation }
