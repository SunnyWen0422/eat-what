const test=require('node:test'),assert=require('node:assert/strict')
const {fixture,target}=require('./fixtures/workspace-flow')
test('long-term preferences entry flushes current meal and refuses failed save',async t=>{
 const f=fixture(),page=f.createPage();t.after(()=>page.onUnload());await page.initializeWorkspace(target)
 assert.equal(typeof page.onOpenLongTermPreferences,'function')
 page.flushDraft=async()=>{throw new Error('offline')};await page.onOpenLongTermPreferences();assert.equal(f.navigation.length,0)
 page.flushDraft=async()=>{};await page.onOpenLongTermPreferences();assert.match(f.navigation[0],/^\/pages\/settings\/settings\?/)
})
test('meal time adjustment leaves preferences unchanged and never writes preference API',async t=>{
 const f=fixture(),page=f.createPage();let writes=0;f.api.updateUserPreferences=async()=>{writes++};t.after(()=>page.onUnload());await page.initializeWorkspace(target)
 page.onDishFeedback({detail:{kind:'quicker',dishId:7}})
 assert.equal(page.data.settingsVisible,true);assert.equal(writes,0)
 page.onCloseMealSettings();assert.equal(writes,0)
 assert.equal(page.data.context.totalCookMinutes,null)
})
test('explicit meal duration changes workspace context without contaminating saved preferences',async t=>{
 const f=fixture(),page=f.createPage();t.after(()=>page.onUnload());const preferences={maxCookMinutes:15,excludedIngredients:['花生']};let writes=0
 f.api.getUserPreferences=async()=>structuredClone(preferences);f.api.updateUserPreferences=async()=>{writes++};await page.initializeWorkspace(target)
 page.onDishFeedback({detail:{kind:'quicker',dishId:7}});assert.equal(page.data.settingsContext.totalCookMinutes,null)
 page.data.settingsContext.totalCookMinutes=45;await page.onApplyMealSettings();await page.flushDraft()
 assert.equal(page.store.state().context.totalCookMinutes,45);assert.equal(writes,0);assert.deepEqual(await f.api.getUserPreferences(),preferences)
 await page.onDishFeedback({detail:{kind:'change',dishId:7}});assert.deepEqual(await f.api.getUserPreferences(),preferences)
 assert.equal(page.store.state().context.totalCookMinutes,45)
})
