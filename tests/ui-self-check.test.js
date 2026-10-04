const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const path = require('node:path')
const read = file => fs.readFileSync(file, 'utf8')
function component(name, wx = {}) {
  const file = path.resolve(`components/${name}/${name}.js`)
  let definition
  vm.runInNewContext(read(file), { Component: value => { definition = value }, wx, require: createRequire(file) })
  return definition
}
function binding(source, data) {
  return source.replace(/\{\{(.*?)\}\}/g, (_, expression) => vm.runInNewContext(expression, data))
}

test('login overlay intercepts background when visible and busy cancellation keeps authorization pending', () => {
  const css = read('pages/profile/profile.wxss')
  const rule = css.match(/\.login-modal-mask\.mask-show\s*\{([^}]+)\}/)
  assert.ok(rule && /visibility:\s*visible/.test(rule[1]) && /opacity:\s*1/.test(rule[1]), 'visible login overlay must intercept taps')
  assert.match(read('pages/profile/profile.wxml'), /class="[^"]*\blogin-modal-mask\b[^>]+catchtap="onCloseLoginModal"/)
  let page
  const file = path.resolve('pages/profile/profile.js')
  vm.runInNewContext(read(file), { Page: value => { page = value }, getApp: () => ({}), require: name => name.endsWith('/font-scale') ? () => 1 : name.endsWith('/ui-tokens') ? require('../utils/ui-tokens') : {}, console })
  page.setData = values => Object.assign(page.data, values)
  page.data.showLoginModal = true
  page.data.loginBusy = true
  page.onCloseLoginModal()
  assert.equal(page.data.showLoginModal, true)
  page.data.loginBusy = false
  page.onCloseLoginModal()
  assert.equal(page.data.showLoginModal, false)
})

test('sheet reopen and keyboard dismissal derive fresh dimensions from the current window', () => {
  let windowHeight = 700, keyboard, removed
  const def = component('ui-sheet', { getWindowInfo: () => ({ windowHeight }), onKeyboardHeightChange: callback => { keyboard = callback }, offKeyboardHeightChange: callback => { removed = callback } })
  const view = { properties: { visible: true }, data: { ...def.data }, setData(value) { Object.assign(this.data, value) }, ...def.methods }
  def.lifetimes.attached.call(view)
  def.observers.visible.call(view, true)
  keyboard({ height: 450 })
  assert.equal(view.data.sheetHeight, 226)
  assert.equal(view.data.bodyHeight, 66)
  view.properties.visible = false
  def.observers.visible.call(view, false)
  keyboard({ height: 0 })
  windowHeight = 800
  view.properties.visible = true
  def.observers.visible.call(view, true)
  assert.equal(view.data.sheetHeight, 776)
  assert.equal(view.data.bodyHeight, 616)
  keyboard({ height: 300 })
  windowHeight = 750
  keyboard({ height: 0 })
  assert.equal(view.data.sheetHeight, 726)
  assert.equal(view.data.bodyHeight, 566)
  def.lifetimes.detached.call(view)
  assert.equal(removed, keyboard)
})

