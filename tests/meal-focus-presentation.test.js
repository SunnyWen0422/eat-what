const test = require('node:test')
const assert = require('node:assert/strict')
const {fixture, target} = require('./fixtures/workspace-flow')
const {deriveWorkspacePresentation} = require('../utils/meal-workspace-presentation')
test('menu focus does not override recovery priority', () => {
  for (const syncStatus of ['unknown','offline','conflict']) {
    const result = deriveWorkspacePresentation({status:'draft',syncStatus,context:{},draft:{dishes:[{id:7,type:'veg'}]}})
    assert.equal(result.hasMenu,true)
    assert.equal(result.settingsInitiallyCollapsed,true)
    assert.equal(result.primaryAction,syncStatus==='conflict'?'onLoadLatest':'onRetryWorkspace')
  }
  assert.equal(deriveWorkspacePresentation({context:{},draft:{dishes:[]}}).settingsInitiallyCollapsed,false)
})
test('settings expansion survives render but resets on target change without commands', async () => {
  const f=fixture(), page=f.createPage(); await page.initializeWorkspace(target)
  f.row().draft.dishes=[{id:7,name:'青菜',type:'veg'}]; await page.readWorkspace(target)
  assert.equal(page.data.mealSettingsExpanded,false)
  const before=f.calls.length
  page.onToggleMealSettings(); page.renderWorkspace()
  assert.equal(page.data.mealSettingsExpanded,true)
  assert.equal(f.calls.length,before)
  f.row({...target,mealType:'lunch'}).draft.dishes=[]
  await page.readWorkspace({...target,mealType:'lunch'})
  assert.equal(page.data.mealSettingsExpanded,true)
  page.onUnload()
})
