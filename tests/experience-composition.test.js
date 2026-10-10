const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const rules = require('../utils/meal-workspace')
const file = path.resolve('utils/meal-composition.js')
const composition = fs.existsSync(file) ? require(file) : {
  validateCounts: () => ({ valid: false, total: 0, error: 'missing' }),
  compositionRows: () => [], compositionSummary: () => '', missingCounts: () => [],
}
const { validateCounts, compositionRows, compositionSummary, missingCounts } = composition
const plain = value => value == null ? value : JSON.parse(JSON.stringify(value))
const target = { date: '2026-10-09', mealType: 'dinner' }

// Production page/store/preferences are real. Only WeChat and HTTP are replaced;
// context responses preserve the old draft and mark needs_regeneration as Java does.
function fixture() {
  let account = 'A'
  const memory = new Map(), calls = [], navigation = [], rows = new Map()
  const util = { getCurrentUserIdentity: () => account, getUserStorageKey: key => `${account}:${key}` }
  const wx = { getStorageSync: key => plain(memory.get(key)), setStorageSync: (key, value) => memory.set(key, plain(value)),
    removeStorageSync: key => memory.delete(key), getAppBaseInfo: () => ({ fontSizeScaleFactor: 1 }),
    navigateTo: value => navigation.push(value.url), switchTab: value => navigation.push(value.url) }
  function row(meal = target) {
    const id = `${account}:${meal.date}:${meal.mealType}`
    if (!rows.has(id)) rows.set(id, { id, revision: 1, status: 'draft', context: rules.normalizeContext({ ...meal, people: 2 }),
      draft: { planVersion: 1, dishes: [{ id: 7, name: '炒青菜', type: 'veg' }, { id: 8, name: '蒸鱼', type: 'meat' }], lockedDishIds: [], history: [] } })
    return rows.get(id)
  }
  const update = (id, patch) => { const next = { ...rows.get(id), ...plain(patch), revision: rows.get(id).revision + 1 }; rows.set(id, next); return plain(next) }
  const api = {
    getUserPreferences: async () => ({ defaultPeople: 2, excludedIngredients: ['花生'] }),
    updateUserPreferences: async value => calls.push({ type: 'preferences', value }),
    getMealWorkspace: async (date, mealType) => ({ workspace: plain(row({ date, mealType })), planRevision: 0 }),
    saveWorkspaceContext: async (id, body) => { calls.push({ type: 'context', id, body: plain(body) }); return update(id, { context: body.context, status: row(body.context).draft.dishes.length ? 'needs_regeneration' : 'empty', message: '本餐条件已保存，重新安排后生效' }) },
    commandMealWorkspace: async (id, body) => { calls.push({ type: 'command', id, body: plain(body) }); return update(id, { status: 'generating', taskId: 'fixture-task', message: '正在安排本餐' }) },
    recordBehaviorEvent: async () => {},
    getWorkspaceRequest: async () => null,
  }
  const preferencesFile = path.resolve('utils/experience-preferences.js'), preferenceModule = { exports: {} }
  vm.runInNewContext(fs.readFileSync(preferencesFile, 'utf8'), { module: preferenceModule, require: () => util, wx })
  const sandbox = { module: { exports: {} }, wx, console, setTimeout, clearTimeout,
    require: name => name === './api' ? api : name === './util' ? util : name === './experience-preferences' ? preferenceModule.exports
      : name === './meal-workspace' ? { ...rules, createWorkspaceStore: () => rules.createWorkspaceStore({ api, identity: util.getCurrentUserIdentity, read: wx.getStorageSync, write: wx.setStorageSync }) }
        : require(path.resolve('utils', name)) }
  vm.runInNewContext(fs.readFileSync('utils/meal-workspace-page.js', 'utf8'), sandbox)
  function createPage(mode = 'today') { const page = sandbox.module.exports({ mode }); page.setData = patch => Object.assign(page.data, patch); page._alive = true; return page }
  return { createPage, row, rows, api, calls, memory, navigation, switchAccount: () => { account = 'B' } }
}
const event = (type, delta) => ({ currentTarget: { dataset: { type, delta } } })

