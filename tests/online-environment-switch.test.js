const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

test('the mini-program uses online HTTPS with V4 and real login enabled', () => {
  const config = require('../utils/config')
  assert.equal(config.getApiBaseUrl(), 'https://chishenme.icu/api')
  assert.equal(config.ENABLE_MEAL_WORKSPACE, true)
  assert.equal(config.ENABLE_LOGIN, true)
})

function utility() {
  let environment = 'http://127.0.0.1:18780/api'
  let user = { id: 7 }
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync('utils/util.js', 'utf8'), {
    module, console: { log() {} },
    require: () => ({ getApiBaseUrl: () => environment }),
    wx: { getStorageSync: () => user }
  })
  return { util: module.exports, online: () => { environment = 'https://chishenme.icu/api' }, guest: () => { user = null } }
}

test('equal account IDs in local and online environments cannot share pending workspaces or receipts', () => {
  const fixture = utility()
  const localIdentity = fixture.util.getCurrentUserIdentity()
  const localKey = fixture.util.getUserStorageKey('pendingRecipeRecord')
  fixture.online()
  assert.notEqual(fixture.util.getCurrentUserIdentity(), localIdentity)
  assert.notEqual(fixture.util.getUserStorageKey('pendingRecipeRecord'), localKey)
})

test('guest remains recognisable while guest storage is separated by environment', () => {
  const fixture = utility(); fixture.guest()
  assert.equal(fixture.util.getCurrentUserIdentity(), 'guest')
  const localKey = fixture.util.getUserStorageKey('activeMealTarget')
  fixture.online()
  assert.equal(fixture.util.getCurrentUserIdentity(), 'guest')
  assert.notEqual(fixture.util.getUserStorageKey('activeMealTarget'), localKey)
})

test('legacy local records are retained in their known original environment without overwriting newer records', () => {
  const config = require('../utils/config')
  const util = require('../utils/util')
  const oldEnvironment = 'http://127.0.0.1:18780/api'
  const oldKey = 'user:id_7:pendingRecipeRecord'
  const newOldKey = `user:api_${encodeURIComponent(oldEnvironment)}:id_7:pendingRecipeRecord`
  const storage = new Map([[oldKey, { local: true }], ['user:id_7:shoppingList', { old: true }],
    [`user:api_${encodeURIComponent(oldEnvironment)}:id_7:shoppingList`, { newer: true }]])
  const runtime = { getStorageInfoSync: () => ({ keys: [...storage.keys()] }), getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value) }
  util.preserveLegacyUserStorage(oldEnvironment, runtime)
  assert.deepEqual(storage.get(newOldKey), { local: true })
  assert.deepEqual(storage.get(oldKey), { local: true })
  assert.deepEqual(storage.get(`user:api_${encodeURIComponent(oldEnvironment)}:id_7:shoppingList`), { newer: true })
  assert.equal(storage.has(`user:api_${encodeURIComponent(config.getApiBaseUrl())}:id_7:pendingRecipeRecord`), false)
  const count = storage.size
  util.preserveLegacyUserStorage(undefined, runtime)
  assert.equal(storage.size, count)
})
