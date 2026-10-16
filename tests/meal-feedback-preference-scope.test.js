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
for(const outcome of ['success','offline','account-switch'])test('explicit preference save '+outcome+' retains correct account feedback',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');let scope='A',page,finish;const toasts=[]
 const prefs=require('../utils/preference-store'),writeResult=new Promise(resolve=>finish=resolve)
 const wx={showToast:o=>toasts.push(o),getStorageSync:()=>null}
 vm.runInNewContext(fs.readFileSync('pages/settings/settings.js','utf8'),{Page:v=>page=v,wx,require:name=>name.endsWith('/util')?{getUserStorageKey:key=>scope+':'+key}:name.endsWith('/font-scale')?Object.assign(()=>1,{base:16}):require(path.resolve('pages/settings',name))})
 page.setData=v=>Object.assign(page.data,v);page._scope='A:preferencesPage';page.data.loading=false;let writes=0;page.store={save:()=>{writes++;return writeResult}};page.data.preferences={...prefs.defaultPreferences(),maxCookMinutes:15};const pending=page.onSave();assert.equal(writes,1)
 if(outcome==='account-switch')scope='B'
 finish({preferences:page.data.preferences,synced:outcome!=='offline'});await pending
 if(outcome==='account-switch'){assert.equal(toasts.length,0);assert.notEqual(page.data.statusText,'已同步到账号')}
 else {assert.equal(page.data.dirty,false);assert.equal(page.data.synced,outcome!=='offline');assert.equal(page.data.preferences.maxCookMinutes,15);assert.equal(toasts[0].icon,outcome==='offline'?'none':'success');if(outcome==='offline')assert.match(page.data.statusText,/本机草稿.*账号尚未保存/)}
})
