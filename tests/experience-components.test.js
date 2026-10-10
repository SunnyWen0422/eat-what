const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

const read = file => fs.readFileSync(file, 'utf8')
const plain = value => JSON.parse(JSON.stringify(value))
// The harness simulates only WeChat registration, binding dispatch and platform storage.
// Removing a production handler makes its observable event/state assertion fail.
function component(name, properties = {}, wx = {}, overrides = {}) {
  const file = path.resolve(`components/${name}/${name === 'ui-sheet' ? name : 'index'}.js`)
  let definition = { properties: {}, data: {}, methods: {}, observers: {}, lifetimes: {} }
  const nativeRequire = createRequire(file)
  if (fs.existsSync(file)) vm.runInNewContext(read(file), { Component: value => { definition = value }, require: name => overrides[name] || nativeRequire(name), wx })
  const defaults = Object.fromEntries(Object.entries(definition.properties || {}).map(([key, prop]) => [key, prop && prop.value]))
  const events = [], view = {
    ...definition.methods, properties: { ...defaults, ...properties }, data: plain(definition.data || {}),
    setData(patch) { Object.assign(this.data, plain(patch)) },
    triggerEvent(type, detail = {}) { events.push({ type, detail: plain(detail) }) },
  }
  Object.assign(view.data, view.properties)
  definition.lifetimes?.attached?.call(view)
  return { definition, view, events, observe(key, value) { definition.observers?.[key]?.call(view, value) } }
}
function page(file, overrides = {}, wx = {}) {
  let definition
  const scale = Object.assign(() => 1, { base: 16 })
  vm.runInNewContext(read(file), { Page: value => { definition = value }, getApp: () => ({ globalData: {} }), wx, console,
    require: name => overrides[name] || (name.endsWith('/font-scale') ? scale : name.endsWith('/product-release') ? { version: '4' } : {}),
    setTimeout, clearTimeout })
  return { ...definition, data: plain(definition.data), setData(patch) { Object.assign(this.data, plain(patch)) } }
}
function preferencesHarness() {
  const file = path.resolve('utils/experience-preferences.js'), memory = new Map()
  let account = 'A', factory = () => ({ get: () => ({}), setReducedMotion() {}, rememberComposition() {} })
  if (fs.existsSync(file)) factory = require(file)
  const store = factory({ read: key => plain(memory.get(key) || null), write: (key, value) => memory.set(key, plain(value)), key: () => `${account}:experience` })
  return { store, memory, account(value) { account = value } }
}

