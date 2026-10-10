const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
function fixture(file) {
  let environment = 'http://127.0.0.1:18780/api', account = 'guest'
  const cache = new Map(), module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, console,
    require: name => name === './config' ? { getApiBaseUrl: () => environment } : require('../utils/' + name.slice(2)) })
  const options = { identity: () => account, read: key => cache.get(key), write: (key, value) => cache.set(key, value),
    api: { getMealWorkspace: async () => ({ workspace: null }), startControlledTask: async () => { throw Error('offline') } }, confirm: async () => true }
  return { module: module.exports, cache, options, online: () => { environment = 'https://chishenme.icu/api' }, login: () => { account = 'api_online:id_7' } }
}
test('guest workspaces are isolated across APIs and old instances cannot write after a switch', async () => {
  const f = fixture('utils/meal-workspace.js'), local = f.module.createWorkspaceStore(f.options)
  await local.load('2026-10-10', 'lunch'); local.edit({ date: '2026-10-10', mealType: 'lunch', requirements: 'local guest draft' })
  f.online()
  const online = f.module.createWorkspaceStore(f.options); await online.load('2026-10-10', 'lunch')
  assert.equal(online.state().context.requirements, '')
  assert.equal(local.state().syncStatus, 'account_changed')
  assert.throws(() => local.edit({ date: '2026-10-10', mealType: 'lunch' }), /账号已切换/)
  assert.equal([...f.cache.keys()].some(key => key.startsWith('user:guest:')), false)
  f.login(); const logged = f.module.createWorkspaceStore(f.options); await logged.load('2026-10-10', 'lunch')
  assert.equal(logged.state().context.requirements, '')
  assert.equal(online.state().syncStatus, 'account_changed')
})
test('guest harness does not recover another environment task and invalidates after login', () => {
  const f = fixture('utils/controlled-harness.js'); const localKey = 'user:api_v2_' + encodeURIComponent('http://127.0.0.1:18780/api') + ':guest:controlled-harness'
  const onlineKey = 'user:api_v2_' + encodeURIComponent('https://chishenme.icu/api') + ':guest:controlled-harness'
  const record = { body: { requestId: 'local-pending' }, target: {} }; f.cache.set(localKey, record)
  const local = f.module.createControlledHarness(f.options)
  assert.equal(local.state().requestId, 'local-pending')
  f.online(); const online = f.module.createControlledHarness(f.options)
  assert.equal(online.state().status, 'idle'); assert.equal(local.state().status, 'account_changed')
  assert.equal(f.cache.has(onlineKey), false); assert.equal(f.cache.get(localKey), record)
  f.login(); assert.equal(online.state().status, 'account_changed')
})
test('sync page lists only the current environment guest workspace drafts', () => {
  const prefix = 'user:api_v2_' + encodeURIComponent('https://chishenme.icu/api') + ':guest:'
  const data = new Map([[prefix + 'meal-workspace:2026-10-10:lunch', { dirty: true }], ['user:guest:meal-workspace:2026-10-09:lunch', { dirty: true }]])
  let page
  vm.runInNewContext(fs.readFileSync('pages/sync/sync.js', 'utf8'), {
    Page: value => { page = value }, wx: { getStorageInfoSync: () => ({ keys: [...data.keys()] }), getStorageSync: key => data.get(key) },
    require: path => path.endsWith('/util') ? { getCurrentUserIdentity: () => 'guest', getUserStorageKey: key => prefix + key }
      : path.endsWith('/shopping-list') ? { loadPendingOperations: () => [] }
      : path.endsWith('/meal-workflow') ? { mealNames: { lunch: '午餐' } } : Object.assign(() => '', { base: 16 })
  })
  page.setData = update => Object.assign(page.data, update)
  page.loadPendingSync()
  assert.equal(page.data.workspaceDrafts.length, 1)
  assert.equal(page.data.workspaceDrafts[0].date, '2026-10-10')
})
