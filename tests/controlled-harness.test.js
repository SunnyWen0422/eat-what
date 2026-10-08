const test = require('node:test')
const assert = require('node:assert/strict')
const { createControlledHarness } = require('../utils/controlled-harness')
const target = { date:'2026-10-08', mealType:'lunch', startDate:'2026-10-05', endDate:'2026-10-11' }
const preview = () => ({ id:'task-one', requestId:'server-key', status:'awaiting_confirmation', previewToken:'server-token', summary:'服务器：保存青菜；不计入实际', retryable:true, steps:[] })
const complete = () => ({...preview(),status:'completed',report:{mealCount:0},message:'已保存计划；本周实际回顾已生成',retryable:false})
function setup(options={}) {
  let user='A';const cache=options.cache||new Map();const calls=[]
  const api={
    previewControlledTask:async body=>{calls.push(['preview',body]);return {...preview(),requestId:body.requestId}},
    getControlledTask:async id=>{calls.push(['get',id]);return preview()},
    getControlledTaskByRequest:async key=>{calls.push(['request',key]);return null},
    confirmControlledTask:async(id,token)=>{calls.push(['confirm',id,token]);return complete()}
  }
  const factory=(extra={})=>createControlledHarness({api,identity:()=>user,read:key=>cache.get(key),write:(key,value)=>cache.set(key,value),confirm:async summary=>{calls.push(['modal',summary]);return true},...extra})
  return {api,calls,cache,factory,switchUser:()=>{user='B'},client:factory(options.extra)}
}

test('server summary is reviewed before exact token confirmation; saving does not mark actual',async()=>{
  const f=setup();const result=await f.client.run(target)
  assert.equal(result.status,'completed');assert.equal(result.report.mealCount,0)
  assert.deepEqual(f.calls.map(x=>x[0]),['preview','modal','confirm'])
  assert.equal(f.calls[1][1],preview().summary);assert.deepEqual(f.calls[2],['confirm','task-one','server-token'])
  assert.deepEqual(f.calls[0][1].steps.map(x=>x.tool),['confirm_current_meal','read_actual_diet_review'])
  assert.equal(f.calls[0][1].userId,undefined)
})

test('cancelled modal never commits and a later explicit run can create a fresh preview',async()=>{
  const f=setup({extra:{confirm:async()=>false}})
  assert.equal((await f.client.run(target)).status,'cancelled')
  assert.equal(f.calls.filter(x=>x[0]==='confirm').length,0)
})

test('unknown confirm recovers original durable task without a new preview or second modal',async()=>{
  const f=setup();f.api.confirmControlledTask=async(id,token)=>{f.calls.push(['confirm',id,token]);throw new Error('network')}
  assert.equal((await f.client.run(target)).status,'unknown')
  f.api.getControlledTask=async id=>{f.calls.push(['get',id]);return complete()}
  const restarted=f.factory();assert.equal(restarted.state().status,'unknown');assert.equal((await restarted.recover()).status,'completed')
  assert.equal(f.calls.filter(x=>x[0]==='preview').length,1);assert.equal(f.calls.filter(x=>x[0]==='modal').length,1)
  assert.equal(f.calls.filter(x=>x[0]==='confirm').length,1)
})

test('partial failure reads original task then retries only its remaining server steps',async()=>{
  const f=setup();let commits=0
  f.api.confirmControlledTask=async(id,token)=>{f.calls.push(['confirm',id,token]);return ++commits===1?{...preview(),status:'partial_failed',retryable:true,message:'计划已保存；回顾暂未生成'}:complete()}
  f.api.getControlledTask=async()=>({...preview(),status:'partial_failed',retryable:true})
  assert.equal((await f.client.run(target)).status,'partial_failed')
  assert.equal((await f.client.recover()).status,'completed')
  assert.equal(f.calls.filter(x=>x[0]==='preview').length,1);assert.equal(f.calls.filter(x=>x[0]==='modal').length,1)
  assert.deepEqual(f.calls.filter(x=>x[0]==='confirm'),[['confirm','task-one','server-token'],['confirm','task-one','server-token']])
})

