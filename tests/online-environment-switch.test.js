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

test('legacy records with unmarked scoped storage remain quarantined without overwriting newer records', () => {
  const config = require('../utils/config')
  const util = require('../utils/util')
  const oldEnvironment = 'http://127.0.0.1:18780/api'
  const oldKey = 'user:id_7:pendingRecipeRecord'
  const newOldKey = `user:api_v2_${encodeURIComponent(oldEnvironment)}:id_7:pendingRecipeRecord`
  const storage = new Map([[oldKey, { local: true }], ['user:id_7:shoppingList', { old: true }],
    [`user:api_v2_${encodeURIComponent(oldEnvironment)}:id_7:shoppingList`, { newer: true }]])
  const runtime = { getStorageInfoSync: () => ({ keys: [...storage.keys()] }), getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value) }
  util.preserveLegacyUserStorage(oldEnvironment, runtime)
  assert.equal(storage.has(newOldKey), false)
  assert.deepEqual(storage.get(oldKey), { local: true })
  assert.deepEqual(storage.get(`user:api_v2_${encodeURIComponent(oldEnvironment)}:id_7:shoppingList`), { newer: true })
  assert.equal(storage.has(`user:api_v2_${encodeURIComponent(config.getApiBaseUrl())}:id_7:pendingRecipeRecord`), false)
  const count = storage.size
  util.preserveLegacyUserStorage(undefined, runtime)
  assert.equal(storage.size, count)
})

const localEnvironment = 'http://127.0.0.1:18780/api'
const onlineEnvironment = 'https://chishenme.icu/api'
const scoped = (environment, key) => key.replace('user:', `user:api_v2_${encodeURIComponent(environment)}:`)
function storageFixture(entries = []) {
  const storage = new Map(entries)
  const runtime = {
    getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, JSON.parse(JSON.stringify(value))),
    removeStorageSync: key => storage.delete(key)
  }
  return { storage, runtime }
}
function launch(runtime) {
  let app, logins = 0
  vm.runInNewContext(fs.readFileSync('app.js', 'utf8'), {
    App: value => { app = value }, wx: runtime, console: { warn() {} },
    require: path => path === './utils/config' ? { getApiBaseUrl: () => onlineEnvironment } : path === './utils/util' ? {
      preserveLegacyUserStorage: environment => require('../utils/util').preserveLegacyUserStorage(environment, runtime)
    } : {}
  })
  app.doLogin = () => { logins += 1 }
  app.onLaunch()
  return logins
}

test('two launches keep all legacy accounts bound to the original environment', () => {
  const keys = ['user:id_7:personalRecipeWrite:create', 'user:id_8:meal-workspace:2026-10-10:lunch', 'user:open_other:shoppingList', 'user:guest:activeMealTarget']
  const { storage, runtime } = storageFixture([['apiEnvironment', localEnvironment], ...keys.map(key => [key, { pending: key }])])
  assert.equal(launch(runtime), 1)
  assert.equal(launch(runtime), 1)
  for (const key of keys) {
    assert.deepEqual(storage.get(scoped(localEnvironment, key)), storage.get(key))
    assert.equal(storage.has(scoped(onlineEnvironment, key)), false)
    assert.equal(storage.has(key), true)
  }
})

test('completed migration never resurrects cleared pending writes or imports later legacy keys', () => {
  const util = require('../utils/util'), key = 'user:id_7:personalRecipeWrite:create'
  const { storage, runtime } = storageFixture([[key, { requestId: 'old' }]])
  util.preserveLegacyUserStorage(localEnvironment, runtime)
  storage.delete(scoped(localEnvironment, key))
  storage.set('user:id_9:shoppingList', ['late'])
  assert.equal(util.preserveLegacyUserStorage(localEnvironment, runtime), 0)
  assert.equal(storage.has(scoped(localEnvironment, key)), false)
  assert.equal(storage.has(scoped(localEnvironment, 'user:id_9:shoppingList')), false)
  assert.equal(storage.has(key), true)
})

test('unknown legacy origin remains unbound after the online environment is recorded', () => {
  const key = 'user:id_7:personalRecipeWrite:create'
  const { storage, runtime } = storageFixture([[key, { requestId: 'unknown' }]])
  launch(runtime); launch(runtime)
  assert.equal(storage.has(scoped(onlineEnvironment, key)), false)
  assert.equal(storage.has(key), true)
})

