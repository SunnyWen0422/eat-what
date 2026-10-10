const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

test('component WXSS and every imported stylesheet use native-supported selectors', () => {
  const seen = new Set(), invalid = []
  function check(file) {
    file = path.resolve(file)
    if (seen.has(file)) return
    seen.add(file)
    const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    let depth = 0
    for (const character of css) {
      if (character === '{') depth += 1
      if (character === '}') depth -= 1
      assert.ok(depth >= 0, `Unmatched closing rule in ${path.relative(process.cwd(), file)}`)
    }
    assert.equal(depth, 0, `Unclosed rule in ${path.relative(process.cwd(), file)}`)
    for (const match of css.matchAll(/@import\s+["']([^"']+)["'];/g)) check(path.resolve(path.dirname(file), match[1]))
    const clean = css.replace(/@import[^;]+;/g, '')
    for (const match of clean.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      const selector = match[1].trim()
      if (selector.startsWith('@') || /^(from|to|\d+%)$/.test(selector)) continue
      // WeChat components reject tag/ID/attribute selectors even when the standalone compiler succeeds.
      if (/[\[#]/.test(selector) || /(?:^|[\s>,+~])(?:[a-z][\w-]*|\*)(?=[\s.#:[>,+~]|$)/i.test(selector)) {
        invalid.push(`${path.relative(process.cwd(), file)}: ${selector}`)
      }
    }
  }
  for (const dir of fs.readdirSync('components')) {
    for (const file of fs.readdirSync(path.join('components', dir)).filter(file => file.endsWith('.wxss'))) check(path.join('components', dir, file))
  }
  assert.deepEqual(invalid, [])
})

test('dish row has a valid placeholder before its first attached callback', () => {
  const file = path.resolve('components/compact-dish-row/index.js')
  let definition
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Component: value => { definition = value }, require: createRequire(file) })
  assert.equal(definition.data.dishView.placeholderIcon, 'recipe')
  assert.equal(typeof definition.data.dishView.name, 'string')
})
