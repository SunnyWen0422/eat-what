const { deriveSelectedMeal, appendSelectedDish, selectionComposition, targetLabel } = require('./selected-meal')
const { validateMealTarget } = require('./meal-save-target')
const { interactionCommand, deriveActionFeedback } = require('./meal-action-feedback')
function buildDishSelection(id, response, target) {
  const w = response && response.workspace
  return { ...validateMealTarget(target), dishIds: appendSelectedDish(response, id), expectedWorkspaceId: w ? w.id : null, expectedWorkspaceRevision: w ? w.revision : null }
}
function resolveRecipeTarget(wx, storageKey, explicit) {
  const rules = require('./meal-workspace')
  return validateMealTarget(explicit || wx.getStorageSync(storageKey('pendingRecipeRecord')) || wx.getStorageSync(storageKey('activeMealTarget')) || rules.defaultTarget())
}
/** Uses the existing account-scoped workspace cache and command journal only. */
function createRecipeSelection({ api, wx, storageKey, current, target, identity }) {
  const rules = require('./meal-workspace'), util = require('./util')
  const destination = resolveRecipeTarget(wx, storageKey, target)
  const store = rules.createWorkspaceStore({ api, identity: identity || util.getCurrentUserIdentity, read: key => wx.getStorageSync(key), write: (key, value) => wx.setStorageSync(key, value) })
  let active = true, actionError = null
  const ensure = () => { if (!active || !current()) throw Object.assign(Error('当前餐或账号已切换，请重新读取'), { superseded: true }) }
  ensure()
  // Reuse the existing account-scoped target handoff; no menu is duplicated.
  const activeKey = storageKey('activeMealTarget'), activeTarget = wx.getStorageSync(activeKey)
  if (!activeTarget || activeTarget.date !== destination.date || activeTarget.mealType !== destination.mealType) {
    ensure(); wx.setStorageSync(activeKey, destination)
  }
  const view = () => {
    const state = store.state(), action = state.lastAction
    return { state, selectedMeal: deriveSelectedMeal(state, destination), dishes: state.workspace && state.workspace.draft.dishes || [],
      selectionFeedback: action ? deriveActionFeedback({ before: action.before, after: { ...state, actionReceipt: action.receipt, actionTask: action.task }, command: action.command, requestId: action.command.requestId, error: actionError }) : state.pending ? { requestId: state.pending.body && state.pending.body.requestId, kind: 'select', state: 'unknown', message: '本餐草稿创建结果待确认，请核对原请求后再加入菜品', undoAvailable: false } : null }
  }
  async function load() { ensure(); await store.load(destination.date, destination.mealType); ensure(); return view() }
  async function change(ids, removal = false) {
    ensure(); const before = store.state(), w = before.workspace
    if (before.pending) throw Error('上次结果待确认，请核对并重试原请求')
    if (before.syncStatus !== 'synced' || before.dirty) throw Error('本餐尚未同步，请查看本餐核对后再选菜')
    if (w && w.status === 'generating') throw Error('正在更新本餐，请等待结果后再选菜')
    if (!ids.length) throw Error('本餐至少保留 1 道菜，请继续选菜或替换后再移除')
    if (ids.length > 10) throw Error('一餐最多安排 10 道菜，请先调整当前餐')
    const recipes = await Promise.all(ids.map(async id => { const dish = await api.getDishById(id); if (!dish || Number(dish.id) !== id) throw Error('菜品已不可用，请核对，原菜单仍保留'); return dish }))
    ensure()
    const actual = selectionComposition(recipes, destination.mealType), counts = before.context.counts || {}
    const changed = [...new Set([...Object.keys(counts), ...Object.keys(actual.counts)])].some(type => (counts[type] || 0) !== (actual.counts[type] || 0))
    if (removal || changed) {
      const confirmed = await new Promise(resolve => wx.showModal({ title: removal ? '从本餐草稿移除？' : '确认本餐选菜',
        content: `${targetLabel(destination)} · ${before.context.people} 人。实际搭配：${actual.label}。${removal ? '只修改草稿；已保存的日历安排保留。' : '确认后按这些菜更新本餐草稿搭配；保存到日历还需下一步确认。'}`,
        confirmText: removal ? '移除' : '加入本餐', cancelText: '继续选菜', success: result => resolve(!!result.confirm), fail: () => resolve(false) }))
      ensure(); if (!confirmed) return view()
    }
    const latest = store.state().workspace
    if ((latest && latest.id) !== (w && w.id) || (latest && latest.revision) !== (w && w.revision)) throw Error('本餐版本已变化，请核对最新菜单后重新选择')
    actionError = null
    try { await store.command('select', interactionCommand('select', { dishIds: ids })); ensure(); return view() }
    catch (error) { actionError = error; throw error }
  }
  async function append(id) {
    const state = store.state(), ids = appendSelectedDish(state, id), existing = deriveSelectedMeal(state, destination).dishIds
    if (ids.length === existing.length) return view()
    return change(ids)
  }
  async function remove(id) { return change(deriveSelectedMeal(store.state(), destination).dishIds.filter(value => value !== Number(id)), true) }
  async function recover() { ensure(); actionError = null; await store.retry(); ensure(); return view() }
  function dispose() { active = false; store.dispose() }
  return { target: destination, load, append, remove, recover, view, dispose }
}
async function addDishToWorkspace(id, options) {
  const session = options.session || createRecipeSelection(options)
  try { if (!options.session) await session.load(); return await session.append(id) }
  finally { if (!options.session) session.dispose() }
}
module.exports = { buildDishSelection, resolveRecipeTarget, createRecipeSelection, addDishToWorkspace }

