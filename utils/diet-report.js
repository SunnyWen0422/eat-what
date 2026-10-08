const flow = require('./meal-workflow')
const BLOCKS = ['overview', 'actualDetails', 'frequentDishes', 'categoryCounts', 'planExecution', 'completeness']
const CATEGORY_LABELS = { meat: '荤菜', veg: '素菜', soup: '汤品', staple: '主食', dessert: '甜品', unknown: '未分类' }

function recordUrl(date, mealType) {
  const target = `/pages/calendar-detail/calendar-detail?date=${encodeURIComponent(date)}`
  return flow.mealNames[mealType] ? `${target}&mealType=${encodeURIComponent(mealType)}` : target
}

function presentDietReport(report, range) {
  const metadata = report && report.metadata
  if (!metadata || metadata.startDate !== range.startDate || metadata.endDate !== range.endDate) {
    throw new Error('报告日期范围不匹配，请重新加载。')
  }
  if (metadata.basis !== 'explicit_eaten' || !report.blocks || BLOCKS.some(key => !report.blocks[key])) {
    throw new Error('报告缺少实际用餐依据，请更新后重试。')
  }
  const blocks = report.blocks
  const categories = blocks.categoryCounts.categories || {}
  const entryCount = blocks.categoryCounts.entryCount || 0
  const categoryRows = Object.keys(CATEGORY_LABELS).map(key => ({
    key, label: CATEGORY_LABELS[key], count: categories[key] || 0,
    percent: entryCount ? Math.round((categories[key] || 0) / entryCount * 100) : 0
  }))
  const daily = blocks.overview.dailyMeals || report.dailyMeals || {}
  const dailyRows = []
  for (let date = range.startDate; date <= range.endDate; date = flow.shiftDay(date, 1)) {
    dailyRows.push({ date, label: date.slice(5), count: daily[date] || 0 })
  }
  const peak = Math.max(0, ...dailyRows.map(row => row.count))
  dailyRows.forEach(row => { row.width = peak ? Math.round(row.count / peak * 100) : 0 })
  const order = { breakfast: 0, lunch: 1, dinner: 2 }
  const recordRows = (blocks.actualDetails.records || []).filter(row => row.status === 'eaten').map(row => ({
    ...row, key: `${row.mealDate}|${row.mealType}`, label: flow.mealNames[row.mealType] || row.mealType,
    names: (row.actualDishes || []).map(dish => dish.name).join('、') || '这餐已标记吃过，菜品明细缺失',
    sourceUrl: recordUrl(row.mealDate, row.mealType)
  })).sort((a, b) => b.mealDate.localeCompare(a.mealDate) || order[a.mealType] - order[b.mealType])
  return { reportView: { metadata, ...blocks }, categoryRows, dailyRows, recordRows }
}

module.exports = { presentDietReport, recordUrl }
