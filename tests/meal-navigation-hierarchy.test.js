const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const { createRequire } = require('node:module')
test('calendar opens the selected meal on the selected date', () => {
  const file = path.resolve('pages/calendar/calendar.js'), actualRequire = createRequire(file), urls = []
  let def
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { Page: v => { def = v }, wx: { getStorageSync: () => '', navigateTo: v => urls.push(v.url) }, require: p => p === '../../utils/font-scale' ? Object.assign(() => 1, { base: 14 }) : actualRequire(p) })
  def.data.selectedDate = '2026-10-08'
  def.onOpenMeal({ currentTarget: { dataset: { meal: 'dinner' } } })
  assert.equal(urls[0], '/pages/calendar-detail/calendar-detail?date=2026-10-08&mealType=dinner')
  def.onOpenMeal({ currentTarget: { dataset: { meal: 'unknown' } } })
  assert.equal(urls[1], '/pages/calendar-detail/calendar-detail?date=2026-10-08')
})
test('a static meal name does not emit a misleading open action', () => {
  let def, count = 0
  vm.runInNewContext(fs.readFileSync('components/meal-card/meal-card.js', 'utf8'), { Component: v => { def = v } })
  def.methods.open.call({ data: { clickable: false }, triggerEvent: () => count++ })
  assert.equal(count, 0)
  def.methods.open.call({ data: { clickable: true }, triggerEvent: () => count++ })
  assert.equal(count, 1)
})