function renderSelectionPage(page) {
  const session = page._recipeSelection
  if (!session) return
  const value = session.view(), state = value.state, dishId = Number(page._dishId || page.data.dish && page.data.dish.id)
  const selected = value.selectedMeal.dishIds.includes(dishId)
  const fields = { mealSelectedDishes:value.dishes,selectedMeal: value.selectedMeal, selectionFeedback: value.selectionFeedback ? {...value.selectionFeedback,undoAvailable:false} : null,
    selectionBlocked: !!state.pending || state.dirty || state.syncStatus !== 'synced' || state.workspace && state.workspace.status === 'generating',
    mealPrimaryLabel: selected ? '查看本餐' : '加入本餐', isAddedToMeal: selected }
  // A personal-menu editor is an explicit form, not another current-meal draft.
  if (!page.data.menuEditingId && !page.data.menuPending && !page.data.menuFormVisible) Object.assign(fields, {
    selectedIds: value.selectedMeal.dishIds, selectedTotal: value.selectedMeal.count, selectedList: value.dishes,
    currentDishes: (page.data.currentDishes || []).map(dish => ({ ...dish, isSelected: value.selectedMeal.dishIds.includes(Number(dish.id)) })),
    filtered: (page.data.filtered || []).map(dish => ({ ...dish, isSelected: value.selectedMeal.dishIds.includes(Number(dish.id)) })) })
  if (page.allDishesMap) value.dishes.forEach(dish => { page.allDishesMap[dish.id] = dish })
  page.setData(fields)
  clearTimeout(page._recipePoll)
  if (page._recipeVisible !== false && state.workspace && state.workspace.status === 'generating' && !state.pending) {
    page._recipePoll = setTimeout(() => { if (page._recipeSelection === session && page._recipeVisible !== false) page.refreshSelectedMeal() }, 750)
  }
  return value
}
async function refreshSelectionPage(page, options) {
  const scope = options.storageKey('recipeMealView'), target = resolveRecipeTarget(options.wx, options.storageKey), signature = `${scope}:${target.date}:${target.mealType}`
  if (signature !== page._recipeSignature) {
    disposeSelectionPage(page); page._recipeSignature = signature
    const fields = { selectedMeal: deriveSelectedMeal(null, target), selectionFeedback: null, mealPrimaryLabel: '加入本餐', selectionBlocked: true,selectionBusy:false,selectionError:'',mealSelectedDishes:[],showMealSelected:false }
    if (!page.data.menuEditingId && !page.data.menuPending && !page.data.menuFormVisible) Object.assign(fields, { selectedIds: [], selectedTotal: 0, selectedList: [] })
    page.setData(fields)
    const current = () => page._recipeSignature === signature && scope === options.storageKey('recipeMealView') && options.current()
    page._recipeSelection = createRecipeSelection({ ...options, target, current })
  }
  const session = page._recipeSelection, epoch = page._recipeReadEpoch = (page._recipeReadEpoch || 0) + 1
  const owns = () => session === page._recipeSelection && signature === page._recipeSignature && options.current() && epoch === page._recipeReadEpoch
  page.setData({ selectionLoading: true })
  try { const result = await session.load(); if (owns() && !result.state.superseded) { page.setData({ [options.errorKey]: '',selectionError:'' }); renderSelectionPage(page) } }
  catch (error) { if (owns() && !error.superseded) { renderSelectionPage(page); page.setData({ [options.errorKey]: error.message || '本餐暂未读到，请重试',selectionError:error.message || '本餐暂未读到，请重试' }) } }
  finally { if (owns()) page.setData({ selectionLoading: false }) }
}
async function changeSelectionPage(page, operation, id, options) {
  const session = page._recipeSelection, signature = page._recipeSignature
  if (!session || page.data.selectionBusy || page.data.selectionLoading || !options.current()) return
  const owns = () => session === page._recipeSelection && signature === page._recipeSignature && options.current()
  page.setData({ selectionBusy: true, [options.errorKey]: '',selectionError:'' })
  try { const result = await session[operation](id); if (owns()) renderSelectionPage(page); return result }
  catch (error) { if (owns() && !error.superseded) { renderSelectionPage(page); page.setData({ [options.errorKey]: error.message || '结果待确认，请核对原请求',selectionError:error.message || '结果待确认，请核对原请求' }) } }
  finally { if (owns()) page.setData({ selectionBusy: false }) }
}
function disposeSelectionPage(page) {
  clearTimeout(page._recipePoll)
  if (page._recipeSelection) page._recipeSelection.dispose()
  page._recipeSelection = null; page._recipeSignature = null; page._recipeReadEpoch = (page._recipeReadEpoch || 0) + 1
}
function openSelectedMeal(page, wx, save = false) {
  const view = page.data.selectedMeal
  if (!view) return
  wx.navigateTo({ url: `/pages/result/result?date=${view.target.date}&mealType=${view.target.mealType}${save ? '&save=1' : ''}` })
}
Object.assign(module.exports, { renderSelectionPage, refreshSelectionPage, changeSelectionPage, disposeSelectionPage, openSelectedMeal })
