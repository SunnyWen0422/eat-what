const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
const rules = require('../utils/meal-workspace')
const util = require('../utils/util')
const plain = value => value == null ? value : JSON.parse(JSON.stringify(value))
const yesterday = { date: '2026-10-09', mealType: 'dinner' }

async function fixture(t) {
  const memory = new Map(), reads = [], now = new Date('2026-10-10T02:00:00Z')
  const previousWx = global.wx
  const wx = { getStorageSync: key => plain(memory.get(key)), setStorageSync: (key, value) => memory.set(key, plain(value)),
    removeStorageSync: key => memory.delete(key), getAppBaseInfo: () => ({}) }
  global.wx = wx
  const api = { getUserPreferences: async () => ({ defaultPeople: 2 }), getMealWorkspace: async () => ({ workspace: null }) }
  const create = () => rules.createWorkspaceStore({ api, identity: util.getCurrentUserIdentity, read: wx.getStorageSync, write: wx.setStorageSync })
  const sandbox = { module: { exports: {} }, wx, console, setTimeout, clearTimeout,
    require: name => name === './api' ? api : name === './util' ? util : name === './meal-workspace' ? { ...rules,
      defaultTarget: () => rules.defaultTarget(now), resolveActiveTarget: (mode, params, saved) => rules.resolveActiveTarget(mode, params, saved, now),
      createWorkspaceStore: create } : require(path.resolve('utils', name)) }
  vm.runInNewContext(fs.readFileSync('utils/meal-workspace-page.js', 'utf8'), sandbox)
  const page = sandbox.module.exports(), store = create()
  page._alive = true; page.setData = patch => Object.assign(page.data, patch)
  page.readWorkspace = async target => { reads.push(plain(target)); await page.store.load(target.date, target.mealType) }
  t.after(() => { page.onUnload(); store.dispose(); if (previousWx === undefined) delete global.wx; else global.wx = previousWx })
  wx.setStorageSync(util.getUserStorageKey('activeMealTarget'), { ...yesterday, selectedOn: yesterday.date })
  return { page, store, memory, reads, wx }
}

test('guest unfinished meal survives midnight in its API-scoped workspace cache', async t => {
  const f = await fixture(t)
  await f.store.load(yesterday.date, yesterday.mealType)
  f.store.edit({ ...yesterday, requirements: 'unfinished dinner' })
  await f.page.initializeWorkspace({})
  assert.deepEqual(f.reads[0], yesterday)
  assert.equal(f.page.store.state().context.requirements, 'unfinished dinner')
  assert.equal(f.wx.getStorageSync(util.getUserStorageKey('activeMealTarget')).date, yesterday.date)
})

test('guest midnight recovery never revives an unscoped or another API draft', async t => {
  const f = await fixture(t)
  f.memory.set(`user:guest:meal-workspace:${yesterday.date}:${yesterday.mealType}`, { dirty: true })
  f.memory.set(`user:api_v2_${encodeURIComponent('http://127.0.0.1:18780/api')}:guest:meal-workspace:${yesterday.date}:${yesterday.mealType}`, { dirty: true })
  await f.page.initializeWorkspace({})
  assert.equal(f.reads[0].date, '2026-10-10')
  assert.equal(f.memory.get(`user:guest:meal-workspace:${yesterday.date}:${yesterday.mealType}`).dirty, true)
})
