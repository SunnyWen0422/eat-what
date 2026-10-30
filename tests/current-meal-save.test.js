const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture, deferred, plain, target } = require('./fixtures/workspace-flow')

function pendingAssistant(f, state, workspace = f.row()) {
  const scope = require('../utils/config').getApiBaseUrl() + '|A'
  const key = 'assistant-v4:' + encodeURIComponent(scope) + ':' + workspace.id
  const row = { sessionBody: { workspaceId: workspace.id }, sessionId: 'assistant-session',
    pending: state === 'unknown' ? { requestId: 'assistant-original' } : { turnId: 'assistant-turn' },
    lastTurn: state === 'unknown' ? null : { status: state === 'busy' ? 'running' : 'awaiting_confirmation' } }
  f.memory.set(key, plain(row))
  return key
}

for (const pending of ['unknown', 'busy', 'confirmation']) for (const alreadyOpen of [false, true]) {
  test(`a ${pending} assistant operation blocks calendar writes ${alreadyOpen ? 'after the target picker opens' : 'from every save entry'}`, async t => {
    const f = fixture({ journals: true }), page = f.createPage()
    t.after(() => page.onUnload())
    await page.initializeWorkspace(target)
    if (alreadyOpen) { page.onOpenSaveTarget(); assert.equal(page.data.confirmationVisible, true) }
    const key = pendingAssistant(f, pending), original = plain(f.memory.get(key))
    if (alreadyOpen) await page.onApproveReplacement()
    else {
      page.renderWorkspace()
      assert.equal(page.data.primaryAction, 'onRecoverJourney')
      await page.onConfirmPlan()
      page.onToggleExtraActions(); page.onOpenSaveTarget()
      await page.onApproveReplacement()
    }
    assert.equal(f.calls.length, 0, 'unresolved assistant work cannot be bypassed by another save entry')
    assert.equal(page.data.confirmationVisible, false)
    assert.equal(page.data.primaryAction, 'onRecoverJourney')
    assert.deepEqual(f.memory.get(key), original)
  })
}

test('an unresolved assistant operation belonging to another meal does not block this save', async t => {
  const f = fixture({ journals: true }), page = f.createPage()
  t.after(() => page.onUnload())
  await page.initializeWorkspace(target)
  const other = f.row({ date: '2026-10-07', mealType: 'lunch' })
  f.memory.set('user:A:meal-workspace:2026-10-07:lunch', { workspace: plain(other), syncStatus: 'synced' })
  pendingAssistant(f, 'unknown', other)
  page.renderWorkspace()
  await page.onConfirmPlan()
  assert.equal(page.data.saveState, 'saved')
  assert.equal(f.calls.filter(call => call.type === 'confirm').length, 1)
})

for (const statusCode of [400, 403]) {
  test(`a definite save rejection ${statusCode} keeps the meal and offers a read before any new write`, async t => {
    const f = fixture(), page = f.createPage(), original = f.api.confirmMealWorkspace
    t.after(() => page.onUnload())
    await page.initializeWorkspace(target)
    const before = plain(page.data.draft.dishes)
    let attempts = 0
    const reason = '菜单包含已下架菜品，请重新选菜'
    f.api.confirmMealWorkspace = async () => { attempts++; throw { statusCode, message: reason } }
    await page.onConfirmPlan()
    assert.deepEqual(plain(page.data.draft.dishes), before)
    assert.equal(page.store.state().pending, null)
    assert.equal(page.data.primaryAction, 'onRetryWorkspace')
    assert.equal(page.data.primaryLabel, '重新读取这餐')
    assert.equal(page.data.resultNotice.text, reason, 'the visible notice must explain the rejection')
    assert.equal(page.data.confirmationVisible, false)
    f.api.confirmMealWorkspace = original
    await page.onPrimaryAction()
    assert.equal(attempts, 1)
    assert.equal(f.calls.length, 0, 'rereading never saves or regenerates implicitly')
    assert.equal(page.data.primaryAction, 'onConfirmPlan')
    await page.onPrimaryAction()
    assert.equal(page.data.saveState, 'saved')
  })
}

