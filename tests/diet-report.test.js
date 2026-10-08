const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const flow = require('../utils/meal-workflow')
function fixture(read) {
  let view, scope = 'A'
  const urls = []
  const api = { getDietReview: read }
  vm.runInNewContext(fs.readFileSync('pages/statistics/statistics.js','utf8'), {
    Page: value => {view=value}, console,
    wx: {navigateTo: ({url}) => urls.push(url), showToast() {}},
    require: name => name.endsWith('/api') ? api : name.endsWith('/util') ? {getUserStorageKey: key => scope + ':' + key} : require(path.resolve('pages/statistics',name))
  })
  view.data = structuredClone(view.data)
  view.setData = values => Object.assign(view.data, values)
  view.data.selectedDate = '2026-01-01'
  return {view, urls, switchAccount: () => {scope='B'}}
}
function report(range = flow.weekRange('2026-01-01')) {
  return {
    metadata: {reportId:'diet-report-abc', startDate:range.startDate,endDate:range.endDate,timezone:'Asia/Shanghai',generatedAt:'2026-01-04T20:00:00+08:00',calculationVersion:'actual-diet-v1',sourceFingerprint:'abc',persisted:false,basis:'explicit_eaten'},
    mealCount:0, recordedDays:0, uniqueDishCount:0, entryCount:0, classifiedCount:0, unclassifiedCount:0,
    categories:{}, popularDishes:[], dailyMeals:{}, consumptions:[],
    plannedMealsDue:2, plannedMealsFollowed:0, plannedMealsChanged:0, skippedMeals:0, unconfirmedMeals:2,
    blocks: { overview:{mealCount:0,recordedDays:0,uniqueDishCount:0,entryCount:0}, actualDetails:{records:[]}, frequentDishes:{dishes:[]}, categoryCounts:{categories:{},entryCount:0,classifiedCount:0,unclassifiedCount:0}, planExecution:{plannedMealsDue:2,plannedMealsFollowed:0,plannedMealsChanged:0,skippedMeals:0,unconfirmedMeals:2}, completeness:{explicitSkippedMeals:0,explicitUnrecordedMeals:0,freeTextEntryCount:0,actualMealsWithoutDishes:0,daysWithoutActualRecord:7,observedDays:7,nutritionAvailable:false} }
  }
}
test('empty actual report retains all six sections and pending plans with provenance', async () => {
  const {view} = fixture(async () => report())
  await view.loadStatistics()
  assert.equal(view.data.reportView.metadata.reportId,'diet-report-abc')
  assert.equal(view.data.reportView.overview.mealCount,0)
  assert.equal(view.data.reportView.planExecution.unconfirmedMeals,2)
  assert.equal(view.data.reportView.completeness.daysWithoutActualRecord,7)
  assert.equal(view.data.recordRows.length,0)
  const source = fs.readFileSync('pages/statistics/statistics.wxml','utf8')
  for (const block of ['overview','actualDetails','frequentDishes','categoryCounts','planExecution','completeness']) assert.ok(source.includes(`data-report-block="${block}"`),block)
})
test('actual record link retains both date and meal type', () => {
  const {view,urls} = fixture(async () => report())
  view._viewScope='A:dietReview'
  view.onRecord({currentTarget:{dataset:{date:'2026-01-01',meal:'lunch'}}})
  assert.equal(urls[0],'/pages/calendar-detail/calendar-detail?date=2026-01-01&mealType=lunch')
})
test('mismatched server range is an error rather than showing the wrong report', async () => {
  const {view} = fixture(async () => report({startDate:'2020-01-01',endDate:'2020-01-07'}))
  await view.loadStatistics()
  assert.equal(view.data.report,null)
  assert.match(view.data.errorMessage,/日期|范围|周期/)
})
test('last requested period wins even if old response or error arrives late', async () => {
  const pending=[]
  const {view} = fixture((startDate,endDate) => new Promise((resolve,reject) => pending.push({startDate,endDate,resolve,reject})))
  const old = view.loadStatistics()
  view.data.selectedDate='2026-01-12'
  const latest=view.loadStatistics()
  pending[1].resolve(report(pending[1])); await latest
  pending[0].reject(Error('old network error')); await old
  assert.equal(view.data.reportView.metadata.startDate,pending[1].startDate)
  assert.equal(view.data.errorMessage,'')
  assert.equal(view.data.loading,false)
})
test('account change while response is pending prevents private report and navigation reuse', async () => {
  let resolve
  const {view,switchAccount,urls} = fixture(() => new Promise(done => {resolve=done}))
  const request = view.loadStatistics(); switchAccount(); resolve(report()); await request
  assert.equal(view.data.report,null)
  view.onRecord({currentTarget:{dataset:{date:'2026-01-01',meal:'lunch'}}})
  assert.equal(urls.length,0)
})
test('daily bars use observed maximum and details preserve unknown names and source targets', async () => {
  const data=report()
  data.dailyMeals={'2026-01-01':1,'2026-01-02':2}
  data.blocks.actualDetails.records=[{id:9,mealDate:'2026-01-01',mealType:'lunch',status:'eaten',revision:4,actualDishes:[{name:'未识别外食'}]}]
  data.blocks.categoryCounts={categories:{unknown:1},entryCount:1,classifiedCount:0,unclassifiedCount:1}
  const {view}=fixture(async()=>data);await view.loadStatistics()
  assert.equal(view.data.dailyRows.find(x=>x.date==='2026-01-01').width,50)
  assert.equal(view.data.dailyRows.find(x=>x.date==='2026-01-02').width,100)
  assert.equal(view.data.recordRows[0].names,'未识别外食')
  assert.equal(view.data.recordRows[0].sourceUrl,'/pages/calendar-detail/calendar-detail?date=2026-01-01&mealType=lunch')
  assert.equal(view.data.categoryRows.find(x=>x.key==='unknown').percent,100)
})
test('explicit weekly report anchor survives onShow and rejects impossible calendar dates', async () => {
  const requests=[]
  const {view}=fixture(async(startDate,endDate)=>{requests.push({startDate,endDate});return report({startDate,endDate})})
  assert.equal(typeof view.onLoad,'function')
  view.onLoad({period:'week',anchor:'2026-01-14'})
  assert.equal(view.data.selectedDate,'2026-01-14');assert.equal(view.data.periodMode,'week')
  view.onShow();await Promise.resolve();await Promise.resolve()
  assert.equal(requests[0].startDate,'2026-01-12');assert.equal(requests[0].endDate,'2026-01-18')
  view.onLoad({period:'week',anchor:'2026-02-30'})
  assert.equal(view.data.selectedDate,'2026-01-14')
})
test('page unload discards late report responses and classification absence is explicit', async () => {
  let resolve
  const {view}=fixture(()=>new Promise(done=>{resolve=done}))
  const request=view.loadStatistics();view.onUnload();resolve(report());await request
  assert.equal(view.data.report,null)
  const {presentDietReport}=require('../utils/diet-report')
  const data=report();data.metadata.basis='plan'
  assert.throws(()=>presentDietReport(data,flow.weekRange('2026-01-01')),/实际用餐依据/)
})
test('unknown rejection still clears stale content and exposes a retryable read error', async () => {
  const {view}=fixture(async()=>{throw null})
  view.data.report={mealCount:99};view.data.reportView={metadata:{reportId:'old'}}
  await view.loadStatistics()
  assert.equal(view.data.report,null);assert.equal(view.data.reportView,null)
  assert.match(view.data.errorMessage,/重试/);assert.equal(view.data.loading,false)
})