// Break: invalid count objects reaching normalization/commands, or losing a valid total.
test('count validation permits four dishes and rejects invalid category boundaries', () => {
  assert.deepEqual(validateCounts({ meat: 2, veg: 1, soup: 1 }), { valid: true, total: 4, error: '' })
  assert.equal(validateCounts({ meat: 11 }).valid, false)
  assert.equal(validateCounts({ meat: 0 }).valid, false)
  for (const counts of [{}, { meat: -1 }, { meat: 1.5 }, { meat: NaN }, { meat: Infinity }, { unknown: 1 }, { meat: '2' }, { meat: 6, veg: 5 }, null, []]) assert.equal(validateCounts(counts).valid, false)
  assert.deepEqual(validateCounts({ meat: 10, soup: 0 }), { valid: true, total: 10, error: '' })
})
test('manual normalization rejects zero total decimals and unknown keys before editing a workspace', () => {
  for (const counts of [{ meat: 0 }, { meat: 11 }, { meat: -1 }, { meat: 1.5 }, { meat: NaN }, { unknown: 1 }]) assert.throws(() => rules.normalizeContext({ ...target, compositionMode: 'manual', counts }), /菜|搭配|数量/)
})
test('automatic people boundaries keep two-person one-meat one-veg and manual counts survive people changes', () => {
  assert.deepEqual(rules.normalizeContext({ ...target, people: 2 }).counts, { meat: 1, veg: 1 })
  for (const people of [1, 50]) assert.equal(rules.normalizeContext({ ...target, people }).people, people)
  for (const people of [0, 51]) assert.throws(() => rules.normalizeContext({ ...target, people }), /1.*50/)
  assert.deepEqual(rules.normalizeContext({ ...target, people: 50, compositionMode: 'manual', counts: { meat: 2, veg: 1 } }).counts, { meat: 2, veg: 1 })
})
test('six composition rows prioritize breakfast staple and side without removing soup and dessert', () => {
  const rows = compositionRows({ ...target, mealType: 'breakfast', counts: { staple: 1, side: 1, soup: 1, dessert: 1 } })
  assert.deepEqual(rows.slice(0, 2).map(row => row.type), ['staple', 'side'])
  assert.equal(rows.length, 6)
  assert.equal(rows.find(row => row.type === 'soup').count, 1)
  assert.equal(rows.find(row => row.type === 'dessert').count, 1)
  assert.equal(compositionSummary({ ...target, counts: { meat: 2, veg: 1, soup: 1 } }), '2荤 · 1素 · 1汤')
})
test('deficits use factual dish categories and never infer a type from its name', () => {
  assert.deepEqual(missingCounts({ meat: 2, veg: 1, soup: 1 }, ['meat', '素菜', '汤品']), [{ type: 'meat', count: 1 }])
  assert.deepEqual(missingCounts({ meat: 1 }, ['unknown', null, '红烧肉']), [{ type: 'meat', count: 1 }])
  assert.deepEqual(missingCounts({ staple: 1, side: 1, soup: 1, dessert: 1 }, ['staple', 'veg', 'soup', 'dessert']), [])
  assert.deepEqual(missingCounts({ staple: 1, side: 2 }, ['staple', 'soup', 'dessert']), [])
})

