const test = require('node:test')
const assert = require('node:assert/strict')
const { fixture, plain, target, deferred } = require('./fixtures/workspace-flow')
const { deriveMealJourney } = require('../utils/meal-journey-presentation')

test('next-generation conditions do not create a normal recovery action', () => {
  const journey = deriveMealJourney({ workspace: { context: target, status: 'needs_regeneration', draft: { dishes: [{id: 1}] } }, canConfirm: true, syncStatus: 'synced' })
  assert.equal(journey.recovery, null)
  assert.equal(journey.primary.action, 'onConfirmPlan')
})

test('save review cannot redirect the current menu to a different calendar slot', async t => {
  const f = fixture(), page = f.createPage(); t.after(() => page.onUnload())
  await page.initializeWorkspace(target)
  page.onOpenSaveTarget()
  await page.changeSaveTarget({ date: '2027-01-01', mealType: 'breakfast' })
  await page.onApproveReplacement()
  const save = f.calls.find(c => c.type === 'confirm')
  assert.ok(save)
  assert.equal(save.body.targetDate, target.date)
  assert.equal(save.body.targetMealType, target.mealType)
})

test('changing next-generation preferences keeps dish identities and does not show recovery clutter', async t => {
  const f = fixture(), page = f.createPage(); t.after(() => page.onUnload())
  await page.initializeWorkspace(target)
  const before = plain(page.data.draft.dishes)
  await page.store.saveContext({ ...page.store.state().context, ownedIngredients: ['番茄'] })
  page.renderWorkspace()
  assert.deepEqual(plain(page.data.draft.dishes), before)
  assert.equal(page.data.journeyRecovery, null)
  assert.equal(page.data.primaryAction, 'onConfirmPlan')
  await page.onConfirmPlan()
  assert.equal(f.calls.filter(c => c.type === 'command').length, 0)
  assert.equal(f.calls.filter(c => c.type === 'confirm').length, 1)
})

test('a late settings save cannot save the next page meal',async t=>{
 const f=fixture(),page=f.createPage(),gate=deferred(),original=f.api.saveWorkspaceContext;t.after(()=>page.onUnload())
 await page.initializeWorkspace(target);page.store.edit({...page.data.context,ownedIngredients:['番茄']});page.renderWorkspace()
 f.api.saveWorkspaceContext=async(...args)=>{await gate.promise;return original(...args)}
 const saving=page.onConfirmPlan();await page.initializeWorkspace({date:'2026-10-07',mealType:'lunch'})
 gate.resolve();await saving;assert.equal(f.calls.filter(c=>c.type==='confirm').length,0);assert.equal(page.data.context.date,'2026-10-07')
})