test('a direct-save conflict rereads the current record and requires explicit replacement', async t => {
  const f = fixture(), page = f.createPage(), original = f.api.confirmMealWorkspace
  t.after(() => page.onUnload())
  await page.initializeWorkspace(target)
  f.api.confirmMealWorkspace = async () => { throw { statusCode: 409, message: '这餐已有更新' } }
  await page.onConfirmPlan()
  assert.equal(page.data.primaryAction, 'onLoadLatest')
  f.plans.set(f.row().id, { revision: 5, recipeName: '另一设备保存的菜单', dishDetails: [{ id: 9, name: '南瓜汤' }] })
  f.api.confirmMealWorkspace = original
  await page.onPrimaryAction()
  assert.equal(f.calls.length, 0)
  await page.onConfirmPlan()
  assert.equal(page.data.confirmationVisible, true)
  assert.match(page.data.confirmationText, /另一设备保存的菜单/)
  assert.equal(f.calls.length, 0)
  await page.onApproveReplacement()
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].body.expectedPlanRevision, 5)
})

test('generate then save completes the current empty calendar slot in two primary actions', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  Object.assign(f.row(), { status: 'empty', draft: { planVersion: 0, dishes: [], history: [], lockedDishIds: [] } })
  const original = f.api.commandMealWorkspace
  f.api.commandMealWorkspace = async (...args) => {
    const result = await original(...args)
    result.draft.dishes = [{ id: 7, name: '青菜', type: 'veg' }]
    f.rows.set(result.id, plain(result))
    return result
  }
  await page.initializeWorkspace(target)
  assert.equal(page.data.primaryAction, 'onGenerate')
  await page.onPrimaryAction()
  assert.equal(page.data.primaryAction, 'onConfirmPlan')
  await page.onPrimaryAction()
  assert.equal(page.data.confirmationVisible, false)
  assert.equal(page.data.saveState, 'saved')
  assert.equal(f.calls.filter(call => call.type === 'confirm').length, 1)
  assert.deepEqual(f.plans.get('A:' + target.date + ':' + target.mealType).dishIds, [7])
})

test('existing record is shown before one explicit replacement confirmation; cancel writes nothing', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  f.plans.set(f.row().id, { revision: 3, recipeName: '原菜单', dishIds: [8], dishDetails: [{ id: 8, name: '原菜单' }] })
  await page.initializeWorkspace(target)
  await page.onConfirmPlan()
  assert.equal(page.data.confirmationVisible, true)
  assert.match(page.data.confirmationText, /原菜单/)
  assert.match(page.data.confirmationText, /青菜/)
  page.onCloseConfirmation()
  assert.equal(f.calls.length, 0)
  await page.onConfirmPlan()
  assert.equal(page.data.confirmationLabel, '确认替换')
  await page.onApproveReplacement()
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].body.expectedPlanRevision, 3)
  assert.equal(page.data.saveState, 'saved')
})

test('direct save stays on the meal while busy and ignores repeated taps', async t => {
  const f = fixture(), page = f.createPage(), gate = deferred(), started = deferred()
  t.after(() => page.onUnload())
  const original = f.api.confirmMealWorkspace
  let writes = 0
  f.api.confirmMealWorkspace = async (...args) => { writes++; started.resolve(); await gate.promise; return original(...args) }
  await page.initializeWorkspace(target)
  const saving = page.onConfirmPlan()
  await Promise.race([started.promise, saving])
  assert.equal(writes, 1)
  assert.equal(page.data.busy, true)
  page.renderWorkspace()
  assert.equal(page.data.confirmationVisible, false)
  await page.onPrimaryAction()
  await page.onConfirmPlan()
  assert.equal(writes, 1)
  gate.resolve()
  await saving
  assert.equal(page.data.saveState, 'saved')
  assert.equal(page.data.primaryDisabled, false)
})

