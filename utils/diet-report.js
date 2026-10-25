const flow = require('./meal-workflow')
const BLOCKS = ['overview', 'actualDetails', 'frequentDishes', 'categoryCounts', 'completeness']
const CATEGORY_LABELS = { meat: '荤菜', veg: '素菜', soup: '汤品', staple: '主食', dessert: '甜品', unknown: '未分类' }
const NUTRIENTS = [['energyKcal','热量','千卡'],['proteinG','蛋白质','克'],['fatG','脂肪','克'],['carbohydrateG','碳水化合物','克'],['fiberG','膳食纤维','克'],['sodiumMg','钠','毫克']]

function presentNutritionReference(nutrition) {
  if(!nutrition || nutrition.basis!=='recipe_baseline' || nutrition.personalIntakeAvailable!==false)return null
  const {entryCount,coveredCount,unknownCount}=nutrition
  if(![entryCount,coveredCount,unknownCount].every(value=>Number.isSafeInteger(value)&&value>=0) || !entryCount || coveredCount+unknownCount!==entryCount)return null
  const valid=value=>value && NUTRIENTS.every(([key])=>typeof value[key]==='number'&&Number.isFinite(value[key])&&value[key]>=0)
  const complete=nutrition.complete===true && unknownCount===0 && coveredCount===entryCount && !!valid(nutrition.total)
  const values=complete?nutrition.total:coveredCount>0&&valid(nutrition.knownTotal)?nutrition.knownTotal:null
  return {label:complete?'总值':'已知部分',coverage:`已覆盖 ${coveredCount}/${entryCount} 道`,available:!!values,
    rows:values?NUTRIENTS.map(([key,label,unit])=>({key,label,unit,value:String(key==='energyKcal'?Math.round(values[key]):Number(values[key].toFixed(1)))})):[],
    note:'按日历记录中的整道菜配方用量汇总，不代表个人实际摄入。'}
}

function recordUrl(date, mealType) {
  const target = `/pages/calendar-detail/calendar-detail?date=${encodeURIComponent(date)}`
  return flow.mealNames[mealType] ? `${target}&mealType=${encodeURIComponent(mealType)}` : target
}

function presentDietReport(report, range) {
  const metadata = report && report.metadata
  if (!metadata || metadata.startDate !== range.startDate || metadata.endDate !== range.endDate) {
    throw new Error('报告日期范围不匹配，请重新加载。')
  }
  if (metadata.basis !== 'calendar_records' || !report.blocks || BLOCKS.some(key => !report.blocks[key])) {
    throw new Error('报告记录版本不匹配，请更新后重试。')
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
  const through = blocks.completeness.observedDays === 0 ? '' : blocks.completeness.observedThroughDate || range.endDate
  const recordRows = (blocks.actualDetails.records || []).filter(row => row.status === 'recorded' && row.mealDate >= range.startDate && row.mealDate <= range.endDate && row.mealDate <= through).map(row => ({
    ...row, key: `${row.mealDate}|${row.mealType}`, label: flow.mealNames[row.mealType] || row.mealType,
    names: (row.actualDishes || []).map(dish => dish.name).join('、') || '已保存这餐，暂无菜品明细',
    sourceUrl: recordUrl(row.mealDate, row.mealType), recordUrl: recordUrl(row.mealDate, row.mealType)
  })).sort((a, b) => b.mealDate.localeCompare(a.mealDate) || order[a.mealType] - order[b.mealType])
  const review = { eatenCount: recordRows.length, recordedDays: new Set(recordRows.map(row => row.mealDate)).size }
  const missing = blocks.completeness.daysWithoutActualRecord || 0
  const coverageNotice = `${blocks.completeness.observedDays === 0 ? '未来菜单到对应日期计入回顾。' : missing ? `${missing} 天没有保存餐次记录。` : '已汇总本周期保存的餐次。'}按北京时间统计至今天。`

  return { hasActualRecords: Number(blocks.overview.mealCount)>0, review, coverageNotice, nutritionReference:presentNutritionReference(blocks.actualDetails.nutrition), recordUrl: recordUrl(range.startDate), reportView: { metadata, ...blocks }, categoryRows, dailyRows, recordRows }
}

module.exports = { presentDietReport, presentNutritionReference, recordUrl }
