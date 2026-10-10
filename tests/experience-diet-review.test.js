const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const {presentDietReport} = require('../utils/diet-report')
const range = {startDate:'2026-10-01',endDate:'2026-10-07'}
function fixture() {
  return {metadata:{...range,basis:'explicit_eaten',timezone:'Asia/Shanghai'},blocks:{
    overview:{mealCount:2,recordedDays:2,uniqueDishCount:1,entryCount:2},
    actualDetails:{records:[
      {mealDate:'2026-10-01',mealType:'lunch',status:'eaten',actualDishes:[{dishId:1,name:'青菜',type:'veg'}]},
      {mealDate:'2026-10-02',mealType:'dinner',status:'eaten',actualDishes:[{name:'自由填写'}]},
      {mealDate:'2026-10-03',mealType:'dinner',status:'skipped'},
      {mealDate:'2026-10-04',mealType:'dinner',status:'plan'},
      {mealDate:'2026-10-05',mealType:'lunch',status:'unrecorded'},
      {mealDate:'2026-10-08',mealType:'dinner',status:'eaten'}]},
    frequentDishes:{dishes:[]}, categoryCounts:{categories:{veg:1,unknown:1},entryCount:2},
    planExecution:{plannedMealsDue:1,unconfirmedMeals:1},
    completeness:{observedDays:7,observedThroughDate:'2026-10-07',daysWithoutActualRecord:3,explicitSkippedMeals:1,nutritionAvailable:false}}}
}
function pageHarness() {
  let page,scope='A';const urls=[]
  vm.runInNewContext(fs.readFileSync('pages/statistics/statistics.js','utf8'),{Page:value=>{page=value},wx:{navigateTo:({url})=>urls.push(url)},require:name=>name.endsWith('/api')?{}:name.endsWith('/util')?{getUserStorageKey:key=>scope+':'+key}:require(path.resolve('pages/statistics',name))})
  page.setData=patch=>Object.assign(page.data,patch)
  return {page,urls,switchAccount:()=>{scope='B'}}
}
test('actual coverage excludes skipped plans unrecorded and out-of-range rows without invented nutrition',()=>{
  const {review,recordRows,coverageNotice}=presentDietReport(fixture(),range)
  assert.equal(review.eatenCount, 2)
  assert.equal(review.calories, undefined)
  assert.equal(review.recordedDays,2)
  assert.equal(recordRows.length,2)
  assert.match(coverageNotice,/覆盖不足/)
  assert.match(coverageNotice,/取消.*1/)
  assert.doesNotMatch(coverageNotice,/健康分|千卡/)
})
test('future records inside selected range do not count as observed eaten facts',()=>{
  const report=fixture();report.blocks.completeness.observedThroughDate='2026-10-01'
  const {review,recordRows}=presentDietReport(report,range)
  assert.equal(review.eatenCount,1);assert.equal(recordRows.length,1)
})
test('basis navigation retains actual target and refuses changed accounts',()=>{
  const {page,urls,switchAccount}=pageHarness();page._viewScope='A:dietReview'
  const row=presentDietReport(fixture(),range).recordRows[0]
  assert.equal(row.recordUrl,row.sourceUrl)
  page.onRecord({currentTarget:{dataset:{date:row.mealDate,meal:row.mealType}}})
  assert.equal(urls[0],row.recordUrl)
  switchAccount();page.onRecord({currentTarget:{dataset:{date:row.mealDate,meal:row.mealType}}});assert.equal(urls.length,1)
})
test('replacement Page and real store submit a one-time command without permanent preference writes',async()=>{
  const permanentPreferenceWrites=[],commands=[],memory=new Map()
  const rules=require('../utils/meal-workspace'),target={date:'2026-10-01',mealType:'dinner'}
  const api={updateUserPreferences:value=>permanentPreferenceWrites.push(value),
    getMealWorkspace:async()=>({workspace:{id:1,revision:1,status:'draft',context:rules.normalizeContext({...target,people:2}),draft:{planVersion:1,dishes:[{id:7,name:'青菜',type:'veg'}],lockedDishIds:[],history:[]}}}),
    // A terminal conflict response exercises dispatch only, never a model result.
    commandMealWorkspace:async(id,body)=>{commands.push(body);throw Object.assign(new Error('版本变化'),{statusCode:409})}}
  const util={getCurrentUserIdentity:()=> 'A',getUserStorageKey:key=>'A:'+key}
  let module={exports:{}}
  vm.runInNewContext(fs.readFileSync('utils/meal-workspace-page.js','utf8'),{module,clearTimeout,setTimeout,require:name=>name==='./api'?api:name==='./util'?util:require(path.resolve('utils',name))})
  const page=module.exports();page.setData=patch=>Object.assign(page.data,patch);page._alive=true;page._scope='A'
  page.renderWorkspace=()=>{} // UI rendering only; real Page dispatch and store remain.
  page.store=rules.createWorkspaceStore({api,identity:()=> 'A',read:key=>memory.get(key),write:(key,value)=>memory.set(key,value)})
  await page.store.load(target.date,target.mealType)
  await page.onReplace({detail:{id:7}})
  assert.equal(commands.length,1);assert.equal(commands[0].command,'replace');assert.equal(commands[0].dishId,7)
  assert.equal(commands[0].releaseLegacyLocks,true)
  assert.equal(permanentPreferenceWrites.length, 0)
  assert.equal(page.data.errorMessage,'版本变化')
})
test('review and workspace expose generic evidence limits without per-dish causal claims',()=>{
  const review=fs.readFileSync('pages/statistics/statistics.wxml','utf8'),workspace=fs.readFileSync('templates/meal-workspace.wxml','utf8')
  assert.match(review,/coverageNotice/);assert.match(review,/showReviewDetails/)
  assert.match(workspace,/已记录的用餐可参与近期重复推荐判断/)
  assert.match(workspace,/不等于推荐效果已验证/)
  assert.doesNotMatch(review+workspace,/本次已因昨日鸡肉调整/)
})

test('zero observed days excludes future snapshots and never calls the period complete',()=>{
  const report=fixture();report.blocks.completeness.observedDays=0;report.blocks.completeness.observedThroughDate=null;report.blocks.completeness.daysWithoutActualRecord=0
  const presentation=presentDietReport(report,range)
  assert.equal(presentation.review.eatenCount,0)
  assert.match(presentation.coverageNotice,/尚未到观察日期/)
})

test('secondary details are opt-in and clearing report clears new presentation state',()=>{
  const {page}=pageHarness()
  assert.equal(page.data.showReviewDetails,false)
  page.onToggleReviewDetails();assert.equal(page.data.showReviewDetails,true)
  page.setData({coverageNotice:'旧记录',review:{eatenCount:2},recordUrl:'/old',showProvenance:true})
  page.clearReport()
  assert.equal(page.data.showReviewDetails,false);assert.equal(page.data.showProvenance,false)
  assert.equal(page.data.coverageNotice,'');assert.equal(page.data.recordUrl,'');assert.equal(page.data.review,null)
})
