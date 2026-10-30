const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const plain = value => value == null ? value : JSON.parse(JSON.stringify(value))

// Real pages, preference store, handoff and source validation; only platform/HTTP are isolated.
function fixture(route = 'settings') {
  let owner = 'A', definition
  const rows = new Map(), writes = [], dialogs = [], navigation = [], alerts = [], cache = {}
  const user = () => ({ id: owner, nickname: '小明', avatar: '' })
  const wx = {
    getStorageSync: key => key === 'userInfo' ? user() : plain(rows.get(key)),
    setStorageSync: (key, value) => rows.set(key, plain(value)), removeStorageSync: key => rows.delete(key),
    showToast() {}, vibrateShort() {}, showModal: value => dialogs.push(value),
    navigateBack: value => navigation.push(value), navigateTo: value => navigation.push(value),
    enableAlertBeforeUnload: value => alerts.push(value.message), disableAlertBeforeUnload: () => alerts.push(null),
  }
  const api = {
    getUserPreferences: async () => ({ preferences: {} }),
    updateUserPreferences: async value => { writes.push(plain(value)); return { preferences: value } },
    updateUserInfo: async value => { writes.push(plain(value)); return { success: true, user: { ...user(), ...value } } },
    getAdminUser: async id => ({ user: { id, nickname: '目标用户' }, customDishes: [] }),
    updateAdminUserStatus: async (...args) => { writes.push({ method: 'updateAdminUserStatus', args: plain(args) }); return { user: { id: args[0], status: args[1] } } },
    deleteAdminUserDish: async (...args) => { writes.push({ method: 'deleteAdminUserDish', args: plain(args) }); return {} },
    updateAdminDishStatus: async (...args) => { writes.push({ method: 'updateAdminDishStatus', args: plain(args) }); return { id: args[0], isPublished: args[1] } },
  }
  function load(file) {
    if (cache[file]) return cache[file]
    const name = path.basename(file)
    if (name === 'api.js') return api
    if (name === 'config.js') return { getApiBaseUrl: () => 'https://isolated.test/api' }
    if (name === 'util.js') return { getUserStorageKey: key => owner + ':' + key }
    if (name === 'avatar.js') return { resolveAvatar: value => value || '', uploadAvatar: async () => ({ user: {} }) }
    if (name === 'recommendation-options.js') return { loadRecommendationOptions: async () => ({ options: { groups: { cuisine: [{ code: 'SICHUAN' }] } }, synced: true }), sanitizeCriteriaForOptions: value => value }
    if (name === 'font-scale.js') return Object.assign(() => 1, { base: 16 })
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Page: value => { definition = value }, module, exports: module.exports, require: value => load(path.resolve(path.dirname(file), value + '.js')), wx, getApp: () => ({ globalData: {} }), getCurrentPages: () => [], console, setTimeout, clearTimeout })
    return cache[file] = module.exports
  }
  load(path.resolve(`pages/${route}/${route}.js`))
  const page = { ...definition, data: plain(definition.data), setData(values) { for (const [key, value] of Object.entries(values)) { const parts = key.split('.'); let target = this.data; while (parts.length > 1) target = target[parts.shift()]; target[parts[0]] = value } } }
  return { page, rows, writes, dialogs, navigation, alerts, api, load: name => load(path.resolve('utils', name + '.js')), switch: () => { owner = 'B' } }
}
const input = value => ({ detail: { value } })
const tap = value => ({ currentTarget: { dataset: { value } } })