for (const mode of ['today', 'result', 'assistant']) {
  test(`${mode} applies a manual composition without replacing old dishes and remembers it only after sync`, async t => {
    const f = fixture(), page = f.createPage(mode); t.after(() => page.onUnload()); await page.initializeWorkspace(target)
    assert.equal(typeof page.onOpenComposition, 'function')
    const before = plain(page.data.draft.dishes)
    page.onOpenComposition(); page.onCompositionPreset({ currentTarget: { dataset: { id: 'two-meat-one-veg' } } })
    assert.equal(f.memory.has('A:experiencePreferences'), false)
    assert.deepEqual(plain(page.data.context.counts), { meat: 1, veg: 1 })
    await page.onApplyComposition()
    assert.deepEqual(plain(page.data.context.counts), { meat: 2, veg: 1 })
    assert.deepEqual(plain(page.data.draft.dishes), before)
    assert.equal(page.data.compositionVisible, false)
    assert.equal(page.data.conditionsNotice, '条件已更新')
    assert.equal(page.data.primaryLabel, '按新搭配换一套')
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].type, 'context')
    assert.deepEqual(f.memory.get('A:experiencePreferences').compositionByMeal.dinner, { mode: 'manual', counts: { meat: 2, veg: 1 } })
    page.onPeopleInput({ detail: { value: '7' } }); await page.flushDraft()
    assert.deepEqual(plain(page.data.context.counts), { meat: 2, veg: 1 })
    await page.onPrimaryAction(); assert.equal(f.calls.at(-1).body.command, 'regenerate')
    assert.deepEqual(plain(page.data.draft.dishes), before)
  })
}
test('composition controls disable every plus at ten and application at zero', async t => {
  const f = fixture(), page = f.createPage(); t.after(() => page.onUnload()); await page.initializeWorkspace(target)
  assert.equal(typeof page.onOpenComposition, 'function'); page.onOpenComposition()
  page.onCompositionInput({ detail: { value: '9' }, currentTarget: { dataset: { type: 'meat' } } })
  assert.equal(page.data.compositionTotal, 10); assert.ok(page.data.compositionRows.every(row => row.plusDisabled))
  page.onCompositionStep(event('soup', 1)); assert.equal(page.data.compositionTotal, 10)
  page.onCompositionInput({ detail: { value: '0' }, currentTarget: { dataset: { type: 'meat' } } }); page.onCompositionStep(event('veg', -1))
  assert.equal(page.data.compositionTotal, 0); assert.equal(page.data.compositionApplyDisabled, true); assert.match(page.data.compositionHint, /至少.*1/)
  await page.onApplyComposition(); assert.equal(f.calls.length, 0)
  for (const value of ['-1', '1.5', '', 'NaN', '11']) {
    page.onCompositionInput({ detail: { value }, currentTarget: { dataset: { type: 'meat' } } })
    assert.equal(page.data.compositionApplyDisabled, true)
    await page.onApplyComposition(); assert.equal(f.calls.length, 0)
  }
})
test('canceling composition keeps the original counts and never remembers a preset', async t => {
  const f = fixture(), page = f.createPage(); t.after(() => page.onUnload()); await page.initializeWorkspace(target)
  assert.equal(typeof page.onOpenComposition, 'function'); page.onOpenComposition()
  page.onCompositionPreset({ currentTarget: { dataset: { id: 'one-meat-one-veg-soup' } } }); page.onCloseComposition()
  assert.deepEqual(plain(page.data.context.counts), { meat: 1, veg: 1 }); assert.equal(f.calls.length, 0); assert.equal(f.memory.has('A:experiencePreferences'), false)
})
test('failed composition sync keeps entered counts and does not create a remembered suggestion', async t => {
  const f = fixture(), page = f.createPage(); t.after(() => page.onUnload()); await page.initializeWorkspace(target)
  assert.equal(typeof page.onOpenComposition, 'function'); page.onOpenComposition(); page.onCompositionPreset({ currentTarget: { dataset: { id: 'two-meat-one-veg' } } })
  f.api.saveWorkspaceContext = async () => { throw Object.assign(Error('offline'), { statusCode: 503 }) }
  await page.onApplyComposition()
  assert.equal(page.data.compositionVisible, true); assert.deepEqual(plain(page.data.compositionContext.counts), { meat: 2, veg: 1 })
  assert.equal(f.memory.has('A:experiencePreferences'), false); assert.equal(page.data.primaryAction, 'onRetryWorkspace')
})
test('composition opened before account change cannot write or remember in the next account', async t => {
  const f = fixture(), page = f.createPage(); t.after(() => page.onUnload()); await page.initializeWorkspace(target)
  assert.equal(typeof page.onOpenComposition, 'function'); page.onOpenComposition(); page.onCompositionPreset({ currentTarget: { dataset: { id: 'two-meat-one-veg' } } })
  f.switchAccount(); await page.onApplyComposition(); assert.equal(f.calls.length, 0); assert.equal(f.memory.has('B:experiencePreferences'), false)
})
test('late composition sync cannot close a next-account sheet or remember under its key', async t => {
  const f = fixture(), page = f.createPage(); t.after(() => page.onUnload()); await page.initializeWorkspace(target)
  assert.equal(typeof page.onOpenComposition, 'function'); page.onOpenComposition(); page.onCompositionPreset({ currentTarget: { dataset: { id: 'two-meat-one-veg' } } })
  let finish; const save = f.api.saveWorkspaceContext
  f.api.saveWorkspaceContext = (id, body) => new Promise(resolve => { finish = () => save(id, body).then(resolve) })
  const old = page.onApplyComposition(); await new Promise(resolve => setImmediate(resolve))
  f.switchAccount(); await page.initializeWorkspace(target); page.onOpenComposition(); finish(); await old
  assert.equal(page.data.compositionVisible, true); assert.equal(f.memory.has('B:experiencePreferences'), false)
})
test('remembered dinner counts initialize only an empty new dinner and never replace a saved workspace', async t => {
  const f = fixture(), page = f.createPage(); t.after(() => page.onUnload())
  f.memory.set('A:experiencePreferences', { reducedMotion: true, compositionByMeal: { dinner: { mode: 'manual', counts: { meat: 2, soup: 1 } } } })
  await page.initializeWorkspace(target); assert.deepEqual(plain(page.data.context.counts), { meat: 1, veg: 1 })
  f.api.getMealWorkspace = async () => ({ workspace: null, planRevision: 0 })
  await page.initializeWorkspace({ date: '2026-10-10', mealType: 'dinner' }); assert.deepEqual(plain(page.data.context.counts), { meat: 2, soup: 1 }); assert.equal(page.data.context.compositionMode, 'manual')
  await page.initializeWorkspace({ date: '2026-10-10', mealType: 'breakfast' }); assert.deepEqual(plain(page.data.context.counts), { staple: 1, side: 1 }); assert.equal(page.data.context.compositionMode, 'auto')
})
test('new meal suggestions cannot overwrite a cached unsynced composition', async t => {
  const f = fixture(), page = f.createPage(); t.after(() => page.onUnload())
  f.memory.set('A:experiencePreferences', { compositionByMeal: { dinner: { mode: 'manual', counts: { meat: 2, soup: 1 } } } })
  f.memory.set('user:A:meal-workspace:2026-10-09:dinner', { context: { ...target, people: 2, compositionMode: 'manual', counts: { veg: 3 } }, dirty: true })
  f.api.getMealWorkspace = async () => ({ workspace: null, planRevision: 0 })
  await page.initializeWorkspace(target); assert.deepEqual(plain(page.data.context.counts), { veg: 3 })
})
test('real missing categories expose recovery without discarding a usable old menu', async t => {
  const f = fixture(), page = f.createPage(); t.after(() => page.onUnload())
  Object.assign(f.row(), { status: 'needs_input', context: { ...f.row().context, compositionMode: 'manual', counts: { meat: 2, veg: 1 } }, message: '当前筛选不足，原方案已保留' })
  await page.initializeWorkspace(target); assert.equal(page.data.missingCompositionLabel, '还缺1道荤菜'); assert.equal(page.data.draft.dishes.length, 2)
  page.onOpenFilter(); assert.equal(f.navigation.at(-1), '/pages/recommend-filter/recommend-filter')
  page.onChooseDishes(); assert.equal(f.navigation.at(-1), '/pages/customize/customize')
})
test('unclassified dishes do not fabricate an exact shortage from their names', async t => {
  const f = fixture(), page = f.createPage(); t.after(() => page.onUnload())
  f.row().status = 'needs_input'; f.row().draft.dishes = [{ id: 9, name: '红烧肉' }]
  await page.initializeWorkspace(target); assert.equal(page.data.missingCompositionLabel, ''); assert.match(page.data.compositionUnknownNotice, /分类.*无法确认/)
})
test('requirements apply and temporary filters retain menus and never write hard exclusions', async t => {
  const f = fixture(), page = f.createPage(); t.after(() => page.onUnload()); page._params = target; await page.initializeWorkspace(target)
  const dishes = plain(page.data.draft.dishes), hard = page.data.hardExclusionSummary
  page.onOpenRequirements(); page.onClearRequirements(); await page.onApplyRequirements()
  assert.deepEqual(plain(page.data.draft.dishes), dishes); assert.equal(page.data.hardExclusionSummary, hard)
  assert.equal(page.data.conditionsNotice, '条件已更新')
  f.memory.set('A:pendingRecommendationCriteria', { cuisineCodes: ['SICHUAN'] }); await page.onShow()
  assert.deepEqual(plain(page.data.draft.dishes), dishes); assert.equal(page.data.conditionsNotice, '条件已更新'); assert.match(page.data.filterSummary, /川菜/)
  assert.ok(f.calls.every(call => call.type !== 'preferences'))
})
test('independent people sheet retains the same stepper and cannot reset manual counts', async t => {
  const f = fixture(), page = f.createPage(); t.after(() => page.onUnload()); f.row().context = { ...f.row().context, compositionMode: 'manual', counts: { meat: 2, veg: 1 } }
  await page.initializeWorkspace(target); assert.equal(typeof page.onOpenPeople, 'function'); page.onOpenPeople()
  assert.equal(page.data.peopleVisible, true); assert.equal(page.data.compositionVisible, false); assert.equal(page.data.requirementsVisible, false)
  page.onPeopleStep({ currentTarget: { dataset: { delta: 1 } } }); assert.equal(page.data.context.people, 3); assert.deepEqual(plain(page.data.context.counts), { meat: 2, veg: 1 })
  page.onClosePeople(); assert.equal(page.data.peopleVisible, false)
})
// The template is the native page's registration boundary. This is declared
// visibility/wiring evidence only; it does not simulate native layout or focus.
test('generated page declares permanent requirements filter selection and composition entry bindings', () => {
  const template = fs.readFileSync('templates/meal-workspace.wxml', 'utf8'), surface = template.split('<ui-sheet')[0]
  const visible = surface.replace(/<view wx:if="\{\{advancedVisible\}\}"[\s\S]*?<\/view><\/view>/g, '')
  assert.match(visible, /<meal-composition-summary[^>]+bind:composition="onOpenComposition"/)
  for (const handler of ['onOpenRequirements', 'onOpenFilter', 'onChooseDishes']) assert.match(visible, new RegExp(`bindtap="${handler}"`))
  assert.equal((surface.match(/mode="date"/g) || []).length, 0)
  const more = template.split('visible="{{moreVisible}}"')[1].split('</ui-sheet>')[0]
  assert.match(more, /mode="date"[^>]*bindchange="onDateTarget"/)
  assert.match(surface, /dateLabel/)
  assert.doesNotMatch(template, /label="语音输入 · 暂不可用"/)
})