test('unknown preview queries original request before retrying the identical request',async()=>{
  const f=setup();let n=0
  f.api.previewControlledTask=async body=>{f.calls.push(['preview',body]);if(++n===1)throw new Error('network');return preview()}
  assert.equal((await f.client.run(target)).status,'unknown')
  await f.client.recover()
  assert.deepEqual(f.calls[0][1],f.calls.find((x,i)=>i>0&&x[0]==='preview')[1])
  assert.equal(f.calls[1][0],'request')
})

test('account change during preview or modal discards callbacks and never commits',async()=>{
  const f=setup();let finish
  f.api.previewControlledTask=()=>new Promise(resolve=>{finish=resolve})
  const pending=f.client.run(target);await Promise.resolve();f.switchUser();finish(preview())
  assert.equal((await pending).status,'account_changed');assert.equal(f.calls.length,0)
  const g=setup({extra:{confirm:async()=>{g.switchUser();return true}}})
  assert.equal((await g.client.run(target)).status,'account_changed');assert.equal(g.calls.filter(x=>x[0]==='confirm').length,0)
})

test('double clicks share one run and disposed target cannot commit',async()=>{
  const f=setup();let finish
  f.api.previewControlledTask=body=>{f.calls.push(['preview',body]);return new Promise(resolve=>{finish=resolve})}
  const one=f.client.run(target),two=f.client.run(target);await Promise.resolve();f.client.dispose();finish(preview())
  assert.equal((await one).status,'account_changed');assert.equal((await two).status,'account_changed');assert.equal(f.calls.length,1)
})

test('recovery never invents a replacement task when a known task temporarily disappears',async()=>{
  const f=setup();f.api.confirmControlledTask=async()=>{throw new Error('timeout')}
  await f.client.run(target)
  f.api.getControlledTask=async()=>null
  const result=await f.client.recover()
  assert.equal(result.status,'unknown');assert.match(result.message,/原任务/)
  assert.equal(f.calls.filter(x=>x[0]==='preview').length,1)
})

test('changing the target does not replace an unresolved task or confirm another meal',async()=>{
  const f=setup();f.api.confirmControlledTask=async()=>{throw new Error('timeout')}
  await f.client.run(target)
  const result=await f.client.run({...target,mealType:'dinner'})
  assert.equal(result.status,'unknown');assert.match(result.message,/原任务/)
  assert.equal(f.calls.filter(x=>x[0]==='preview').length,1)
})

test('a definitive preview rejection is retryable as a fresh preview, not stuck in recovery',async()=>{
  const f=setup();let attempts=0
  f.api.previewControlledTask=async body=>{f.calls.push(['preview',body]);if(++attempts===1)throw Object.assign(new Error('请先安排本餐'),{statusCode:400});return preview()}
  assert.equal((await f.client.run(target)).status,'failed')
  assert.equal((await f.client.run(target)).status,'completed')
  assert.notEqual(f.calls[0][1].requestId,f.calls[1][1].requestId)
})

test('recovery can finish a definitively rejected preview after proving no original task exists',async()=>{
  const f=setup();let n=0
  f.api.previewControlledTask=async body=>{f.calls.push(['preview',body]);if(++n===1)throw new Error('network');throw Object.assign(new Error('本餐已变化'),{statusCode:400})}
  await f.client.run(target)
  const result=await f.client.recover()
  assert.equal(result.status,'failed');assert.equal(result.retryable,false)
  assert.equal(f.calls[1][0],'request')
})

test('restarting while confirmation is still in flight preserves an unknown outcome',async()=>{
  const f=setup();let finish
  f.api.confirmControlledTask=()=>new Promise(resolve=>{finish=resolve})
  const pending=f.client.run(target)
  while(!finish) await Promise.resolve()
  const restarted=f.factory()
  assert.equal(restarted.state().status,'unknown')
  finish(complete());assert.equal((await pending).status,'completed')
  assert.equal(f.factory().state().status,'completed')
})
