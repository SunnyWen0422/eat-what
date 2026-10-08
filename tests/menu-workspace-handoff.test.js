const test = require('node:test')
const assert = require('node:assert/strict')
const {fixture, target, plain} = require('./fixtures/workspace-flow')

const selected = () => ({...target, menuId: 14, menuVersion: 3, menuDate: target.date,
  menuMealType: target.mealType, people: 4, dishIds: [8, 9]})

test('menu handoff carries server version and target into selection with its people count', async t => {
  const f = fixture(), page = f.createPage('result')
  t.after(() => page.onUnload())
  f.memory.set('A:workspaceSelectedDishes', selected())
  await page.initializeWorkspace(target)
  const command = f.calls.find(call => call.type === 'command')
  assert.equal(page.data.context.people, 4)
  assert.equal(command.body.menuId, 14)
  assert.equal(command.body.menuVersion, 3)
  assert.equal(command.body.menuDate, target.date)
  assert.equal(command.body.menuMealType, target.mealType)
  assert.deepEqual(plain(command.body.dishIds), [8, 9])
  assert.equal(f.calls.some(call => call.type === 'confirm'), false)
  assert.equal(f.memory.has('A:workspaceSelectedDishes'), false)
})

test('failed menu selection keeps the exact handoff available for retry', async t => {
  const f = fixture(), page = f.createPage('result'), value = selected()
  t.after(() => page.onUnload())
  f.memory.set('A:workspaceSelectedDishes', value)
  f.api.commandMealWorkspace = async () => { throw {statusCode:409,data:{message:'菜单已更新'}} }
  await page.initializeWorkspace(target)
  assert.deepEqual(f.memory.get('A:workspaceSelectedDishes'), value)
  assert.equal(page.data.busy, false)
  assert.equal(f.calls.some(call => call.type === 'confirm'), false)
})

test('menu for another target remains untouched', async t => {
  const f = fixture(), page = f.createPage('result'), value = {...selected(), date: '2026-10-07'}
  t.after(() => page.onUnload())
  f.memory.set('A:workspaceSelectedDishes', value)
  await page.initializeWorkspace(target)
  assert.deepEqual(f.memory.get('A:workspaceSelectedDishes'), value)
  assert.equal(f.calls.length, 0)
})

test('inconsistent stored menu target is rejected before any context write', async t => {
  const f = fixture(), page = f.createPage('result'), value = {...selected(), menuDate:'2026-10-07'}
  t.after(() => page.onUnload())
  f.memory.set('A:workspaceSelectedDishes', value)
  await page.initializeWorkspace(target)
  assert.equal(f.calls.length, 0)
  assert.match(page.data.errorMessage, /菜单.*重新/)
  assert.deepEqual(f.memory.get('A:workspaceSelectedDishes'), value)
})
