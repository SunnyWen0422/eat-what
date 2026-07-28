const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const apiSource = fs.readFileSync(path.join(__dirname, '../../utils/api.js'), 'utf8')

test('custom dish API exposes ownership-safe update and delete wrappers', () => {
  assert.match(apiSource, /function updateCustomDish\(id, dish\)/)
  assert.match(apiSource, /request\(`\/dishes\/custom\/\$\{encodeURIComponent\(id\)\}`, 'PUT', dish\)/)
  assert.match(apiSource, /function deleteCustomDish\(id\)/)
  assert.match(apiSource, /request\(`\/dishes\/custom\/\$\{encodeURIComponent\(id\)\}`, 'DELETE'\)/)
  assert.match(apiSource, /updateCustomDish,\s*\n\s*deleteCustomDish,/)
})