test('failed preference save survives a successful reread and explicit retry clears the draft', async () => {
  const f = fixture(); await f.page.onLoad()
  f.page.onIngredientInput(input('花生')); f.page.onAddIngredient()
  f.api.updateUserPreferences = async () => { throw { isNetworkError: true } }
  await f.page.onSave()
  assert.match(f.page.data.statusText, /草稿.*保留|保留.*草稿/)
  await f.page.onLoad()
  assert.deepEqual(plain(f.page.data.preferences.excludedIngredients), ['花生'])
  assert.equal(f.page.data.synced, false)
  assert.match(f.page.data.statusText, /未同步/)
  f.api.updateUserPreferences = async value => ({ preferences: value })
  await f.page.onSave()
  assert.equal(f.page.data.synced, true)
  f.api.getUserPreferences = async () => ({ preferences: { excludedIngredients: ['芝麻'] } })
  await f.page.onLoad()
  assert.deepEqual(plain(f.page.data.preferences.excludedIngredients), ['芝麻'])
})

test('an older preference read cannot overwrite a just-saved preference', async () => {
  const f = fixture(), store = f.load('preference-store').createPreferenceStore()
  let resolve
  f.api.getUserPreferences = () => new Promise(done => { resolve = done })
  const pending = store.load()
  await store.save({ excludedIngredients: ['花生'] })
  resolve({ preferences: {} })
  const result = await pending
  assert.deepEqual(plain(result.preferences.excludedIngredients), ['花生'])
  assert.deepEqual(plain(store.readCache().excludedIngredients), ['花生'])
})

test('saving the same preference value still supersedes a read that began before the save', async () => {
  const f = fixture(), store = f.load('preference-store').createPreferenceStore()
  store.writeCache({ excludedIngredients: ['花生'] })
  let resolve
  f.api.getUserPreferences = () => new Promise(done => { resolve = done })
  const reading = store.load()
  await store.save({ excludedIngredients: ['花生'] })
  resolve({ preferences: { excludedIngredients: ['芝麻'] } })
  assert.deepEqual(plain((await reading).preferences.excludedIngredients), ['花生'])
  assert.deepEqual(plain(store.readCache().excludedIngredients), ['花生'])
})

test('late older preference save cannot erase a newer unsynced draft or another account', async () => {
  const f = fixture(), store = f.load('preference-store').createPreferenceStore()
  let resolve
  f.api.updateUserPreferences = value => value.excludedIngredients[0] === '花生' ? new Promise(done => { resolve = done }) : Promise.reject({ isNetworkError: true })
  const older = store.save({ excludedIngredients: ['花生'] })
  await store.save({ excludedIngredients: ['芝麻'] })
  resolve({ preferences: { excludedIngredients: ['花生'] } }); await older
  assert.deepEqual(plain((await store.load()).preferences.excludedIngredients), ['芝麻'])
  f.switch()
  assert.deepEqual(plain((await store.load()).preferences.excludedIngredients), [])
})

test('unadded ingredient is never silently omitted', async () => {
  const f = fixture(); await f.page.onLoad()
  f.page.onIngredientInput(input(' 花生 ')); await f.page.onSave()
  assert.equal(f.writes.length, 0)
  assert.equal(f.page.data.ingredientError, '请先添加这项忌口')
  assert.equal(f.page.data.ingredientFocus, true)
  f.page.onAddIngredient(); await f.page.onSave()
  assert.deepEqual(f.writes[0].excludedIngredients, ['花生'])
  assert.equal(f.page.data.ingredientDraft, '')
  assert.equal(f.page.data.dirty, false)
  assert.equal(f.alerts.at(-1), null)
})

test('preference save issue identifies exact field and keeps people validation', () => {
  const { preferenceSaveIssue } = require('../utils/preference-save-presentation')
  assert.deepEqual(preferenceSaveIssue({ peopleDraft: '2', ingredientDraft: '花生' }), { field: 'ingredientDraft', message: '请先添加这项忌口' })
  assert.deepEqual(preferenceSaveIssue({ peopleDraft: '', ingredientDraft: '' }), { field: 'peopleDraft', message: '常用人数应为 1 至 50' })
  assert.equal(preferenceSaveIssue({ peopleDraft: '50', ingredientDraft: '  ' }), null)
})

