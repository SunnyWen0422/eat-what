const {canonicalDish,canonicalApi}=require('./fixtures/canonical-dish')
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { imageSource } = require('../utils/dish-image')
const oldImage = 'http://cp1.douguo.net/upload/food/a%20b.jpg?size=300&x=%2F'
const newImage = 'https://cp1.douguo.com/upload/food/a%20b.jpg?size=300&x=%2F'
const plain = value => JSON.parse(JSON.stringify(value))

test('verified legacy image hosts use working HTTPS without changing path query or input objects', () => {
  assert.equal(imageSource('  ' + oldImage + '  '), newImage)
  assert.equal(imageSource(oldImage.replace('cp1', 'cp2')), newImage)
  assert.equal(imageSource('HTTPS://CP1.DOUGUO.NET:443/a?x=1'), 'https://cp1.douguo.com:443/a?x=1')
  assert.equal(imageSource(newImage), newImage)
  assert.equal(imageSource(null), '')
})

test('similar hosts and unverified cp hosts are never redirected', () => {
  for (const url of ['https://cp3.douguo.net/a', 'https://cp1.douguo.net.evil.example/a',
    'https://evil-cp1.douguo.net/a',
    'https://evil.example/cp1.douguo.net/a', 'https://images.example.com/a']) assert.equal(imageSource(url), url)
  assert.equal(imageSource('https://cp1.douguo.net@evil.example/a'), '')
})

function load(file, overrides = {}) {
  let definition
  const nativeRequire = createRequire(path.resolve(file))
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Page: value => { definition = value }, Component: value => { definition = value },
    getApp: () => ({ globalData: { loginReady: true } }), wx: { getStorageSync: () => null }, console,
    require: name => overrides[name] || (name.endsWith('/config') ? { ENABLE_MEAL_WORKSPACE: false }
      : name.endsWith('/font-scale') ? Object.assign(() => 1, { base: 16 }) : nativeRequire(name)),
    setTimeout: () => 0, clearTimeout() {},
  })
  return { ...definition, ...definition.methods, data: plain(definition.data), setData(patch) { Object.assign(this.data, patch) } }
}

test('dish card displays a normalized URL while preserving the original selected dish', () => {
  const view = load('components/dish-card/dish-card.js')
  const dish = { id: 1, image: oldImage }; view.properties = { dish }; view.data.dish = dish
  view.observers['dish.image'].call(view)
  assert.equal(view.data.imageSource, newImage)
  assert.equal(view.data.dish.image, oldImage)
  view.fail(); assert.equal(view.data.imageFailed, true)
  const replacement = { id: 2, image: 'https://cp2.douguo.net/next.jpg' }
  view.properties.dish = replacement; view.data.dish = replacement
  view.observers['dish.image'].call(view)
  assert.equal(view.data.imageFailed, false)
  assert.equal(view.data.imageSource, 'https://cp1.douguo.com/next.jpg')
  assert.equal(replacement.image, 'https://cp2.douguo.net/next.jpg')
})

test('assistant cards use the same verified image alias without mutating source facts', () => {
  const dish = { id: 1, name: '菜', image: oldImage }
  const card = require('../utils/assistant-cards').presentCard({ type: 'recipe', data: dish })
  assert.equal(card.rows[0].image, newImage); assert.equal(dish.image, oldImage)
})

test('detail cover, each step image and full preview list use the verified alias', async () => {
  const source = { id: 1, type: 'veg', image: oldImage, steps: '步骤', stepImages: JSON.stringify([oldImage + '#' + oldImage.replace('cp1', 'cp2')]) }
  const view = load('pages/dish-detail/dish-detail.js', {
    '../../utils/api': { getDishById: async () => canonicalDish({ ...source }) },
    '../../utils/util': { getUserStorageKey: key => key },
  })
  view.checkFavoriteStatus = () => {}; view.loadMealQuantities = () => {}; view.measureDetailActions = () => {}
  await view.loadDishDetail(1)
  assert.equal(view.data.error, false); assert.equal(view.data.dish.image, newImage)
  assert.deepEqual(plain(view.data.dish.stepImagesFlat), [[newImage, newImage]])
  assert.deepEqual(plain(view.data.dish.allStepImages), [newImage, newImage])
  assert.equal(source.image, oldImage)
})

test('legacy assistant normalizes restored and newly received dish thumbnails', () => {
  const view = load('pages/chat/chat.js', {
    '../../utils/meal-workflow': { today: () => '2026-10-14' }, '../../utils/api': {},
    '../../utils/util': {}, '../../utils/shopping-list': {},
  })
  const dish = { id: 1, image: oldImage }
  view.hydrateSession({ messages: [{ role: 'assistant', dishes: [dish] }] })
  assert.equal(view.data.messages[0].dishes[0].image, newImage)
  view.addMessage('assistant', '菜谱', { dishes: [dish] })
  assert.equal(view.data.messages[1].dishes[0].image, newImage); assert.equal(dish.image, oldImage)
})
