const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { fixture, target, plain } = require('./fixtures/workspace-flow')
const { deriveWorkspacePresentation } = require('../utils/meal-workspace-presentation')

function emptyMeal(f) {
  const row = f.row()
  row.status = 'empty'
  row.draft.dishes = []
  return row
}

// These assertions fail if the shared template restores duplicate first-screen
// inputs/navigation, or if the people control is moved back into advanced settings.
test('shared homepage keeps one optional requirements entry and an independent people control', () => {
  const template = fs.readFileSync('templates/meal-workspace.wxml', 'utf8')
  const firstScreen = template.split('<ui-sheet')[0]
  assert.match(firstScreen, /bindinput="onPeopleInput"/)
  assert.match(firstScreen, /bindtap="onPeopleStep"/)
  assert.match(firstScreen, /本餐要求（选填）/)
  assert.equal((firstScreen.match(/bindtap="onOpenRequirements"/g) || []).length, 1)
  assert.equal((firstScreen.match(/bindtap="onChooseDishes"/g) || []).length, 1)
  assert.doesNotMatch(firstScreen, /<textarea|补充要求|聊聊这餐|助手历史|bindtap="onQuickActual"/)
  assert.match(firstScreen, /hardExclusionSummary/)
  assert.match(firstScreen, /wx:if="\{\{advancedVisible\}\}"/)
  assert.match(template, /title="本餐要求（选填）"/)
  assert.doesNotMatch(template, /bind:change="onPeopleSetting"/)
  assert.match(template, /title="\{\{confirmationTitle\}\}"/)
})

test('empty, generated, planned and needs-input states have one explicit next action', () => {
  const view = { syncStatus: 'synced', context: target, draft: { dishes: [] } }
  assert.equal(deriveWorkspacePresentation({ ...view, status: 'empty' }).primaryLabel, '生成本餐菜单')
  assert.equal(deriveWorkspacePresentation({ ...view, status: 'draft', canConfirm: true }).primaryLabel, '保存到日历')
  assert.equal(deriveWorkspacePresentation({ ...view, status: 'planned', linkedPlan: {} }).primaryAction, 'onViewRecipes')
  assert.equal(deriveWorkspacePresentation({ ...view, status: 'needs_input' }).primaryLabel, '调整本餐要求')
})

for (const syncStatus of ['unknown', 'offline', 'conflict']) {
  test(`${syncStatus} recovery outranks generation and invalid people input`, () => {
    const view = deriveWorkspacePresentation({ status: 'empty', syncStatus, peopleError: '人数无效' })
    assert.equal(view.primaryAction, syncStatus === 'conflict' ? 'onLoadLatest' : 'onRetryWorkspace')
    assert.equal(view.primaryDisabled, false)
  })
}

test('saved meal people are restored and inline edits affect only the selected meal', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  f.api.getUserPreferences = async () => ({ defaultPeople: 6, excludedIngredients: ['花生'] })
  f.row().context.people = 4
  const other = { date: target.date, mealType: 'lunch' }, otherBefore = plain(f.row(other))
  await page.initializeWorkspace(target)
  assert.equal(page.data.peopleInput, '4')
  page.onPeopleInput({ detail: { value: '50' } })
  await page.flushDraft()
  assert.equal(page.data.context.people, 50)
  assert.equal(page.data.settingsVisible, false)
  assert.equal(f.calls[0].type, 'context')
  assert.equal(f.calls[0].body.context.people, 50)
  assert.deepEqual(f.row(other), otherBefore)
  assert.ok(f.calls.every(call => call.type !== 'preferences'))
})

test('inline stepper and numeric entry enforce integer people from 1 to 50', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  await page.initializeWorkspace(target)
  for (const value of ['', '0', '51', '1.5', 'bad']) {
    page.onPeopleInput({ detail: { value } })
    assert.equal(page.data.context.people, 2)
    assert.match(page.data.peopleError, /1.*50/)
    assert.equal(page.data.primaryDisabled, true)
  }
  page.onPeopleInput({ detail: { value: '1' } })
  page.onPeopleStep({ currentTarget: { dataset: { delta: -1 } } })
  assert.equal(page.data.context.people, 1)
  page.onPeopleInput({ detail: { value: '50' } })
  page.onPeopleStep({ currentTarget: { dataset: { delta: 1 } } })
  assert.equal(page.data.context.people, 50)
  page.onPeopleStep({ currentTarget: { dataset: { delta: -1 } } })
  assert.equal(page.data.context.people, 49)
  assert.equal(page.data.peopleError, '')
  assert.equal(page.data.primaryDisabled, false)
})

