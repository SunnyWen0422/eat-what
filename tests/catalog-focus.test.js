const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const {createRequire}=require('node:module')
test('clearing the header search preserves personalized filters and selected dishes',()=>{
  let definition
  const file=path.resolve('pages/customize/customize.js')
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page:d=>definition=d,require:createRequire(file),wx:{},console,clearTimeout})
  const calls=[],criteria={cuisineCodes:['sichuan']}
  const page={...definition,data:{...definition.data,activeTab:'meat',browseCriteria:criteria,selectedIds:[7],searchKeyword:'鸡蛋'},ensureBrowseOwner:()=>true,setData(v){Object.assign(this.data,v)},loadPage(...args){calls.push(args)}}
  page.onResetRecipeSearch()
  assert.equal(page.data.searchKeyword,'');assert.equal(page.data.browseCriteria,criteria)
  assert.deepEqual(page.data.selectedIds,[7]);assert.deepEqual(calls,[['meat',1]])
  page.ensureBrowseOwner=()=>false;page.data.searchKeyword='豆腐';page.onResetRecipeSearch()
  assert.equal(page.data.searchKeyword,'豆腐');assert.equal(calls.length,1)
})