test('unknown direct save remains inline after reopening and resumes the same request', async t => {
  const f = fixture(), page = f.createPage(), attempted = []
  let next
  t.after(() => { page.onUnload(); if (next) next.onUnload() })
  const original = f.api.confirmMealWorkspace
  f.api.confirmMealWorkspace = async (id, body) => { attempted.push(plain(body)); throw { statusCode: 503 } }
  await page.initializeWorkspace(target)
  await page.onConfirmPlan()
  assert.equal(page.data.syncStatus, 'unknown')
  assert.equal(page.data.confirmationVisible, false)
  assert.equal(page.data.primaryLabel, '继续完成保存')
  page.onUnload()
  next = f.createPage()
  await next.initializeWorkspace(target)
  assert.equal(next.data.confirmationVisible, false)
  assert.equal(next.data.primaryAction, 'onRetryWorkspace')
  f.api.confirmMealWorkspace = async (id, body) => { attempted.push(plain(body)); return original(id, body) }
  await next.onPrimaryAction()
  assert.deepEqual(attempted[1], attempted[0])
  assert.equal('presentation' in attempted[0], false, 'UI intent never changes the API payload')
  assert.equal(next.data.saveState, 'saved')
})

test('a lost successful save response is recovered without resubmitting the write', async t => {
  const f = fixture(), page = f.createPage(), original = f.api.confirmMealWorkspace
  t.after(() => page.onUnload())
  let receipt
  f.api.confirmMealWorkspace = async (...args) => { receipt = await original(...args); throw { statusCode: 503 } }
  await page.initializeWorkspace(target)
  await page.onConfirmPlan()
  assert.equal(page.data.syncStatus, 'unknown')
  f.api.getWorkspaceRequest = async (id, requestId) => {
    assert.equal(requestId, receipt.confirmation.requestId)
    return receipt
  }
  f.api.confirmMealWorkspace = async () => { throw Error('Successful save must not be sent again') }
  await page.onPrimaryAction()
  assert.equal(f.calls.filter(call => call.type === 'confirm').length, 1)
  assert.equal(page.data.saveState, 'saved')
})

test('a removed target picker cannot change where the current menu is saved', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  await page.initializeWorkspace(target)
  page.setData({ moreVisible: true })
  page.onOpenSaveTarget()
  assert.equal(page.data.moreVisible, false)
  assert.equal(page.data.confirmationVisible, true)
  assert.equal(f.calls.length, 0)
  await page.onSaveTargetDate({ detail: { value: '2026-10-07' } })
  await page.onApproveReplacement()
  assert.equal(f.calls[0].body.targetDate, target.date)
  assert.equal(page.data.context.date, target.date)
})

for (const transition of ['account', 'target', 'unload']) for (const failure of [false, true]) {
  test(`late direct-save ${failure ? 'failure' : 'success'} cannot change the page after ${transition}`, async t => {
    const f = fixture(), page = f.createPage(), gate = deferred(), started = deferred(), original = f.api.confirmMealWorkspace
    t.after(() => page.onUnload())
    f.api.confirmMealWorkspace = async (...args) => {
      // A success is committed for the original identity before its delayed response.
      const result = failure ? null : await original(...args)
      started.resolve(); await gate.promise
      if (failure) throw { statusCode: 503 }
      return result
    }
    await page.initializeWorkspace(target)
    const saving = page.onConfirmPlan()
    await Promise.race([started.promise, saving])
    assert.equal(page.data.busy, true)
    if (transition === 'account') { f.switchAccount(); await page.initializeWorkspace(target) }
    else if (transition === 'target') await page.initializeWorkspace({ date: '2026-10-07', mealType: 'lunch' })
    else page.onUnload()
    const visible = () => plain({ error: page.data.errorMessage, context: page.data.context, draft: page.data.draft, busy: page.data.busy, saved: page.data.saveState })
    const before = visible()
    gate.resolve(); await saving
    assert.deepEqual(visible(), before)
    if (transition === 'account') assert.equal(f.plans.has(`B:${target.date}:${target.mealType}`), false)
  })
}
