const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const read = file => fs.readFileSync(file, 'utf8')

// These tests fail if a visible page label again conflates planning with eating.
test('calendar directs empty meals to an arrangement without conflating food records', () => {
  const source = read('pages/calendar/calendar.wxml')
  assert.match(source, /action-label="\{\{.*\? '查看' : '安排'\}\}"/)
  assert.doesNotMatch(source, /安排 \/ 记录这一餐/)
})

test('calendar meal entry labels actual records before existing or empty plans', () => {
  const source = read('pages/calendar/calendar.wxml')
  const expression = source.match(/action-label="\{\{(.*?)\}\}"/)
  assert.ok(expression, 'calendar retains its single meal-detail entry')
  const cases = [
    { item: { status: 'unrecorded', plan: null }, label: '安排' },
    { item: { status: 'recorded', plan: { recipeName: '原安排' } }, label: '查看' },

    { item: { status: 'unrecorded', plan: { recipeName: '明日午餐' } }, label: '查看' },
    { item: { status: 'unrecorded', plan: null }, label: '安排' },
  ]
  for (const { item, label } of cases) {
    assert.equal(vm.runInNewContext(expression[1], { item }), label)
  }
  assert.equal((source.match(/bind:open="onOpenMeal"/g) || []).length, 1)
  assert.match(source, /data-meal="\{\{item.mealType\}\}"/)
})

test('calendar detail saves one record and exposes no mark-eaten editor', () => {
  const source=read('pages/calendar-detail/calendar-detail.wxml')
  assert.doesNotMatch(source,/onActualDifferent|meal-actual-sheet|实际吃过/)
  assert.match(source,/原记录保留，复制后会生成目标日期的餐次记录/)
  const expression=source.match(/confirm-label="\{\{(.*?)\}\}"/)
  assert.equal(vm.runInNewContext(expression[1],{formMode:'plan'}),'保存到日历')
  assert.equal(vm.runInNewContext(expression[1],{formMode:'copy'}),'复制安排')
  for(const file of ['templates/meal-workspace.wxml','pages/meal-cooking/meal-cooking.wxml'])assert.doesNotMatch(read(file),/meal-actual-sheet/)
})

test('recipe details are clearly ingredients and cooking instructions', () => {
  const config = JSON.parse(read('pages/dish-detail/dish-detail.json'))
  const source = read('pages/dish-detail/dish-detail.wxml')
  assert.equal(config.navigationBarTitleText, '食材与做法')
  assert.match(source, /食材与用量/)
  assert.match(source, /烹饪步骤/)
  assert.doesNotMatch(read('pages/calendar-detail/calendar-detail.wxml'), /实际做法/)
})

test('diet review and help use saved records with the future-date boundary', () => {
  const source=read('pages/statistics/statistics.wxml')
  assert.doesNotMatch(source,/计划执行对照|planExecution|明确吃过/)
  assert.match(source,/有餐次记录的天数/)
  assert.match(source,/保存即记录；未来菜单到对应日期再计入/)
  const help=read('pages/about/about.wxml')
  assert.match(help,/保存到日历即成为餐次记录/)
  assert.match(help,/未来菜单到当天计入/)
  assert.doesNotMatch(help,/“记录饮食”|保存到日历只保存计划/)
})

test('help presents one generation action with optional meal requirements', () => {
  const source = read('pages/about/about.wxml')
  assert.match(source, /确认日期、餐次和人数/)
  assert.match(source, /本餐要求可留空/)
  assert.match(source, /点击“生成本餐菜单”/)
  assert.match(source, /换菜和撤销修改/)
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
  assert.match(read('pages/profile/profile.wxml'), /wx:for="\{\{menuItems\}\}"[\s\S]*?bindtap="onMenuTap"/)
  page.onMenuTap({ currentTarget: { dataset: { index } } })
  assert.deepEqual(urls, ['/pages/assistant-history/assistant-history'])
})
