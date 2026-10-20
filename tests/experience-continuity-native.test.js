const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const native = require('../scripts/acceptance/experience-continuity-native.cjs')

test('every attempted interaction failure changes the aggregate and exit code',()=>{
 for(const route of ['custom-dishes','meal-cooking','customize','chat'])for(const status of ['failed','blocked']){
  const item={route:'pages/'+route+'/'+route,status:'measured',errors:[],interaction:{status}}
  native.aggregateInteraction(item)
  assert.ok(['failed','blocked'].includes(item.status),route+' '+status)
  const report={widths:[],exceptions:[],cases:[item]}
  assert.equal(native.captureStatus(report),'captured-with-failures')
  assert.equal(native.resultExitCode({status:native.captureStatus(report)}),2)
 }
 for(const status of ['not-run','observed','observed-requires-db-count']){
  const item={status:'measured',interaction:{status}}
  native.aggregateInteraction(item);assert.equal(item.status,'measured')
  assert.equal(native.captureStatus({widths:[],exceptions:[],cases:[item]}),'captured-requires-inspection')
 }
 const item={status:'failed',interaction:{status:'observed'}};native.aggregateInteraction(item)
 assert.equal(item.status,'failed')
})

test('new process boundaries receive explicit minimal environments',async()=>{
 const {EventEmitter}=require('node:events'),calls=[]
 const source=fs.readFileSync(path.resolve(__dirname,'../scripts/acceptance/experience-continuity-native.cjs'),'utf8')
 const injected={SystemRoot:'C:/Windows',PATH:'D:/tools',USERPROFILE:'C:/synthetic',TEMP:'C:/temp',PYTHONPATH:'D:/verification',EATWHAT_E18_CHILD:'stale',SENTINEL_CREDENTIAL:'secret',NODE_OPTIONS:'--require inject',DEEPSEEK_API_KEY:'secret',HTTPS_PROXY:'secret'}
 const cp={spawn:(file,args,opts)=>{
  calls.push({file,opts});const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.exitCode=0
  queueMicrotask(()=>child.emit('exit',0));return child
 },spawnSync:(file,args,opts)=>{calls.push({file,opts});throw Error('export-boundary-captured')}}
 const fakeFs={...fs,mkdirSync(){},writeFileSync(){},existsSync:p=>['fake-sdk','fake-cli'].includes(String(p))||fs.existsSync(p)}
 const mini={evaluate:async()=>({runId:'owned',mode:'fixture'}),disconnect(){}}
 const req=name=>name==='node:child_process'?cp:name==='node:fs'?fakeFs:name===path.resolve('fake-sdk')?{connect:async()=>mini}:require(name)
 const context={require:req,module:{exports:{}},__dirname:path.resolve(__dirname,'../scripts/acceptance'),__filename:path.resolve(__dirname,'../scripts/acceptance/experience-continuity-native.cjs'),process:{...process,env:injected},console,setTimeout,clearTimeout}
 vm.runInNewContext(source+'\nmodule.exports.main=main;module.exports.launch=launch;validate=()=>{};portAvailable=async()=>{}',context)
 const api=context.module.exports,out=path.join(require('node:os').tmpdir(),'e18-spawn-contract-no-write')
 await api.main(['--mode','service','--config','synthetic.json','--out',out,'--python','python'])
 assert.throws(()=>api.prepare({out,mode:'fixture',python:'python',scales:[1]}),/export-boundary-captured/)
 await api.launch({sdk:'fake-sdk',cli:'fake-cli',port:9431,mode:'fixture',out},{project:out,runId:'owned'})
 assert.equal(calls.length,3)
 for(const {opts} of calls){
  assert.equal(opts.env.SystemRoot,'C:/Windows');assert.equal(opts.env.PATH,'D:/tools')
  for(const key of ['SENTINEL_CREDENTIAL','NODE_OPTIONS','DEEPSEEK_API_KEY','HTTPS_PROXY','EATWHAT_E18_CHILD'])assert.equal(opts.env[key],undefined,key)
 }
 assert.equal(calls[0].opts.env.PYTHONPATH,'D:/verification')
 assert.equal(calls[1].opts.env.PYTHONPATH,undefined)
 assert.equal(calls[2].opts.env.PYTHONPATH,undefined)
})

