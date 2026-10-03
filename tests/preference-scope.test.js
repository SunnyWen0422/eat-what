const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
test('an async preference response never populates the next account cache',async () => {
  let scope='A',complete
  const writes=[]
  const backend={getUserPreferences:()=>new Promise(resolve=>{complete=resolve})}
  const wx={getStorageSync:()=>null,setStorageSync:(key,value)=>writes.push([key,value])}
  const module={exports:{}}
  vm.runInNewContext(fs.readFileSync('utils/preference-store.js','utf8'),{module,wx,require:key=>key==='./api'?backend:{getUserStorageKey:key=>scope+':'+key}})
  const pending=module.exports.createPreferenceStore({api:backend,wx}).load()
  scope='B'; complete({preferences:{excludedIngredients:['花生']}})
  const result=await pending
  assert.equal(result.accountChanged,true); assert.equal(writes.length,0)
})