test('origin marker failure prevents copies, environment changes and login', () => {
  const key = 'user:id_7:pendingRecipeRecord'
  const { storage, runtime } = storageFixture([['apiEnvironment', localEnvironment], [key, { pending: true }]])
  const write = runtime.setStorageSync
  runtime.setStorageSync = (name, value) => {
    if (!name.startsWith('user:') && !['apiEnvironment', 'logs'].includes(name)) throw Error('quota')
    write(name, value)
  }
  assert.equal(launch(runtime), 0)
  assert.equal(storage.get('apiEnvironment'), localEnvironment)
  assert.equal(storage.has(scoped(localEnvironment, key)), false)
  runtime.setStorageSync = write
  assert.equal(launch(runtime), 1)
  assert.deepEqual(storage.get(scoped(localEnvironment, key)), { pending: true })
})

test('interrupted copying preserves uncertain originals and resumes only untouched keys at the fixed source', () => {
  const util = require('../utils/util'), first = 'user:id_7:pendingRecipeRecord', second = 'user:id_8:shoppingList', third = 'user:id_10:shoppingList'
  const { storage, runtime } = storageFixture([[first, 'first'], [second, 'second'], [third, 'third']])
  const write = runtime.setStorageSync
  runtime.setStorageSync = (name, value) => {
    if (name === scoped(localEnvironment, second)) throw Error('quota')
    write(name, value)
  }
  assert.throws(() => util.preserveLegacyUserStorage(localEnvironment, runtime), /quota/)
  storage.set(scoped(localEnvironment, first), 'newer')
  storage.set('user:id_9:shoppingList', 'late')
  runtime.setStorageSync = write
  util.preserveLegacyUserStorage(onlineEnvironment, runtime)
  assert.equal(storage.get(scoped(localEnvironment, first)), 'newer')
  assert.equal(storage.has(scoped(localEnvironment, second)), false)
  assert.equal(storage.get(second), 'second')
  assert.equal(storage.get(scoped(localEnvironment, third)), 'third')
  assert.equal(storage.has(scoped(onlineEnvironment, first)), false)
  assert.equal(storage.has(scoped(onlineEnvironment, second)), false)
  assert.equal(storage.has(scoped(localEnvironment, 'user:id_9:shoppingList')), false)
})

test('completion marker failure pauses launch and retries without rebinding', () => {
  const key = 'user:id_7:pendingRecipeRecord'
  const { storage, runtime } = storageFixture([['apiEnvironment', localEnvironment], [key, 'pending']])
  const write = runtime.setStorageSync
  runtime.setStorageSync = (name, value) => {
    if (value && value.completed === true) throw Error('quota')
    write(name, value)
  }
  assert.equal(launch(runtime), 0)
  assert.equal(storage.get('apiEnvironment'), localEnvironment)
  runtime.setStorageSync = write
  assert.equal(launch(runtime), 1)
  storage.delete(scoped(localEnvironment, key))
  launch(runtime)
  assert.equal(storage.has(scoped(localEnvironment, key)), false)
  assert.equal(storage.has(scoped(onlineEnvironment, key)), false)
})

test('consumed copies are never replayed after a failed completion marker', () => {
  const util = require('../utils/util'), key = 'user:id_7:personalRecipeWrite:create'
  const { storage, runtime } = storageFixture([[key, 'pending']])
  const write = runtime.setStorageSync
  runtime.setStorageSync = (name, value) => {
    if (value && value.completed === true) throw Error('completion quota')
    write(name, value)
  }
  assert.throws(() => util.preserveLegacyUserStorage(localEnvironment, runtime), /completion quota/)
  assert.equal(storage.get(scoped(localEnvironment, key)), 'pending')
  storage.delete(scoped(localEnvironment, key)) // A page can consume it even if onLaunch returned.
  runtime.setStorageSync = write
  util.preserveLegacyUserStorage(localEnvironment, runtime)
  assert.equal(storage.has(scoped(localEnvironment, key)), false)
  assert.equal(storage.get(key), 'pending')
})

test('a failed later claim resumes untouched keys without replaying a consumed earlier copy', () => {
  const util = require('../utils/util'), first = 'user:id_7:personalRecipeWrite:create', second = 'user:id_8:shoppingList'
  const { storage, runtime } = storageFixture([[first, 'first'], [second, 'second']])
  const write = runtime.setStorageSync
  runtime.setStorageSync = (name, value) => {
    if (value && value.nextIndex === 2) throw Error('claim quota')
    write(name, value)
  }
  assert.throws(() => util.preserveLegacyUserStorage(localEnvironment, runtime), /claim quota/)
  storage.delete(scoped(localEnvironment, first))
  runtime.setStorageSync = write
  util.preserveLegacyUserStorage(onlineEnvironment, runtime)
  assert.equal(storage.has(scoped(localEnvironment, first)), false)
  assert.equal(storage.get(scoped(localEnvironment, second)), 'second')
  assert.equal(storage.has(scoped(onlineEnvironment, second)), false)
})

