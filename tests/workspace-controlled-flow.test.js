const test = require('node:test')
const assert = require('node:assert/strict')
const {fixture, target, deferred} = require('./fixtures/workspace-flow')

function setup() {
  const f = fixture(), operations = []
  const preview = {id:'task-1',previewToken:'bound-token',status:'awaiting_confirmation',retryable:true,
    summary:'保存青菜到10月6日晚餐。计划不计入实际。'}
  const complete = {...preview,status:'completed',retryable:false,message:'计划已保存，实际回顾已生成',report:{mealCount:0}}
  f.api.previewControlledTask = async body => { operations.push(['preview',body]); return preview }
  f.api.confirmControlledTask = async (id,token) => { operations.push(['confirm',id,token]); return complete }
  f.api.getControlledTask = async id => { operations.push(['get',id]); return complete }
  f.api.getControlledTaskByRequest = async () => null
  f.wx.showModal = options => {operations.push(['modal',options.content]); options.success({confirm:true})}
  return {...f, operations, preview, complete}
}

test('workspace controlled flow uses server preview then exact confirmation and links same week', async t => {
  const f=setup(), page=f.createPage('result'); t.after(()=>page.onUnload())
  await page.initializeWorkspace(target)
  assert.equal(typeof page.onSaveAndReview,'function')
  await page.onSaveAndReview()
  assert.deepEqual(f.operations.map(x=>x[0]),['preview','modal','confirm'])
  assert.equal(f.operations[1][1],f.preview.summary)
  assert.deepEqual(f.operations[2],['confirm','task-1','bound-token'])
  assert.equal(f.operations[0][1].steps[1].arguments.startDate,'2026-10-05')
  assert.equal(page.data.harnessStatus,'completed')
  assert.equal(page.data.harnessReport.mealCount,0)
  assert.equal(page.data.busy,false)
  page.onControlledReport()
  assert.equal(f.navigation.at(-1),'/pages/statistics/statistics?period=week&anchor=2026-10-06')
})

test('dirty workspace cannot begin a controlled write and cancel never confirms', async t => {
  const f=setup(), page=f.createPage(); t.after(()=>page.onUnload())
  await page.initializeWorkspace(target)
  assert.equal(typeof page.onSaveAndReview,'function')
  page.data.canConfirm=false
  await page.onSaveAndReview()
  assert.equal(f.operations.length,0)
  page.data.canConfirm=true
  f.wx.showModal=o=>o.success({confirm:false})
  await page.onSaveAndReview()
  assert.equal(f.operations.some(x=>x[0]==='confirm'),false)
  assert.equal(page.data.harnessStatus,'cancelled')
  assert.equal(page.data.busy,false)
})

test('unknown task remains visible after reentry and recovery never creates another preview', async t => {
  const f=setup(), page=f.createPage(); t.after(()=>page.onUnload())
  await page.initializeWorkspace(target)
  assert.equal(typeof page.onSaveAndReview,'function')
  f.api.confirmControlledTask=async()=>{throw new Error('结果未知')}
  await page.onSaveAndReview()
  assert.equal(page.data.harnessStatus,'unknown')
  await page.initializeWorkspace(target)
  assert.equal(page.data.harnessStatus,'unknown')
  assert.equal(page.data.harnessRetryable,true)
  page.data.canConfirm=false
  await page.onRecoverControlledTask()
  assert.equal(page.data.harnessStatus,'completed')
  assert.equal(f.operations.filter(x=>x[0]==='preview').length,1)
  assert.equal(f.operations.filter(x=>x[0]==='get').length,1)
})

test('late controlled result cannot write report into another account page', async t => {
  const f=setup(), page=f.createPage(), waiting=deferred(); t.after(()=>page.onUnload())
  await page.initializeWorkspace(target)
  assert.equal(typeof page.onSaveAndReview,'function')
  f.api.confirmControlledTask=()=>waiting.promise
  const pending=page.onSaveAndReview()
  await new Promise(resolve=>setImmediate(resolve))
  f.switchAccount('B'); await page.initializeWorkspace(target)
  waiting.resolve(f.complete); await pending
  assert.equal(page.data.harnessReport,null)
  assert.equal(page.data.harnessStatus,'idle')
  assert.equal(page.data.busy,false)
})