test('favorite toggles request distinct registered PNG assets on detail and legacy result', () => {
  const def = component('ui-icon')
  for (const [file, data] of [['pages/dish-detail/dish-detail.wxml', value => ({ isFavorite: value })], ['pages/result/result.wxml', value => ({ item: { isFavorite: value } })]]) {
    const tag = read(file).match(/<ui-icon[^>]*line-icon-heart[^>]*>/)[0]
    const names = [false, true].map(value => binding(tag.match(/name="([^"]+)"/)[1], data(value)))
    const assets = names.map(name => { let asset; def.properties.name.observer.call({ setData: value => { asset = value.asset } }, name); return asset })
    assert.deepEqual(assets, ['favorite', 'favorite-filled'])
    assert.notDeepEqual(fs.readFileSync(`assets/icons/${assets[0]}.png`), fs.readFileSync(`assets/icons/${assets[1]}.png`))
  }
})

test('legacy assistant send control has a visible label and prevents resubmission while processing', () => {
  const control = read('pages/chat/chat.wxml').match(/<button[^>]*class="[^"]*\bsend-btn\b[^"]*"[^>]*>[\s\S]*?<\/button>/)[0]
  assert.match(control, /发送/)
  assert.match(control, /aria-label="发送消息"/)
  assert.equal(binding(control.match(/disabled="([^"]+)"/)[1], { loading: true, inputText: '晚餐' }), 'true')
  assert.equal(binding(control.match(/disabled="([^"]+)"/)[1], { loading: false, inputText: '' }), 'true')
  assert.equal(binding(control.match(/disabled="([^"]+)"/)[1], { loading: false, inputText: '晚餐' }), 'false')
})

test('both shopping views show unresolved quantities even with readable amounts and preserve manual confirmation', () => {
  const source = read('pages/shopping-list/shopping-list.wxml')
  const warningTags = [...source.matchAll(/<view\s+wx:if="([^"]+)"\s+class="quantity-warning">([^<]+)<\/view>/g)]
  assert.equal(warningTags.length, 2, 'summary and meal templates both need a visible status')
  const ingredients = require('../utils/shopping-ingredients')
  const fixtures = [
    { calculationStatus: 'NEEDS_ADJUSTMENT', quantityText: '200g', warnings: ['UNKNOWN_SERVINGS'] },
    { calculationStatus: 'CALCULATED', quantityText: '400g', servingsVerified: true, warnings: [] },
    { calculationStatus: 'CALCULATED', quantityText: '400g' },
    { calculationStatus: 'USER_OVERRIDE', quantityText: '450g', userOverride: true, warnings: [] },
  ]
  for (const tag of warningTags) {
    fixtures.forEach((fixture, index) => {
      const item = ingredients.normalizeQuantitySafety(fixture)
      assert.equal(binding(tag[1], { item }), index === 0 || index === 2 ? 'true' : 'false')
      if (index === 0 || index === 2) assert.match(binding(tag[2], { item }), /核对|调整/)
    })
  }
})

function legacyResult(api = {}) {
  let page, account = 'A'
  const pending = [], toasts = []
  const change = () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
  const modules = {
    '../../utils/api': { addFavoriteDish: change, removeFavoriteDish: change, ...api },
    '../../utils/util': { getUserStorageKey: key => `${account}:${key}` },
    '../../utils/font-scale': Object.assign(() => 1, { base: 14 }),
    '../../utils/config': { ENABLE_MEAL_WORKSPACE: false },
  }
  vm.runInNewContext(read('pages/result/result.js'), { Page: value => { page = value }, require: name => modules[name] || {}, wx: { showToast: value => toasts.push(value) }, console: { error() {} }, clearTimeout() {} })
  page.setData = values => {
    for (const [key, value] of Object.entries(values)) {
      const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
      let target = page.data
      for (const part of parts.slice(0, -1)) target = target[part]
      target[parts.at(-1)] = value
    }
  }
  page.data.plans = [{ dishes: [{ id: 1, isFavorite: false }] }]
  page._viewScope = 'A:resultView'
  const tap = () => page.onToggleFavorite({ currentTarget: { dataset: { dish: page.data.plans[0].dishes[0], planIndex: 0, dishIndex: 0 } } })
  return { page, pending, toasts, tap, switchAccount: () => { account = 'B' } }
}

test('result favorite submits once while busy and failures preserve the original selection', async () => {
  const view = legacyResult()
  const first = view.tap()
  const duplicate = view.tap()
  assert.equal(view.pending.length, 1)
  assert.equal(view.page.data.favoriteBusyKey, '0:0')
  view.pending[0].reject(Error('network unavailable'))
  await first
  await duplicate
  assert.equal(view.page.data.plans[0].dishes[0].isFavorite, false)
  assert.equal(view.page.data.favoriteBusyKey, '')
  assert.ok(view.toasts.some(value => value.title === '操作失败'))
})

for (const reason of ['account', 'generation', 'unload']) test(`result late favorite cannot update plans or show feedback after ${reason}`, async () => {
  const view = legacyResult()
  const first = view.tap()
  if (reason === 'account') view.switchAccount()
  if (reason === 'generation') view.page.generationVersion++
  if (reason === 'unload') view.page.onUnload()
  view.page.data.plans = [{ dishes: [{ id: 9, isFavorite: false }] }]
  view.pending[0].resolve({})
  await first
  assert.equal(view.page.data.plans[0].dishes[0].isFavorite, false)
  assert.equal(view.toasts.length, 0)
})

test('old favorite cleanup cannot clear the busy state of a new generation request', async () => {
  const view = legacyResult()
  const old = view.tap()
  view.page.generationVersion++
  view.page.data.plans = [{ dishes: [{ id: 9, isFavorite: false }] }]
  const current = view.tap()
  assert.equal(view.pending.length, 2)
  view.pending[0].resolve({})
  await old
  assert.equal(view.page.data.favoriteBusyKey, '0:0')
  view.pending[1].resolve({})
  await current
  assert.equal(view.page.data.plans[0].dishes[0].isFavorite, true)
  assert.equal(view.page.data.favoriteBusyKey, '')
})

test('a late background favorite read cannot overwrite the shopper toggle in the same generation', async () => {
  let finishRead
  const view = legacyResult({ batchCheckFavoriteDishes: () => new Promise(resolve => { finishRead = resolve }) })
  const readStatus = view.page.checkFavoriteStatus()
  const toggle = view.tap()
  view.pending[0].resolve({})
  await toggle
  finishRead([])
  await readStatus
  assert.equal(view.page.data.plans[0].dishes[0].isFavorite, true)
})

test('an account switch blocks a favorite tap on the old page before onShow clears it', () => {
  const view = legacyResult()
  view.switchAccount()
  view.tap()
  assert.equal(view.pending.length, 0)
})