test('failed migration clears old environment credentials before any page can use them', () => {
  const { storage, runtime } = storageFixture([
    ['apiEnvironment', localEnvironment], ['token', 'local-only-token'], ['userInfo', { id: 7 }],
    ['user:id_7:pendingRecipeRecord', 'pending']
  ])
  runtime.setStorageSync = () => { throw Error('quota') }
  assert.equal(launch(runtime), 0)
  assert.equal(storage.has('token'), false)
  assert.equal(storage.has('userInfo'), false)
  assert.equal(storage.get('apiEnvironment'), localEnvironment)
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync('utils/util.js', 'utf8'), {
    module, wx: runtime, console: { log() {} },
    require: () => ({ getApiBaseUrl: () => onlineEnvironment })
  })
  assert.equal(module.exports.getCurrentUserIdentity(), 'guest')
})

test('upgrading after the defective first migration quarantines legacy keys instead of rebinding online', () => {
  const util = require('../utils/util'), key = 'user:id_7:personalRecipeWrite:create'
  const { storage, runtime } = storageFixture([
    ['apiEnvironment', onlineEnvironment], [key, 'local pending'],
    [scoped(localEnvironment, key), 'local pending']
  ])
  util.preserveLegacyUserStorage(storage.get('apiEnvironment'), runtime)
  assert.equal(storage.has(scoped(onlineEnvironment, key)), false)
  storage.delete(scoped(localEnvironment, key))
  util.preserveLegacyUserStorage(onlineEnvironment, runtime)
  assert.equal(storage.has(scoped(onlineEnvironment, key)), false)
  assert.equal(storage.get(key), 'local pending')
})

test('known legacy environment still migrates when no scoped storage has ever existed', () => {
  const util = require('../utils/util'), key = 'user:id_7:pendingRecipeRecord'
  const { storage, runtime } = storageFixture([[key, 'pending']])
  assert.equal(util.preserveLegacyUserStorage(localEnvironment, runtime), 1)
  assert.equal(storage.get(scoped(localEnvironment, key)), 'pending')
  assert.equal(storage.get(key), 'pending')
})

test('known online origin without a legacy binding never migrates unscoped requests', () => {
  const util = require('../utils/util'), key = 'user:id_7:pendingRecipeRecord'
  const { storage, runtime } = storageFixture([[key, 'pending']])
  util.preserveLegacyUserStorage(onlineEnvironment, runtime)
  assert.equal(storage.has(scoped(onlineEnvironment, key)), false)
  util.preserveLegacyUserStorage(localEnvironment, runtime)
  assert.equal(storage.has(scoped(localEnvironment, key)), false)
})

test('upgrading an old local binding never recreates a previously consumed v2 request', () => {
  const util = require('../utils/util'), key = 'user:id_7:pendingRecipeRecord'
  const { storage, runtime } = storageFixture([
    ['legacyUserStorageEnvironmentV1', localEnvironment], [key, 'consumed before upgrade']
  ])
  util.preserveLegacyUserStorage(onlineEnvironment, runtime)
  assert.equal(storage.has(scoped(localEnvironment, key)), false)
  assert.equal(storage.has(scoped(onlineEnvironment, key)), false)
  assert.equal(storage.get('legacyUserStorageEnvironmentV1'), localEnvironment)
  assert.equal(storage.get(key), 'consumed before upgrade')
})

test('active account and guest namespaces never read the possibly contaminated api namespace', () => {
  const fixture = utility(); fixture.online()
  assert.match(fixture.util.getUserStorageKey('pendingRecipeRecord'), /^user:api_v2_/)
  fixture.guest()
  assert.match(fixture.util.getUserStorageKey('activeMealTarget'), /^user:api_v2_/)
})
test('unscoped or earlier cached operations of uncertain origin are never activated online', () => {
  const config = require('../utils/config'), util = require('../utils/util')
  const storage = new Map([['user:id_7:pendingRecipeRecord', { local: true }],
    [`user:api_${encodeURIComponent(config.getApiBaseUrl())}:id_7:pendingRecipeRecord`, { originUncertain: true }]])
  const runtime = { getStorageInfoSync: () => ({ keys: [...storage.keys()] }), getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value) }
  assert.equal(util.preserveLegacyUserStorage(config.getApiBaseUrl(), runtime), 0)
  const current = utility(); current.online()
  assert.equal(storage.get(current.util.getUserStorageKey('pendingRecipeRecord')), undefined)
  assert.equal(storage.size, 3) // The durable quarantine marker is the only added entry.
})