test('a new meal uses wrapped saved preferences without merging hard exclusions into current text', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  f.api.getMealWorkspace = async () => ({ workspace: null, planRevision: 0 })
  f.api.getUserPreferences = async () => ({ preferences: { defaultPeople: 5, excludedIngredients: ['花生'], excludedTagCodes: ['SPICY'] } })
  await page.initializeWorkspace(target)
  assert.equal(page.data.context.people, 5)
  assert.equal(page.data.context.requirements, '')
  assert.match(page.data.hardExclusionSummary, /花生/)
  assert.match(page.data.hardExclusionSummary, /香辣/)
})

test('clearing or canceling current requirements never clears saved hard exclusions', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  f.api.getUserPreferences = async () => ({ defaultPeople: 2, excludedIngredients: ['花生'] })
  f.row().context.requirements = '清淡一点'
  await page.initializeWorkspace(target)
  const summary = page.data.hardExclusionSummary
  page.onOpenRequirements()
  page.onClearRequirements()
  page.onCancelRequirements()
  assert.equal(page.data.context.requirements, '清淡一点')
  assert.equal(f.calls.length, 0)
  page.onOpenRequirements()
  page.onClearRequirements()
  await page.onApplyRequirements()
  assert.equal(page.data.context.requirements, '')
  assert.equal(page.data.hardExclusionSummary, summary)
  assert.match(summary, /花生/)
  assert.ok(f.calls.every(call => call.type === 'context'))
})

test('a blank optional requirement can generate using the selected target and people', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  emptyMeal(f)
  await page.initializeWorkspace(target)
  await page.onPrimaryAction()
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0].type, 'command')
  assert.equal(f.calls[0].body.command, 'generate')
  assert.equal(page.data.context.requirements, '')
})

test('needs-input presents the exact existing server reason without guessing a new reason', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  Object.assign(emptyMeal(f), { status: 'needs_input', message: '当前筛选范围内仅有一道菜，请调整条件。' })
  await page.initializeWorkspace(target)
  assert.equal(page.data.taskMessage, '当前筛选范围内仅有一道菜，请调整条件。')
  assert.equal(page.data.primaryAction, 'onOpenRequirements')
  assert.equal(page.data.primaryLabel, '调整本餐要求')
  assert.equal(f.calls.length, 0)
})

test('saving a generated menu takes one click and never records eaten', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  f.api.saveMealConsumption = async (...args) => { f.calls.push({ type: 'actual', args }) }
  await page.initializeWorkspace(target)
  await page.onPrimaryAction()
  assert.equal(page.data.confirmationVisible, false)
  assert.equal(f.calls[0].body.expectedPlanRevision, 0)
  assert.equal(f.calls.filter(call => call.type === 'actual').length, 0)
  const template = fs.readFileSync('templates/meal-workspace.wxml', 'utf8')
  assert.match(template, /workspace-save-target[^>]*>[\s\S]*?context.date[\s\S]*?mealName/)
  assert.match(template, /仅保存计划，不记录吃过/)
  assert.equal(f.calls.filter(call => call.type === 'confirm').length, 1)
  assert.equal(page.data.primaryAction, 'onViewRecipes')
  assert.equal(page.data.actual, null)
})

test('canceling the calendar confirmation prevents a stale approval from saving', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  f.plans.set(f.row().id, { revision: 1, recipeName: '原日历菜单', dishDetails: [{ id: 8, name: '原菜单' }] })
  await page.initializeWorkspace(target)
  page.onConfirmPlan()
  page.onCloseConfirmation()
  await page.onApproveReplacement()
  assert.equal(f.calls.length, 0)
})

