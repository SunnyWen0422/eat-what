const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
test('favorite entry preserves the chosen dish and ignores completion after account change',async()=>{
 let definition,scope='A',resolve,calls=[]
 vm.runInNewContext(fs.readFileSync('pages/favorite-dishes/favorite-dishes.js','utf8'),{
  Page:value=>definition=value,wx:{},console,
  require:name=>name.includes('font-scale')?Object.assign(()=>1,{base:16}):name.endsWith('/util')?{getUserStorageKey:key=>scope+key}:name.endsWith('/dish-workspace-handoff')?{addDishToWorkspace:(id,options)=>{calls.push({id,options});return new Promise(r=>resolve=r)}}:{}
 })
 const page={...definition,data:{...definition.data},setData(value){Object.assign(this.data,value)}}
 page._viewScope='AfavoriteView'
 assert.equal(typeof page.onAddToMeal,'function')
 const pending=page.onAddToMeal({currentTarget:{dataset:{id:7}}})
 assert.equal(calls[0].id,7);assert.equal(calls[0].options.current(),true)
 scope='B';assert.equal(calls[0].options.current(),false)
 page.data.addingId=9;resolve();await pending;assert.equal(page.data.addingId,9)
})
