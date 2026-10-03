const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

function client(initial) {
  const state = { ...initial }, requests = []
  const wx = { getStorageSync: key => key === 'userInfo' ? state.user : key === 'token' ? state.token : null, showToast() {}, request: value => requests.push(value) }
  const module = { exports: {} }, cache = {}
  function identityModule() {
    if (!cache.identity) {
      const nested = { exports: {} }
      vm.runInNewContext(fs.readFileSync('utils/account-identity.js', 'utf8'), { module: nested, wx })
      cache.identity = nested.exports
    }
    return cache.identity
  }
  vm.runInNewContext(fs.readFileSync('utils/api.js', 'utf8'), { module, wx, getApp: () => ({ globalData: {} }), console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, require: name => name === './account-identity' ? identityModule() : { getApiBaseUrl: () => '/api' } })
  return { api: module.exports, state, requests, wx }
}

for (const fixture of [
  { label: 'user', before: { user: { id: 'A' }, token: 'A' }, after: { user: { id: 'B' }, token: 'B' } },
  { label: 'missing user ID', before: { user: {}, token: 'A' }, after: { user: {}, token: 'B' } },
  { label: 'anonymous login', before: { user: null, token: '' }, after: { user: { id: 'B' }, token: 'B' } },
  { label: 'logout', before: { user: { id: 'A' }, token: 'A' }, after: { user: null, token: '' } },
]) test(`F02 HTTP success rejects old ${fixture.label} identity`, async () => {
  const { api, state, requests } = client(fixture.before)
  const reading = api.getAdminUsers({})
  Object.assign(state, fixture.after)
  requests[0].success({ statusCode: 200, data: { list: [{ phone: 'A private' }] } })
  await assert.rejects(reading, error => error.isAccountChanged === true)
})

test('F02 same-account token refresh retains successful results', async () => {
  const { api, state, requests } = client({ user: { id: 'A' }, token: 'old' })
  const reading = api.getAdminUsers({}); state.token = 'new'
  requests[0].success({ statusCode: 200, data: { list: [{ id: 1 }] } })
  assert.equal((await reading).list[0].id, 1)
})

test('F02 same-account 401 refresh retries without deduplication deadlock', async () => {
  const { api, state, requests, wx } = client({ user: { id: 'A' }, token: 'old' })
  wx.login = options => options.success({ code: 'refresh' })
  wx.setStorageSync = (key, value) => { if (key === 'token') state.token = value; if (key === 'userInfo') state.user = value }
  const reading = api.getAdminUsers({}); requests[0].success({ statusCode: 401, data: {} })
  await new Promise(resolve => setImmediate(resolve))
  requests[1].success({ statusCode: 200, data: { success: true, token: 'new', user: { id: 'A' } } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(requests.length, 3)
  requests[2].success({ statusCode: 200, data: { list: [{ id: 1 }] } })
  assert.equal((await reading).list[0].id, 1)
})
