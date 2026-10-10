const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture, deferred, target } = require('./fixtures/workspace-flow')

for (const command of ['select', 'keep', 'cancel']) {
  test(`primary action is usable after ${command} settles`, async t => {
    const f = fixture(), page = f.createPage()
    t.after(() => page.onUnload())
    if (command === 'cancel') Object.assign(f.row(), { status: 'generating', taskId: 'running' })
    await page.initializeWorkspace(target)
    await page.runCommand(command, { dishIds: [7], dishId: 7 })
    assert.equal(page.data.busy, false)
    assert.equal(page.data.primaryDisabled, false)
    assert.equal(page.data.primaryAction, 'onConfirmPlan')
    await page.onPrimaryAction()
    assert.equal(page.data.confirmationVisible, true)
    assert.equal(f.calls.filter(c => c.type === 'confirm').length, 0)
    await page.onApproveReplacement()
    assert.equal(f.calls.filter(c => c.type === 'confirm').length, 1)
  })
}

test('confirmed plan enables the cooking action after its refresh finishes', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  await page.initializeWorkspace(target)
  await page.onConfirmPlan()
  await page.onApproveReplacement()
  assert.equal(page.data.busy, false)
  assert.equal(page.data.primaryDisabled, false)
  assert.equal(page.data.primaryAction, 'onViewRecipes')
})

test('command failure and original-payload retry both leave the primary action usable', async t => {
  const f = fixture(), page = f.createPage(), original = f.api.commandMealWorkspace, sent = []
  t.after(() => page.onUnload())
  f.api.commandMealWorkspace = async (id, body) => { sent.push(JSON.parse(JSON.stringify(body))); throw { statusCode: 503 } }
  await page.initializeWorkspace(target)
  await page.runCommand('select', { dishIds: [7] })
  assert.equal(page.data.syncStatus, 'unknown')
  assert.equal(page.data.primaryAction, 'onRetryWorkspace')
  assert.equal(page.data.primaryDisabled, false)
  await page.onRetryWorkspace()
  assert.equal(page.data.primaryDisabled, false)
  f.api.commandMealWorkspace = async (id, body) => { sent.push(JSON.parse(JSON.stringify(body))); return original(id, body) }
  await page.onRetryWorkspace()
  assert.equal(page.data.syncStatus, 'synced')
  assert.equal(page.data.primaryDisabled, false)
  assert.deepEqual(sent, [sent[0], sent[0], sent[0]])
})

test('failed confirmation can be retried without leaving its next action disabled', async t => {
  const f = fixture(), page = f.createPage(), original = f.api.confirmMealWorkspace
  t.after(() => page.onUnload())
  await page.initializeWorkspace(target)
  f.api.confirmMealWorkspace = async () => { throw { statusCode: 503 } }
  await page.onConfirmPlan()
  await page.onApproveReplacement()
  assert.equal(page.data.primaryAction, 'onRetryWorkspace')
  assert.equal(page.data.primaryDisabled, false)
  f.api.confirmMealWorkspace = original
  await page.onRetryWorkspace()
  assert.equal(page.data.primaryAction, 'onViewRecipes')
  assert.equal(page.data.primaryDisabled, false)
})

test('conflict reload success and failure derive the current enabled action', async t => {
  const f = fixture(), page = f.createPage(), original = f.api.getMealWorkspace
  t.after(() => page.onUnload())
  await page.initializeWorkspace(target)
  f.api.commandMealWorkspace = async () => { throw { statusCode: 409 } }
  await page.runCommand('keep', { dishId: 7 })
  assert.equal(page.data.primaryAction, 'onLoadLatest')
  assert.equal(page.data.primaryDisabled, false)
  f.api.getMealWorkspace = async () => { throw Error('offline') }
  await page.onLoadLatest()
  assert.equal(page.data.primaryAction, 'onRetryWorkspace')
  assert.equal(page.data.primaryDisabled, false)
  f.api.getMealWorkspace = original
  await page.onLoadLatest()
  assert.equal(page.data.primaryAction, 'onConfirmPlan')
  assert.equal(page.data.primaryDisabled, false)
})

test('busy state disables the primary action and still blocks duplicate submissions', async t => {
  const f = fixture(), page = f.createPage(), pending = deferred(), started = deferred()
  t.after(() => page.onUnload())
  await page.initializeWorkspace(target)
  let commands = 0
  const original = f.api.commandMealWorkspace
  f.api.commandMealWorkspace = async (id, body) => { commands++; started.resolve(); await pending.promise; return original(id, body) }
  const running = page.runCommand('keep', { dishId: 7 })
  await started.promise
  assert.equal(page.data.busy, true)
  const disabledWhileBusy = page.data.primaryDisabled
  await page.onPrimaryAction()
  await page.runCommand('select', { dishIds: [8] })
  assert.equal(commands, 1)
  assert.equal(f.calls.filter(c => c.type === 'confirm').length, 0)
  pending.resolve()
  await running
  assert.equal(disabledWhileBusy, true)
  assert.equal(page.data.primaryDisabled, false)
})

test('unsaved context cannot be confirmed even when the page is idle', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  await page.initializeWorkspace(target)
  page.store.edit({ ...page.data.context, requirements: '不要花生' })
  page.renderWorkspace()
  assert.equal(page.data.canConfirm, false)
  await page.onConfirmPlan()
  assert.equal(f.calls.length, 0)
})

for (const fail of [false, true]) {
  test(`late command ${fail ? 'failure' : 'success'} cannot clear the next account busy state`, async t => {
    const f = fixture(), page = f.createPage(), old = deferred(), next = deferred(), oldStarted = deferred(), nextStarted = deferred()
    t.after(() => page.onUnload())
    const original = f.api.commandMealWorkspace
    f.api.commandMealWorkspace = async (id, body) => {
      if (id.startsWith('A:')) { oldStarted.resolve(); await old.promise }
      else { nextStarted.resolve(); await next.promise }
      return original(id, body)
    }
    await page.initializeWorkspace(target)
    const oldRun = page.runCommand('keep', { dishId: 7 })
    await oldStarted.promise
    f.switchAccount()
    await page.initializeWorkspace(target)
    const nextRun = page.runCommand('select', { dishIds: [8] })
    await nextStarted.promise
    if (fail) old.reject(Error('old failure')); else old.resolve()
    await oldRun
    const stateAfterOld = { busy: page.data.busy, disabled: page.data.primaryDisabled, error: page.data.errorMessage }
    next.resolve()
    await nextRun
    assert.deepEqual(stateAfterOld, { busy: true, disabled: true, error: '' })
    assert.equal(page.data.primaryDisabled, false)
    assert.equal(page.data.draft.dishes[0].id, 8)
  })
}