test('settings dirty compares current values and clears after reverting', async () => {
  const f = fixture(); await f.page.onLoad()
  f.page.onDefaultPeople(input('3')); assert.equal(f.page.data.dirty, true)
  f.page.onDefaultPeople(input('2')); assert.equal(f.page.data.dirty, false)
  f.page.onIngredientInput(input('花生')); assert.equal(f.page.data.dirty, true)
  f.page.onIngredientInput(input('')); assert.equal(f.page.data.dirty, false)
  f.page.onDayTap(tap(14)); assert.equal(f.page.data.dirty, true)
  f.page.onDayTap(tap(7)); assert.equal(f.page.data.dirty, false)
})

test('cancel dirty leave keeps current values', async () => {
  const f = fixture('profile-edit'); f.page.onShow()
  f.page.onNicknameInput(input('新的昵称')); f.page.onCancel()
  assert.equal(f.dialogs.length, 1); f.dialogs[0].success({ confirm: false })
  assert.equal(f.page.data.nickname, '新的昵称'); assert.equal(f.navigation.length, 0); assert.equal(f.writes.length, 0)
  await f.page.onSave(); assert.equal(f.page.data.dirty, false)
  f.page.onCancel(); assert.equal(f.dialogs.length, 1); assert.equal(f.navigation.length, 1); assert.equal(f.alerts.at(-1), null)
})

test('profile revert clears leave guard and stale discard cannot discard newer edits', () => {
  const f = fixture('profile-edit'); f.page.onShow()
  f.page.onNicknameInput(input('改名')); f.page.onNicknameInput(input('小明')); assert.equal(f.page.data.dirty, false)
  f.page.onNicknameInput(input('新名称')); f.page.onCancel()
  f.page.onNicknameInput(input('更新名称')); f.dialogs[0].success({ confirm: true })
  assert.equal(f.navigation.length, 0); assert.equal(f.page.data.nickname, '更新名称')
})

test('filter draft participates in dirty leave and cannot be silently applied', async () => {
  const f = fixture('recommend-filter'); await f.page.onLoad()
  f.page.onDurationTap(tap(20)); assert.equal(f.page.data.dirty, true)
  f.page.onDurationTap(tap('none')); assert.equal(f.page.data.dirty, false)
  f.page.onIngredientInput(input('花生')); f.page.onApply()
  assert.equal(f.navigation.length, 0); assert.equal(f.rows.has('A:pendingRecommendationCriteria'), false)
  assert.equal(f.page.data.ingredientFocus, true)
  f.page.onAddIngredient(); f.page.onApply()
  assert.deepEqual(f.rows.get('A:pendingRecommendationCriteria').excludedIngredients, ['花生'])
  assert.equal(f.page.data.dirty, false); assert.equal(f.alerts.at(-1), null)
})

test('assistant prefill remains a proposal', async () => {
  const f = fixture(), handoff = f.load('assistant-action-handoff')
  const token = handoff.currentStore().put({ kind: 'edit_preferences', ref: {}, prefill: { userText: '以后不要花生' } }, { kind: 'assistant', sessionId: 's1', workspaceId: 'w1', date: '2026-10-17', mealType: 'dinner' })
  await f.page.onLoad({ handoffToken: token })
  assert.equal(f.page.data.assistantPreferenceProposal, '以后不要花生'); assert.equal(f.writes.length, 0)
  assert.deepEqual(plain(f.page.data.preferences.excludedIngredients), [])
  f.page.onIngredientInput(input('花生')); f.page.onAssistantReturn()
  assert.equal(f.dialogs.length, 1); f.dialogs[0].success({ confirm: false })
  assert.equal(f.page.data.ingredientDraft, '花生'); assert.equal(f.navigation.length, 0)
  f.page.onAssistantReturn(); f.dialogs[1].success({ confirm: true })
  assert.equal(f.navigation.length, 1); assert.equal(f.alerts.at(-1), null)
  f.switch(); await f.page.onShow()
  assert.equal(f.page.data.assistantPreferenceProposal, ''); assert.equal(f.page.data.ingredientDraft, ''); assert.equal(f.writes.length, 0)
})