test('four navigation labels preserve today recipes calendar and profile destinations', () => {
  const app = JSON.parse(read('app.json')), tabLabels = app.tabBar.list.map(item => item.text)
  assert.deepEqual(tabLabels, ['今天', '菜谱', '日历', '我的'])
  assert.deepEqual(app.tabBar.list.map(item => item.pagePath), ['pages/index/index', 'pages/customize/customize', 'pages/calendar/calendar', 'pages/profile/profile'])
})
test('profile keeps independent list review account data and privacy routes', () => {
  const view = page('pages/profile/profile.js'), source = read('pages/profile/profile.wxml')
  assert.match(source, /bindtap="onShoppingListTap"/)
  assert.ok(view.data.menuItems.some(item => item.url === '/pages/statistics/statistics'))
  assert.ok(view.data.menuItems.some(item => item.url === '/pages/sync/sync'))
  assert.ok(view.data.menuItems.some(item => item.url === '/pages/settings/settings'))
  assert.match(source, /bindtap="onUserInfoTap"/)
  assert.match(source, /wx:if="\{\{isAdmin\}\}"[^>]*bindtap="onAdminWorkbench"/)
  assert.ok(view.data.menuItems.some(item => item.action === 'privacy'))
})
test('profile privacy entry opens the platform privacy statement on demand', () => {
  let opened = 0
  const view = page('pages/profile/profile.js', {}, { openPrivacyContract: () => { opened++ } })
  const index = view.data.menuItems.findIndex(item => item.action === 'privacy')
  assert.ok(index >= 0)
  view.onMenuTap({ currentTarget: { dataset: { index } } })
  assert.equal(opened, 1)
})
test('shared text and controls use body 16 touch 44 and button 48', () => {
  const tokens = JSON.parse(read('design/tokens.json'))
  assert.equal(tokens.font.body, 16)
  assert.equal(tokens.controls.touchSize, 44)
  assert.equal(tokens.controls.primaryHeight, 48)
  assert.equal(require('../utils/font-scale').base, 16)
  assert.match(read('app.wxss'), /font-size:\s*16px/)
})
test('replace dispatch is isolated from the dish detail tap', () => {
  const f = component('compact-dish-row', { dish: { id: 7, name: '清蒸鱼', type: 'meat' } })
  f.view.onReplace?.()
  const eventsAfterReplace = f.events
  assert.equal(eventsAfterReplace.filter(x => x.type === 'view').length, 0)
  assert.deepEqual(eventsAfterReplace, [{ type: 'replace', detail: { id: 7 } }])
  assert.match(read('components/compact-dish-row/index.wxml'), /catchtap="onReplace"/)
})
test('dish detail tap and busy replacement obey the command boundary', () => {
  const f = component('compact-dish-row', { dish: { id: 7, name: '清蒸鱼' }, busy: true })
  f.view.onReplace?.()
  assert.deepEqual(f.events, [])
  f.view.onView?.()
  assert.deepEqual(f.events, [{ type: 'view', detail: { id: 7 } }])
})
test('broken image retains the same dish name and a category placeholder', () => {
  const f = component('compact-dish-row', { dish: { id: 7, name: '很长的清蒸鱼菜名', type: 'meat', image: 'https://example.com/fish.png' } })
  f.view.onImageError?.()
  assert.equal(f.view.data.imageFailed, true)
  assert.equal(f.view.data.dishView?.name, '很长的清蒸鱼菜名')
  assert.equal(f.view.data.dishView?.placeholderIcon, 'meat')
  assert.match(read('components/compact-dish-row/index.wxml'), /imageFailed[^]*ui-icon[^]*dishView.name/)
  assert.match(read('components/compact-dish-row/index.wxss'), /width:\s*64px;\s*height:\s*64px/)
})
test('changing image identity clears a previous failure without changing dish ownership', () => {
  const f = component('compact-dish-row', { dish: { id: 7, name: '鱼', image: 'old' } })
  f.view.onImageError?.()
  f.view.properties.dish = { id: 8, name: '青菜', type: 'veg', image: 'new' }
  f.observe('dish')
  assert.equal(f.view.data.imageFailed, false)
  assert.equal(f.view.data.dishView?.id, 8)
})
for (const [name, quality, expected] of [
  ['explicitly unknown', { reviewStatus: 'UNREVIEWED', timeStatus: 'UNKNOWN' }, '荤菜'],
  ['verified', { reviewStatus: 'VERIFIED', timeStatus: 'VERIFIED' }, '荤菜 · 20 分钟'],
  ['estimated', { reviewStatus: 'UNREVIEWED', timeStatus: 'ESTIMATED' }, '荤菜 · 预计 20 分钟'],
  ['unreviewed verified claim', { reviewStatus: 'UNREVIEWED', timeStatus: 'VERIFIED' }, '荤菜'],
  ['legacy without evidence', undefined, '荤菜'],
]) test(`dish duration metadata distinguishes ${name} evidence`, () => {
  const f = component('compact-dish-row', { dish: { id: 7, name: '清蒸鱼', type: 'meat', cookMinutes: 20, quality } })
  assert.equal(f.view.data.dishView.meta, expected)
})
test('breakfast side placeholder resolves to food line art rather than the info fallback', () => {
  const f = component('compact-dish-row', { dish: { id: 7, name: '配餐', type: 'side' } })
  const file = path.resolve('components/ui-icon/ui-icon.js')
  let definition, asset
  vm.runInNewContext(read(file), { Component: value => { definition = value }, require: createRequire(file) })
  definition.properties.name.observer.call({ properties: { tone: 'brand' }, setData: value => { asset = value.asset } }, f.view.data.dishView.placeholderIcon)
  assert.equal(asset, 'recipe')
})
test('ingredient actions report source IDs without mutating business data', () => {
  const row = { key: 'ginger:g', name: '姜', quantityLabel: '20 g', itemIds: [11, 12], sourceCount: 2 }
  const f = component('compact-ingredient-row', { row, checked: false, busy: false })
  f.view.onCheck?.(); f.view.onEdit?.(); f.view.onSources?.()
  assert.deepEqual(f.events, [{ type: 'check', detail: { itemIds: [11, 12] } }, { type: 'edit', detail: { itemIds: [11, 12] } }, { type: 'sources', detail: { key: 'ginger:g' } }])
  assert.deepEqual(row, { key: 'ginger:g', name: '姜', quantityLabel: '20 g', itemIds: [11, 12], sourceCount: 2 })
  assert.equal(f.view.properties.checked, false)
})
test('busy ingredient row never emits editing or checked mutations', () => {
  const f = component('compact-ingredient-row', { row: { key: 'g', itemIds: [11] }, busy: true })
  f.view.onCheck?.(); f.view.onEdit?.(); f.view.onSources?.()
  assert.deepEqual(f.events, [])
})
test('composition summary exposes separate people and composition actions', () => {
  const f = component('meal-composition-summary', { people: 2, summary: '1荤 · 1素' })
  f.view.onPeople?.(); f.view.onComposition?.()
  assert.deepEqual(f.events.map(event => event.type), ['people', 'composition'])
  assert.match(read('components/meal-composition-summary/index.wxml'), /人数[^]*本餐搭配/)
})
test('persistent feedback announces the result and emits only an available next action', () => {
  const f = component('action-feedback', { feedback: { state: 'success', message: '已换为清蒸鱼', undoAvailable: true }, busy: false })
  f.view.onUndo?.(); f.view.onView?.()
  assert.deepEqual(f.events.map(event => event.type), ['undo'])
  assert.match(read('components/action-feedback/index.wxml'), /aria-live="polite"/)
  assert.match(read('components/action-feedback/index.wxml'), /feedback.message/)
})
test('sheet optional restorefocus event drives an input focus property in a host harness after hiding', () => {
  // This synthetic host proves the extension contract only. Existing app
  // triggers are buttons and have no supported native input focus property.
  const f = component('ui-sheet', { visible: true, busy: false, returnFocusId: 'test-input' }, { getWindowInfo: () => ({ windowHeight: 700 }) })
  const host = { data: { inputFocused: false }, setData(value) { Object.assign(this.data, value) } }
  const hostTemplate = '<input id="test-input" focus="{{inputFocused}}" />'
  f.view.triggerEvent = (type, detail) => {
    f.events.push({ type, detail: plain(detail || {}) })
    if (type === 'close') { f.view.properties.visible = false; f.observe('visible', false) }
    if (type === 'restorefocus' && detail.id === 'test-input') host.setData({ inputFocused: true })
  }
  f.observe('visible', true)
  f.view.close()
  const focusExpression = hostTemplate.match(/focus="\{\{(.*?)\}\}"/)[1]
  assert.equal(vm.runInNewContext(focusExpression, host.data), true)
  assert.deepEqual(f.events.map(event => event.type), ['close', 'restorefocus'])
})
test('busy sheet mask does not close or restore focus', () => {
  const f = component('ui-sheet', { visible: true, busy: true, returnFocusId: 'input' })
  f.observe('visible', true); f.view.close()
  assert.deepEqual(f.events, [])
})
test('sheet reserves safe area and keyboard space while keeping the body scrollable', () => {
  let keyboard
  const f = component('ui-sheet', { visible: true }, { getWindowInfo: () => ({ windowHeight: 700, screenHeight: 800, safeArea: { bottom: 780 } }), onKeyboardHeightChange: listener => { keyboard = listener } })
  assert.equal(f.view.data.safeInset, 20)
  assert.equal(f.view.data.sheetHeight, 676)
  assert.equal(f.view.data.bodyHeight, 496)
  keyboard({ height: 250 })
  assert.equal(f.view.data.safeInset, 0)
  assert.equal(f.view.data.sheetHeight, 426)
  assert.equal(f.view.data.bodyHeight, 266)
})
test('sheet measures wrapped headers and footers before sizing its scroll body', () => {
  const f = component('ui-sheet', { visible: true }, { getWindowInfo: () => ({ windowHeight: 700 }) })
  const query = { select() { return this }, boundingClientRect() { return this }, exec(callback) { callback([{ height: 70 }, { height: 96 }, { height: 4 }]) } }
  f.view.createSelectorQuery = () => query
  f.view.measureChrome?.()
  assert.equal(f.view.data.bodyHeight, 442)
  f.view.resize(250)
  assert.equal(f.view.data.bodyHeight, 192)
})
test('oversized chrome uses native whole-panel scrolling within the keyboard-visible viewport', () => {
  const f = component('ui-sheet', { visible: true }, { getWindowInfo: () => ({ windowHeight: 450 }) })
  const query = { select() { return this }, boundingClientRect() { return this }, exec(callback) { callback([{ height: 70 }, { height: 96 }, { height: 4 }]) } }
  f.view.createSelectorQuery = () => query
  f.view.measureChrome()
  f.view.resize(300)
  assert.equal(f.view.data.sheetHeight, 126)
  assert.equal(f.view.data.overflowChrome, true)
  assert.equal(f.view.data.bodyHeight, 0)
  const source = read('components/ui-sheet/ui-sheet.wxml')
  assert.match(source, /<scroll-view[^>]*class="sheet-scroll"[^>]*scroll-y="\{\{overflowChrome\}\}"[^]*sheet-header[^]*sheet-footer[^]*<\/scroll-view>/)
  assert.match(source, /class="sheet-body"[^>]*scroll-y="\{\{!overflowChrome\}\}"/)
  assert.match(source, /min-height:\{\{sheetHeight < 44 \? sheetHeight : 44\}\}px/)
})
for (const keyboardHeight of [403, 440, 450]) test(`keyboard leaving ${450 - keyboardHeight}px space requests native dismissal without exceeding that space`, () => {
  let keyboard, dismissals = 0
  const f = component('ui-sheet', { visible: true }, { getWindowInfo: () => ({ windowHeight: 450 }), onKeyboardHeightChange: callback => { keyboard = callback }, hideKeyboard: () => { dismissals++ } })
  keyboard({ height: keyboardHeight })
  assert.equal(dismissals, 1)
  assert.ok(f.view.data.sheetHeight <= 450 - keyboardHeight)
  f.view.resize(keyboardHeight)
  assert.equal(dismissals, 1, 'do not repeatedly dismiss the same keyboard')
  keyboard({ height: 0 })
  assert.equal(f.view.data.sheetHeight, 426)
  assert.equal(f.view.data.overflowChrome, false)
  f.view.close()
  assert.deepEqual(f.events.map(event => event.type), ['close'])
})
test('sheet reduces its decorative margin before sacrificing a full primary hit target', () => {
  let dismissed = 0
  const f = component('ui-sheet', { visible: true }, { getWindowInfo: () => ({ windowHeight: 450 }), hideKeyboard: () => { dismissed++ } })
  f.view.resize(384)
  assert.equal(f.view.data.sheetHeight, 48)
  assert.equal(f.view.data.overflowChrome, true)
  assert.equal(dismissed, 0)
})
test('an explicitly zero-height window is not replaced by a fictitious default viewport', () => {
  const f = component('ui-sheet', { visible: true }, { getWindowInfo: () => ({ windowHeight: 0 }) })
  assert.equal(f.view.data.sheetHeight, 0)
  assert.equal(f.view.data.bodyHeight, 0)
  assert.equal(f.view.data.overflowChrome, true)
})
test('failed native keyboard dismissal leaves a bounded panel and an honest instruction', () => {
  let dismiss, keyboard
  const messages = []
  const f = component('ui-sheet', { visible: true }, { getWindowInfo: () => ({ windowHeight: 450 }), onKeyboardHeightChange: callback => { keyboard = callback }, hideKeyboard: options => { dismiss = options }, showToast: value => messages.push(value.title) })
  keyboard({ height: 450 })
  assert.equal(f.view.data.sheetHeight, 0)
  dismiss.fail()
  assert.deepEqual(messages, ['请先收起键盘'])
  assert.equal(f.view.data.sheetHeight, 0, 'never pretend the failed action dismissed the keyboard')
  keyboard({ height: 0 })
  assert.equal(f.view.data.sheetHeight, 426)
})
test('a queued sheet measurement cannot query a detached component', () => {
  let scheduled, queried = 0
  const f = component('ui-sheet', { visible: true }, { nextTick: callback => { scheduled = callback } })
  f.view.createSelectorQuery = () => { queried++; return { select() { return this }, boundingClientRect() { return this }, exec() {} } }
  f.view.measureChrome()
  f.definition.lifetimes.detached.call(f.view)
  scheduled()
  assert.equal(queried, 0)
})
test('reduced motion sets dish feedback and sheet dynamic durations to zero', () => {
  for (const name of ['compact-dish-row', 'action-feedback', 'ui-sheet']) {
    const f = component(name, { reducedMotion: true, feedback: { state: 'success', message: '已恢复' } })
    assert.equal(f.view.data.motionDuration, 0, name)
    f.view.properties.reducedMotion = false; f.observe('reducedMotion', false)
    assert.ok(f.view.data.motionDuration >= 150 && f.view.data.motionDuration <= 240, name)
  }
})
test('account B cannot read account A composition or motion preference', () => {
  const f = preferencesHarness(), composition = { mode: 'manual', counts: { meat: 2, veg: 1 } }
  f.store.rememberComposition('dinner', composition); f.store.setReducedMotion(true)
  assert.deepEqual(f.store.get(), { reducedMotion: true, compositionByMeal: { dinner: composition } })
  f.account('B')
  assert.deepEqual(f.store.get(), { reducedMotion: false, compositionByMeal: {} })
  f.store.rememberComposition('lunch', { mode: 'manual', counts: { veg: 2 } })
  f.account('A')
  assert.deepEqual(f.store.get().compositionByMeal, { dinner: composition })
})
test('optional preference read failure returns a safe view without overwriting unread settings', () => {
  let failRead = true, writes = 0
  const saved = { reducedMotion: false, compositionByMeal: { dinner: { mode: 'manual', counts: { meat: 1 } } } }
  const store = require('../utils/experience-preferences')({ key: () => 'A:experience', read: () => { if (failRead) throw new Error('storage failed'); return saved }, write: () => { writes++ } })
  assert.deepEqual(store.get(), { reducedMotion: true, compositionByMeal: {} })
  assert.equal(store.readFailed(), true)
  assert.throws(() => store.setReducedMotion(false), /暂未读到/)
  assert.throws(() => store.rememberComposition('dinner', { mode: 'manual', counts: { veg: 1 } }), /暂未读到/)
  assert.equal(writes, 0)
  failRead = false
  assert.deepEqual(store.get(), saved)
  assert.equal(store.readFailed(), false)
})
test('an optional storage read failure does not abort hidden sheet attachment', () => {
  const store = require('../utils/experience-preferences')({ key: () => 'A:experience', read: () => { throw new Error('storage failed') } })
  let f
  assert.doesNotThrow(() => { f = component('ui-sheet', { visible: false }, {}, { '../../utils/experience-preferences': () => store }) })
  assert.equal(f.view.data.motionDuration, 0)
})
test('settings finishes loading recommendation preferences when local motion settings cannot be read', async () => {
  const store = require('../utils/experience-preferences')({ key: () => 'A:experience', read: () => { throw new Error('storage failed') } })
  let recommendationLoads = 0
  const empty = () => ({ preferredCuisineCodes: [], preferredTagCodes: [], excludedTagCodes: [], excludedIngredients: [] })
  const view = page('pages/settings/settings.js', {
    '../../utils/util': { getUserStorageKey: key => `A:${key}` },
    '../../utils/experience-preferences': () => store,
    '../../utils/preference-store': { defaultPreferences: empty, sanitizePreferencesForOptions: value => value, createPreferenceStore: () => ({ migrateLegacy: async () => {}, load: async () => { recommendationLoads++; return { preferences: empty(), synced: true } } }) },
    '../../utils/recommendation-options': { loadRecommendationOptions: async () => ({ options: { groups: {} } }) },
  })
  await view.onLoad()
  assert.equal(recommendationLoads, 1)
  assert.equal(view.data.loading, false)
  assert.equal(view.data.synced, true)
  assert.equal(view.data.reducedMotion, true)
  assert.match(view.data.motionStatus, /暂未读到/)
})
test('preference snapshots cannot mutate persisted compositions and reject invalid values', () => {
  const f = preferencesHarness()
  f.store.rememberComposition('dinner', { mode: 'manual', counts: { meat: 1 } })
  const snapshot = f.store.get()
  assert.ok(snapshot.compositionByMeal?.dinner)
  snapshot.compositionByMeal.dinner.counts.meat = 9
  assert.equal(f.store.get().compositionByMeal.dinner.counts.meat, 1)
  assert.throws(() => f.store.rememberComposition('dinner', { mode: 'manual', counts: { meat: 11 } }), /搭配/)
  assert.throws(() => f.store.rememberComposition('unknown', { mode: 'manual', counts: { meat: 1 } }), /餐次/)
})
test('settings toggles motion separately from long-term recommendation preferences', () => {
  const f = preferencesHarness(), view = page('pages/settings/settings.js', { '../../utils/experience-preferences': () => f.store, '../../utils/preference-store': { defaultPreferences: () => ({}) } })
  view.experienceStore = f.store
  view.onReducedMotionChange?.({ detail: { value: true } })
  assert.equal(f.store.get().reducedMotion, true)
  assert.equal(view.data.reducedMotion, true)
  assert.equal(view.data.dirty, false)
  assert.match(read('pages/settings/settings.wxml'), /减少动态效果/)
  assert.doesNotMatch(read('pages/settings/settings.wxml'), /已自动跟随系统/)
})
test('motion storage failure preserves the visible setting and announces an unsaved result', () => {
  const view = page('pages/settings/settings.js', { '../../utils/preference-store': { defaultPreferences: () => ({}) } })
  view.experienceStore = { setReducedMotion() { throw new Error('storage unavailable') } }
  view.onReducedMotionChange({ detail: { value: true } })
  assert.equal(view.data.reducedMotion, false)
  assert.equal(view.data.motionStatus, '动态效果设置未保存，请重试')
})
test('settings reloads local motion preference when the account changes', async () => {
  const f = preferencesHarness()
  let account = 'A'
  f.store.setReducedMotion(true)
  const empty = () => ({ preferredCuisineCodes: [], preferredTagCodes: [], excludedTagCodes: [], excludedIngredients: [] })
  const view = page('pages/settings/settings.js', {
    '../../utils/util': { getUserStorageKey: key => `${account}:${key}` },
    '../../utils/experience-preferences': () => f.store,
    '../../utils/preference-store': { defaultPreferences: empty, sanitizePreferencesForOptions: value => value, createPreferenceStore: () => ({ migrateLegacy: async () => {}, load: async () => ({ preferences: empty() }) }) },
    '../../utils/recommendation-options': { loadRecommendationOptions: async () => ({ options: { groups: {} } }) },
  })
  await view.onLoad()
  assert.equal(view.data.reducedMotion, true)
  account = 'B'; f.account('B')
  const load = view.onLoad.bind(view)
  let reload
  view.onLoad = () => { reload = load(); return reload }
  view.onShow(); await reload
  assert.equal(view.data.reducedMotion, false)
  assert.equal(view.data.dirty, false)
})
test('compact rows flow with long text and keep scalable body text and real hit areas', () => {
  for (const name of ['compact-dish-row', 'compact-ingredient-row', 'meal-composition-summary', 'action-feedback']) {
    const css = read(`components/${name}/index.wxss`)
    assert.match(css, /min-width:\s*0/)
    assert.match(css, /overflow-wrap:\s*(anywhere|break-word)/)
    assert.doesNotMatch(css, /line-clamp|text-overflow:\s*ellipsis|white-space:\s*nowrap/)
    assert.match(css, /min-height:\s*44px/)
  }
  assert.match(read('components/compact-dish-row/index.wxss'), /min-height:\s*80px/)
  assert.match(read('components/compact-ingredient-row/index.wxss'), /min-height:\s*52px/)
  assert.match(read('components/ui-sheet/ui-sheet.wxml'), /scroll-y/)
  assert.match(read('components/ui-sheet/ui-sheet.wxss'), /sheet-footer[^]*flex-shrink:\s*0/)
})

