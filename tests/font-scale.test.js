const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const source=fs.readFileSync(require.resolve('../utils/font-scale'),'utf8')
test('shared typography defaults to standard scale regardless of device font settings',()=>{
 for(const info of [{},{fontSizeScaleFactor:1.5},{fontSizeScaleFactor:2},{fontSizeSetting:24},{fontSizeScaleFactor:0.8}]){
  let reads=0
  const context={module:{exports:{}},require:()=>({font:{body:16}}),wx:{getAppBaseInfo(){reads++;return info}}}
  vm.runInNewContext(source,context)
  assert.equal(context.module.exports(),1)
  assert.equal(context.module.exports.base,16)
  assert.equal(reads,0)
 }
})
test('standard typography also works without the WeChat runtime',()=>{
 const scale=require('../utils/font-scale')
 assert.equal(scale(),1)
 assert.equal(scale.base,require('../utils/ui-tokens').font.body)
})
test('meal workspace initialization does not restore device large text after loading preferences',async t=>{
 const {fixture,target}=require('./fixtures/workspace-flow')
 for(const mode of ['today','assistant']){
  const f=fixture(),page=f.createPage(mode)
  f.wx.getAppBaseInfo=()=>({fontSizeScaleFactor:2,fontSizeSetting:32})
  t.after(()=>page.onUnload())
  await page.initializeWorkspace(target)
  assert.equal(page.data.fontScale,1)
 }
})
