const test = require('node:test')
const assert = require('node:assert/strict')
const { createWriteJournal, menuHandoff } = require('../utils/personal-recipes')
function fixture() {
  const data = new Map(); let owner = 'A', sequence = 0
  const journal = createWriteJournal({ identity: () => owner, key: name => owner + ':' + name, read: key => data.get(key), write: (key, value) => data.set(key, value), remove: key => data.delete(key), requestId: () => 'recipe-' + (++sequence) })
  return { journal, data, switchOwner: value => { owner = value } }
}
test('unknown result survives reload and retries exact original body and request ID', async () => {
  const f = fixture(), sent = []
  await assert.rejects(f.journal.run('create', { name: '鱼' }, async body => { sent.push(body); throw { isNetworkError: true } }))
  await f.journal.run('create', { name: 'changed' }, async body => { sent.push(body); return { id: 8 } })
  assert.deepEqual(sent[1], sent[0]); assert.equal(sent[1].name, '鱼'); assert.equal(f.journal.pending('create'), null)
})
test('known conflict clears pending, network timeout retains it, and repeated clicks reuse one send', async () => {
  const f = fixture(); let release, sends = 0
  const first = f.journal.run('edit:1', { expectedVersion: 'v1' }, body => { sends++; return new Promise(resolve => { release = resolve }) })
  const second = f.journal.run('edit:1', {}, () => { sends++ })
  release({ id: 1 }); await Promise.all([first, second]); assert.equal(sends, 1)
  await assert.rejects(f.journal.run('edit:1', {}, async () => { throw { statusCode: 409 } })); assert.equal(f.journal.pending('edit:1'), null)
  await assert.rejects(f.journal.run('edit:1', {}, async () => { throw { statusCode: 408 } })); assert.ok(f.journal.pending('edit:1'))
})
test('account switch rejects late result and never exposes pending contents to another account', async () => {
  const f = fixture(); let release
  const pending = f.journal.run('copy:1', { private: 'A only' }, () => new Promise(resolve => { release = resolve }))
  f.switchOwner('B'); assert.equal(f.journal.pending('copy:1'), null); release({ id: 4 })
  await assert.rejects(pending, /账号/); assert.equal(f.journal.pending('copy:1'), null)
})
test('menu handoff binds target, menu revision, people and selected IDs without confirming a plan', () => {
  const value = menuHandoff({ menuId: 3, menuVersion: 2, menuDate: '2026-10-08', menuMealType: 'dinner', people: 4, dishIds: [1, 2] })
  assert.deepEqual(value, { date: '2026-10-08', mealType: 'dinner', menuId: 3, menuVersion: 2, menuDate: '2026-10-08', menuMealType: 'dinner', people: 4, dishIds: [1, 2] })
  assert.throws(() => menuHandoff({ menuId: 3, menuVersion: 2, people: 4, dishIds: [] }), /菜单/)
})
test('synchronous transport failure cannot poison the in-flight retry slot', async () => {
  const f = fixture(); let sends = 0
  await assert.rejects(f.journal.run('create', {}, () => { sends++; throw new Error('transport unavailable') }))
  await f.journal.run('create', {}, async () => { sends++; return { id: 2 } })
  assert.equal(sends, 2)
})
test('editable recipe text preserves rich arrays as readable lines', () => {
  const { editableRecipeText } = require('../utils/personal-recipes')
  assert.equal(editableRecipeText('["洗鱼","蒸熟"]'), '洗鱼\n蒸熟')
  assert.equal(editableRecipeText('鱼|1|条###姜|2|片'), '鱼|1|条\n姜|2|片')
})
for (const statusCode of [401, 403]) test(`unknown create then ${statusCode} retains original request for authenticated recovery`, async () => {
  const f = fixture(), sent = []
  await assert.rejects(f.journal.run('create', { name: 'original' }, async body => { sent.push(body); throw { isNetworkError: true } }))
  await assert.rejects(f.journal.run('create', { name: 'edited' }, async body => { sent.push(body); throw { statusCode } }))
  assert.ok(f.journal.pending('create'))
  await f.journal.run('create', { name: 'edited again' }, async body => { sent.push(body); return { id: 1 } })
  assert.deepEqual(sent[2], sent[0])
})