test('advanced controls open separately and canceled settings do not overwrite inline people', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  await page.initializeWorkspace(target)
  page.onToggleAdvanced()
  assert.equal(page.data.advancedVisible, true)
  page.onOpenMealSettings()
  page.data.settingsContext.totalCookMinutes = 30
  page.onCloseMealSettings()
  page.onPeopleInput({ detail: { value: '4' } })
  page.onOpenMealSettings()
  assert.equal(page.data.settingsContext.people, 4)
  assert.equal(page.data.settingsContext.totalCookMinutes, null)
})

test('returning from preferences refreshes exclusions without replacing current-meal people', async t => {
  const f = fixture(), page = f.createPage()
  page._params = target
  t.after(() => page.onUnload())
  f.api.getUserPreferences = async () => ({ defaultPeople: 6, excludedIngredients: ['花生'] })
  await page.initializeWorkspace(target)
  f.api.getUserPreferences = async () => ({ defaultPeople: 8, excludedIngredients: ['虾'] })
  await page.onShow()
  assert.match(page.data.hardExclusionSummary, /虾/)
  assert.doesNotMatch(page.data.hardExclusionSummary, /花生/)
  assert.equal(page.data.context.people, 2)
  f.api.getUserPreferences = async () => { throw Error('offline') }
  await page.onShow()
  assert.match(page.data.hardExclusionSummary, /未读到/)
})

for (const change of ['meal', 'account']) {
  test(`invalid people input never follows a ${change} change`, async t => {
    const f = fixture(), page = f.createPage()
    t.after(() => page.onUnload())
    await page.initializeWorkspace(target)
    page.onPeopleInput({ detail: { value: '51' } })
    if (change === 'account') f.switchAccount()
    await page.initializeWorkspace({ ...target, mealType: 'lunch' })
    assert.equal(page.data.peopleError, '')
    assert.equal(page.data.peopleInput, '2')
    assert.equal(page.data.primaryDisabled, false)
  })
}

test('offline context controls cannot hide the recovery action by creating an unsynced edit', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  emptyMeal(f)
  await page.initializeWorkspace(target)
  f.api.getMealWorkspace = async () => { throw Error('offline') }
  await page.readWorkspace()
  page.onPeopleInput({ detail: { value: '4' } })
  page.onOpenRequirements()
  page.onOpenMealSettings()
  assert.equal(page.data.context.people, 2)
  assert.equal(page.data.requirementsVisible, false)
  assert.equal(page.data.settingsVisible, false)
  assert.equal(page.data.primaryAction, 'onRetryWorkspace')
})

test('late preference refresh cannot replace the next account hard exclusions', async t => {
  const f = fixture(), page = f.createPage()
  page._params = target
  t.after(() => page.onUnload())
  await page.initializeWorkspace(target)
  let finish
  f.api.getUserPreferences = () => new Promise(resolve => { finish = resolve })
  const old = page.onShow()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(typeof finish, 'function')
  f.switchAccount()
  f.api.getUserPreferences = async () => ({ defaultPeople: 3, excludedIngredients: ['虾'] })
  await page.initializeWorkspace(target)
  finish({ defaultPeople: 4, excludedIngredients: ['花生'] })
  await old
  assert.match(page.data.hardExclusionSummary, /虾/)
  assert.doesNotMatch(page.data.hardExclusionSummary, /花生/)
})

for (const [status, linkedPlan, expected] of [['generating', null, 'onCancelTask'], ['planned', {}, 'onViewRecipes'], ['plan_changed', {}, 'onViewPlan']]) {
  test(`invalid people input does not disable ${expected}`, () => {
    const view = deriveWorkspacePresentation({ status, linkedPlan, syncStatus: 'synced', peopleError: '人数无效' })
    assert.equal(view.primaryAction, expected)
    assert.equal(view.primaryDisabled, false)
  })
}

test('people edits cannot interrupt generation or disable its cancellation', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  Object.assign(f.row(), { status: 'generating', taskId: 'running' })
  await page.initializeWorkspace(target)
  page.onPeopleInput({ detail: { value: '51' } })
  page.onPeopleStep({ currentTarget: { dataset: { delta: 1 } } })
  assert.equal(page.data.peopleInput, '2')
  assert.equal(page.data.peopleError, '')
  assert.equal(page.data.context.people, 2)
  assert.equal(page.data.primaryDisabled, false)
  assert.equal(page.data.primaryAction, 'onCancelTask')
})