test('native modes are explicit and fixture cannot claim service lifecycle', () => {
  assert.throws(() => native.options([]), /mode/)
  assert.throws(() => native.options(['--mode', 'service', '--out', 'x']), /config/)
  assert.throws(() => native.options(['--mode', 'live', '--out', 'x']), /mode/)
  assert.equal(native.options(['--mode', 'fixture', '--out', 'x']).mode, 'fixture')
  assert.throws(()=>native.options(['--mode','fixture','--out','x','--remote']),/service mode/)
  assert.throws(()=>native.options(['--mode','service','--config','x','--out','x','--remote-ui']),/explicit --remote/)
  assert.equal(native.options(['--mode','service','--config','x','--out','x','--remote','--remote-ui']).remoteUi,true)
})
test('all 27 routes register eight states and both admin roles without invented passes', () => {
  const routes = require('../app.json').pages, matrix = native.matrix(routes)
  assert.equal(matrix.length, 33)
  for (const route of routes) assert.ok(matrix.some(row => row.route === route))
  for (const row of matrix) {
    assert.equal(Object.keys(row.states).length, 8)
    for (const state of Object.values(row.states)) {
      assert.ok(['not-run', 'not-applicable'].includes(state.status))
      assert.ok(state.reason.length > 10)
    }
  }
  assert.equal(matrix.filter(row => row.role === 'ordinary' && row.route.includes('/admin')).length, 6)
  const logs=matrix.find(row=>row.route==='pages/logs/logs')
  assert.equal(logs.states.empty.status,'not-run')
  assert.equal(logs.states.completed.status,'not-run')
  assert.equal(matrix.find(row=>row.route==='pages/about/about').states.empty.status,'not-applicable')
})

