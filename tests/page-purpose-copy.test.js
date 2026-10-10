const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const read = file => fs.readFileSync(file, 'utf8')

// These tests fail if a visible page label again conflates planning with eating.
test('calendar explains planning and directs empty meals to an arrangement', () => {
  const source = read('pages/calendar/calendar.wxml')
  assert.match(source, /安排三餐并保存计划，吃过后再记录饮食/)
  assert.match(source, /'查看与调整安排' : '安排这一餐'/)
  assert.doesNotMatch(source, /安排 \/ 记录这一餐/)
})

test('calendar meal entry labels actual records before existing or empty plans', () => {
  const source = read('pages/calendar/calendar.wxml')
  const expression = source.match(/bindtap="onOpenMeal">\{\{(.*?)\}\}/)
  assert.ok(expression, 'calendar retains its single meal-detail entry')
  const cases = [
    { item: { status: 'eaten', plan: null }, label: '查看饮食记录' },
    { item: { status: 'eaten', plan: { recipeName: '原安排' } }, label: '查看饮食记录' },
    { item: { status: 'unrecorded', plan: { recipeName: '明日午餐' } }, label: '查看与调整安排' },
    { item: { status: 'unrecorded', plan: null }, label: '安排这一餐' },
  ]
  for (const { item, label } of cases) {
    assert.equal(vm.runInNewContext(expression[1], { item }), label)
  }
  assert.equal((source.match(/bindtap="onOpenMeal"/g) || []).length, 1)
})

test('calendar detail labels saving a plan separately from recording food', () => {
  const source = read('pages/calendar-detail/calendar-detail.wxml')
  assert.match(source, /这里保存用餐安排；吃过后用“记录饮食”记下实际吃了什么/)
  assert.match(source, /'修改饮食记录' : '记录饮食'/)
  const expression = source.match(/confirm-label="\{\{(.*?)\}\}"/)
  assert.ok(expression, 'the form confirm label reflects its action')
  for (const formMode of ['plan', 'copy']) {
    assert.equal(vm.runInNewContext(expression[1], { formMode }), '保存到日历')
  }
  assert.equal(vm.runInNewContext(expression[1], { formMode: 'actual' }), '记录饮食')
})

test('food recording sheet states its actual-only purpose and keeps the meal context', () => {
  const source = read('templates/meal-actual-sheet.wxml')
  assert.match(source, /<ui-sheet[^>]*title="记录饮食"/)
  assert.match(source, />\{\{actualTitle\}\}<\/text>/)
  assert.match(source, /只记录实际吃过的内容，用于饮食回顾；保存计划不会计入/)
  const expression = source.match(/slot="footer" label="\{\{(.*?)\}\}"/)
  assert.ok(expression, 'recording has an explicit confirmation label')
  assert.equal(vm.runInNewContext(expression[1], { actualMode: 'changed' }), '记录饮食')
  assert.equal(vm.runInNewContext(expression[1], { actualMode: 'byPlan' }), '记录饮食')
  assert.equal(vm.runInNewContext(expression[1], { actualMode: 'skipped' }), '确认未按计划')
})

test('recipe details are clearly ingredients and cooking instructions', () => {
  const config = JSON.parse(read('pages/dish-detail/dish-detail.json'))
  const source = read('pages/dish-detail/dish-detail.wxml')
  assert.equal(config.navigationBarTitleText, '食材与做法')
  assert.match(source, /查看食材用量和烹饪做法/)
  assert.match(source, /食材与用量/)
  assert.match(source, /烹饪步骤/)
  assert.doesNotMatch(read('pages/calendar-detail/calendar-detail.wxml'), /实际做法/)
})

test('diet review separates actual food statistics from plan execution comparisons', () => {
  const source = read('pages/statistics/statistics.wxml')
  assert.match(source, /饮食统计只计入实际吃过的记录；计划执行单独对照/)
  assert.match(source, /data-report-block="planExecution"/)
  assert.match(source, /计划执行对照/)
  assert.match(source, /仅对照安排是否执行，不计入饮食统计/)
  assert.match(source, /action-label="记录饮食"/)
})

test('help distinguishes saving to the calendar from recording food after eating', () => {
  const source = read('pages/about/about.wxml')
  assert.match(source, /2 · 保存到日历/)
  assert.match(source, /保存到日历只保存计划，不会记作实际吃过/)
  assert.match(source, /4 · 记录饮食/)
  assert.match(source, /“记录饮食”/)
  assert.match(source, /实际吃过的内容才计入饮食回顾/)
  assert.doesNotMatch(source, /4 · 确认实际用餐|“实际吃了别的”/)
})

test('help presents one generation action with optional meal requirements', () => {
  const source = read('pages/about/about.wxml')
  assert.match(source, /确认日期、餐次和人数/)
  assert.match(source, /本餐要求可留空/)
  assert.match(source, /点击“生成本餐菜单”/)
  assert.match(source, /换菜、保留和撤销修改/)
  assert.doesNotMatch(source, /设置人数、餐次和偏好|浏览推荐或与助手一起搭配/)
})

test('profile still exposes assistant history and opens the existing history page', () => {
  let page
  const urls = []
  const scale = Object.assign(() => 1, { base: 14 })
  vm.runInNewContext(read('pages/profile/profile.js'), {
    Page: value => { page = value },
    getApp: () => ({ globalData: {} }),
    wx: { navigateTo: value => urls.push(value.url) },
    require: name => name.endsWith('/font-scale') ? scale : {},
  })
  const index = page.data.menuItems.findIndex(item => item.title === '助手历史')
  assert.notEqual(index, -1)
  assert.match(read('pages/profile/profile.wxml'), /wx:for="\{\{menuItems\}\}"[^>]*bindtap="onMenuTap"/)
  page.onMenuTap({ currentTarget: { dataset: { index } } })
  assert.deepEqual(urls, ['/pages/assistant-history/assistant-history'])
})