test('invalid people block direct generation and saving and invalidate an open calendar confirmation', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  f.plans.set(f.row().id, { revision: 1, recipeName: '原日历菜单', dishDetails: [{ id: 8, name: '原菜单' }] })
  await page.initializeWorkspace(target)
  page.onConfirmPlan()
  assert.equal(page.data.confirmationVisible, true)
  page.onPeopleInput({ detail: { value: '51' } })
  assert.equal(page.data.confirmationVisible, false)
  await page.onApproveReplacement()
  page.onConfirmPlan()
  assert.equal(page.data.confirmationVisible, false)
  await page.onGenerate()
  await page.onRegenerate()
  assert.equal(f.calls.length, 0)
})

for (const mode of ['today', 'result', 'assistant']) {
  test(`${mode} generates immediately after people input without a blur or a preference write`, async t => {
    const f = fixture(), page = f.createPage(mode)
    t.after(() => page.onUnload())
    emptyMeal(f)
    let preferenceWrites = 0, peopleAtGeneration
    f.api.updateUserPreferences = async () => { preferenceWrites++ }
    const generate = f.api.commandMealWorkspace
    f.api.commandMealWorkspace = async (id, body) => {
      peopleAtGeneration = f.row().context.people
      return generate(id, body)
    }
    await page.initializeWorkspace(target)
    page.onPeopleInput({ detail: { value: '7' } })
    await page.onPrimaryAction()
    assert.equal(peopleAtGeneration, 7)
    assert.equal(f.calls.length, 2)
    assert.equal(f.calls[0].type, 'context')
    assert.equal(f.calls[0].body.context.people, 7)
    assert.equal(f.calls[0].body.context.date, target.date)
    assert.equal(f.calls[0].body.context.mealType, target.mealType)
    assert.equal(f.calls[1].body.command, 'generate')
    assert.equal(preferenceWrites, 0)
  })
}

test('an unknown calendar save closes its confirmation so recovery remains visible and retries the original payload', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  f.plans.set(f.row().id, { revision: 1, recipeName: '原日历菜单', dishDetails: [{ id: 8, name: '原菜单' }] })
  const confirm = f.api.confirmMealWorkspace, sent = []
  f.api.confirmMealWorkspace = async (id, body) => { sent.push(plain(body)); throw { statusCode: 503 } }
  await page.initializeWorkspace(target)
  page.onConfirmPlan()
  await page.onApproveReplacement()
  assert.equal(page.data.confirmationVisible, false)
  assert.equal(page.data.primaryAction, 'onRetryWorkspace')
  assert.equal(page.data.primaryDisabled, false)
  f.api.confirmMealWorkspace = async (id, body) => { sent.push(plain(body)); return confirm(id, body) }
  await page.onPrimaryAction()
  assert.deepEqual(sent[1], sent[0])
  assert.equal(page.data.primaryAction, 'onViewRecipes')
  assert.equal(page.data.actual, null)
})

for (const fails of [false, true]) {
  test(`a late ${fails ? 'failed' : 'successful'} exclusion refresh cannot overwrite the newest summary for the same meal`, async t => {
    const f = fixture(), page = f.createPage()
    t.after(() => page.onUnload())
    await page.initializeWorkspace(target)
    let finishOld, failOld, finishNew, reads = 0
    const old = new Promise((resolve, reject) => { finishOld = resolve; failOld = reject })
    const latest = new Promise(resolve => { finishNew = resolve })
    f.api.getUserPreferences = () => ++reads === 1 ? old : latest
    const first = page.refreshHardExclusions()
    const second = page.refreshHardExclusions()
    finishNew({ defaultPeople: 2, excludedIngredients: ['虾'] })
    await second
    assert.match(page.data.hardExclusionSummary, /虾/)
    if (fails) failOld(Error('old request failed'))
    else finishOld({ defaultPeople: 2, excludedIngredients: ['花生'] })
    await first
    assert.match(page.data.hardExclusionSummary, /虾/)
    assert.doesNotMatch(page.data.hardExclusionSummary, /花生|未读到/)
  })
}

