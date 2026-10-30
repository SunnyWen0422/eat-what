const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { buildShoppingView } = require('../utils/shopping-view')
const pricing = require('../utils/shopping-prices')
const fixture = process.env.EATWHAT_SHOPPING_PRESENTATION_FIXTURE

for (const name of ['preview', 'saved']) {
  test(`serialized Java ${name} receipt keeps ingredient labels and business identities separate`, { skip: !fixture }, () => {
    const list = JSON.parse(fs.readFileSync(path.join(fixture, name + '.json'), 'utf8'))
    const before = JSON.stringify(list), item = list.dishes[0].items[0]
    assert.equal(item.variantLabel, '')
    assert.equal(item.normalizedVariant, 'salt')
    assert.equal(buildShoppingView(list).rows[0].name, '盐')
    assert.equal(pricing.buildPricing(list).rows[0].displayName, '盐')
    assert.doesNotMatch(pricing.copyList(list), /salt/)
    assert.equal(pricing.ingredientKey(item), pricing.ingredientKey({ ...item, variantLabel: undefined }))
    if (name === 'saved') assert.equal(buildShoppingView(list).rows[1].name, '鸡腿（去骨）')
    assert.equal(JSON.stringify(list), before)
  })
}