test('native output refuses Windows case variants and real junction ancestors before creation', () => {
  const os=require('node:os'),root=path.resolve(__dirname,'..'),missing='new-native-output'
  assert.throws(()=>native.outside(path.join(root,missing)),/Canonical/)
  if(process.platform==='win32')assert.throws(()=>native.outside(path.join(root.toUpperCase(),missing)),/Canonical/)
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'eatwhat-native-boundary-')),link=path.join(temp,'canonical-link')
  let linkCreated=false
  try {
    fs.symlinkSync(root,link,process.platform==='win32'?'junction':'dir')
    linkCreated=true
    assert.throws(()=>native.outside(path.join(link,missing)),/Canonical/)
    assert.equal(native.outside(path.join(temp,'safe-output')),path.join(temp,'safe-output'))
    assert.equal(fs.existsSync(path.join(root,missing)),false)
  } finally {if(linkCreated)fs.unlinkSync(link);fs.rmdirSync(temp)}
})
test('native page content stays reachable requires measurements; screenshots are not passes', () => {
  assert.equal(native.assess({measurements:[]}).status, 'blocked')
  assert.equal(native.assess({measurements:[{selector:'button',width:40,height:48,left:0,right:40,hit:true}]}).status,'failed')
  assert.equal(native.assess({measurements:[{selector:'primary',width:100,height:44,left:0,right:100,hit:true,primary:true}]}).status,'failed')
  assert.equal(native.assess({measurements:[{selector:'button',width:48,height:48,left:0,right:48,hit:true}]}).status,'measured')
  assert.equal(native.assess({measurements:[{selector:'category chip',width:48,height:48,left:300,right:348,hit:true,clipped:true,scrollContained:true}]}).status,'measured')
  assert.equal(native.assess({measurements:[{selector:'category chip',width:20,height:48,left:300,right:320,hit:true,clipped:true,scrollContained:true}]}).status,'failed')
})
test('service guard retains lifecycle, isolates storage, and rejects non-owned transport', () => {
  let registration, calls=0, lifecycle=0
  const wx={cloud:{},getAppBaseInfo:()=>({fontSizeScaleFactor:1}),request:o=>{calls++;return o},getStorageSync:()=>{throw Error('real storage read')}}
  const context={wx,Page:def=>{registration=def},module:{exports:{}},Promise}
  vm.runInNewContext(native.guardSource({mode:'service',runId:'test',api:'http://127.0.0.1:18780/api'}),context)
  context.Page({onLoad(){lifecycle++}});registration.onLoad.call({route:'test'})
  assert.equal(lifecycle,1)
  wx.request({url:'http://127.0.0.1:18780/api/users/info'})
  wx.request({url:'http://127.0.0.1:18780/api-evil'})
  wx.request({url:'https://chishenme.icu/api/users/info'})
  assert.equal(calls,1);assert.equal(wx.getStorageSync('token'),'')
  assert.equal(context.module.exports.lifecycleEnabled,true)
})
test('fixture guard denies transport and suppresses lifecycle while retaining handlers', () => {
  let registered, calls=0
  const wx={cloud:{},request:()=>{calls++},getAppBaseInfo:()=>({})}
  const context={wx,Page:def=>{registered=def},module:{exports:{}},Promise}
  vm.runInNewContext(native.guardSource({mode:'fixture',runId:'test',api:'http://127.0.0.1:9/api'}),context)
  context.Page({onLoad(){calls++},handler(){return 7}});registered.onLoad.call({route:'test'});wx.request({url:'http://127.0.0.1:9/api/a'})
  assert.equal(calls,0);assert.equal(registered.handler(),7)
})
test('cold service font factor initializes modules without overriding lifecycle data', () => {
  let registered, loads=0
  const wx={cloud:{},request(){},getAppBaseInfo:()=>({fontSizeScaleFactor:1})}
  const context={wx,Page:def=>{registered=def},module:{exports:{}},Promise}
  vm.runInNewContext(native.guardSource({mode:'service',runId:'test',api:'http://127.0.0.1:18780/api',fontScale:1.3}),context)
  context.Page({data:{fontScale:wx.getAppBaseInfo().fontSizeScaleFactor},onLoad(){loads++}})
  registered.setData=()=>assert.fail('Acceptance must not force page font data')
  registered.onLoad();assert.equal(registered.data.fontScale,1.3);assert.equal(loads,1)
})

test('guard installation fails closed when native request replacement is rejected', () => {
  const wx={cloud:{},getAppBaseInfo:()=>({})}
  Object.defineProperty(wx,'request',{value(){throw Error('real transport reached')},writable:false})
  assert.throws(()=>vm.runInNewContext(native.guardSource({mode:'service',runId:'test',api:'http://127.0.0.1:18780/api'}),{wx,Page(){},module:{exports:{}},Promise}),/GUARD_INSTALL/)
})

test('remote entry preserves original device font information', () => {
  const wx={cloud:{},request(){},getAppBaseInfo:()=>({fontSizeScaleFactor:1.7,fontSizeSetting:27})}
  const context={wx,Page(){},module:{exports:{}},Promise}
  vm.runInNewContext(native.guardSource({mode:'service',runId:'remote',api:'http://127.0.0.1:18780/api',fontScale:null}),context)
  assert.equal(wx.getAppBaseInfo().fontSizeScaleFactor,1.7)
  assert.equal(wx.getAppBaseInfo().fontSizeSetting,27)
})
test('service read delay preserves the actual response and remains limited to owned catalog GET', async () => {
  let received, calls=0
  const wx={cloud:{},getAppBaseInfo:()=>({}),request:o=>{calls++;o.success?.({statusCode:200,data:{actual:true}})}}
  const context={wx,Page(){},module:{exports:{}},Promise,setTimeout}
  vm.runInNewContext(native.guardSource({mode:'service',runId:'test',api:'http://127.0.0.1:18780/api'}),context)
  context.module.exports.readDelayMs=20
  wx.request({url:'http://127.0.0.1:18780/api/dishes',method:'GET',success:r=>{received=r}})
  assert.equal(received,undefined)
  await new Promise(r=>setTimeout(r,40));assert.equal(received.data.actual,true);assert.equal(calls,1)
})
