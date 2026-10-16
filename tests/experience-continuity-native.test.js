const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const native = require('../scripts/acceptance/experience-continuity-native.cjs')

test('native modes are explicit and fixture cannot claim service lifecycle', () => {
  assert.throws(() => native.options([]), /mode/)
  assert.throws(() => native.options(['--mode', 'service', '--out', 'x']), /config/)
  assert.throws(() => native.options(['--mode', 'live', '--out', 'x']), /mode/)
  assert.equal(native.options(['--mode', 'fixture', '--out', 'x']).mode, 'fixture')
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
})
test('native page content stays reachable requires measurements; screenshots are not passes', () => {
  assert.equal(native.assess({measurements:[]}).status, 'blocked')
  assert.equal(native.assess({measurements:[{selector:'button',width:40,height:48,left:0,right:40,hit:true}]}).status,'failed')
  assert.equal(native.assess({measurements:[{selector:'primary',width:100,height:44,left:0,right:100,hit:true,primary:true}]}).status,'failed')
  assert.equal(native.assess({measurements:[{selector:'button',width:48,height:48,left:0,right:48,hit:true}]}).status,'measured')
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