for (const name of ['compact-dish-row', 'action-feedback']) {
  test(`${name} refreshes retained motion on visibility and account changes without reattachment`, () => {
    const prefs = preferencesHarness()
    const f = component(name, { dish: { id: 1 }, feedback: { state: 'success' } }, {}, { '../../utils/experience-preferences': () => prefs.store })
    assert.ok(f.view.data.motionDuration > 0)
    prefs.store.setReducedMotion(true)
    f.definition.pageLifetimes?.show?.call(f.view)
    assert.equal(f.view.data.motionDuration, 0)
    prefs.store.setReducedMotion(false)
    f.definition.pageLifetimes?.show?.call(f.view)
    assert.ok(f.view.data.motionDuration > 0)
    prefs.store.setReducedMotion(true); prefs.account('B')
    f.definition.pageLifetimes?.show?.call(f.view)
    assert.ok(f.view.data.motionDuration > 0)
    prefs.account('A'); f.definition.pageLifetimes?.show?.call(f.view)
    assert.equal(f.view.data.motionDuration, 0)
  })
  test(`${name} newly displayed content reads current motion preference`, () => {
    const prefs = preferencesHarness()
    const f = component(name, {}, {}, { '../../utils/experience-preferences': () => prefs.store })
    prefs.store.setReducedMotion(true)
    const property = name === 'compact-dish-row' ? 'dish' : 'feedback'
    f.view.properties[property] = name === 'compact-dish-row' ? { id: 2 } : { state: 'success', message: 'saved' }
    f.observe(property, f.view.properties[property])
    assert.equal(f.view.data.motionDuration, 0)
  })
}
test('selected meal sheet leads to the meal while an empty selection leads to picking', () => {
  const shared = read('templates/recipe-selected-sheet.wxml')
  assert.match(shared, /<ui-button[^>]*wx:if="\{\{selectedMeal.count\}\}"[^>]*label="查看本餐"[^>]*bind:action="onViewMeal"/)
  assert.match(shared, /<ui-button[^>]*wx:if="\{\{!selectedMeal.count\}\}"[^>]*label="去选菜"[^>]*bind:action="onContinueSelecting"/)
  const custom = read('pages/customize/customize.wxml')
  assert.match(custom, /class="ew-hit-target selected-wrap"[^>]*bindtap="onShowSelected"/)
  assert.match(custom, /class="selected-num"/)
  assert.doesNotMatch(custom, /class="bottom-bar"[\s\S]*?<button[^>]*bindtap="onViewMeal"/)
})
test('help describes replace undo and existing legacy locks without offering keep', () => {
  const source = read('pages/about/about.wxml')
  assert.doesNotMatch(source, /换菜、保留/)
  assert.match(source, /换菜和撤销/)
  assert.match(source, /旧菜单.*锁定/)
})
