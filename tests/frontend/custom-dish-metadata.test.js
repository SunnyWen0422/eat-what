const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')

test('custom dish form stores canonical recommendation metadata', () => {
  const script = fs.readFileSync(path.join(root, 'pages/customize/customize.js'), 'utf8')
  const template = fs.readFileSync(path.join(root, 'pages/customize/customize.wxml'), 'utf8')

  assert.match(script, /cuisineCode/)
  assert.match(script, /tagCodes/)
  assert.match(script, /cookMinutes/)
  assert.match(script, /请输入烹饪步骤/)
  assert.match(template, /onCustomCuisineChange/)
  assert.match(template, /onCustomTagTap/)
})
