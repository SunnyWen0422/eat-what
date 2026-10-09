const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture, deferred, plain } = require('./fixtures/workspace-flow')
const previous = { date: '2026-10-06', mealType: 'lunch' }
const imported = { date: '2026-10-07', mealType: 'dinner' }
const event = { currentTarget: { dataset: { index: 0 } } }
function historyFixture() {
  const f = fixture()
  let version = 4
  f.memory.set('A:activeMealTarget', previous)
  f.api.getAssistantSessions = async () => ({ sessions: [{ sessionId: 'history-s', updatedAt: 1791244800 }], nextCursor: null })
  f.api.getAssistantSession = async () => ({ session_id: 'history-s', state: { plan: { version, period: { people: 3 }, meals: [{ date: imported.date, meal_type: imported.mealType, dishes: [{ id: 8, name: '蛋汤' }] }] } } })
  const history = f.createHistory()
  async function browse() {
    await history.onShow()
    await history.onOpenSession({ currentTarget: { dataset: { id: 'history-s' } } })
  }
  async function handoff() { await browse(); await history.onImportMeal(event) }
  return { ...f, history, browse, handoff, changeVersion: value => { version = value } }
}

test('browsing historical meals does not change the account active target or draft', async () => {
  const f = historyFixture()
  await f.browse()
  assert.deepEqual(f.memory.get('A:activeMealTarget'), previous)
  assert.equal(f.memory.has('A:pendingLegacyMealImport'), false)
  assert.equal(f.calls.length, 0)
  assert.equal(f.navigation.length, 0)
})

test('validated history import stays selected through assistant to result and return', async t => {
  const f = historyFixture(), assistant = f.createPage('assistant'), result = f.createPage('result')
  t.after(() => { assistant.onUnload(); result.onUnload() })
  f.memory.set('B:activeMealTarget', previous)
  await f.handoff()
  assert.equal(f.navigation[0], '/pages/chat/chat?date=2026-10-07&mealType=dinner&import=history')
  await assistant.initializeWorkspace({ ...imported, import: 'history' })
  assert.equal(assistant.data.context.date, imported.date)
  assert.equal(assistant.data.context.people, 3)
  assert.equal(assistant.data.draft.dishes[0].id, 8)
  assert.deepEqual(f.memory.get('A:activeMealTarget'), imported)
  assert.deepEqual(f.memory.get('B:activeMealTarget'), previous)
  assert.equal(f.memory.has('A:pendingLegacyMealImport'), false)
  await assistant.onOpenMealResult()
  assistant.onHide()
  await result.initializeWorkspace(imported)
  assert.equal(result.data.draft.dishes[0].id, 8)
  result.onUnload()
  await assistant.onShow()
  assert.equal(assistant.data.context.date, imported.date)
  assert.equal(assistant.data.context.mealType, imported.mealType)
  assert.equal(assistant.data.draft.dishes[0].id, 8)
  assert.equal(f.calls.filter(call => call.type === 'command').length, 1)
  assert.equal(f.navigation[1], '/pages/result/result?date=2026-10-07&mealType=dinner')
})

test('a version change before explicit history handoff does not select a new target', async () => {
  const f = historyFixture()
  await f.browse()
  f.changeVersion(5)
  await f.history.onImportMeal(event)
  assert.deepEqual(f.memory.get('A:activeMealTarget'), previous)
  assert.equal(f.memory.has('A:pendingLegacyMealImport'), false)
  assert.equal(f.navigation.length, 0)
  assert.match(f.history.data.errorMessage, /更新/)
})

test('assistant revalidation rejects an updated history version before selecting its target', async t => {
  const f = historyFixture(), page = f.createPage('assistant')
  t.after(() => page.onUnload())
  await f.handoff()
  f.changeVersion(5)
  await page.initializeWorkspace({ ...imported, import: 'history' })
  assert.deepEqual(f.memory.get('A:activeMealTarget'), previous)
  assert.equal(f.calls.length, 0)
  assert.match(page.data.errorMessage, /更新/)
  assert.equal(page.data.draft.dishes[0].id, 7)
})

test('a route alone without a validated explicit handoff does not change the shared target', async t => {
  const f = historyFixture(), page = f.createPage('assistant')
  t.after(() => page.onUnload())
  await page.initializeWorkspace({ ...imported, import: 'history' })
  assert.deepEqual(f.memory.get('A:activeMealTarget'), previous)
  assert.equal(f.calls.length, 0)
})

test('an account switch during history validation cannot hand off or select another account target', async () => {
  const f = historyFixture(), pending = deferred()
  await f.browse()
  const session = await f.api.getAssistantSession()
  f.api.getAssistantSession = () => pending.promise
  const opening = f.history.onImportMeal(event)
  f.switchAccount()
  f.memory.set('B:activeMealTarget', previous)
  pending.resolve(session)
  await opening
  assert.deepEqual(f.memory.get('A:activeMealTarget'), previous)
  assert.deepEqual(f.memory.get('B:activeMealTarget'), previous)
  assert.equal(f.memory.has('B:pendingLegacyMealImport'), false)
  assert.equal(f.navigation.length, 0)
})

