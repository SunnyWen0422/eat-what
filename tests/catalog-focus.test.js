const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const {createRequire}=require('node:module')
test('catalog help is explicit and does not change filters or selected dishes',()=>{
  let definition
  const file=path.resolve('pages/customize/customize.js')
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{Page:d=>definition=d,require:createRequire(file),wx:{},console})
  const page={...definition,data:{...definition.data,selectedIds:[7],searchKeyword:'鸡蛋'},ensureBrowseOwner:()=>true,setData(v){Object.assign(this.data,v)}}
  assert.equal(typeof page.onOpenCatalogHelp,'function')
  page.onOpenCatalogHelp()
  assert.equal(page.data.catalogHelpVisible,true)
  assert.equal(page.data.showBrowseFilters,false)
  assert.deepEqual(page.data.selectedIds,[7]);assert.equal(page.data.searchKeyword,'鸡蛋')
  page.onCloseCatalogHelp();assert.equal(page.data.catalogHelpVisible,false)
  page.ensureBrowseOwner=()=>false;page.onOpenCatalogHelp();assert.equal(page.data.catalogHelpVisible,false)
})