test('a stale profile discard callback cannot leave a different account', () => {
  const f = fixture('profile-edit'); f.page.onShow(); f.page.onNicknameInput(input('A 的修改')); f.page.onCancel()
  f.switch(); f.dialogs[0].success({ confirm: true }); assert.equal(f.navigation.length, 0)
})

test('same-account preference reread retains the assistant proposal and failed return restores leave protection', async () => {
  const f = fixture(), handoff = f.load('assistant-action-handoff')
  const token = handoff.currentStore().put({ kind: 'edit_preferences', ref: {}, prefill: { userText: '以后不要花生' } }, { kind: 'assistant', sessionId: 's1', workspaceId: 'w1', date: '2026-10-17', mealType: 'dinner' })
  await f.page.onLoad({ handoffToken: token }); await f.page.onLoad()
  assert.equal(f.page.data.assistantPreferenceProposal, '以后不要花生')
  assert.equal(f.page.data.assistantReturnVisible, true)
  f.page.onIngredientInput(input('花生')); f.page.onAssistantReturn(); f.dialogs.at(-1).success({ confirm: true })
  assert.equal(f.alerts.at(-1), null)
  f.navigation[0].fail(); assert.match(f.alerts.at(-1), /尚未保存/)
})

function adminConfirmation(route, detailAction = 'deleteDish') {
  const f = fixture(route), target = { id: 7, name: '目标菜品', isPublished: 1 }, user = { id: 31, nickname: '目标用户', displayName: '目标用户', status: 1 }
  Object.assign(f.page.data, { users: [user], user, userId: 31, dishes: [target], userDishes: [target], selectedUser: user })
  const event = { currentTarget: { dataset: { id: 7 } } }
  if (route === 'admin-users') f.page.toggleStatus({ currentTarget: { dataset: { id: 31 } } })
  else if (route === 'admin-user-detail') f.page[detailAction](event)
  else if (route === 'admin-dishes') f.page.togglePublished(event)
  else f.page.onDeleteDish(event)
  return f
}

const adminWrites = [
  { route: 'admin-users', method: 'updateAdminUserStatus', args: [31, 0] },
  { route: 'admin-user-detail', method: 'deleteAdminUserDish', args: [31, 7] },
  { route: 'admin-dishes', method: 'updateAdminDishStatus', args: [7, 0] },
  { route: 'admin', method: 'deleteAdminUserDish', args: [31, 7] },
]

for (const { route, method, args } of adminWrites) {
 test(`${route} dangerous confirmation identifies the current object and cancelled action writes nothing`, async () => {
  const f = adminConfirmation(route)
  assert.match(f.dialogs[0].content, route === 'admin-users' ? /目标用户.*31/ : /目标菜品.*7/)
  await f.dialogs[0].success({ confirm: false }); assert.equal(f.writes.length, 0)
  f.switch(); await f.dialogs[0].success({ confirm: true }); assert.equal(f.writes.length, 0)
 })
 test(`${route} explicit current confirmation observes the named administrative write`, async () => {
  const f = adminConfirmation(route)
  await f.dialogs[0].success({ confirm: true })
  assert.deepEqual(f.writes, [{ method, args }])
 })
}

for (const action of ['deleteDish', 'toggleStatus']) test(`admin-user-detail ${action} rejects confirmation after target user changes`, async () => {
  const f = adminConfirmation('admin-user-detail', action)
  const dialog = f.dialogs.at(-1)
  f.page.setData({ userId: 32, user: { id: 32, nickname: '另一用户', status: 1 } })
  await dialog.success({ confirm: true })
  assert.equal(f.writes.length, 0)
})
