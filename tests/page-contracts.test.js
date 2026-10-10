const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const flow = require('../utils/meal-workflow')
const ingredients = require('../utils/shopping-ingredients')
function page(route, api, store = {}) {
  let definition
  const sandbox = { Page: value => { definition = value }, require: name => {
    if (name.endsWith('/shopping-view')) return require('../utils/shopping-view')
    if (name.endsWith('/experience-preferences')) return () => ({get:()=>({reducedMotion:false})})
    if (name.endsWith('/shopping-list-presentation')) return require('../utils/shopping-list-presentation')
    if (name.endsWith('/shopping-prices')) return require('../utils/shopping-prices')
    if (name.endsWith('/shopping-capabilities')) return {refresh:async()=>({pricesEnabled:false,expensesEnabled:false}),notice:()=>''}
    if (name.endsWith('/product-release')) return require('../utils/product-release')
    if (name.endsWith('/font-scale')) return () => 1
    if (name.endsWith('/ui-tokens')) return require('../utils/ui-tokens')
    if (name.endsWith('/meal-actual-entry')) return require('../utils/meal-actual-entry')
    if (name.endsWith('/api')) return api
    if (name.endsWith('/util')) return { getUserStorageKey: key => 'user:1:' + key }
    if (name.endsWith('/meal-workflow')) return flow
    if (name.endsWith('/shopping-ingredients')) return ingredients
    if (name.endsWith('/shopping-list')) return store
    if (name.endsWith('/calendar-meal-presentation')) return require('../utils/calendar-meal-presentation')
    throw new Error('Unexpected dependency ' + name)
  }, wx: { getStorageSync: () => null }, console, Date, Math, Map, Set }
  vm.runInNewContext(fs.readFileSync(route + '.js', 'utf8'), sandbox)
  definition.data = structuredClone(definition.data)
  definition.setData = update => Object.assign(definition.data, update)
  return definition
}
test('calendar deep link retains an explicit meal target',()=>{
 const view=page('pages/calendar-detail/calendar-detail',{});view.onLoad({date:'2026-10-06',mealType:'dinner'});assert.equal(view.data.focusedMeal,'dinner');view.onLoad({date:'2026-10-06',mealType:'unknown'});assert.equal(view.data.focusedMeal,'')
});
test('shopping filters retain the authoritative full list without another request', () => {
  let requests = 0
  const view = page('pages/shopping-list/shopping-list', { getShoppingList: () => { requests++ } })
  view.applyList({ version: 4, dishes: [{ dishName: '鱼', selectionKey: 'one', items: [{ id: 1, displayName: '盐', checked: true }, { id: 2, displayName: '鱼', checked: false }] }] })
  view.onFilterChange({ currentTarget: { dataset: { status: 'checked' } } })
  assert.equal(view.data.dishes[0].items[0].id, 1)
  view.onFilterChange({ currentTarget: { dataset: { status: 'pending' } } })
  assert.equal(view.data.dishes[0].items.length, 1)
  assert.equal(view.data.dishes[0].items[0].id, 2)
  assert.equal(view._full.dishes[0].items.length, 2)
  assert.equal(view.data.pendingCount, 1); assert.equal(view.data.checkedCount, 1)
  assert.equal(requests, 0)
})
test('purchase preview preserves two dates for the same dish and separate people counts', async () => {
  const view = page('pages/shopping-preview/shopping-preview', { createShoppingPreview: async body => ({ dishes: [{ dishId: 1, dishName: '鱼', targetPeople: body.targetPeople, items: [{ sourceDishId: 1, sourceLineNo: 0, displayName: '鱼', quantityValue: body.targetPeople }] }] }) })
  view._scope = 'user:1:shoppingList'; view._selectionId = 'preview-one'
  view.selection = { sources: [{ sourceDate: '2026-10-01', sourceMealType: 'dinner', dishIds: [1], targetPeople: 2 }, { sourceDate: '2026-10-02', sourceMealType: 'dinner', dishIds: [1], targetPeople: 4 }] }
  await view.loadPreview()
  assert.equal(view.data.dishes.length, 2)
  assert.notEqual(view.data.dishes[0].selectionKey, view.data.dishes[1].selectionKey)
  assert.equal(view.data.dishes[1].targetPeople, 4)
})
test('all registered routes have valid event handlers, dark titles and the shared theme', () => {
  const app = JSON.parse(fs.readFileSync('app.json','utf8'))
  assert.equal(app.pages.length,27)
  assert.deepEqual(app.tabBar.list.map(tab => tab.text), ['今天','菜谱','日历','我的'])
  for (const route of app.pages) {
    const source = fs.readFileSync(route + '.js','utf8') + fs.readFileSync('utils/meal-workspace-page.js','utf8'), template = fs.readFileSync(route + '.wxml','utf8') + (['pages/index/index','pages/result/result','pages/chat/chat'].includes(route) ? fs.readFileSync('templates/meal-workspace.wxml','utf8') : '')
    assert.ok(fs.readFileSync(route + '.wxss','utf8').includes('styles/theme.wxss'), route)
    assert.equal(JSON.parse(fs.readFileSync(route + '.json','utf8')).navigationBarTextStyle,'black',route)
    for (const binding of template.matchAll(/(?:bind|catch)(?::)?(?:tap|input|change|blur|confirm|cancel|action|open|error|scrolltolower|chooseavatar|longpress)="([A-Za-z][A-Za-z0-9_]*)"/g)) {
      assert.ok(new RegExp('\\b' + binding[1] + '\\s*(?:\\(|:)').test(source), `${route}: missing handler ${binding[1]}`)
    }
  }
})

test('public component event bindings match events actually emitted by that component', () => {
  const app=JSON.parse(fs.readFileSync('app.json','utf8'))
  for(const route of app.pages) {
    const template=fs.readFileSync(route+'.wxml','utf8') + (['pages/index/index','pages/result/result','pages/chat/chat'].includes(route) ? fs.readFileSync('templates/meal-workspace.wxml','utf8') : '')
    for(const tag of template.matchAll(/<(ui-[a-z-]+|meal-card|dish-card)\b([^>]+)>/g)) {
      const source=fs.readFileSync('.'+app.usingComponents[tag[1]]+'.js','utf8')
      for(const binding of tag[2].matchAll(/(?:bind|catch):([a-z]+)=/g))
        assert.ok(new RegExp("triggerEvent\\(['\"]"+binding[1]+"['\"]").test(source),`${route}: ${tag[1]} does not emit ${binding[1]}`)
    }
  }
})
