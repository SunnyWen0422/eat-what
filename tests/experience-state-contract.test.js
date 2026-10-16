const test = require('node:test')
const assert = require('node:assert/strict')
const { deriveWorkspacePresentation } = require('../utils/meal-workspace-presentation')
const { normalizeContext } = require('../utils/meal-workspace')
const { fixture, plain, target } = require('./fixtures/workspace-flow')

const current = { date: '2026-12-31', mealType: 'lunch' }
const saved = { date: '2027-01-01', mealType: 'dinner' }
function input(patch = {}) {
  return {
    context: normalizeContext({ ...current, people: 2 }),
    draft: { planVersion: 3, dishes: [{ id: 7, name: '青菜', type: 'vegetable' }], history: [] },
    status: 'draft', syncStatus: 'synced', canConfirm: true,
    saveState: 'unsaved', savedTarget: null, ...patch,
  }
}
const receipt = (state, kind = 'assistant', meal = current) => ({ state, kind, target: { ...meal }, label: '核对本餐请求' })

// Break: deriving the editing label/next action from the calendar receipt or Today.
test('saved target and current draft remain separate', () => {
  const value = input({ saveState: 'changed', savedTarget: saved }), before = plain(value)
  const view = deriveWorkspacePresentation(value)
  assert.equal(view.contextLabel, '2026年12月31日午餐 · 2人')
  assert.equal(view.menuState, 'changed')
  assert.deepEqual(view.resultNotice.target, saved)
  assert.notDeepEqual(view.resultNotice.target, current)
  assert.equal(view.resultNotice.action, 'onViewSavedMeal')
  assert.match(view.resultNotice.text, /2027年1月1日晚餐/)
  assert.match(view.resultNotice.text, /当前菜单.*未保存/)
  assert.equal(view.primaryAction, 'onConfirmPlan')
  assert.deepEqual(value, before, 'projection must not mutate either target or business state')
})

// Break: a stale successful receipt hides the new unknown operation.
test('unknown operation cannot become saved', () => {
  const value = input({ saveState: 'saved', savedTarget: saved, pendingReceipts: [receipt('unknown')] })
  const view = deriveWorkspacePresentation(value)
  assert.equal(view.menuState, 'recover')
  assert.equal(view.primaryAction, 'onRecoverJourney')
  assert.equal(view.resultNotice.kind, 'warning')
  assert.equal(view.resultNotice.action, 'onRecoverJourney')
  assert.deepEqual(view.resultNotice.target, current)
  assert.match(view.resultNotice.text, /待核对/)
  assert.match(view.resultNotice.text, /此前.*2027年1月1日晚餐/)
  assert.deepEqual(value.savedTarget, saved, 'old receipt remains available to onViewSavedMeal')
})

// Retained regression: actual page/store handlers must keep the menu and write nothing.
test('repeated selected meal is a no-op', async t => {
  const f = fixture(), page = f.createPage()
  t.after(() => page.onUnload())
  await page.initializeWorkspace(target)
  const before = plain(page.store.state()), writes = f.calls.length
  await page.onMealTab({ currentTarget: { dataset: { index: page.data.mealIndex } } })
  assert.equal(f.calls.length, writes)
  assert.deepEqual(plain(page.store.state()), before)
  assert.deepEqual(plain(page.data.draft.dishes).map(dish => dish.id), [7])
})

// Break: deriving display state independently of the existing journey precedence.
const cases = [
  ['empty meal', { status: 'empty', draft: { dishes: [] }, canConfirm: false }, 'empty', 'onGenerate'],
  ['ordinary draft', {}, 'draft', 'onConfirmPlan'],
  ['generating', { status: 'generating' }, 'working', 'onCancelTask'],
  ['saved meal', { status: 'planned', canConfirm: false, linkedPlan: { revision: 1 }, saveState: 'saved', savedTarget: current }, 'saved', 'onViewRecipes'],
  ['modified saved menu', { saveState: 'changed', savedTarget: saved }, 'changed', 'onConfirmPlan'],
  ['unapplied conditions outrank confirmation', { dirty: true, saveState: 'saved', savedTarget: saved, pendingReceipts: [receipt('confirmation')] }, 'changed', 'onRegenerate'],
  ['confirmation outranks old save', { status: 'planned', canConfirm: false, saveState: 'saved', savedTarget: saved, pendingReceipts: [receipt('confirmation')] }, 'draft', 'onRecoverJourney'],
  ['busy outranks unapplied conditions', { busy: true, dirty: true }, 'working', 'onCancelTask'],
  ['conflict outranks busy', { syncStatus: 'conflict', busy: true, dirty: true }, 'conflict', 'onLoadLatest'],
  ['unknown outranks conflict', { syncStatus: 'conflict', busy: true, pendingReceipts: [receipt('unknown')] }, 'recover', 'onRecoverJourney'],
  ['offline keeps recovery', { syncStatus: 'offline', saveState: 'saved', savedTarget: saved }, 'recover', 'onRetryWorkspace'],
  ['unrelated receipt cannot block this meal', { pendingReceipts: [receipt('unknown', 'assistant', saved)] }, 'draft', 'onConfirmPlan'],
  ['capability closed retains local draft', { workspaceEnabled: false, assistantAvailable: false, canConfirm: false }, 'draft', 'onGenerate'],
]
for (const [name, patch, state, action] of cases) {
  test(`state contract: ${name}`, () => {
    const view = deriveWorkspacePresentation(input(patch))
    assert.equal(view.menuState, state)
    assert.equal(view.primaryAction, action)
    if (view.resultNotice) {
      assert.deepEqual(Object.keys(view.resultNotice).sort(), ['action', 'kind', 'target', 'text'])
      assert.ok(view.resultNotice.text)
    }
  })
}

// Break: an invalid target or an unfinished confirmation is presented as a saved result.
test('only a valid saved target has a saved result notice', () => {
  assert.equal(deriveWorkspacePresentation(input()).resultNotice, null)
  const view = deriveWorkspacePresentation(input({ saveState: 'saved', savedTarget: { date: '2026-02-30', mealType: 'lunch' } }))
  assert.equal(view.resultNotice, null)
  assert.equal(view.menuState, 'draft')
})