test('the homepage shows saved exclusions and failed reads but hides a confirmed empty list', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  f.api.getUserPreferences = async () => ({ defaultPeople: 2, excludedIngredients: [], excludedTagCodes: [] })
  await page.initializeWorkspace(target)
  assert.equal(page.data.hasHardExclusions, false)
  assert.equal(page.data.hardExclusionsUnavailable, false)
  f.api.getUserPreferences = async () => ({ defaultPeople: 2, excludedIngredients: ['花生'] })
  await page.refreshHardExclusions()
  assert.equal(page.data.hasHardExclusions, true)
  assert.equal(page.data.hardExclusionsUnavailable, false)
  f.api.getUserPreferences = async () => { throw Error('offline') }
  await page.refreshHardExclusions()
  assert.equal(page.data.hardExclusionsUnavailable, true)
  assert.match(page.data.hardExclusionSummary, /未读到/)
  const template = fs.readFileSync('templates/meal-workspace.wxml', 'utf8')
  assert.match(template, /wx:if="\{\{hasHardExclusions \|\| hardExclusionsUnavailable\}\}" class="workspace-exclusions"/)
})

test('a new draft can be saved after independently recording actual food without changing that record', async t => {
  const f = fixture(), page = f.createPage(), actual = { status: 'eaten', source: 'independent', description: '外食面条' }
  t.after(() => page.onUnload())
  f.api.saveMealConsumption = async (...args) => { f.calls.push({ type: 'actual', args }) }
  emptyMeal(f)
  const read = f.api.getMealWorkspace, generate = f.api.commandMealWorkspace
  f.api.getMealWorkspace = async (...args) => ({ ...await read(...args), actual: plain(actual) })
  f.api.commandMealWorkspace = async (id, body) => {
    if (body.command === 'generate') f.row().draft.dishes = [{ id: 7, name: '青菜' }]
    return generate(id, body)
  }
  await page.initializeWorkspace(target)
  assert.deepEqual(plain(page.data.actual), actual)
  await page.onGenerate()
  assert.equal(page.data.primaryLabel, '保存到日历')
  assert.equal(page.data.primaryAction, 'onConfirmPlan')
  await page.onPrimaryAction()
  assert.equal(f.calls.filter(call => call.type === 'confirm').length, 1)
  assert.deepEqual(plain(page.data.actual), actual)
  assert.equal(f.calls.filter(call => call.type === 'actual').length, 0)
})

for (const [statusCode, syncStatus, primaryAction] of [[503, 'unknown', 'onRetryWorkspace'], [409, 'conflict', 'onLoadLatest']]) {
  test(`failed requirements save ${statusCode} exposes recovery immediately and cancel does not reapply its text`, async t => {
    const f = fixture(), page = f.createPage(), submitted = []
    t.after(() => page.onUnload())
    f.api.saveWorkspaceContext = async (id, body) => {
      submitted.push(plain(body))
      throw Object.assign(Error('requirements save failed'), { statusCode })
    }
    await page.initializeWorkspace(target)
    page.onOpenRequirements()
    page.onRequirementsDraftInput({ detail: { value: '本餐不要鸡蛋' } })
    await page.onApplyRequirements()
    assert.equal(page.store.state().syncStatus, syncStatus)
    assert.equal(page.data.syncStatus, syncStatus)
    const pendingBeforeCancel = plain(page.store.state().pending)
    page.onCancelRequirements()
    assert.equal(page.data.requirementsVisible, false)
    assert.equal(page.data.context.requirements, '本餐不要鸡蛋')
    assert.equal(page.data.requirementsDraft, '本餐不要鸡蛋')
    assert.equal(page.data.primaryAction, primaryAction)
    assert.equal(page.data.primaryDisabled, false)
    assert.equal(submitted.length, 1)
    assert.equal(submitted[0].context.requirements, '本餐不要鸡蛋')
    assert.deepEqual(plain(page.store.state().pending), pendingBeforeCancel)
  })
}
