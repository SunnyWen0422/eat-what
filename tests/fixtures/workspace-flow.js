const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const rules = require('../../utils/meal-workspace')
const plain = value => value == null ? value : JSON.parse(JSON.stringify(value))
const target = { date: '2026-10-06', mealType: 'dinner' }

// Only the platform and HTTP boundary are simulated. Page handlers and the store
// use production code, including request identity, revision and account guards.
function fixture() {
  let account = 'A'
  const memory = new Map(), rows = new Map(), plans = new Map(), navigation = [], calls = []
  const util = { getCurrentUserIdentity: () => account, getUserStorageKey: key => account + ':' + key }
  const wx = {
    getStorageSync: key => plain(memory.get(key)),
    setStorageSync: (key, value) => memory.set(key, plain(value)),
    removeStorageSync: key => memory.delete(key),
    getAppBaseInfo: () => ({ fontSizeScaleFactor: 1 }),
    navigateTo: value => navigation.push(value.url),
  }
  function row(meal = target) {
    const id = `${account}:${meal.date}:${meal.mealType}`
    if (!rows.has(id)) rows.set(id, {
      id, revision: 1, status: 'draft', context: rules.normalizeContext({ ...meal, people: 2 }),
      draft: { planVersion: 1, dishes: [{ id: 7, name: '青菜' }], lockedDishIds: [], history: [] },
    })
    return rows.get(id)
  }
  function replace(id, patch) {
    const next = { ...rows.get(id), ...patch, revision: rows.get(id).revision + 1 }
    rows.set(id, next)
    return plain(next)
  }
  const api = {
    getUserPreferences: async () => ({ defaultPeople: 2 }),
    getMealWorkspace: async (date, mealType) => {
      const workspace = row({ date, mealType }), plan = plans.get(workspace.id) || null
      return plain({ workspace, plan, planRevision: plan ? plan.revision : 0 })
    },
    saveWorkspaceContext: async (id, body) => {
      calls.push({ type: 'context', id, body: plain(body) })
      return replace(id, { context: body.context })
    },
    commandMealWorkspace: async (id, body) => {
      calls.push({ type: 'command', id, body: plain(body) })
      const old = rows.get(id), draft = { ...old.draft, planVersion: old.draft.planVersion + 1 }
      if (body.command === 'select') draft.dishes = body.dishIds.map(id => ({ id, name: '菜' + id }))
      if (body.command === 'keep') draft.lockedDishIds = [body.dishId]
      if (body.command === 'release') draft.lockedDishIds = []
      return replace(id, { status: 'draft', draft })
    },
    confirmMealWorkspace: async (id, body) => {
      calls.push({ type: 'confirm', id, body: plain(body) })
      const old = rows.get(id), plan = { revision: body.expectedPlanRevision + 1, dishIds: old.draft.dishes.map(d => d.id), dishDetails: old.draft.dishes }
      const target = { date: body.targetDate || old.context.date, mealType: body.targetMealType || old.context.mealType }
      plans.set(`${account}:${target.date}:${target.mealType}`, plan)
      return replace(id, { status: 'planned', confirmation: { ...target, requestId: body.requestId, planVersion: body.planVersion, planRevision: plan.revision } })
    },
    getWorkspaceRequest: async () => null,
    recordBehaviorEvent: async () => {},
  }
  const sandbox = {
    module: { exports: {} }, wx, setTimeout, clearTimeout, console,
    require: name => name === './api' ? api : name === './util' ? util : name === './meal-workspace'
      ? { ...rules, createWorkspaceStore: () => rules.createWorkspaceStore({ api, identity: util.getCurrentUserIdentity, read: wx.getStorageSync, write: wx.setStorageSync }) }
      : require(path.resolve(__dirname, '../../utils', name)),
  }
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../utils/meal-workspace-page.js'), 'utf8'), sandbox)
  function createPage(mode = 'today') {
    const page = sandbox.module.exports({ mode })
    page.setData = value => Object.assign(page.data, value)
    page._alive = true
    return page
  }
  function createHistory() {
    let page
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../pages/assistant-history/assistant-history.js'), 'utf8'), {
      Page: value => { page = value }, wx, console,
      require: name => name.endsWith('/api') ? api : name.endsWith('/util') ? util
        : require(path.resolve(__dirname, '../../pages/assistant-history', name)),
    })
    page.setData = value => Object.assign(page.data, value)
    page.onLoad(target)
    return page
  }
  return { api, memory, rows, plans, navigation, calls, row, createPage, createHistory, wx, switchAccount: (next = 'B') => { account = next } }
}
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
module.exports = { fixture, deferred, plain, target }