test('repeated application and editing cannot race a pending composition save', async t => {
  const f = fixture(), page = f.createPage(); t.after(() => page.onUnload()); await page.initializeWorkspace(target)
  page.onOpenComposition(); page.onCompositionPreset({ currentTarget: { dataset: { id: 'two-meat-one-veg' } } })
  let finish; const save=f.api.saveWorkspaceContext; let attempts=0
  f.api.saveWorkspaceContext=(id,body)=>{attempts++;return new Promise(resolve=>{finish=()=>save(id,body).then(resolve)})}
  const apply=page.onApplyComposition(); await new Promise(resolve=>setImmediate(resolve))
  await page.onApplyComposition(); page.onCompositionPreset({currentTarget:{dataset:{id:'one-meat-two-veg'}}}); page.onCloseComposition()
  page.onOpenPeople(); page.onOpenRequirements()
  assert.equal(attempts,1); assert.equal(page.data.compositionVisible,true)
  assert.equal(page.data.peopleVisible,false); assert.equal(page.data.requirementsVisible,false)
  assert.deepEqual(plain(page.data.compositionContext.counts),{meat:2,veg:1})
  finish();await apply;assert.equal(page.data.compositionVisible,false)
})
test('optional preference writes can fail after context sync without undoing application', async t => {
  const f=fixture(),page=f.createPage();t.after(()=>page.onUnload());await page.initializeWorkspace(target)
  page.onOpenComposition();page.onCompositionPreset({currentTarget:{dataset:{id:'two-meat-one-veg'}}})
  page._experiencePreferences.rememberComposition=()=>{throw Error('storage unavailable')}
  await page.onApplyComposition();assert.equal(page.data.compositionVisible,false);assert.equal(page.data.syncStatus,'synced')
  assert.deepEqual(plain(page.data.context.counts),{meat:2,veg:1});assert.match(page.data.compositionPreferenceNotice,/已应用.*暂未记住/)
})
test('automatic restoration recalculates the current people suggestion without remembering another manual value', async t => {
  const f=fixture(),page=f.createPage();t.after(()=>page.onUnload());await page.initializeWorkspace(target)
  page.onOpenComposition();page.onCompositionPreset({currentTarget:{dataset:{id:'two-meat-one-veg'}}});page.onCompositionAuto()
  assert.deepEqual(plain(page.data.compositionContext.counts),{meat:1,veg:1});await page.onApplyComposition()
  assert.equal(page.data.context.compositionMode,'auto');assert.equal(f.memory.has('A:experiencePreferences'),false)
})
test('a recovered original context request keeps its id and requires successful explicit application before remembering', async t => {
  const f=fixture(),page=f.createPage();t.after(()=>page.onUnload());await page.initializeWorkspace(target)
  page.onOpenComposition();page.onCompositionPreset({currentTarget:{dataset:{id:'two-meat-one-veg'}}})
  const save=f.api.saveWorkspaceContext,sent=[]
  f.api.saveWorkspaceContext=async(id,body)=>{sent.push(plain(body));throw Object.assign(Error('offline'),{statusCode:503})}
  await page.onApplyComposition();assert.equal(page.data.compositionVisible,true);assert.equal(page.data.primaryAction,'onRetryWorkspace')
  f.api.saveWorkspaceContext=(id,body)=>{sent.push(plain(body));return save(id,body)}
  await page.onPrimaryAction();assert.deepEqual(sent[1],sent[0]);assert.equal(f.memory.has('A:experiencePreferences'),false)
  await page.onApplyComposition();assert.equal(page.data.compositionVisible,false)
  assert.deepEqual(f.memory.get('A:experiencePreferences').compositionByMeal.dinner.counts,{meat:2,veg:1})
})
test('nonbreakfast side counts do not relabel factual soup or dessert categories as side', () => {
  const view=require('../utils/meal-workspace-presentation').deriveWorkspacePresentation({status:'needs_input',syncStatus:'synced',context:{...target,compositionMode:'manual',counts:{side:1,soup:1}},draft:{dishes:[{type:'soup'},{type:'dessert'}]}})
  assert.equal(view.missingCompositionLabel,'还缺1道配餐')
})
test('filter surface explicitly keeps long-term exclusions and labels temporary clearing', () => {
  const filter=fs.readFileSync('pages/recommend-filter/recommend-filter.wxml','utf8')
  assert.match(filter,/只影响本餐.*长期忌口/);assert.match(filter,/清空本餐筛选/)
})
test('invalid people input also disables the new whole-menu regeneration action', () => {
  const view=require('../utils/meal-workspace-presentation').deriveWorkspacePresentation({status:'needs_regeneration',syncStatus:'synced',peopleError:'人数无效',context:{...target,compositionMode:'manual'}})
  assert.equal(view.primaryAction,'onRegenerate');assert.equal(view.primaryDisabled,true)
})
test('inherited object properties are never accepted as factual dish categories', () => {
  for(const type of ['__proto__','constructor','toString'])assert.equal(composition.normalizeDishType(type),null)
})
test('target and automatic summary reset together before a new preference read completes', async t => {
  const f=fixture(),page=f.createPage();t.after(()=>page.onUnload());await page.initializeWorkspace(target)
  let finish;f.api.getUserPreferences=()=>new Promise(resolve=>{finish=resolve})
  const loading=page.initializeWorkspace({date:'2026-11-02',mealType:'breakfast'})
  assert.equal(page.data.dateLabel,'11月2日');assert.equal(page.data.compositionLabel,'1主食 · 1配餐');assert.equal(page.data.compositionModeLabel,'按人数自动搭配')
  finish({defaultPeople:2});await loading
})
test('a version conflict keeps composition inputs and recovery ahead of new writes', async t => {
  const f=fixture(),page=f.createPage();t.after(()=>page.onUnload());await page.initializeWorkspace(target)
  page.onOpenComposition();page.onCompositionPreset({currentTarget:{dataset:{id:'two-meat-one-veg'}}})
  const save=f.api.saveWorkspaceContext;let attempts=0
  f.api.saveWorkspaceContext=async()=>{attempts++;throw Object.assign(Error('changed elsewhere'),{statusCode:409})}
  await page.onApplyComposition();assert.equal(page.data.compositionVisible,true);assert.equal(page.data.primaryAction,'onLoadLatest')
  assert.deepEqual(plain(page.data.compositionContext.counts),{meat:2,veg:1});assert.equal(f.memory.has('A:experiencePreferences'),false)
  await page.onApplyComposition();assert.equal(attempts,1);await page.onPrimaryAction()
  assert.deepEqual(plain(page.data.context.counts),{meat:1,veg:1});assert.deepEqual(plain(page.data.compositionContext.counts),{meat:2,veg:1})
  f.api.saveWorkspaceContext=save;await page.onApplyComposition();assert.equal(page.data.compositionVisible,false)
  assert.deepEqual(f.memory.get('A:experiencePreferences').compositionByMeal.dinner.counts,{meat:2,veg:1})
})
test('workspace routes carry the shared controls and name a result without assuming today', () => {
  for(const page of ['index','result','chat'])assert.match(fs.readFileSync(`pages/${page}/${page}.wxml`,'utf8'),/meal-workspace.wxml/)
  assert.equal(JSON.parse(fs.readFileSync('pages/result/result.json','utf8')).navigationBarTitleText,'本餐方案')
})
