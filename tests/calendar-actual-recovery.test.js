const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
test('calendar detail re-entry recovers the original actual request despite a newer plan',async()=>{
 const memory=new Map(),sent=[];let revision=1,fail=true
 const api={getMealOverview:async()=>({plans:[{recordDate:'2026-10-08',mealType:'dinner',revision,dishDetails:[{id:1,name:'青菜'}]}],consumptions:[]}),saveMealConsumption:async(date,type,body)=>{sent.push(structuredClone(body));if(fail)throw {isNetworkError:true};return {success:true}}}
 const util={getUserStorageKey:k=>'A:'+k};const wx={getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,structuredClone(v)),removeStorageSync:k=>memory.delete(k),showToast(){},showModal:v=>v.success({confirm:true})}
 function load(){let definition;const modules={};function read(file){if(modules[file])return modules[file];const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,wx,console,require:n=>n.endsWith('/api')||n==='./api'?api:n.endsWith('/util')||n==='./util'?util:n.includes('font-scale')?Object.assign(()=>1,{base:16}):read(path.resolve(path.dirname(file),n+'.js'))});return modules[file]=module.exports}
 vm.runInNewContext(fs.readFileSync('pages/calendar-detail/calendar-detail.js','utf8'),{Page:d=>definition=d,wx,console,require:n=>n.includes('api')?api:n.endsWith('/util')?util:n.includes('font-scale')?Object.assign(()=>1,{base:16}):read(path.resolve('pages/calendar-detail',n+'.js'))})
 const page={...definition,data:structuredClone(definition.data),setData:values=>Object.assign(page.data,values)};page.onLoad({date:'2026-10-08'});page._viewScope='A:mealView';page.data.meals=[{mealType:'dinner',planRevision:1,plan:{dishDetails:[{id:1,name:'青菜'}]}}];return page}
 const first=load();await first.onEaten({currentTarget:{dataset:{meal:'dinner'}}});assert.equal(typeof first.onConfirmActual,'function');await first.onConfirmActual();assert.equal(first.data.actualUnknown,true);first.onUnload()
 revision=2;fail=false;const second=load();await second.onEaten({currentTarget:{dataset:{meal:'dinner'}}});assert.equal(second.data.actualUnknown,true);await second.onActualRetry()
 assert.equal(sent.length,2);assert.equal(sent[0].requestId,sent[1].requestId);assert.equal(sent[1].expectedPlanRevision,1)
})