test('an account switch during assistant revalidation cannot import or change the new target', async t => {
  const f = historyFixture(), page = f.createPage('assistant'), pending = deferred(), started = deferred()
  t.after(() => page.onUnload())
  await f.handoff()
  const session = await f.api.getAssistantSession()
  f.api.getAssistantSession = () => { started.resolve(); return pending.promise }
  const opening = page.initializeWorkspace({ ...imported, import: 'history' })
  await started.promise
  f.switchAccount()
  f.memory.set('B:activeMealTarget', previous)
  await page.initializeWorkspace(previous)
  const newAccountData = plain(page.data)
  pending.resolve(session)
  await opening
  assert.deepEqual(f.memory.get('A:activeMealTarget'), previous)
  assert.deepEqual(f.memory.get('B:activeMealTarget'), previous)
  assert.equal(f.calls.length, 0)
  assert.deepEqual(plain(page.data), newAccountData)
})

test('a replaced workspace initialization invalidates a pending history import', async t => {
  const f = historyFixture(), page = f.createPage('assistant'), pending = deferred(), started = deferred()
  t.after(() => page.onUnload())
  await f.handoff()
  const session = await f.api.getAssistantSession()
  f.api.getAssistantSession = () => { started.resolve(); return pending.promise }
  const opening = page.initializeWorkspace({ ...imported, import: 'history' })
  await started.promise
  await page.switchTarget(previous)
  pending.resolve(session)
  await opening
  assert.deepEqual(f.memory.get('A:activeMealTarget'), {...previous,selectedOn:require('../utils/meal-workspace').defaultTarget().date})
  assert.equal(page.data.context.date, previous.date)
  assert.equal(page.data.context.mealType, previous.mealType)
  assert.equal(f.calls.length, 0)
})

test('a conflicted select preserves the explicitly chosen target without claiming a successful import', async t => {
  const f = historyFixture(), page = f.createPage('assistant')
  t.after(() => page.onUnload())
  await f.handoff()
  f.api.commandMealWorkspace = async () => { throw { statusCode: 409 } }
  await page.initializeWorkspace({ ...imported, import: 'history' })
  assert.equal(page.data.syncStatus, 'conflict')
  assert.deepEqual(f.memory.get('A:activeMealTarget'), imported)
  assert.equal(page.data.draft.dishes[0].id, 7)
})

test('unknown selection stays on its explicitly chosen target through onShow and original-request retry', async t => {
  const f = historyFixture(), page = f.createPage('assistant'), sent = []
  t.after(() => page.onUnload())
  await f.handoff()
  const original = f.api.commandMealWorkspace
  f.api.commandMealWorkspace = async (id, body) => { sent.push(plain(body)); throw { statusCode: 503 } }
  await page.initializeWorkspace({ ...imported, import: 'history' })
  assert.equal(page.data.syncStatus, 'unknown')
  assert.deepEqual(f.memory.get('A:activeMealTarget'), imported)
  page.onHide()
  await page.onShow()
  assert.equal(page.data.context.date, imported.date)
  assert.equal(page.data.context.mealType, imported.mealType)
  assert.equal(page.data.syncStatus, 'unknown')
  await page.onRetryWorkspace()
  assert.deepEqual(f.memory.get('A:activeMealTarget'), imported)
  f.api.commandMealWorkspace = async (id, body) => { sent.push(plain(body)); return original(id, body) }
  await page.onRetryWorkspace()
  assert.deepEqual(sent, [sent[0], sent[0], sent[0]])
  assert.deepEqual(f.memory.get('A:activeMealTarget'), imported)
  assert.equal(page.data.draft.dishes[0].id, 8)
  await page.onShow()
  assert.equal(page.data.context.date, imported.date)
  assert.equal(page.data.context.mealType, imported.mealType)
})

test('failed context save keeps the chosen target but cannot claim the history selection succeeded', async t => {
  const f = historyFixture(), page = f.createPage('assistant')
  t.after(() => page.onUnload())
  await f.handoff()
  const original = f.api.saveWorkspaceContext
  f.api.saveWorkspaceContext = async () => { throw { statusCode: 503 } }
  await page.initializeWorkspace({ ...imported, import: 'history' })
  f.api.saveWorkspaceContext = original
  await page.onRetryWorkspace()
  assert.deepEqual(f.memory.get('A:activeMealTarget'), imported)
  assert.equal(page.data.draft.dishes[0].id, 7)
  assert.equal(f.calls.filter(call => call.type === 'command').length, 0)
})

for (const retry of [false, true]) {
  test(`account switch during ${retry ? 'import retry' : 'initial import select'} cannot commit a stale target`, async t => {
    const f = historyFixture(), page = f.createPage('assistant'), pending = deferred(), started = deferred()
    t.after(() => page.onUnload())
    await f.handoff()
    const original = f.api.commandMealWorkspace
    if (retry) {
      f.api.commandMealWorkspace = async () => { throw { statusCode: 503 } }
      await page.initializeWorkspace({ ...imported, import: 'history' })
    }
    f.api.commandMealWorkspace = async (id, body) => { started.resolve(); await pending.promise; return original(id, body) }
    const opening = retry ? page.onRetryWorkspace() : page.initializeWorkspace({ ...imported, import: 'history' })
    await started.promise
    f.switchAccount()
    f.memory.set('B:activeMealTarget', previous)
    await page.initializeWorkspace(previous)
    const newAccountData = plain(page.data)
    pending.resolve()
    await opening
    assert.deepEqual(f.memory.get('A:activeMealTarget'), imported)
    assert.deepEqual(f.memory.get('B:activeMealTarget'), previous)
    assert.deepEqual(plain(page.data), newAccountData)
  })
}
