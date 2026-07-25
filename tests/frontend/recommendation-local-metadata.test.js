const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { createWx, freshRequire, installGlobals } = require('./wechat-runtime')

const root = path.resolve(__dirname, '../..')

test('local dish normalization preserves canonical recommendation metadata', async () => {
  const wx = createWx()
  const app = {
    globalData: {
      allDishes: [{
        id: 1,
        name: 'dish',
        type: 'meat',
        cl: 'chicken',
        cuisineCode: 'SICHUAN',
        tagCodes: 'HOME_STYLE,SPICY',
        cookMinutes: 25,
        metadataVersion: 1,
      }],
    },
  }
  installGlobals({ wx, app })
  const recommendation = freshRequire(path.join(root, 'utils/recommend.js'))

  const dishes = await recommendation.getAllDishes()

  assert.equal(dishes[0].cl, 'chicken')
  assert.equal(dishes[0].cuisineCode, 'SICHUAN')
  assert.equal(dishes[0].tagCodes, 'HOME_STYLE,SPICY')
  assert.equal(dishes[0].cookMinutes, 25)
  assert.equal(dishes[0].metadataVersion, 1)
})

test('local recommendation removes selected dishes that violate permanent exclusions', async () => {
  const wx = createWx({
    initialStorage: {
      userInfo: { id: 7 },
      'user:id_7:userPreferencesV2': {
        excludedTagCodes: ['FRY'],
        excludedIngredients: [],
        preferredCuisineCodes: [],
        preferredTagCodes: [],
        avoidRecentDays: 0,
      },
    },
  })
  const app = { globalData: { allDishes: [] } }
  installGlobals({ wx, app })
  const recommendation = freshRequire(path.join(root, 'utils/recommend.js'))
  const dishes = [
    { id: 1, name: 'fried selected', type: 'meat', tagCodes: 'FRY' },
    { id: 2, name: 'allowed', type: 'meat', tagCodes: 'HOME_STYLE' },
  ]

  const plans = await recommendation.recommendPlans({
    meat: 1, veg: 0, soup: 0, dessert: 0, staple: 0,
    userSelectedDishes: [{ id: 1, name: 'fried selected', type: 'meat' }],
  }, dishes)

  assert.ok(plans.flatMap(plan => plan.dishes).every(dish => dish.id !== 1))
})

test('local recommendation never fabricates a dish that bypasses hard cuisine filters', async () => {
  const wx = createWx({ initialStorage: { userInfo: { id: 7 } } })
  installGlobals({ wx, app: { globalData: { allDishes: [] } } })
  const recommendation = freshRequire(path.join(root, 'utils/recommend.js'))
  const dishes = [
    { id: 1, name: 'spicy meat', type: 'meat', tags: ['川味'], cuisineCode: 'SICHUAN' },
    { id: 2, name: 'spicy veg', type: 'veg', tags: ['川味'], cuisineCode: 'SICHUAN' },
  ]

  const plans = await recommendation.recommendPlans({
    meat: 1,
    veg: 1,
    soup: 0,
    dessert: 0,
    staple: 0,
    criteria: { cuisineCodes: ['SICHUAN'] },
  }, dishes)

  assert.ok(plans.length > 0)
  assert.ok(plans.flatMap(plan => plan.dishes).every(dish => dish.id !== 999 && dish.cuisineCode === 'SICHUAN'))
})
