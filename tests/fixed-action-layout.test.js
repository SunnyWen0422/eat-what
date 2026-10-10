const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

function pageFixture(route) {
  let definition, height = 80, measurements = 0
  const file = path.resolve(`pages/${route}/${route}.js`), originalRequire = createRequire(file)
  const wx = { nextTick: callback => callback(), createSelectorQuery: () => ({
    in() { return this }, select() { return this },
    boundingClientRect(callback) { measurements += 1; callback({ height }); return this }, exec() {},
  }) }
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Page: value => { definition = value }, wx,
    require: name => name.endsWith('/dish-workspace-handoff') ? {
      async changeSelectionPage(page) { height = 247.4; page.setData({ isAddedToMeal: true }); return 'recovered' },
    } : name.endsWith('/util') ? { getUserStorageKey: key => 'A:' + key } :
      name.endsWith('/api') ? {} : name.endsWith('/font-scale') ? Object.assign(() => 1, { base: 16 }) : originalRequire(name),
  })
  const page = { ...definition, data: structuredClone(definition.data), setData(value, callback) { Object.assign(this.data, value); callback?.() } }
  return { page, height: value => { height = value }, count: () => measurements }
}

test('recovering a detail addition reserves the newly taller success action bar', async () => {
  const f = pageFixture('dish-detail')
  f.page.measureDetailActions()
  assert.equal(f.page.data.detailActionHeight, 96)
  assert.equal(await f.page.onRetrySelection(), 'recovered')
  assert.equal(f.page.data.isAddedToMeal, true)
  assert.equal(f.page.data.detailActionHeight, 264)
  assert.equal(f.count(), 2)
})

test('shopping footer space follows measured wrapping and ignores callbacks after unload', () => {
  const f = pageFixture('shopping-preview')
  f.height(185.5); f.page.onReady()
  assert.equal(f.page.data.previewActionHeight, 202)
  f.height(250.5); f.page.onResize()
  assert.equal(f.page.data.previewActionHeight, 267)
  f.page._unloaded = true; f.height(400); f.page.measurePreviewActions()
  assert.equal(f.page.data.previewActionHeight, 267)
})
